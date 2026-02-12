// Netlify Function: Update Blacklist (Supabase)
// Voegt een server toe aan de blacklist in Supabase

const { createClient } = require('@supabase/supabase-js');

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

        // Initialize Supabase client
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

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Check of server al bestaat
        const { data: existing } = await supabase
            .from('blacklist')
            .select('id')
            .eq('server_name', serverName)
            .single();

        if (existing) {
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

        // Voeg server toe
        const { data, error } = await supabase
            .from('blacklist')
            .insert([
                { 
                    server_name: serverName,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            console.error('Supabase insert error:', error);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to add server',
                    details: error.message 
                })
            };
        }

        // Tel totaal aantal servers
        const { count } = await supabase
            .from('blacklist')
            .select('*', { count: 'exact', head: true });

        // Optioneel: Stuur Discord notificatie
        await sendDiscordNotification(serverName, count || 0);

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
                totalServers: count || 0
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
