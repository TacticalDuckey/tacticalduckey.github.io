// Load environment variables
const fs = require('fs');
const path = require('path');

// Probeer .env file te laden (handmatig zonder dotenv library)
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    console.log('✅ Environment variables geladen vanuit .env file');
  }
} catch (err) {
  console.log('⚠️  Kon .env file niet laden:', err.message);
}

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1471529070712848588';
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN niet gevonden in environment variables!');
  process.exit(1);
}

client.on('ready', () => {
  console.log(`✅ Bot is online als ${client.user.tag}`);
  console.log(`📡 Luistert naar kanaal: ${CHANNEL_ID}`);
  console.log(`🎯 Type server namen in Discord (elke regel = 1 server)`);
});

client.on('messageCreate', async (message) => {
  // Negeer bot berichten
  if (message.author.bot) return;
  
  // Alleen luisteren naar het blacklist kanaal
  if (message.channel.id !== CHANNEL_ID) return;

  try {
    // Split bericht op nieuwe regels OF komma's
    let lines = message.content.split('\n').map(line => line.trim());
    
    // Als er maar 1 regel is, probeer split op komma's
    if (lines.length === 1 && lines[0].includes(',')) {
      lines = lines[0].split(',').map(s => s.trim());
    }
    
    // Filter lege entries
    lines = lines.filter(line => line.length > 0);

    if (lines.length === 0) return;

    console.log(`📝 Verwerk ${lines.length} server(s) van ${message.author.tag}`);

    // Haal alle bestaande servers op
    const existingMessages = await message.channel.messages.fetch({ limit: 100 });
    const existingServers = new Set(
      existingMessages
        .filter(msg => msg.content && msg.author.id === client.user.id)
        .map(msg => msg.content.trim().toLowerCase())
    );

    const results = {
      added: [],
      duplicates: [],
      errors: []
    };

    // Verwerk elke server
    for (const serverName of lines) {
      try {
        const serverLower = serverName.toLowerCase();

        // Check duplicate
        if (existingServers.has(serverLower)) {
          console.log(`⚠️  Duplicate: ${serverName}`);
          results.duplicates.push(serverName);
          continue;
        }

        // Voeg toe aan Discord kanaal
        await message.channel.send(serverName);
        existingServers.add(serverLower); // Voorkom dubbele toevoegingen in batch
        results.added.push(serverName);
        console.log(`✅ Toegevoegd: ${serverName}`);

      } catch (error) {
        console.error(`❌ Error bij ${serverName}:`, error);
        results.errors.push(serverName);
      }
    }

    // Verwijder originele bericht van gebruiker
    await message.delete().catch(() => {});

    // Haal nieuw totaal op
    const allMessages = await message.channel.messages.fetch({ limit: 100 });
    const totalCount = allMessages.filter(
      msg => msg.content && msg.author.id === client.user.id
    ).size;

    // Bouw embed response
    const embed = new EmbedBuilder()
      .setTimestamp()
      .setFooter({ text: `Totaal: ${totalCount} servers op blacklist` });

    // Success embed
    if (results.added.length > 0) {
      embed.setTitle(`✅ ${results.added.length} Server${results.added.length > 1 ? 's' : ''} Toegevoegd`);
      embed.setColor(0x00FF00); // Groen
      embed.setDescription(results.added.map((s, i) => `${i + 1}. **${s}**`).join('\n'));
    }
    // Alleen duplicaten
    else if (results.duplicates.length > 0 && results.added.length === 0) {
      embed.setTitle('⚠️ Duplicaten Gedetecteerd');
      embed.setColor(0xFFA500); // Oranje
      embed.setDescription(
        results.duplicates.length === 1
          ? `**${results.duplicates[0]}** staat al op de blacklist!`
          : `Deze servers staan al op de blacklist:\n${results.duplicates.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      );
    }
    // Alleen errors
    else if (results.errors.length > 0) {
      embed.setTitle('❌ Fout bij Toevoegen');
      embed.setColor(0xFF0000); // Rood
      embed.setDescription(`Kon deze servers niet toevoegen:\n${results.errors.join(', ')}`);
    }

    // Voeg extra info toe als mixed results
    const fields = [];
    
    if (results.added.length > 0 && results.duplicates.length > 0) {
      fields.push({
        name: '⚠️ Duplicaten (overgeslagen)',
        value: results.duplicates.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        inline: false
      });
    }

    if (results.errors.length > 0 && (results.added.length > 0 || results.duplicates.length > 0)) {
      fields.push({
        name: '❌ Fouten',
        value: results.errors.join(', '),
        inline: false
      });
    }

    if (fields.length > 0) {
      embed.addFields(fields);
    }

    // Stuur embed response
    await message.channel.send({ embeds: [embed] });

  } catch (error) {
    console.error('❌ Fout bij verwerken bericht:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Systeemfout')
      .setDescription('Er ging iets mis bij het verwerken van je bericht.')
      .setColor(0xFF0000)
      .setTimestamp();
    
    await message.channel.send({ embeds: [errorEmbed] }).catch(() => {});
  }
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

// Login
client.login(BOT_TOKEN).catch((error) => {
  console.error('❌ Kon niet inloggen:', error);
  process.exit(1);
});
