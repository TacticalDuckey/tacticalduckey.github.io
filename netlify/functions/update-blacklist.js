// Netlify Function: Discord Webhook -> Blacklist Update
// Ontvangt Discord webhook messages en update de blacklist
// Environment Variable: DISCORD_BLACKLIST (webhook URL)

const fs = require('fs');
const path = require('path');

// Optioneel: Stuur confirmation naar Discord
async function sendDiscordNotification(serverName, totalServers) {
    const webhookUrl = process.env.DISCORD_BLACKLIST;
    
    if (!webhookUrl) {
        // Geen webhook geconfigureerd, skip notificatie
        return;
    }

    try {
        // Use native fetch (available in Node 18+) or skip if not available
        if (typeof fetch !== 'undefined') {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: '✅ Server Toegevoegd aan Blacklist',
                        description: `**${serverName}** is toegevoegd aan de blacklist`,
                        color: 0xC8102E, // Rood
                        fields: [
                            { name: 'Server', value: serverName, inline: true },
                            { name: 'Totaal', value: totalServers.toString(), inline: true }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: { text: 'Lage Landen RP Blacklist System' }
                    }]
                })
            });
        }
    } catch (error) {
        console.error('Discord notification failed:', error);
        // Negeer errors - notificatie is optioneel
    }
}

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        
        // Verificatie: Check of het een Discord webhook is
        if (!payload.content && !payload.embeds) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid Discord webhook payload' })
            };
        }

        // Extract server naam uit bericht
        const content = payload.content || '';
        const serverName = content.trim();

        if (!serverName || serverName.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Server name cannot be empty' })
            };
        }

        // Vind blacklist bestand
        const paths = [
            path.join(__dirname, '../../blacklist.json'),
            path.join(process.cwd(), 'blacklist.json'),
            '/var/task/blacklist.json'
        ];
        
        let blacklistPath;
        for (const testPath of paths) {
            if (fs.existsSync(testPath)) {
                blacklistPath = testPath;
                break;
            }
        }
        
        if (!blacklistPath) {
            // Maak nieuw bestand in de eerste mogelijke locatie
            blacklistPath = paths[0];
            const dir = path.dirname(blacklistPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        
        // Lees huidige blacklist
        let blacklistData;
        
        try {
            if (fs.existsSync(blacklistPath)) {
                const fileContent = fs.readFileSync(blacklistPath, 'utf8');
                blacklistData = JSON.parse(fileContent);
            } else {
                blacklistData = { servers: [], lastUpdated: null };
            }
        } catch (error) {
            // Als bestand niet bestaat of corrupt is, maak een nieuwe lijst
            blacklistData = { servers: [], lastUpdated: null };
        }

        // Check of server al op de lijst staat
        if (blacklistData.servers.includes(serverName)) {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'Server already on blacklist',
                    serverName: serverName 
                })
            };
        }

        // Voeg server toe aan blacklist
        blacklistData.servers.push(serverName);
        blacklistData.lastUpdated = new Date().toISOString();

        // Sorteer alfabetisch voor overzichtelijkheid
        blacklistData.servers.sort();

        // Schrijf terug naar bestand
        fs.writeFileSync(
            blacklistPath, 
            JSON.stringify(blacklistData, null, 2),
            'utf8'
        );

        // Optioneel: Stuur bevestiging naar Discord
        await sendDiscordNotification(serverName, blacklistData.servers.length);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: true,
                message: 'Server added to blacklist',
                serverName: serverName,
                totalServers: blacklistData.servers.length
            })
        };

    } catch (error) {
        console.error('Error updating blacklist:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Failed to update blacklist',
                details: error.message 
            })
        };
    }
};
