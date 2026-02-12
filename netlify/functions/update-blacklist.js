// Netlify Function: Update Blacklist (Supabase REST API)
// Voegt een server toe aan de blacklist in Supabase via REST API

// Optioneel: Stuur confirmation naar Discord
async function sendDiscordNotification(serverName, totalServers) {
    const webhookUrl = process.env.DISCORD_BLACKLIST;
    
    if (!webhookUrl) {
        return;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: '✅ Server Toegevoegd aan Blacklist',
                    description: `**${serverName}** is toegevoegd aan de blacklist`,
                    color: 0xC8102E,
                    fields: [
                        { name: 'Server', value: serverName, inline: true },
                        { name: 'Totaal', value: totalServers.toString(), inline: true }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Lage Landen RP Blacklist System' }
                }]
            })
        });
    } catch (error) {
        console.error('Discord notification failed:', error);
    }
}

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

        // Supabase credentials
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Supabase configuration missing' })
            };
        }

        const headers = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        // Check of server al bestaat
        const checkResponse = await fetch(
            `${supabaseUrl}/rest/v1/blacklist?server_name=eq.${encodeURIComponent(serverName)}&select=id`,
            { headers }
        );

        const existing = await checkResponse.json();

        if (existing && existing.length > 0) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    message: 'Server already on blacklist',
                    serverName: serverName 
                })
            };
        }

        // Voeg server toe via REST API
        const insertResponse = await fetch(
            `${supabaseUrl}/rest/v1/blacklist`,
            {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    server_name: serverName,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
            }
        );

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Supabase insert error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to add server',
                    details: errorText 
                })
            };
        }

        // Tel totaal aantal servers
        const countResponse = await fetch(
            `${supabaseUrl}/rest/v1/blacklist?select=id`,
            { 
                headers,
                method: 'HEAD'
            }
        );
        
        const countHeader = countResponse.headers.get('content-range');
        const totalServers = countHeader ? parseInt(countHeader.split('/')[1]) : 0;

        // Optioneel: Stuur Discord notificatie
        await sendDiscordNotification(serverName, totalServers);

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
