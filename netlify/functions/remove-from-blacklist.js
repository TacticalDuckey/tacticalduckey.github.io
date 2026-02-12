// Netlify Function: Remove from Blacklist (Discord Database)
// Verwijdert een server door het Discord bericht te deleten
// Vereist authenticatie met BLACKLIST_AUTH_KEY

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
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
        const payload = JSON.parse(event.body);
        const { serverName, authKey } = payload;

        // Authenticatie
        const validAuthKey = process.env.BLACKLIST_AUTH_KEY || 'CHANGE_THIS_SECRET';
        
        if (authKey !== validAuthKey) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        if (!serverName) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Server name is required' })
            };
        }

        const botToken = process.env.DISCORD_BOT_TOKEN;
        const channelId = process.env.DISCORD_CHANNEL_ID;

        if (!botToken || !channelId) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Discord configuration missing' })
            };
        }

        // Zoek het bericht met deze server naam
        const messagesResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            {
                headers: {
                    'Authorization': `Bot ${botToken}`
                }
            }
        );

        if (!messagesResponse.ok) {
            const errorText = await messagesResponse.text();
            console.error('Discord fetch error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to fetch messages from Discord',
                    details: errorText 
                })
            };
        }

        const messages = await messagesResponse.json();
        const messageToDelete = messages.find(
            msg => msg.content.trim().toLowerCase() === serverName.toLowerCase()
        );

        if (!messageToDelete) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Server not found on blacklist',
                    serverName: serverName 
                })
            };
        }

        // Delete het bericht
        const deleteResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageToDelete.id}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bot ${botToken}`
                }
            }
        );

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('Discord delete error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to delete message from Discord',
                    details: errorText 
                })
            };
        }

        const totalServers = messages.length - 1; // -1 omdat we er net 1 hebben verwijderd

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                success: true,
                message: 'Server removed from blacklist',
                serverName: serverName,
                totalServers: totalServers
            })
        };

    } catch (error) {
        console.error('Error removing from blacklist:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: 'Failed to remove from blacklist',
                details: error.message 
            })
        };
    }
};
