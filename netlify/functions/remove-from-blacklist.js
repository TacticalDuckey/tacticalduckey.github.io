// Netlify Function: Remove from Blacklist
// Verwijdert een server van de blacklist (alleen voor geauthoriseerde verzoeken)

const fs = require('fs');
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

        // Vind blacklist bestand
        const paths = [
            path.join(__dirname, '../../blacklist.json'),
            path.join(process.cwd(), 'blacklist.json'),
            '/var/task/blacklist.json'
        ];
        
        let blacklistPath;
        for (const testPath of paths) {
            if (fs.existsSync(testPath)) {
                blacklistPath = testPath;
                break;
            }
        }
        
        if (!blacklistPath) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Blacklist file not found' })
            };
        }

        // Lees huidige blacklist
        const fileContent = fs.readFileSync(blacklistPath, 'utf8');
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
        fs.writeFileSync(
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
