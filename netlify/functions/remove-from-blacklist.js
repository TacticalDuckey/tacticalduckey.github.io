// Netlify Function: Remove from Blacklist
// Verwijdert een server van de blacklist (alleen voor geauthoriseerde verzoeken)

const fs = require('fs').promises;
const path = require('path');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        const { serverName, authKey } = payload;

        // Simpele authenticatie (vervang door je eigen secret key)
        const validAuthKey = process.env.BLACKLIST_AUTH_KEY || 'CHANGE_THIS_SECRET';
        
        if (authKey !== validAuthKey) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        if (!serverName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Server name is required' })
            };
        }

        // Lees huidige blacklist
        const blacklistPath = path.join(process.cwd(), 'blacklist.json');
        const fileContent = await fs.readFile(blacklistPath, 'utf8');
        const blacklistData = JSON.parse(fileContent);

        // Verwijder server van de lijst
        const originalLength = blacklistData.servers.length;
        blacklistData.servers = blacklistData.servers.filter(
            server => server !== serverName
        );

        if (blacklistData.servers.length === originalLength) {
            return {
                statusCode: 404,
                body: JSON.stringify({ 
                    error: 'Server not found on blacklist',
                    serverName: serverName 
                })
            };
        }

        blacklistData.lastUpdated = new Date().toISOString();

        // Schrijf terug naar bestand
        await fs.writeFile(
            blacklistPath, 
            JSON.stringify(blacklistData, null, 2),
            'utf8'
        );

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: true,
                message: 'Server removed from blacklist',
                serverName: serverName,
                totalServers: blacklistData.servers.length
            })
        };

    } catch (error) {
        console.error('Error removing from blacklist:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Failed to remove from blacklist',
                details: error.message 
            })
        };
    }
};
