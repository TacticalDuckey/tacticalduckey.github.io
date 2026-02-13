exports.handler = async function(event, context) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const botToken = process.env.BOT_TOKEN;

  if (!channelId || !botToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing environment variables' })
    };
  }

  // ========================================
  // DISCORD WEBHOOK MODE
  // ========================================
  // Als dit wordt aangeroepen via Discord webhook
  if (event.httpMethod === 'POST' && event.headers['x-signature-ed25519']) {
    try {
      const payload = JSON.parse(event.body);
      
      // Server naam uit bericht halen
      const serverName = payload.content?.trim();
      
      if (!serverName) {
        return { statusCode: 200, body: '' }; // Negeer lege berichten
      }

      // Check of server al bestaat
      const existingResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { 'Authorization': `Bot ${botToken}` }
        }
      );
      
      const existingMessages = await existingResponse.json();
      const isDuplicate = existingMessages.some(
        msg => msg.content?.toLowerCase() === serverName.toLowerCase()
      );

      if (isDuplicate) {
        // Stuur waarschuwing embed terug via webhook
        const webhookUrl = event.headers['x-webhook-url'] || process.env.DISCORD_WEBHOOK_URL;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title: '⚠️ Dubbele Server',
                description: `**${serverName}** staat al op de blacklist!`,
                color: 0xFFA500, // Oranje
                timestamp: new Date().toISOString()
              }]
            })
          });
        }
        
        return { statusCode: 200, body: '' };
      }

      // Voeg toe aan blacklist (post bericht in kanaal)
      const postResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: serverName })
        }
      );

      if (!postResponse.ok) {
        throw new Error('Failed to add server');
      }

      // Haal totaal aantal servers op
      const countResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { 'Authorization': `Bot ${botToken}` }
        }
      );
      const allMessages = await countResponse.json();
      const totalCount = allMessages.filter(m => m.content?.trim()).length;

      // Stuur success embed terug via webhook
      const webhookUrl = event.headers['x-webhook-url'] || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: '✅ Server Toegevoegd',
              description: `**${serverName}** is succesvol toegevoegd aan de blacklist!`,
              color: 0x00FF00, // Groen
              fields: [
                {
                  name: '📊 Totaal',
                  value: `${totalCount} servers`,
                  inline: true
                },
                {
                  name: '🕒 Tijdstip',
                  value: new Date().toLocaleString('nl-NL'),
                  inline: true
                }
              ],
              timestamp: new Date().toISOString()
            }]
          })
        });
      }

      return { statusCode: 200, body: '' };

    } catch (error) {
      console.error('Webhook error:', error);
      return { statusCode: 500, body: '' };
    }
  }

  // ========================================
  // ADMIN PANEL MODE (via fetch)
  // ========================================
  if (event.httpMethod === 'POST') {
    try {
      const data = JSON.parse(event.body);
      const serverNameInput = data.serverName?.trim();

      if (!serverNameInput) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Server naam is verplicht' })
        };
      }

      // Support voor meerdere servers (elke regel = 1 server OF komma-gescheiden)
      let serverNames = serverNameInput.split('\n').map(line => line.trim());
      
      // Als er maar 1 regel is, probeer split op komma's
      if (serverNames.length === 1 && serverNames[0].includes(',')) {
        serverNames = serverNames[0].split(',').map(s => s.trim());
      }
      
      // Filter lege entries
      serverNames = serverNames.filter(line => line.length > 0);

      // Haal bestaande servers op
      const existingResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { 'Authorization': `Bot ${botToken}` }
        }
      );
      
      const existingMessages = await existingResponse.json();
      const existingServers = new Set(
        existingMessages
          .filter(m => m.content?.trim())
          .map(m => m.content.trim().toLowerCase())
      );

      const results = {
        added: [],
        duplicates: [],
        errors: []
      };

      // Verwerk elke server
      for (const serverName of serverNames) {
        const serverLower = serverName.toLowerCase();

        // Check duplicate
        if (existingServers.has(serverLower)) {
          results.duplicates.push(serverName);
          continue;
        }

        // Voeg toe
        try {
          const postResponse = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ content: serverName })
            }
          );

          if (!postResponse.ok) {
            results.errors.push(serverName);
          } else {
            results.added.push(serverName);
            existingServers.add(serverLower); // Voorkom dubbele toevoegingen in batch
          }
        } catch {
          results.errors.push(serverName);
        }
      }

      // Als er duplicaten zijn en niets is toegevoegd
      if (results.added.length === 0 && results.duplicates.length > 0) {
        return {
          statusCode: 409,
          body: JSON.stringify({ 
            error: results.duplicates.length === 1 
              ? 'Deze server staat al op de blacklist' 
              : 'Deze servers staan al op de blacklist',
            duplicates: results.duplicates
          })
        };
      }

      // Haal nieuw totaal op
      const countResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
        {
          headers: { 'Authorization': `Bot ${botToken}` }
        }
      );
      const allMessages = await countResponse.json();
      const totalCount = allMessages.filter(m => m.content?.trim()).length;

      // Stuur embed bevestiging
      const embed = {
        color: 0x00FF00,
        timestamp: new Date().toISOString(),
        footer: { text: `Totaal: ${totalCount} servers op blacklist` }
      };

      if (results.added.length > 0) {
        embed.title = `✅ ${results.added.length} Server${results.added.length > 1 ? 's' : ''} Toegevoegd`;
        embed.description = results.added.map((s, i) => `${i + 1}. **${s}**`).join('\n');
        embed.fields = [];

        if (results.duplicates.length > 0) {
          embed.fields.push({
            name: '⚠️ Duplicaten (overgeslagen)',
            value: results.duplicates.map((s, i) => `${i + 1}. ${s}`).join('\n'),
            inline: false
          });
        }

        if (results.errors.length > 0) {
          embed.fields.push({
            name: '❌ Fouten',
            value: results.errors.join(', '),
            inline: false
          });
        }
      }

      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ embeds: [embed] })
        }
      );

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: true, 
          added: results.added,
          duplicates: results.duplicates,
          errors: results.errors
        })
      };

    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
