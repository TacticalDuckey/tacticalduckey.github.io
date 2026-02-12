// Netlify Function: Update Blacklist (Discord Database)
// Voegt een server toe door een bericht te posten in Discord kanaal

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
        
        // Extract server naam uit bericht
        const serverName = (payload.content || '').trim();

        if (!serverName || serverName.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Server name cannot be empty' })
            };
        }

        const botToken = process.env.BOT_TOKEN;
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

        // Check of server al bestaat (lees alle messages)
        const checkResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            {
                headers: {
                    'Authorization': `Bot ${botToken}`
                }
            }
        );

        if (checkResponse.ok) {
            const existingMessages = await checkResponse.json();
            const serverExists = existingMessages.some(
                msg => msg.content.trim().toLowerCase() === serverName.toLowerCase()
            );

            if (serverExists) {
                // Stuur waarschuwing naar Discord
                await fetch(
                    `https://discord.com/api/v10/channels/${channelId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            embeds: [{
                                title: '⚠️ Server Al op Blacklist',
                                description: `**${serverName}** staat al op de blacklist`,
                                color: 0xFFA500, // Oranje
                                fields: [
                                    {
                                        name: '📊 Totaal Blacklist',
                                        value: `${existingMessages.length} servers`,
                                        inline: true
                                    }
                                ],
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: 'Lage Landen RP • Blacklist Systeem'
                                }
                            }]
                        })
                    }
                );

                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({ 
                        message: 'Server already on blacklist',
                        serverName: serverName,
                        totalServers: existingMessages.length
                    })
                };
            }
        }

        // Post bericht naar Discord kanaal
        const postResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: serverName
                })
            }
        );

        if (!postResponse.ok) {
            const errorText = await postResponse.text();
            console.error('Discord post error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to add server to Discord',
                    details: errorText 
                })
            };
        }

        // Haal updated totaal op
        const countResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
            {
                headers: {
                    'Authorization': `Bot ${botToken}`
                }
            }
        );

        let totalServers = 0;
        if (countResponse.ok) {
            const messages = await countResponse.json();
            totalServers = messages.length;
        }

        // Stuur bevestigingsbericht in Discord kanaal
        await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    embeds: [{
                        title: '✅ Server Toegevoegd aan Blacklist',
                        description: `**${serverName}** is succesvol toegevoegd aan de blacklist`,
                        color: 0xC8102E, // Rood (Lage Landen RP kleur)
                        fields: [
                            {
                                name: '🎮 Server',
                                value: serverName,
                                inline: true
                            },
                            {
                                name: '📊 Totaal Blacklist',
                                value: `${totalServers} servers`,
                                inline: true
                            }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'Lage Landen RP • Blacklist Systeem'
                        }
                    }]
                })
            }
        );

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                success: true,
                message: 'Server added to blacklist',
                serverName: serverName,
                totalServers: totalServers
            })
        };

    } catch (error) {
        console.error('Error updating blacklist:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: 'Failed to update blacklist',
                details: error.message 
            })
        };
    }
};
