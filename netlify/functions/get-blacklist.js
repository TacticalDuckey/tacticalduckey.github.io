exports.handler = async function(event, context) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const botToken = process.env.BOT_TOKEN;

  if (!channelId || !botToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing environment variables' })
    };
  }

  try {
    // Fetch alle berichten uit het Discord kanaal
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
      {
        headers: {
          'Authorization': `Bot ${botToken}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Discord API error:', error);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to fetch messages' })
      };
    }

    const messages = await response.json();
    
    // Filter alleen berichten met content (server namen)
    const servers = messages
      .filter(msg => msg.content && msg.content.trim())
      .map(msg => msg.content.trim())
      .reverse(); // Oudste eerst

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ servers })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
