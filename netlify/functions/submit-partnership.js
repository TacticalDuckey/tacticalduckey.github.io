// Netlify Function - Partnership Aanvraag Handler
// Stuurt partnership aanvragen naar Discord via PARTNERSHIP_WEBHOOK_URL

exports.handler = async (event, context) => {
    const allowedOrigins = [
        'https://lagelanden.netlify.app',
        'https://tacticalduckey.github.io',
        'http://localhost:8888',
        'http://localhost:3000'
    ];

    const origin = event.headers.origin || event.headers.Origin;
    const isAllowedOrigin = allowedOrigins.includes(origin);

    const headers = {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    if (event.httpMethod !== 'POST' && event.httpMethod !== 'OPTIONS') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (!isAllowedOrigin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden - Invalid origin' }) };
    }

    try {
        const payload = JSON.parse(event.body);

        const WEBHOOK_URL = process.env.PARTNERSHIP_WEBHOOK_URL;

        if (!WEBHOOK_URL) {
            console.error('PARTNERSHIP_WEBHOOK_URL not configured');
            throw new Error('Partnership Webhook URL not configured');
        }

        console.log('Sending partnership request to Discord...');

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Discord API error:', response.status, errorText);
            throw new Error(`Discord API error: ${response.status}`);
        }

        console.log('Partnership request successfully sent to Discord');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Partnership aanvraag succesvol verzonden' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
