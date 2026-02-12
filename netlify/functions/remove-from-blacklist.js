// Netlify Function: Remove from Blacklist (Supabase)
// Verwijdert een server van de blacklist in Supabase

const { createClient } = require('@supabase/supabase-js');

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

        // Verwijder server
        const { data, error } = await supabase
            .from('blacklist')
            .delete()
            .eq('server_name', serverName)
            .select();

        if (error) {
            console.error('Supabase delete error:', error);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to remove server',
                    details: error.message 
                })
            };
        }

        if (!data || data.length === 0) {
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

        // Tel totaal aantal servers
        const { count } = await supabase
            .from('blacklist')
            .select('*', { count: 'exact', head: true });

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
                totalServers: count || 0
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
