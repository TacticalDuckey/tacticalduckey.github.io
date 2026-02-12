// Netlify Function: Get Blacklist (Supabase REST API)
// Retourneert de blacklist uit Supabase database via REST API

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

        // Fetch via Supabase REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/blacklist?select=*&order=server_name.asc`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase API error: ${response.status}`);
        }

        const data = await response.json();

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
