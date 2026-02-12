// Netlify Function: Get Blacklist (Discord Database)
// Haalt alle blacklisted servers op uit Discord kanaal (elk bericht = 1 server)

exports.handler = async (event, context) => {
    // Allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const channelId = process.env.DISCORD_CHANNEL_ID;

        if (!botToken || !channelId) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Discord configuration missing',
                    servers: [],
                    lastUpdated: null
                })
            };
        }

        // Haal berichten op uit Discord kanaal (laatste 100)
        const response = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            {
                headers: {
                    'Authorization': `Bot ${botToken}`
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Discord API error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to fetch from Discord',
                    servers: [],
                    lastUpdated: null
                })
            };
        }

        const messages = await response.json();

        // Elk bericht content = server naam
        const servers = messages
            .map(msg => msg.content.trim())
            .filter(content => content.length > 0)
            .reverse(); // Oudste eerst

        const lastUpdated = messages.length > 0 
            ? messages[0].timestamp 
            : null;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=60'
            },
            body: JSON.stringify({
                servers: servers,
                lastUpdated: lastUpdated,
                total: servers.length
            })
        };

    } catch (error) {
        console.error('Error loading blacklist:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: 'Failed to load blacklist',
                details: error.message,
                servers: [],
                lastUpdated: null
            })
        };
    }
};
