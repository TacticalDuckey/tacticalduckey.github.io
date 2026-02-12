// Netlify Function: Get Blacklist
// Retourneert de huidige blacklist als JSON

const fs = require('fs').promises;
const path = require('path');

exports.handler = async (event, context) => {
    // Allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Lees blacklist bestand
        const blacklistPath = path.join(process.cwd(), 'blacklist.json');
        const fileContent = await fs.readFile(blacklistPath, 'utf8');
        const blacklistData = JSON.parse(fileContent);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300' // Cache voor 5 minuten
            },
            body: JSON.stringify(blacklistData)
        };

    } catch (error) {
        console.error('Error reading blacklist:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Failed to load blacklist',
                servers: [],
                lastUpdated: null
            })
        };
    }
};
