// Netlify Function: Get Blacklist (Supabase)
// Retourneert de blacklist uit Supabase database

const { createClient } = require('@supabase/supabase-js');

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
                body: JSON.stringify({ 
                    error: 'Supabase configuration missing',
                    servers: [],
                    lastUpdated: null
                })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch all blacklisted servers
        const { data, error } = await supabase
            .from('blacklist')
            .select('*')
            .order('server_name', { ascending: true });

        if (error) {
            console.error('Supabase error:', error);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Database error',
                    servers: [],
                    lastUpdated: null
                })
            };
        }

        // Transform data
        const servers = data.map(row => row.server_name);
        const lastUpdated = data.length > 0 
            ? data.reduce((latest, row) => {
                const rowDate = new Date(row.updated_at || row.created_at);
                return rowDate > latest ? rowDate : latest;
              }, new Date(0)).toISOString()
            : null;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=60' // Cache 1 minuut
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
