// Discord Webhook Integration voor Lage Landen RP Sollicitaties v2.0
// Features: Code Verification, 24h Cooldown, Enhanced Security
// Security: Uses Netlify Function to hide Discord webhook URL

class DiscordSubmitter {
    constructor() {
        // Use Netlify Function instead of direct Discord webhook
        this.webhookUrl = '/.netlify/functions/submit-sollicitatie';
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

        // 4. Verzend naar Discord via Netlify Function (secure)
        const embed = this.createEmbed(formData, formType, username);
        
        const payload = {
            username: "Lage Landen RP - Sollicitaties",
            avatar_url: "https://lagelandenrp.netlify.app/images/logo.png",
            embeds: [embed]
        };

        try {
            console.log('📤 Submitting to Netlify Function:', this.webhookUrl);
            console.log('📦 Payload size:', JSON.stringify(payload).length, 'bytes');
            
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            console.log('📥 Response status:', response.status);
            
            let result;
            try {
                result = await response.json();
                console.log('📥 Response data:', result);
            } catch (jsonError) {
                console.error('❌ Failed to parse response as JSON:', jsonError);
                const text = await response.text();
                console.log('📄 Response text:', text);
                throw new Error('Invalid response from server: ' + text.substring(0, 100));
            }

            if (response.ok && result.success) {
                // Set cooldown na succesvolle verzending
                this.setCooldown(username, formType);
                
                return { 
                    success: true, 
                    message: '✅ Sollicitatie succesvol ingediend!\n\nStaff zal je sollicitatie beoordelen.' 
                };
            } else {
                const errorMsg = result.error || result.message || 'Unknown server error';
                console.error('❌ Server returned error:', errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('💥 Error submitting to Discord:', error);
            console.error('Error details:', error.message);
            return { 
                success: false, 
                message: '❌ Er is een fout opgetreden.\n\nDetails: ' + error.message + '\n\nCheck de console (F12) voor meer info of neem contact op met staff.',
                errorType: 'network',
                error: error.message
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
        if (formType === 'politie') {
            this.addPolitieSollicitatieFields(embed, formData);
        } else {
            this.addGenericFields(embed, formData);
        }
    }

    // Specifieke formatting voor politie sollicitatie
    addPolitieSollicitatieFields(embed, formData) {
        // Basisinformatie in één field
        const basisInfo = `
👤 **Roblox:** ${formData['Roblox gebruikersnaam'] || 'N/A'}
💬 **Discord:** ${formData['Discord naam (incl. #)'] || 'N/A'}
🌍 **Tijdzone:** ${formData['Tijdzone'] || 'N/A'}
🎂 **Leeftijd (IRL):** ${formData['Leeftijd (IRL)'] || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Motivatie & Ervaring
        const motivatie = `
**${formData['Zo ja, waar en welke rang?'] || ''}**

${formData['3. Waarom wil jij bij de politie van De Lage Landen?'] || ''}
        `.trim();

        if (motivatie.length > 10) {
            embed.fields.push({
                name: '💭 Motivatie & Ervaring',
                value: motivatie.substring(0, 1024),
                inline: false
            });
        }

        // Eigenschappen (inline voor compactheid)
        const eigenschappen = formData['4. Wat zijn volgens jou de belangrijkste eigenschappen van een goede politieagent?'];
        if (eigenschappen) {
            embed.fields.push({
                name: '⭐ Belangrijkste Eigenschappen',
                value: eigenschappen.substring(0, 1024),
                inline: false
            });
        }

        // Kennis vragen (3 kolommen voor compactheid)
        const kennisVragen = [
            { q: '5. BTGV', a: formData['5. Wat houdt een BTGV in en wanneer mag deze worden uitgegeven?'] },
            { q: '6. Aanhouding', a: formData['6. Wat is het verschil tussen een staandehouding en een aanhouding?'] },
            { q: '7. Geweld', a: formData['7. Wanneer mag een politieagent geweld gebruiken? Noem de belangrijkste voorwaarden.'] }
        ];

        kennisVragen.forEach((item, index) => {
            if (item.a) {
                embed.fields.push({
                    name: item.q,
                    value: item.a.substring(0, 1024),
                    inline: true
                });
            }
        });

        // Scenario & Toelichtingsvragen
        const scenario1 = formData['8. Wat betekent proportionaliteit en subsidiariteit binnen politiewerk?'];
        const scenario2 = formData['9. Wat doe je als een collega zich niet aan de regels houdt tijdens een RP-situatie?'];
        const scenario3 = formData['10. Je voert een verkeerscontrole uit. De bestuurder weigert zijn ID te tonen en scheidt je uit. Hoe handel je dit af?'];

        if (scenario1 || scenario2 || scenario3) {
            embed.fields.push({
                name: '📝 Scenario & Inzicht',
                value: `${scenario1 ? '**Proportionaliteit:** ' + scenario1.substring(0, 300) : ''}

${scenario2 ? '**Collega overtredingen:** ' + scenario2.substring(0, 300) : ''}

${scenario3 ? '**Verkeerscontrole:** ' + scenario3.substring(0, 300) : ''}`.trim().substring(0, 1024),
                inline: false
            });
        }

        // Overige kennis
        const achtervolging = formData['11. Tijdens een achtervolging ontstaat gevaar voor burgers. Wat doe je en waarom?'];
        const toelichting = formData['Toelichting'];
        const gemiddeld = formData['Gemiddeld aantal uur per week actief'];

        if (achtervolging) {
            embed.fields.push({
                name: '🚨 Achtervolging Scenario',
                value: achtervolging.substring(0, 1024),
                inline: false
            });
        }

        if (toelichting) {
            embed.fields.push({
                name: '📖 Toelichting',
                value: toelichting.substring(0, 1024),
                inline: false
            });
        }

        // Overige vragen kort weergeven
        const overigeVragen = formData['14. Waarom zouden wij jou moeten aannemen?'] || formData['15. Heb je nog vragen of opmerkingen?'];
        if (overigeVragen) {
            embed.fields.push({
                name: '💡 Slot',
                value: `${formData['14. Waarom zouden wij jou moeten aannemen?'] ? '**Waarom jij?** ' + formData['14. Waarom zouden wij jou moeten aannemen?'].substring(0, 200) : ''}

${formData['15. Heb je nog vragen of opmerkingen?'] ? '**Vragen:** ' + formData['15. Heb je nog vragen of opmerkingen?'].substring(0, 200) : ''}`.trim().substring(0, 1024),
                inline: false
            });
        }

        // Activiteit en commitment
        if (gemiddeld) {
            embed.fields.push({
                name: '⏰ Activiteit',
                value: `${gemiddeld} uur per week`,
                inline: true
            });
        }
    }

    // Generieke field formatting voor andere formulieren
    addGenericFields(embed, formData) {
        const fields = Object.entries(formData)
            .filter(([key, value]) => value && value.trim() !== '')
            .map(([key, value]) => {
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

        embed.fields = fields.slice(0, 25);

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
