// Netlify Function: Get Blacklist (met fallback naar GitHub)
// Leest blacklist.json uit de repository

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
        // Fallback data - laad de initiële blacklist vanuit de build
        const fallbackData = {
            servers: [
                "De Lijn RP",
                "Saade Community",
                "Biggs Leaks",
                "Schaap Community",
                "Pyschopaten Community",
                "Buildify Development",
                "Weekly Scripts",
                "Leaker Community",
                "Dutch Hollandia RP V2",
                "Urk",
                "VOX V2",
                "Bartekboys",
                "Bovenkarspel Roleplay",
                "Fire Response: Drenthe",
                "Blaze Services",
                "Fatahdevshop",
                "Luuk Development",
                "Amsterdam Roleplay",
                "De Nederlandser Expose Server",
                "GaG Shop NL/EN",
                "Dutch Oisterwijk RP",
                "Albertheijn RP Rotterdam",
                "Cola | Hangout VC Gaming Community",
                "Silent",
                "Dutch-Holland-Roleplay",
                "Amsterdam Roleplay (PhysicGamingYT & Bas08112013)",
                "Dutch Eindhoven Roleplay NL",
                "Apeldoorn Roleplay OG",
                "AnoxGuard",
                "Cheatos"
            ],
            lastUpdated: "2026-02-12T00:00:00Z"
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=60' // Cache 1 minuut
            },
            body: JSON.stringify(fallbackData)
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
                servers: [],
                lastUpdated: null
            })
        };
    }
};
