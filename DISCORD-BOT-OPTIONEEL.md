# Discord Bot Integratie (Optioneel)

Als je het liever met een Discord bot wilt doen in plaats van webhooks, kun je deze code gebruiken.

## Discord.js Bot Code

```javascript
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const BLACKLIST_CHANNEL_ID = 'JOUW_KANAAL_ID'; // Vervang met je kanaal ID
const API_URL = 'https://jouw-site.netlify.app/.netlify/functions/update-blacklist';
const REMOVE_API_URL = 'https://jouw-site.netlify.app/.netlify/functions/remove-from-blacklist';
const AUTH_KEY = 'JOUW_GEHEIME_SLEUTEL'; // Zelfde als in Netlify

client.on('ready', () => {
    console.log(`✅ Bot is online als ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    // Negeer bot berichten
    if (message.author.bot) return;
    
    // Alleen in blacklist kanaal
    if (message.channel.id !== BLACKLIST_CHANNEL_ID) return;

    const content = message.content.trim();

    // Commando: !add <server naam>
    if (content.startsWith('!add ')) {
        const serverName = content.substring(5).trim();
        
        if (!serverName) {
            return message.reply('❌ Geef een server naam op!');
        }

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: serverName })
            });

            const data = await response.json();

            if (response.ok) {
                const embed = new EmbedBuilder()
                    .setColor('#10b981')
                    .setTitle('✅ Server Toegevoegd')
                    .setDescription(`**${serverName}** is toegevoegd aan de blacklist`)
                    .addFields({ 
                        name: 'Totaal Servers', 
                        value: data.totalServers.toString(), 
                        inline: true 
                    })
                    .setTimestamp();

                message.reply({ embeds: [embed] });
            } else {
                message.reply(`❌ Fout: ${data.error || 'Onbekende fout'}`);
            }
        } catch (error) {
            console.error(error);
            message.reply('❌ Fout bij het toevoegen van de server');
        }
    }

    // Commando: !remove <server naam>
    if (content.startsWith('!remove ') && message.member.permissions.has('Administrator')) {
        const serverName = content.substring(8).trim();
        
        if (!serverName) {
            return message.reply('❌ Geef een server naam op!');
        }

        try {
            const response = await fetch(REMOVE_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    serverName: serverName,
                    authKey: AUTH_KEY 
                })
            });

            const data = await response.json();

            if (response.ok) {
                const embed = new EmbedBuilder()
                    .setColor('#ef4444')
                    .setTitle('🗑️ Server Verwijderd')
                    .setDescription(`**${serverName}** is verwijderd van de blacklist`)
                    .addFields({ 
                        name: 'Totaal Servers', 
                        value: data.totalServers.toString(), 
                        inline: true 
                    })
                    .setTimestamp();

                message.reply({ embeds: [embed] });
            } else {
                message.reply(`❌ Fout: ${data.error || 'Onbekende fout'}`);
            }
        } catch (error) {
            console.error(error);
            message.reply('❌ Fout bij het verwijderen van de server');
        }
    }

    // Commando: !list
    if (content === '!list') {
        try {
            const response = await fetch('https://jouw-site.netlify.app/.netlify/functions/get-blacklist');
            const data = await response.json();

            const embed = new EmbedBuilder()
                .setColor('#3b82f6')
                .setTitle('📋 Blacklist Overzicht')
                .setDescription(data.servers.length > 0 
                    ? data.servers.join('\n') 
                    : 'Geen servers op de blacklist')
                .addFields({ 
                    name: 'Totaal', 
                    value: data.servers.length.toString(), 
                    inline: true 
                })
                .setFooter({ 
                    text: `Laatst bijgewerkt: ${new Date(data.lastUpdated).toLocaleString('nl-NL')}` 
                })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            message.reply('❌ Fout bij het ophalen van de blacklist');
        }
    }

    // Commando: !help
    if (content === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#8b5cf6')
            .setTitle('📚 Blacklist Bot Commando\'s')
            .setDescription('Beschikbare commando\'s:')
            .addFields(
                { name: '!add <naam>', value: 'Voeg een server toe aan de blacklist' },
                { name: '!remove <naam>', value: 'Verwijder een server (Admin only)' },
                { name: '!list', value: 'Toon alle servers op de blacklist' },
                { name: '!help', value: 'Toon dit help bericht' }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

client.login('JOUW_BOT_TOKEN');
```

## Package.json

```json
{
  "name": "blacklist-discord-bot",
  "version": "1.0.0",
  "main": "bot.js",
  "dependencies": {
    "discord.js": "^14.14.1",
    "node-fetch": "^2.7.0"
  },
  "scripts": {
    "start": "node bot.js"
  }
}
```

## Setup

1. Installeer dependencies:
```bash
npm install
```

2. Configureer de constanten bovenaan het bestand:
   - `BLACKLIST_CHANNEL_ID`: Het Discord kanaal ID voor blacklist updates
   - `API_URL`: Jouw Netlify functie URL
   - `AUTH_KEY`: Zelfde geheime sleutel als in Netlify

3. Start de bot:
```bash
npm start
```

## Commando's

- `!add Server Naam` - Voegt server toe aan blacklist
- `!remove Server Naam` - Verwijdert server (Admin only)
- `!list` - Toont alle servers op blacklist
- `!help` - Toont help bericht

## Bot Permissions

De bot heeft de volgende permissions nodig:
- Read Messages/View Channels
- Send Messages
- Embed Links
- Read Message History

## Voordelen van Bot vs Webhook

**Bot Voordelen:**
- ✅ Meer controle en validatie
- ✅ Mooie embed berichten
- ✅ Commando's voor beheer
- ✅ Kan lijst direct in Discord tonen
- ✅ Admin-only commando's

**Webhook Voordelen:**
- ✅ Simpeler te setup
- ✅ Geen server nodig om bot te hosten
- ✅ Direct berichten = direct toevoegen

Kies wat het beste past bij jouw use case!
