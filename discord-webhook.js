// Discord Webhook Integration voor Lage Landen RP Sollicitaties
// Stuurt ingevulde formulieren automatisch naar Discord

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1461510160059990250/vncs7XBl59lKFN-FOUZVUtIcCpgmNhR9zOEZ5HHS5wIOZ91eYyTJ17zvzdjFKilSRdQS';

class DiscordSubmitter {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
    }

    // Verzend sollicitatie naar Discord
    async submitToDiscord(formData, formType) {
        const embed = this.createEmbed(formData, formType);
        
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
                return { success: true, message: 'Sollicitatie succesvol ingediend!' };
            } else {
                throw new Error('Discord webhook error');
            }
        } catch (error) {
            console.error('Error submitting to Discord:', error);
            return { success: false, message: 'Er is een fout opgetreden bij het indienen.' };
        }
    }

    // Maak Discord embed
    createEmbed(formData, formType) {
        const timestamp = new Date().toISOString();
        
        // Basis embed
        const embed = {
            title: this.getFormTitle(formType),
            color: this.getFormColor(formType),
            timestamp: timestamp,
            footer: {
                text: "Lage Landen RP Sollicitatie Systeem"
            },
            fields: []
        };

        // Voeg gebruiker info toe als beschikbaar
        if (window.auth && window.auth.user) {
            embed.author = {
                name: window.auth.user.user_metadata?.full_name || window.auth.user.email,
                icon_url: window.auth.user.user_metadata?.avatar_url
            };
        }

        // Voeg velden toe op basis van formulier type
        this.addFieldsToEmbed(embed, formData, formType);

        return embed;
    }

    // Bepaal titel op basis van formulier type
    getFormTitle(formType) {
        const titles = {
            'politie': '🚔 Politie Sollicitatie',
            'wtgm': '🔫 WTGM Toets',
            'grootwapen': '⚔️ Groot Wapen Toets',
            'taser': '⚡ Taser Toets',
            'rijbewijs-auto': '🚗 Rijbewijs Auto',
            'rijbewijs-motor': '🏍️ Rijbewijs Motor',
            'rijbewijs-boot': '🚤 Rijbewijs Boot',
            'rijbewijs-lucht': '✈️ Rijbewijs Lucht'
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
        // Doorloop alle form data
        for (const [key, value] of Object.entries(formData)) {
            // Skip lege velden
            if (!value || value.trim() === '') continue;

            // Maak field naam leesbaar
            const fieldName = this.formatFieldName(key);
            const fieldValue = value.length > 1024 ? value.substring(0, 1021) + '...' : value;

            embed.fields.push({
                name: fieldName,
                value: fieldValue,
                inline: false
            });
        }

        // Als er veel velden zijn, splits ze op in meerdere embeds (Discord limiet: 25 fields)
        if (embed.fields.length > 25) {
            embed.fields = embed.fields.slice(0, 25);
            embed.fields.push({
                name: "⚠️ Opmerking",
                value: "Niet alle velden konden worden getoond. Bekijk het volledige formulier voor details.",
                inline: false
            });
        }
    }

    // Format field name voor betere leesbaarheid
    formatFieldName(fieldName) {
        // Verwijder underscores en capitalize
        return fieldName
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .trim();
    }

    // Verzamel form data van HTML formulier
    collectFormData(formElement) {
        const formData = {};
        const inputs = formElement.querySelectorAll('input, textarea, select');

        inputs.forEach(input => {
            const name = input.name || input.id;
            if (!name) return;

            if (input.type === 'checkbox') {
                formData[name] = input.checked ? 'Ja' : 'Nee';
            } else if (input.type === 'radio') {
                if (input.checked) {
                    formData[name] = input.value;
                }
            } else {
                formData[name] = input.value;
            }
        });

        return formData;
    }

    // Attach submit handler aan formulier
    attachToForm(formElement, formType) {
        formElement.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Toon loading indicator
            const submitBtn = formElement.querySelector('button[type="submit"], input[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Verzenden...';
            }

            // Verzamel data
            const formData = this.collectFormData(formElement);

            // Verstuur naar Discord
            const result = await this.submitToDiscord(formData, formType);

            // Toon resultaat
            if (result.success) {
                this.showSuccessMessage(formElement);
                formElement.reset();
            } else {
                this.showErrorMessage(formElement);
            }

            // Reset button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Toon success bericht
    showSuccessMessage(formElement) {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 2rem 3rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            text-align: center;
            font-size: 1.2rem;
            font-weight: 600;
        `;
        message.innerHTML = `
            ✅ Succesvol ingediend!<br>
            <small style="font-size: 0.9rem; opacity: 0.9;">Je sollicitatie is doorgestuurd naar het staff team.</small>
        `;
        document.body.appendChild(message);

        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    // Toon error bericht
    showErrorMessage(formElement) {
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            padding: 2rem 3rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            text-align: center;
            font-size: 1.2rem;
            font-weight: 600;
        `;
        message.innerHTML = `
            ❌ Er ging iets mis<br>
            <small style="font-size: 0.9rem; opacity: 0.9;">Probeer het later opnieuw of neem contact op met staff.</small>
        `;
        document.body.appendChild(message);

        setTimeout(() => {
            message.remove();
        }, 4000);
    }
}

// Globale instance
const discordSubmitter = new DiscordSubmitter(DISCORD_WEBHOOK_URL);

// Helper functie voor eenvoudige integratie
function initDiscordSubmit(formId, formType) {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById(formId) || document.querySelector('form');
        if (form) {
            discordSubmitter.attachToForm(form, formType);
        }
    });
}
