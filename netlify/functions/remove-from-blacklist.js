exports.handler = async function(event, context) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const botToken = process.env.BOT_TOKEN;
  const authKey = process.env.BLACKLIST_AUTH_KEY;

  if (!channelId || !botToken || !authKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing environment variables' })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Check auth
    const providedKey = event.headers['authorization']?.replace('Bearer ', '');
    
    if (providedKey !== authKey) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const data = JSON.parse(event.body);
    const serverName = data.serverName?.trim();

    if (!serverName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Server naam is verplicht' })
      };
    }

    // Zoek het bericht met deze server naam
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      {
        headers: {
          'Authorization': `Bot ${botToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const messages = await response.json();
    const messageToDelete = messages.find(
      msg => msg.content?.toLowerCase() === serverName.toLowerCase()
    );

    if (!messageToDelete) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Server niet gevonden op blacklist' })
      };
    }

    // Verwijder het bericht
    const deleteResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageToDelete.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bot ${botToken}`
        }
      }
    );

    if (!deleteResponse.ok) {
      throw new Error('Failed to delete message');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, serverName })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
