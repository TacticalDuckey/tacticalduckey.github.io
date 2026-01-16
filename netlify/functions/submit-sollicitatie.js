// Netlify Function - Server-side Discord Webhook Handler
// Verbergt de Discord webhook URL voor publiek
// Secure CORS policy - alleen eigen domain

exports.handler = async (event, context) => {
    // Whitelist van toegestane origins
    const allowedOrigins = [
        'https://lagelandenrp.netlify.app',
        'https://tacticalduckey.github.io',
        'http://localhost:8888', // Voor lokaal testen
        'http://localhost:3000'
    ];

    const origin = event.headers.origin || event.headers.Origin;
    const isAllowedOrigin = allowedOrigins.includes(origin);

    // Security headers
    const headers = {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400', // 24 hours
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    // Alleen POST en OPTIONS toestaan
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'OPTIONS') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Check origin voor POST requests
    if (!isAllowedOrigin) {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: 'Forbidden - Invalid origin' })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        
        // Haal webhook URL uit environment variable
        const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        
        if (!DISCORD_WEBHOOK_URL) {
            throw new Error('Webhook URL not configured');
        }

        // Verstuur naar Discord
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status}`);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Sollicitatie succesvol verzonden' 
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                error: error.message 
            })
        };
    }
};
