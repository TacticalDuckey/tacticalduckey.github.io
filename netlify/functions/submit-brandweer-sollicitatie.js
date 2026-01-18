// Netlify Function voor Brandweer Sollicitaties
// Verbergt webhook URL voor veiligheid

exports.handler = async (event, context) => {
    // Alleen POST requests toestaan
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const data = JSON.parse(event.body);
        
        // Webhook URL uit environment variable
        const WEBHOOK_URL = process.env.BRANDWEER_WEBHOOK_URL;
        
        if (!WEBHOOK_URL) {
            console.error('Brandweer webhook URL not configured');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        // Verstuur naar Discord
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Discord webhook failed: ${response.status}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: 'Sollicitatie verzonden!' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Er ging iets fout bij het verzenden',
                details: error.message 
            })
        };
    }
};
