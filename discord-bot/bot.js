// Discord Bot voor Lage Landen RP Blacklist
// Luistert naar berichten in blacklist kanaal en registreert servers automatisch

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Environment variabelen
const BOT_TOKEN = process.env.BOT_TOKEN;
const BLACKLIST_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// Maak Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Bot is klaar
client.once('ready', () => {
    console.log(`✅ Bot is online als ${client.user.tag}`);
    console.log(`📋 Luistert naar blacklist kanaal: ${BLACKLIST_CHANNEL_ID}`);
});

// Luister naar nieuwe berichten
client.on('messageCreate', async (message) => {
    // Negeer bot berichten
    if (message.author.bot) return;
    
    // Alleen berichten in blacklist kanaal
    if (message.channel.id !== BLACKLIST_CHANNEL_ID) return;
    
    const serverName = message.content.trim();
    
    // Check of het een lege bericht is
    if (!serverName || serverName.length === 0) {
        return;
    }
    
    try {
        // Haal alle bestaande berichten op om duplicaten te checken
        const messages = await message.channel.messages.fetch({ limit: 100 });
        
        // Check of server al bestaat (negeer het huidige bericht)
        const isDuplicate = messages.some(msg => 
            msg.id !== message.id && 
            !msg.author.bot && 
            msg.content.trim().toLowerCase() === serverName.toLowerCase()
        );
        
        if (isDuplicate) {
            // Server staat al op blacklist
            const warningEmbed = new EmbedBuilder()
                .setTitle('⚠️ Server Al op Blacklist')
                .setDescription(`**${serverName}** staat al op de blacklist`)
                .setColor(0xFFA500) // Oranje
                .addFields({
                    name: '📊 Totaal Blacklist',
                    value: `${messages.filter(m => !m.author.bot).size} servers`,
                    inline: true
                })
                .setTimestamp()
                .setFooter({ text: 'Lage Landen RP • Blacklist Systeem' });
            
            await message.reply({ embeds: [warningEmbed] });
            
            // Verwijder het dubbele bericht
            await message.delete();
            return;
        }
        
        // Server succesvol toegevoegd
        const totalServers = messages.filter(m => !m.author.bot).size + 1;
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Server Toegevoegd aan Blacklist')
            .setDescription(`**${serverName}** is succesvol toegevoegd aan de blacklist`)
            .setColor(0xC8102E) // Rood (Lage Landen RP kleur)
            .addFields(
                {
                    name: '🎮 Server',
                    value: serverName,
                    inline: true
                },
                {
                    name: '📊 Totaal Blacklist',
                    value: `${totalServers} servers`,
                    inline: true
                },
                {
                    name: '👤 Toegevoegd door',
                    value: message.author.tag,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: 'Lage Landen RP • Blacklist Systeem' });
        
        await message.reply({ embeds: [successEmbed] });
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
        
        // Stuur error bericht
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Er ging iets fout')
            .setDescription('Kon de server niet toevoegen aan de blacklist')
            .setColor(0xFF0000)
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed] });
    }
});

// Login met bot token
client.login(BOT_TOKEN);
