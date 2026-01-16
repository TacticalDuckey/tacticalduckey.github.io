// Discord Webhook Integration voor Lage Landen RP Sollicitaties v2.0
// Features: Code Verification, 24h Cooldown, Enhanced Security

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1461510160059990250/vncs7XBl59lKFN-FOUZVUtIcCpgmNhR9zOEZ5HHS5wIOZ91eYyTJ17zvzdjFKilSRdQS';

class DiscordSubmitter {
    constructor(webhookUrl = DISCORD_WEBHOOK_URL) {
        this.webhookUrl = webhookUrl;
        this.codesStorageKey = 'sollicitatie_codes';
        this.cooldownStorageKey = 'sollicitatie_cooldowns';
        this.cooldownHours = 24; // 24 uur cooldown
    }

    // ==================== VERIFICATIE SYSTEMEN ====================

    // Verificatie: Check sollicitatiecode
    verifyCode(code, formType) {
        const codes = this.getSavedCodes();
        const now = new Date();

        const validCode = codes.find(c => {
            const expiry = new Date(c.expiresAt);
            return c.code.toUpperCase() === code.toUpperCase() &&
                   c.type === formType &&
                   expiry > now &&
                   !c.used;
        });

        if (validCode) {
            // Mark code as used
            validCode.used = true;
            validCode.usedAt = now.toISOString();
            this.saveCodes(codes);
            return { valid: true };
        }

        return { 
            valid: false, 
            message: 'Ongeldige of verlopen code. Vraag een nieuwe code aan bij staff.' 
        };
    }

    // Cooldown: Check of gebruiker recent al heeft ingestuurd
    checkCooldown(username, formType) {
        const cooldowns = this.getCooldowns();
        const key = `${username.toLowerCase()}_${formType}`;
        
        if (cooldowns[key]) {
            const lastSubmit = new Date(cooldowns[key]);
            const now = new Date();
            const hoursSince = (now - lastSubmit) / (1000 * 60 * 60);
            
            if (hoursSince < this.cooldownHours) {
                const hoursLeft = Math.ceil(this.cooldownHours - hoursSince);
                return {
                    allowed: false,
                    message: `⏱️ Je hebt deze sollicitatie al ingediend.\n\nWacht nog ${hoursLeft} uur voordat je opnieuw kunt indienen.`,
                    hoursLeft: hoursLeft
                };
            }
        }

        return { allowed: true };
    }

    // Set cooldown na succesvolle inzending
    setCooldown(username, formType) {
        const cooldowns = this.getCooldowns();
        const key = `${username.toLowerCase()}_${formType}`;
        cooldowns[key] = new Date().toISOString();
        localStorage.setItem(this.cooldownStorageKey, JSON.stringify(cooldowns));
    }

    // ==================== STORAGE HELPERS ====================

    getCooldowns() {
        const data = localStorage.getItem(this.cooldownStorageKey);
        return data ? JSON.parse(data) : {};
    }

    getSavedCodes() {
        const codes = localStorage.getItem(this.codesStorageKey);
        return codes ? JSON.parse(codes) : [];
    }

    saveCodes(codes) {
        localStorage.setItem(this.codesStorageKey, JSON.stringify(codes));
    }

    // ==================== DISCORD SUBMISSION ====================

    // Hoofd functie: Verzend sollicitatie naar Discord
    async submitToDiscord(formData, formType, accessCode) {
        // 1. Check toegangscode
        const codeCheck = this.verifyCode(accessCode, formType);
        if (!codeCheck.valid) {
            return { 
                success: false, 
                message: codeCheck.message,
                errorType: 'code'
            };
        }

        // 2. Haal username op
        const username = formData['Roblox gebruikersnaam'] || formData['roblox'] || formData['Roblox Username'];
        if (!username) {
            return {
                success: false,
                message: '⚠️ Roblox gebruikersnaam niet ingevuld!',
                errorType: 'validation'
            };
        }

        // 3. Check cooldown
        const cooldownCheck = this.checkCooldown(username, formType);
        if (!cooldownCheck.allowed) {
            return {
                success: false,
                message: cooldownCheck.message,
                errorType: 'cooldown',
                hoursLeft: cooldownCheck.hoursLeft
            };
        }

        // 4. Verzend naar Discord
        const embed = this.createEmbed(formData, formType, username);
        
        const payload = {
            username: "Lage Landen RP - Sollicitaties",
            avatar_url: "https://lagelandenrp.netlify.app/images/logo.png",
            embeds: [embed]
        };

        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Set cooldown na succesvolle verzending
                this.setCooldown(username, formType);
                
                return { 
                    success: true, 
                    message: '✅ Sollicitatie succesvol ingediend!\n\nStaff zal je sollicitatie beoordelen.' 
                };
            } else {
                throw new Error('Discord webhook error');
            }
        } catch (error) {
            console.error('Error submitting to Discord:', error);
            return { 
                success: false, 
                message: '❌ Er is een fout opgetreden.\n\nProbeer het later opnieuw of neem contact op met staff.',
                errorType: 'network'
            };
        }
    }

    // Maak Discord embed
    createEmbed(formData, formType, username) {
        const timestamp = new Date().toISOString();
        
        const embed = {
            title: this.getFormTitle(formType),
            color: this.getFormColor(formType),
            timestamp: timestamp,
            footer: {
                text: "Lage Landen RP Sollicitatie Systeem"
            },
            fields: []
        };

        // Voeg gebruiker info toe
        embed.description = `**Sollicitant:** ${username}`;

        // Voeg velden toe op basis van formulier type
        this.addFieldsToEmbed(embed, formData, formType);

        return embed;
    }

    // Bepaal titel op basis van formulier type
    getFormTitle(formType) {
        const titles = {
            'politie': '🚔 Nieuwe Politie Sollicitatie',
            'wtgm': '🔫 WTGM Toets Inzending',
            'grootwapen': '⚔️ Groot Wapen Toets',
            'taser': '⚡ Taser Toets',
            'rijbewijs-auto': '🚗 Rijbewijs Auto Toets',
            'rijbewijs-motor': '🏍️ Rijbewijs Motor Toets',
            'rijbewijs-boot': '🚤 Rijbewijs Boot Toets',
            'rijbewijs-lucht': '✈️ Rijbewijs Lucht Toets'
        };
        return titles[formType] || '📝 Sollicitatie';
    }

    // Bepaal kleur op basis van formulier type
    getFormColor(formType) {
        const colors = {
            'politie': 0x0047AB,        // Politie blauw
            'wtgm': 0xC8102E,           // Rood
            'grootwapen': 0x8B0000,     // Donkerrood
            'taser': 0xFFD700,          // Goud
            'rijbewijs-auto': 0x2ECC71, // Groen
            'rijbewijs-motor': 0xE74C3C,// Rood
            'rijbewijs-boot': 0x3498DB, // Blauw
            'rijbewijs-lucht': 0x9B59B6 // Paars
        };
        return colors[formType] || 0x0047AB;
    }

    // Voeg velden toe aan embed
    addFieldsToEmbed(embed, formData, formType) {
        // Filter lege velden
        const fields = Object.entries(formData)
            .filter(([key, value]) => value && value.trim() !== '')
            .map(([key, value]) => {
                // Splits lange antwoorden
                const maxLength = 1024;
                let fieldValue = value.trim();
                
                if (fieldValue.length > maxLength) {
                    fieldValue = fieldValue.substring(0, maxLength - 3) + '...';
                }

                return {
                    name: key.length > 256 ? key.substring(0, 253) + '...' : key,
                    value: fieldValue,
                    inline: fieldValue.length < 50
                };
            });

        // Voeg velden toe (max 25 fields in Discord)
        embed.fields = fields.slice(0, 25);

        // Als er meer dan 25 velden zijn, voeg waarschuwing toe
        if (fields.length > 25) {
            embed.fields.push({
                name: '⚠️ Let op',
                value: `Formulier bevat ${fields.length} velden. Alleen eerste 25 worden getoond.`,
                inline: false
            });
        }
    }

    // ==================== UI FEEDBACK ====================

    showSuccessMessage() {
        alert('✅ SOLLICITATIE INGEDIEND!\n\nJe sollicitatie is succesvol verzonden naar de staff.\n\nJe ontvangt binnen 24-48 uur een reactie via Discord.');
    }

    showErrorMessage(message) {
        alert(message || '❌ FOUT\n\nEr is een fout opgetreden bij het indienen.\n\nNeem contact op met staff als dit probleem aanhoudt.');
    }
}

// Global instance
const discordSubmitter = new DiscordSubmitter();
