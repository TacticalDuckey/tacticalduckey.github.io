// Netlify Function: Remove from Blacklist (Supabase REST API)
// Verwijdert een server uit de blacklist in Supabase via REST API
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
            'Content-Type': 'application/json'
        };

        // Delete via REST API
        const deleteResponse = await fetch(
            `${supabaseUrl}/rest/v1/blacklist?server_name=eq.${encodeURIComponent(serverName)}`,
            {
                method: 'DELETE',
                headers: headers
            }
        );

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('Supabase delete error:', errorText);
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                    error: 'Failed to delete server',
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
