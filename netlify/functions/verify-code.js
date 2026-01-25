// Netlify Function voor het valideren van sollicitatiecodes
// Gebruikt een eenvoudig in-memory systeem (voor productie: gebruik een database)

// In-memory storage voor codes (tijdelijke oplossing)
// Voor productie: gebruik Netlify Blobs, een database, of een KV store
let activeCodes = [];

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action, code, type, validDays } = body;

        // ===== GENERATE CODE =====
        if (action === 'generate') {
            const newCode = generateRandomCode();
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + (validDays || 7));

            const codeObject = {
                code: newCode,
                type: type,
                createdAt: new Date().toISOString(),
                expiresAt: expiryDate.toISOString(),
                used: false,
                usedAt: null
            };

            activeCodes.push(codeObject);
            
            // Clean up expired codes
            cleanupExpiredCodes();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    code: codeObject
                })
            };
        }

        // ===== VERIFY CODE =====
        if (action === 'verify') {
            if (!code || !type) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Code en type zijn verplicht'
                    })
                };
            }

            const codeObj = activeCodes.find(c => 
                c.code.toUpperCase() === code.toUpperCase() &&
                c.type === type &&
                !c.used
            );

            if (!codeObj) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        valid: false,
                        message: '❌ ONGELDIGE CODE\n\nDeze code bestaat niet, is al gebruikt, of is voor een ander formulier.\n\nVraag een nieuwe code aan bij staff.'
                    })
                };
            }

            // Check expiry
            const now = new Date();
            const expiry = new Date(codeObj.expiresAt);
            if (expiry < now) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        valid: false,
                        message: '⏰ CODE VERLOPEN\n\nDeze code is verlopen op ' + expiry.toLocaleDateString('nl-NL') + '.\n\nVraag een nieuwe code aan bij staff.'
                    })
                };
            }

            // Mark as used
            codeObj.used = true;
            codeObj.usedAt = now.toISOString();

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    valid: true,
                    message: '✅ Code geldig!'
                })
            };
        }

        // ===== GET ACTIVE CODES (voor staff) =====
        if (action === 'list') {
            cleanupExpiredCodes();
            
            const activeCodesList = activeCodes.filter(c => {
                const expiry = new Date(c.expiresAt);
                return expiry > new Date() && !c.used;
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    codes: activeCodesList
                })
            };
        }

        // ===== REVOKE CODE =====
        if (action === 'revoke') {
            const index = activeCodes.findIndex(c => c.code === code);
            if (index !== -1) {
                activeCodes.splice(index, 1);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Code ingetrokken'
                    })
                };
            }
            
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Code niet gevonden'
                })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Onbekende actie'
            })
        };

    } catch (error) {
        console.error('Error in verify-code function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Server error: ' + error.message
            })
        };
    }
};

// Helper function: Generate random code
function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 2) code += '-';
    }
    return code;
}

// Helper function: Cleanup expired codes
function cleanupExpiredCodes() {
    const now = new Date();
    activeCodes = activeCodes.filter(c => {
        const expiry = new Date(c.expiresAt);
        return expiry > now || c.used; // Keep used codes for record
    });
}
