// Discord Webhook Integration voor Lage Landen RP Sollicitaties v2.0
// Features: Code Verification, 24h Cooldown, Enhanced Security
// Security: Uses Netlify Function to hide Discord webhook URL

class DiscordSubmitter {
    constructor() {
        // Use Netlify Function instead of direct Discord webhook
        this.webhookUrl = '/.netlify/functions/submit-sollicitatie';
        this.codesStorageKey = 'sollicitatie_codes';
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

    // ==================== STORAGE HELPERS ====================

    getSavedCodes() {
        const codes = localStorage.getItem(this.codesStorageKey);
        return codes ? JSON.parse(codes) : [];
    }

    saveCodes(codes) {
        localStorage.setItem(this.codesStorageKey, JSON.stringify(codes));
    }

    // ==================== DISCORD SUBMISSION ====================

    // Hoofd functie: Verzend sollicitatie naar Discord (met code check)
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

        // Ga door met verzenden
        return this.submitToDiscordWithoutCodeCheck(formData, formType, accessCode);
    }

    // Nieuwe functie: Verzend zonder extra code check (code is al gevalideerd)
    async submitToDiscordWithoutCodeCheck(formData, formType, accessCode) {
        // 1. Haal username op (flexibel voor verschillende formulieren)
        const username = formData['Roblox gebruikersnaam'] || 
                        formData['Naam'] || 
                        formData['naam'] || 
                        formData['roblox'] || 
                        formData['discord'] ||
                        formData['Roblox Username'];
        if (!username || username.trim() === '') {
            return {
                success: false,
                message: '⚠️ Naam/Roblox gebruikersnaam niet ingevuld!',
                errorType: 'validation'
            };
        }

        // 2. Select correct webhook URL based on form type
        let webhookUrl = '/.netlify/functions/submit-sollicitatie';
        if (formType === 'spoed') {
            webhookUrl = '/.netlify/functions/submit-spoed-sollicitatie';
        }

        // 3. Verzend naar Discord via Netlify Function (secure)
        const embed = this.createEmbed(formData, formType, username);
        
        // Voeg code toe aan embed
        if (accessCode) {
            embed.fields.unshift({
                name: '🔑 Toegangscode',
                value: `\`${accessCode}\``,
                inline: true
            });
        }
        
        const payload = {
            username: "Lage Landen RP - Sollicitaties",
            avatar_url: "https://lagelandenrp.netlify.app/images/logo.png",
            embeds: [embed]
        };

        try {
            console.log('📤 Submitting to Netlify Function:', webhookUrl);
            console.log('📦 Payload size:', JSON.stringify(payload).length, 'bytes');
            
            const response = await fetch(webhookUrl, {
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
            'spoed': '⚡ SPOED - Partnership & Server Onderhoud',
            'wtgm': '🔫 WTGM Toets Inzending',
            'grootwapen': '⚔️ Groot Wapen Toets',
            'taser': '⚡ Taser Toets',
            'rijbewijs-auto': '🚗 Rijbewijs Auto Toets',
            'rijbewijs-motor': '🏍️ Rijbewijs Motor Toets',
            'rijbewijs-boot': '🚤 Rijbewijs Boot Toets',
            'rijbewijs-lucht': '✈️ Rijbewijs Lucht Toets',
            'ambulance': '🚑 Nieuwe Ambulance Sollicitatie',
            'ambulance-ehbo': '🩹 EHBO Toets Inzending',
            'ambulance-aed': '⚡ AED & Reanimatie Toets',
            'ambulance-trauma': '🩸 Traumazorg Toets',
            'ambulance-bhv': '🩹 BHV & Tourniquet Toets',
            'ambulance-staff': '👔 Ambulance Staff Sollicitatie'
        };
        return titles[formType] || '📝 Sollicitatie';
    }

    // Bepaal kleur op basis van formulier type
    getFormColor(formType) {
        const colors = {
            'politie': 0x0047AB,        // Politie blauw
            'spoed': 0x7c3aed,          // Paars (SPOED)
            'wtgm': 0xC8102E,           // Rood
            'grootwapen': 0x8B0000,     // Donkerrood
            'taser': 0xFFD700,          // Goud
            'rijbewijs-auto': 0x2ECC71, // Groen
            'rijbewijs-motor': 0xE74C3C,// Rood
            'rijbewijs-boot': 0x3498DB, // Blauw
            'rijbewijs-lucht': 0x9B59B6,// Paars
            'ambulance': 0xDC2626,      // Ambulance rood
            'ambulance-ehbo': 0xEF4444, // Licht rood
            'ambulance-aed': 0xF97316,  // Oranje-rood
            'ambulance-trauma': 0x991B1B,// Donkerrood (ernstig)
            'ambulance-bhv': 0xDC2626,  // Rood
            'ambulance-staff': 0x7C2D12 // Donker bruin-rood
        };
        return colors[formType] || 0x0047AB;
    }

    // Voeg velden toe aan embed
    addFieldsToEmbed(embed, formData, formType) {
        if (formType === 'politie') {
            this.addPolitieSollicitatieFields(embed, formData);
        } else if (formType === 'spoed') {
            this.addSpoedSollicitatieFields(embed, formData);
        } else if (formType === 'wtgm') {
            this.addWTGMFields(embed, formData);
        } else if (formType === 'ambulance') {
            this.addAmbulanceSollicitatieFields(embed, formData);
        } else if (formType === 'ambulance-staff') {
            this.addAmbulanceStaffFields(embed, formData);
        } else if (formType.startsWith('ambulance-')) {
            this.addAmbulanceToetsFields(embed, formData, formType);
        } else if (formType === 'grootwapen') {
            this.addGrootWapenFields(embed, formData);
        } else if (formType === 'taser') {
            this.addTaserFields(embed, formData);
        } else if (formType.startsWith('rijbewijs')) {
            this.addRijbewijsFields(embed, formData, formType);
        } else {
            this.addGenericFields(embed, formData);
        }
    }

    // Specifieke formatting voor politie sollicitatie
    addPolitieSollicitatieFields(embed, formData) {
        // Helper functie om field te vinden met flexibele matching
        const getField = (...possibleKeys) => {
            for (const key of possibleKeys) {
                // Exacte match
                if (formData[key]) return formData[key];
                
                // Zoek naar gedeeltelijke match (case-insensitive, zonder HTML tags)
                const foundKey = Object.keys(formData).find(k => 
                    k.toLowerCase().includes(key.toLowerCase()) || 
                    key.toLowerCase().includes(k.toLowerCase())
                );
                if (foundKey && formData[foundKey]) return formData[foundKey];
            }
            return null;
        };

        // Basisinformatie in één field
        const gemiddeld = getField('Gemiddeld aantal uur per week actief', 'uren');
        const basisInfo = `
👤 **Roblox:** ${getField('Roblox gebruikersnaam', 'roblox') || 'N/A'}
💬 **Discord:** ${getField('Discord naam (incl. #)', 'discord') || 'N/A'}
🌍 **Tijdzone:** ${getField('Tijdzone', 'tijdzone') || 'N/A'}
🎂 **Leeftijd (IRL):** ${getField('Leeftijd (IRL)', 'leeftijd') || 'N/A'}
⏰ **Gemiddeld actief:** ${gemiddeld || 'N/A'} uur per week
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Alle vragen met volledige tekst en emojis
        const vragen = [
            { 
                emoji: '👮',
                vraag: '1. Heb je eerder bij een politie, marechaussee of andere hulpdienst gezeten in Roblox?',
                antwoord: getField('1. Heb je eerder bij een politie', 'vraag1')
            },
            { 
                emoji: '🎖️',
                vraag: '2. Zo ja, waar en welke rang?',
                antwoord: getField('Zo ja, waar en welke rang', 'vraag1b')
            },
            { 
                emoji: '💭',
                vraag: '3. Waarom wil jij bij de politie van De Lage Landen?',
                antwoord: getField('3. Waarom wil jij bij de politie', 'vraag3', 'Waarom wil jij')
            },
            { 
                emoji: '⭐',
                vraag: '4. Wat zijn volgens jou de belangrijkste eigenschappen van een goede politieagent?',
                antwoord: getField('4. Wat zijn volgens jou', 'vraag4', 'belangrijkste eigenschappen')
            },
            {
                emoji: '📋',
                vraag: '5. Wat houdt een BTGV in en wanneer mag deze worden uitgegeven?',
                antwoord: getField('5. Wat houdt een BTGV', 'vraag5', 'BTGV')
            },
            {
                emoji: '🚔',
                vraag: '6. Wat is het verschil tussen een staandehouding en een aanhouding?',
                antwoord: getField('6. Wat is het verschil', 'vraag6', 'staandehouding')
            },
            {
                emoji: '⚠️',
                vraag: '7. Wanneer mag een politieagent geweld gebruiken? Noem de belangrijkste voorwaarden.',
                antwoord: getField('7. Wanneer mag een politieagent', 'vraag7', 'geweld gebruiken')
            },
            {
                emoji: '⚖️',
                vraag: '8. Wat betekent proportionaliteit en subsidiariteit binnen politiewerk?',
                antwoord: getField('8. Wat betekent proportionaliteit', 'vraag8', 'proportionaliteit')
            },
            {
                emoji: '👥',
                vraag: '9. Wat doe je als een collega zich niet aan de regels houdt tijdens een RP-situatie?',
                antwoord: getField('9. Wat doe je als een collega', 'vraag9', 'collega zich niet')
            },
            {
                emoji: '🚗',
                vraag: '10. Je voert een verkeerscontrole uit. De bestuurder weigert zijn ID te tonen en scheidt je uit. Hoe handel je dit af?',
                antwoord: getField('10. Je voert een verkeerscontrole', 'vraag10', 'verkeerscontrole uit')
            },
            {
                emoji: '🚨',
                vraag: '11. Tijdens een achtervolging ontstaat gevaar voor burgers. Wat doe je en waarom?',
                antwoord: getField('11. Tijdens een achtervolging', 'vraag11', 'achtervolging ontstaat')
            },
            {
                emoji: '📖',
                vraag: '12. Toelichting',
                antwoord: getField('Toelichting', 'vraag12')
            },
            {
                emoji: '📚',
                vraag: '13. Leg kort uit wat deze termen betekenen',
                antwoord: getField('13. Ben je bekend', 'vraag13', 'Leg kort uit', 'FailRP')
            },
            {
                emoji: '💡',
                vraag: '14. Waarom zouden wij jou moeten aannemen?',
                antwoord: getField('14. Waarom zouden wij jou', 'vraag14')
            },
            {
                emoji: '❓',
                vraag: '15. Heb je nog vragen of opmerkingen?',
                antwoord: getField('15. Heb je nog vragen', 'vraag15')
            }
        ];

        // Voeg elke vraag met volledig antwoord toe
        vragen.forEach(item => {
            if (item.antwoord && item.antwoord.trim()) {
                embed.fields.push({
                    name: `${item.emoji} ${item.vraag}`,
                    value: item.antwoord.substring(0, 1024),
                    inline: false
                });
            }
        });
    }

    // SPOED Partnership & Server Onderhoud Sollicitatie
    addSpoedSollicitatieFields(embed, formData) {
        const getField = (...possibleKeys) => {
            for (const key of possibleKeys) {
                if (formData[key]) return formData[key];
                const foundKey = Object.keys(formData).find(k => 
                    k.toLowerCase().includes(key.toLowerCase()) || 
                    key.toLowerCase().includes(k.toLowerCase())
                );
                if (foundKey && formData[foundKey]) return formData[foundKey];
            }
            return null;
        };

        // Basisinformatie
        const basisInfo = `
👤 **Naam (IC):** ${getField('naam') || 'N/A'}
💬 **Discord:** ${getField('discord') || 'N/A'}
🎂 **Leeftijd:** ${getField('leeftijd') || 'N/A'}
🌍 **Tijdzone:** ${getField('timezone') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Persoonlijke Gegevens',
            value: basisInfo,
            inline: false
        });

        // Ervaring & Kennis
        if (getField('serverervaring')) {
            embed.fields.push({
                name: '💼 Server Management Ervaring',
                value: getField('serverervaring').substring(0, 1024),
                inline: false
            });
        }

        if (getField('rpervaring')) {
            embed.fields.push({
                name: '🎮 RP Ervaring',
                value: getField('rpervaring').substring(0, 1024),
                inline: false
            });
        }

        if (getField('waarom')) {
            embed.fields.push({
                name: '💭 Motivatie - Waarom partnerships regelen?',
                value: getField('waarom').substring(0, 1024),
                inline: false
            });
        }

        // RP & Game Kennis
        if (getField('failrp')) {
            embed.fields.push({
                name: '📖 Wat is FailRP?',
                value: getField('failrp').substring(0, 1024),
                inline: false
            });
        }

        if (getField('rpscenario1')) {
            embed.fields.push({
                name: '🎯 Scenario: Wapen in stad',
                value: getField('rpscenario1').substring(0, 1024),
                inline: false
            });
        }

        if (getField('rpscenario2')) {
            embed.fields.push({
                name: '⚠️ Scenario: RDM - Wat is het en hoe pak je het aan?',
                value: getField('rpscenario2').substring(0, 1024),
                inline: false
            });
        }

        if (getField('rpregels')) {
            embed.fields.push({
                name: '📋 3 Belangrijke RP Regels',
                value: getField('rpregels').substring(0, 1024),
                inline: false
            });
        }

        // Partnership Management
        const partnerInfo = `
**Ervaring:** ${getField('partnerervaring') || 'N/A'}
**Partnerships per week:** ${getField('partnerregel2') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '🤝 Partnership Management',
            value: partnerInfo,
            inline: false
        });

        if (getField('partnerstappen')) {
            embed.fields.push({
                name: '📝 Hoe regel je een partnership?',
                value: getField('partnerstappen').substring(0, 1024),
                inline: false
            });
        }

        if (getField('partnerregel1')) {
            embed.fields.push({
                name: '🔔 Beleid @everyone tags',
                value: getField('partnerregel1').substring(0, 1024),
                inline: false
            });
        }

        if (getField('partnervoorbeeld')) {
            embed.fields.push({
                name: '✉️ Partnership Bericht Voorbeeld',
                value: getField('partnervoorbeeld').substring(0, 1024),
                inline: false
            });
        }

        // Beschikbaarheid
        const beschikbaarheid = `
**Dagen/Tijden:** ${getField('beschikbaarheid') || 'N/A'}
**Uren per week:** ${getField('ureninzet') || 'N/A'}
**Commitment (2 partnerships/week):** ${getField('commitment') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '⏰ Beschikbaarheid & Inzet',
            value: beschikbaarheid,
            inline: false
        });

        // Vaardigheden & Persoonlijkheid
        if (getField('communicatie')) {
            embed.fields.push({
                name: '💬 Communicatieve Vaardigheden (1-10)',
                value: getField('communicatie').substring(0, 1024),
                inline: false
            });
        }

        const persoonlijkheid = `
**Professioneel:** ${getField('professioneel') || 'N/A'}
**Zelfstandig werken:** ${getField('zelfstandig') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '👔 Professioneel & Zelfstandigheid',
            value: persoonlijkheid,
            inline: false
        });

        if (getField('sterktepunten')) {
            embed.fields.push({
                name: '⭐ Sterke Punten (Top 3)',
                value: getField('sterktepunten').substring(0, 1024),
                inline: false
            });
        }

        if (getField('zwaktepunten')) {
            embed.fields.push({
                name: '📉 Zwakke Punten',
                value: getField('zwaktepunten').substring(0, 1024),
                inline: false
            });
        }

        // Situatie Vragen
        if (getField('situatie1')) {
            embed.fields.push({
                name: '🤔 Situatie: Bericht niet binnen 48u geplaatst',
                value: getField('situatie1').substring(0, 1024),
                inline: false
            });
        }

        if (getField('situatie2')) {
            embed.fields.push({
                name: '😠 Situatie: Negatieve reactie server owner',
                value: getField('situatie2').substring(0, 1024),
                inline: false
            });
        }

        if (getField('situatie4')) {
            embed.fields.push({
                name: '⌛ Situatie: Geen reactie op ticket',
                value: getField('situatie4').substring(0, 1024),
                inline: false
            });
        }

        // Technische Vaardigheden
        const technisch = `
**Discord kennis:** ${getField('discord_kennis') || 'N/A'}
**Tools/Bots:** ${getField('tools')?.substring(0, 300) || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📱 Technische Vaardigheden',
            value: technisch,
            inline: false
        });

        // Aanvullende Informatie
        if (getField('ideeen')) {
            embed.fields.push({
                name: '✨ Ideeën voor Server Groei',
                value: getField('ideeen').substring(0, 1024),
                inline: false
            });
        }

        if (getField('verwachtingen')) {
            embed.fields.push({
                name: '🎯 Verwachtingen van deze functie',
                value: getField('verwachtingen').substring(0, 1024),
                inline: false
            });
        }

        if (getField('extra') && getField('extra').trim()) {
            embed.fields.push({
                name: '📝 Extra Informatie',
                value: getField('extra').substring(0, 1024),
                inline: false
            });
        }
    }

    // WTGM Toets formatting
    addWTGMFields(embed, formData) {
        const getField = this.createFieldGetter(formData);
        
        // Basis info
        const basisInfo = `
👤 **Roblox gebruikersnaam:** ${getField('Roblox gebruikersnaam', 'roblox') || 'N/A'}
🎖️ **Rang:** ${getField('Rang', 'rang') || 'N/A'}
📅 **Datum:** ${getField('Datum', 'datum') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Verzamel ALLE vragen dynamisch
        for (let i = 1; i <= 15; i++) {
            const antwoord = getField(`${i}.`, `vraag${i}`, `vraag${i}a`, `vraag${i}b`, `vraag${i}c`, `vraag${i}d`);
            if (antwoord && antwoord.toString().trim()) {
                const emojis = ['🔤', '👮', '🔫', '📊', '⚠️', '👥', '🚫', '📝', '🎯', '💭', '📌', '🔍', '⚖️', '🛡️', '✅'];
                const emoji = emojis[i-1] || '📌';
                embed.fields.push({
                    name: `${emoji} Vraag ${i}`,
                    value: antwoord.toString().substring(0, 1024),
                    inline: false
                });
            }
        }
    }

    // Groot Wapen Toets formatting
    addGrootWapenFields(embed, formData) {
        const getField = this.createFieldGetter(formData);
        
        const basisInfo = `
👤 **Roblox gebruikersnaam:** ${getField('Roblox gebruikersnaam', 'roblox') || 'N/A'}
🎖️ **Rang:** ${getField('Rang', 'rang') || 'N/A'}
📅 **Datum:** ${getField('Datum', 'datum') || 'N/A'}
✅ **WTGM Bevoegdheid:** ${getField('WTGM Bevoegdheid', 'wtgm') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Verzamel ALLE vragen dynamisch
        for (let i = 1; i <= 15; i++) {
            const antwoord = getField(`${i}.`, `vraag${i}`, `vraag${i}a`, `vraag${i}b`, `vraag${i}c`, `vraag${i}d`, `vraag${i}e`);
            if (antwoord && antwoord.toString().trim()) {
                const emojis = ['🔫', '⚠️', '🚗', '🏦', '📦', '🎯', '👥', '📝', '💭', '📌', '🔍', '⚖️', '🛡️', '✅', '🎖️'];
                const emoji = emojis[i-1] || '📌';
                embed.fields.push({
                    name: `${emoji} Vraag ${i}`,
                    value: antwoord.toString().substring(0, 1024),
                    inline: false
                });
            }
        }
    }

    // Taser Toets formatting
    addTaserFields(embed, formData) {
        const getField = this.createFieldGetter(formData);
        
        const basisInfo = `
👤 **Roblox gebruikersnaam:** ${getField('Roblox gebruikersnaam', 'roblox') || 'N/A'}
🎖️ **Rang:** ${getField('Rang', 'rang') || 'N/A'}
📅 **Datum:** ${getField('Datum', 'datum') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Verzamel ALLE vragen (1-10) dynamisch
        for (let i = 1; i <= 10; i++) {
            // Voor vraag 6 (multi-deel vraag), verzamel alle sub-antwoorden
            if (i === 6) {
                const subAnswers = [];
                ['a', 'b', 'c', 'd', 'e'].forEach(suffix => {
                    const answer = getField(`vraag${i}${suffix}`, `${i}.`, `6.`);
                    if (answer && answer.trim()) {
                        subAnswers.push(answer);
                    }
                });
                if (subAnswers.length > 0) {
                    embed.fields.push({
                        name: `🚫 Vraag ${i}`,
                        value: subAnswers.join('\n'),
                        inline: false
                    });
                }
            } else {
                // Normale vragen
                const antwoord = getField(`${i}.`, `vraag${i}`, `vraag${i}a`, `vraag${i}b`, `vraag${i}c`, `vraag${i}d`);
                if (antwoord && antwoord.toString().trim()) {
                    const emoji = ['⚡', '✋', '🔫', '🔢', '🚑', '🚫', '🏃', '🎯', '📝', '💭'][i-1] || '📌';
                    embed.fields.push({
                        name: `${emoji} Vraag ${i}`,
                        value: antwoord.toString().substring(0, 1024),
                        inline: false
                    });
                }
            }
        }
    }

    // Rijbewijs formatting (auto, motor, boot, lucht)
    addRijbewijsFields(embed, formData, formType) {
        const getField = this.createFieldGetter(formData);
        
        const typeEmojis = {
            'rijbewijs-auto': '🚗',
            'rijbewijs-motor': '🏍️',
            'rijbewijs-boot': '🚤',
            'rijbewijs-lucht': '✈️'
        };

        const basisInfo = `
👤 **Roblox gebruikersnaam:** ${getField('Roblox gebruikersnaam', 'roblox') || 'N/A'}
🎖️ **Rang:** ${getField('Rang', 'rang') || 'N/A'}
📅 **Datum:** ${getField('Datum', 'datum') || 'N/A'}
        `.trim();

        embed.fields.push({
            name: '📋 Basisinformatie',
            value: basisInfo,
            inline: false
        });

        // Generieke vragen (10-15 vragen meestal)
        for (let i = 1; i <= 15; i++) {
            const vraag = getField(`${i}.`, `vraag${i}`);
            if (vraag && vraag.trim()) {
                embed.fields.push({
                    name: `${typeEmojis[formType] || '📝'} Vraag ${i}`,
                    value: vraag.substring(0, 1024),
                    inline: false
                });
            }
        }
    }

    // Helper functie om field getter te maken
    createFieldGetter(formData) {
        return (...possibleKeys) => {
            for (const key of possibleKeys) {
                if (formData[key]) return formData[key];
                
                const foundKey = Object.keys(formData).find(k => 
                    k.toLowerCase().includes(key.toLowerCase()) || 
                    key.toLowerCase().includes(k.toLowerCase())
                );
                if (foundKey && formData[foundKey]) return formData[foundKey];
            }
            return null;
        };
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

    // ==================== AMBULANCE SOLLICITATIE FIELDS ====================

    addAmbulanceSollicitatieFields(embed, formData) {
        const getField = this.createFieldGetter(formData);

        // Persoonlijke gegevens
        const basisInfo = [];
        if (getField('naam')) basisInfo.push(`**Naam:** ${getField('naam')}`);
        if (getField('discord')) basisInfo.push(`**Discord:** ${getField('discord')}`);
        if (getField('leeftijd')) basisInfo.push(`**Leeftijd:** ${getField('leeftijd')}`);
        
        if (basisInfo.length > 0) {
            embed.fields.push({
                name: '👤 Persoonlijke Gegevens',
                value: basisInfo.join('\n'),
                inline: false
            });
        }

        // Motivatie
        if (getField('motivatie')) {
            embed.fields.push({
                name: '💭 Motivatie',
                value: getField('motivatie').substring(0, 1024),
                inline: false
            });
        }

        // Scenario's - compact format
        for (let i = 1; i <= 5; i++) {
            const scenario = getField(`scenario${i}`);
            if (scenario) {
                embed.fields.push({
                    name: `🚑 Scenario ${i}`,
                    value: scenario.substring(0, 1024),
                    inline: false
                });
            }
        }

        // Extra velden
        const extraFields = ['beschikbaarheid', 'ervaring', 'rp_ervaring', 'toevoegen'];
        extraFields.forEach(field => {
            const value = getField(field);
            if (value) {
                embed.fields.push({
                    name: field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' '),
                    value: value.substring(0, 1024),
                    inline: field !== 'toevoegen'
                });
            }
        });
    }

    addAmbulanceStaffFields(embed, formData) {
        const getField = this.createFieldGetter(formData);

        // Basis info
        const basisInfo = [];
        if (getField('naam')) basisInfo.push(`**Naam:** ${getField('naam')}`);
        if (getField('discord')) basisInfo.push(`**Discord:** ${getField('discord')}`);
        if (getField('leeftijd')) basisInfo.push(`**Leeftijd:** ${getField('leeftijd')}`);
        if (getField('huidigerang')) basisInfo.push(`**Huidige rang:** ${getField('huidigerang')}`);
        if (getField('ervaring')) basisInfo.push(`**Ervaring:** ${getField('ervaring')}`);
        
        if (basisInfo.length > 0) {
            embed.fields.push({
                name: '👤 Basis Informatie',
                value: basisInfo.join('\n'),
                inline: false
            });
        }

        // Motivatie & Visie
        if (getField('motivatie')) {
            embed.fields.push({
                name: '💼 Motivatie',
                value: getField('motivatie').substring(0, 1024),
                inline: false
            });
        }

        if (getField('visie')) {
            embed.fields.push({
                name: '🎯 Visie',
                value: getField('visie').substring(0, 1024),
                inline: false
            });
        }

        // Sterke/zwakke punten
        const eigenschappen = [];
        if (getField('sterke_punten')) eigenschappen.push(`**✅ Sterke punten:**\n${getField('sterke_punten')}`);
        if (getField('zwakke_punten')) eigenschappen.push(`**⚠️ Ontwikkelpunten:**\n${getField('zwakke_punten')}`);
        
        if (eigenschappen.length > 0) {
            embed.fields.push({
                name: '👥 Eigenschappen',
                value: eigenschappen.join('\n\n').substring(0, 1024),
                inline: false
            });
        }

        // Management scenario's (short)
        for (let i = 1; i <= 5; i++) {
            const scenario = getField(`scenario${i}`);
            if (scenario) {
                const preview = scenario.length > 200 ? scenario.substring(0, 197) + '...' : scenario;
                embed.fields.push({
                    name: `👔 Management Scenario ${i}`,
                    value: preview,
                    inline: false
                });
            }
        }

        // Extra info (compact)
        const extraInfo = [];
        if (getField('certificaten')) extraInfo.push(`**Certificaten:** ${getField('certificaten')}`);
        if (getField('beschikbaarheid')) extraInfo.push(`**Beschikbaarheid:** ${getField('beschikbaarheid')}`);
        if (getField('leiderschapservaring')) extraInfo.push(`**Leiderschapservaring:** ${getField('leiderschapservaring')}`);
        
        if (extraInfo.length > 0) {
            embed.fields.push({
                name: '📋 Aanvullende Info',
                value: extraInfo.join('\n'),
                inline: false
            });
        }
    }

    addAmbulanceToetsFields(embed, formData, formType) {
        const getField = this.createFieldGetter(formData);

        // Bepaal toets naam
        const toetsNamen = {
            'ambulance-ehbo': 'EHBO',
            'ambulance-aed': 'AED & Reanimatie',
            'ambulance-trauma': 'Traumazorg',
            'ambulance-bhv': 'BHV & Tourniquet'
        };
        const toetsNaam = toetsNamen[formType] || 'Ambulance Toets';

        // Basis info
        const basisInfo = [];
        if (getField('naam')) basisInfo.push(`**Naam:** ${getField('naam')}`);
        if (getField('discord')) basisInfo.push(`**Discord:** ${getField('discord')}`);
        
        if (basisInfo.length > 0) {
            embed.fields.push({
                name: '👤 Deelnemer',
                value: basisInfo.join('\n'),
                inline: false
            });
        }

        // Tel antwoorden
        let aantalVragen = 0;
        const maxVragen = formType === 'ambulance-ehbo' ? 20 : 
                          formType === 'ambulance-aed' ? 15 :
                          formType === 'ambulance-trauma' ? 18 : 16;

        for (let i = 1; i <= maxVragen; i++) {
            if (getField(`vraag${i}`)) aantalVragen++;
        }

        embed.fields.push({
            name: '📊 Toets Informatie',
            value: `**Type:** ${toetsNaam}\n**Aantal vragen:** ${aantalVragen}/${maxVragen}\n**Status:** ⏳ Wacht op beoordeling`,
            inline: false
        });

        // Voeg eerste 5 antwoorden toe als preview
        for (let i = 1; i <= Math.min(5, maxVragen); i++) {
            const vraag = getField(`vraag${i}`);
            if (vraag) {
                const preview = vraag.length > 150 ? vraag.substring(0, 147) + '...' : vraag;
                embed.fields.push({
                    name: `❓ Vraag ${i}`,
                    value: preview,
                    inline: false
                });
            }
        }

        if (aantalVragen > 5) {
            embed.fields.push({
                name: '📝 Opmerking',
                value: `*Nog ${aantalVragen - 5} antwoorden niet getoond. Bekijk volledig formulier voor alle antwoorden.*`,
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
