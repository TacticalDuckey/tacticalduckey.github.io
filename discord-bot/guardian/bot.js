// ----------------------------------------------------------------------------
//  Lage Landen RP — GUARDIAN BOT
//  🎵 Muziek  •  🛡️ Noodrespons als main bot weg is
// ----------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// .env laden
try {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const [k, ...v] = t.split('=');
        if (k && v.length) process.env[k.trim()] = v.join('=').trim();
      }
    });
  }
} catch {}

const {
  Client, GatewayIntentBits, EmbedBuilder,
  SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ActivityType,
} = require('discord.js');
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const { spawn }              = require('child_process');
const { Player }             = require('discord-player');
const { YoutubeiExtractor }  = require('discord-player-youtubei');
const { DefaultExtractors }  = require('@discord-player/extractor');

// --- Config -----------------------------------------------------------------
const GUARDIAN_TOKEN  = process.env.GUARDIAN_BOT_TOKEN;
const MAIN_BOT_ID     = process.env.MAIN_BOT_ID || '1471546418572296273';
const GUILD_ID        = process.env.GUILD_ID;
const SECURITY_LOG_CH = process.env.GUARDIAN_SECURITY_CHANNEL || process.env.SECURITY_LOG_CHANNEL_ID;
const QUARANTINE_ROLE = process.env.QUARANTINE_ROLE_ID;
const STAFF_ROLE_ID   = '1458531506208374879';
const ADMIN_ROLE_ID   = '1457747096601100441';

const MAIN_STATS_PATH  = path.join(__dirname, '..', 'bot-stats.json');
const GUARDIAN_LOG     = path.join(__dirname, 'guardian-events.json');
const GUARDIAN_QUEUE   = path.join(__dirname, 'guardian-queue.json');
const MAIN_BOT_PATH    = path.join(__dirname, '..', 'bot.js');
const ffmpegBin       = process.env.FFMPEG_PATH || 'ffmpeg';

if (!GUARDIAN_TOKEN) {
  console.error('❌ GUARDIAN_BOT_TOKEN ontbreekt in .env!');
  process.exit(1);
}

// --- Queue opslaan/herstellen -----------------------------------------------
function saveQueue(guildId) {
  try {
    const q = player.nodes.get(guildId);
    if (!q) return;
    const tracks = [];
    if (q.currentTrack) tracks.push({ title: q.currentTrack.title, url: q.currentTrack.url, duration: q.currentTrack.duration, author: q.currentTrack.author || '' });
    for (const t of q.tracks.toArray()) tracks.push({ title: t.title, url: t.url, duration: t.duration, author: t.author || '' });
    if (tracks.length === 0) return;
    fs.writeFileSync(GUARDIAN_QUEUE, JSON.stringify({ guildId, tracks, savedAt: Date.now() }, null, 2));
    console.log(`[GUARDIAN] Queue opgeslagen: ${tracks.length} nummer(s)`);
  } catch (e) { console.warn('[GUARDIAN] Queue opslaan mislukt:', e.message); }
}

function clearSavedQueue() {
  try { if (fs.existsSync(GUARDIAN_QUEUE)) fs.unlinkSync(GUARDIAN_QUEUE); } catch {}
}

// --- Log helpers ------------------------------------------------------------
function addEvent(type, data) {
  try {
    const events = (() => { try { return JSON.parse(fs.readFileSync(GUARDIAN_LOG, 'utf-8')); } catch { return []; } })();
    events.push({ type, data, ts: Date.now() });
    fs.writeFileSync(GUARDIAN_LOG, JSON.stringify(events.slice(-200), null, 2));
  } catch {}
  console.log(`[GUARDIAN] ${type}`, data);
}

// --- Discord client ---------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
  ],
});

// --- discord-player (YouTube) -----------------------------------------------
const player = new Player(client, {
  ytdlOptions: { quality: 'highestaudio', highWaterMark: 1 << 25 },
});
(async () => {
  await player.extractors.register(YoutubeiExtractor, {}).catch(() => {});
  await player.extractors.loadMulti(DefaultExtractors).catch(() => {});
})();

// --- Security log helper ----------------------------------------------------
async function secLog(embed) {
  if (!SECURITY_LOG_CH) return;
  try {
    const ch = await client.channels.fetch(SECURITY_LOG_CH);
    await ch.send({ embeds: [embed] });
  } catch {}
}

// --- Quarantaine: gevaarlijke rollen strippen + quarantaine rol geven -------
async function quarantine(member, reason) {
  if (!member || !QUARANTINE_ROLE) return;
  try {
    const DANGER = [
      PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,   PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
    ];
    const gevaarlijk = member.roles.cache.filter(r => DANGER.some(p => r.permissions.has(p)));
    for (const r of gevaarlijk.values()) {
      await member.roles.remove(r, `Guardian: ${reason}`).catch(() => {});
    }
    await member.roles.add(QUARANTINE_ROLE, `Guardian: ${reason}`).catch(() => {});

    await secLog(new EmbedBuilder()
      .setTitle('🔒 Guardian — Quarantaine')
      .setColor(0xFF4757)
      .addFields(
        { name: '👤 Gebruiker',          value: `<@${member.id}> \`${member.user.tag}\``,                                             inline: false },
        { name: '📝 Reden',              value: reason,                                                                                inline: false },
        { name: '🗑️ Rollen verwijderd', value: gevaarlijk.size ? gevaarlijk.map(r => `\`${r.name}\``).join(', ') : 'Geen gevaarlijk', inline: false },
      )
      .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
    );
  } catch (e) { console.error('[GUARDIAN] quarantine fout:', e.message); }
}

// --- Radio stations ---------------------------------------------------------
const RADIO_STATIONS = new Map([
  ['538',        { label: '📻 Radio 538',          url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3' }],
  ['q',          { label: '🎵 Q-Music',            url: 'https://icecast-qmusicnl-cdp.triple-it.nl/Qmusic_nl_mp3_96.mp3' }],
  ['fouteuur',   { label: '🎉 Q-Music Foute Uur',  url: 'http://icecast-qmusicnl-cdp.triple-it.nl/Qmusic_nl_fouteuur.mp3' }],
  ['sky',        { label: '🎶 Sky Radio',          url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3' }],
  ['slam',       { label: '🔊 Slam!',              url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SLAM_MP3.mp3' }],
  ['npo3fm',     { label: '🎙️ NPO 3FM',           url: 'https://icecast.omroep.nl/3fm-bb-mp3' }],
  ['sublime',    { label: '🎷 Sublime FM',         url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUBLIMEFM.mp3' }],
  ['radio10',    { label: '🕹️ Radio 10',           url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO10.mp3' }],
  ['arrow',      { label: '🎸 Arrow Classic Rock', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/ARROWCLASSICROCK.mp3' }],
  ['100nl',      { label: '🇳🇱 100% NL',          url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO100NL.mp3' }],
  ['npo1',       { label: '📡 NPO Radio 1',        url: 'https://icecast.omroep.nl/radio1-bb-mp3' }],
  ['npo2',       { label: '🎻 NPO Radio 2',        url: 'https://icecast.omroep.nl/radio2-bb-mp3' }],
]);

const PIRATE_STATIONS = new Map([
  ['slam_hardstyle', { label: '💥 Slam! Hardstyle',    url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SLAM_HARDSTYLE.mp3' }],
  ['slam_party',     { label: '🥳 Slam! Party',        url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SLAM_PARTY.mp3' }],
  ['technobase',     { label: '⚡ Technobase.FM',      url: 'https://listen.technobase.fm/tunein-aac-pls' }],
  ['houseradio',     { label: '🏠 House Radio NL',     url: 'https://stream.houseradio.nl/houseradio' }],
  ['klassiek',       { label: '🎼 NPO Klassiek',       url: 'https://icecast.omroep.nl/radio4-bb-mp3' }],
  ['funx',           { label: '🔥 FunX',               url: 'https://icecast.omroep.nl/funx-bb-mp3' }],
  ['funx_dance',     { label: '💃 FunX Dance',         url: 'https://icecast.omroep.nl/funx-dance-bb-mp3' }],
  ['nrj',            { label: '🎵 NRJ Netherlands',    url: 'https://scdn.nrjaudio.fm/nl/31/52271/live.mp3?origine=fluxradio' }],
  ['difm_house',     { label: '🎧 DI.FM House',        url: 'https://prem2.di.fm/house' }],
  ['difm_trance',    { label: '🌀 DI.FM Trance',       url: 'https://prem2.di.fm/trance' }],
  ['difm_hardstyle', { label: '🔨 DI.FM Hardstyle',    url: 'https://prem2.di.fm/hardstyle' }],
]);

// --- Radio voice map --------------------------------------------------------
const radioMap = new Map(); // guildId → { connection, player, stationLabel, url, channel }

function playRadio(voiceChannel, url, label, guildId) {
  const old = radioMap.get(guildId);
  if (old) { try { old.connection.destroy(); } catch {} }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id, guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });
  const ap     = createAudioPlayer();
  const ffmpeg = spawn(ffmpegBin, [
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', url, '-ac', '2', '-ar', '48000', '-f', 's16le', '-loglevel', 'quiet', 'pipe:1',
  ]);
  const resource = createAudioResource(ffmpeg.stdout);
  ap.play(resource);
  connection.subscribe(ap);

  // Auto-reconnect als stream stopt
  ap.on(AudioPlayerStatus.Idle, () => {
    const cur = radioMap.get(guildId);
    if (cur?.url === url) setTimeout(() => playRadio(voiceChannel, url, label, guildId), 3000);
  });

  radioMap.set(guildId, { connection, player: ap, stationLabel: label, url, channel: voiceChannel });
}

// --- Slash commands registreren ---------------------------------------------
const commands = [
  new SlashCommandBuilder().setName('radio').setDescription('📻 Speel een radiostation af')
    .addStringOption(o => o.setName('station').setDescription('Station').setRequired(true)
      .addChoices(...[...RADIO_STATIONS.entries()].map(([v, s]) => ({ name: s.label, value: v }))))
    .toJSON(),
  new SlashCommandBuilder().setName('piratenradio').setDescription('🏴‍☠️ Speel een piraten radiostation af')
    .addStringOption(o => o.setName('station').setDescription('Station').setRequired(true)
      .addChoices(...[...PIRATE_STATIONS.entries()].map(([v, s]) => ({ name: s.label, value: v }))))
    .toJSON(),
  new SlashCommandBuilder().setName('play').setDescription('▶️ Zoek en speel muziek via YouTube')
    .addStringOption(o => o.setName('zoek').setDescription('Zoekterm of YouTube URL').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName('skip').setDescription('⏭️ Sla het huidige nummer over').toJSON(),
  new SlashCommandBuilder().setName('stop').setDescription('⏹️ Stop muziek en verlaat kanaal').toJSON(),
  new SlashCommandBuilder().setName('queue').setDescription('📋 Bekijk de wachtrij').toJSON(),
  new SlashCommandBuilder().setName('volume').setDescription('🔊 Pas het volume aan')
    .addIntegerOption(o => o.setName('niveau').setDescription('Volume 0–100').setRequired(true).setMinValue(0).setMaxValue(100))
    .toJSON(),
  new SlashCommandBuilder().setName('np').setDescription('🎵 Huidig nummer').toJSON(),
  new SlashCommandBuilder().setName('guardian-status').setDescription('🛡️ [STAFF] Status van de Guardian Bot').toJSON(),
];

// ===========================================================================
//  READY
// ===========================================================================
client.once('ready', async () => {
  console.log(`✅ [GUARDIAN] Ingelogd als ${client.user.tag}`);
  client.user.setActivity('🛡️ Lage Landen RP bewaken', { type: ActivityType.Watching });

  // Slash commands registreren
  try {
    const rest   = new REST({ version: '10' }).setToken(GUARDIAN_TOKEN);
    const app    = await client.application.fetch();
    const guildId = GUILD_ID || client.guilds.cache.first()?.id;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(app.id, guildId), { body: commands });
      console.log(`✅ [GUARDIAN] ${commands.length} commando's geregistreerd`);
    }
  } catch (e) { console.error('[GUARDIAN] Registratie fout:', e.message); }

  // --- Herstel queue na herstart (als <30 min oud) -------------------------
  try {
    if (fs.existsSync(GUARDIAN_QUEUE)) {
      const saved = JSON.parse(fs.readFileSync(GUARDIAN_QUEUE, 'utf-8'));
      const age   = Date.now() - (saved.savedAt || 0);
      if (age < 30 * 60_000 && saved.tracks?.length > 0) {
        console.log(`[GUARDIAN] Opgeslagen queue gevonden: ${saved.tracks.length} nummer(s) uit ${Math.floor(age / 60000)}m geleden`);
        addEvent('queue_found', { tracks: saved.tracks.length, ageMin: Math.floor(age / 60000) });
      } else {
        clearSavedQueue(); // te oud, weggooien
      }
    }
  } catch {}

  // --- Heartbeat: check main bot elke 30s -----------------------------------
  // Verbeterd: PID-check + max 3 herstartpogingen per 5 minuten
  let alerted          = false;
  let mainBotProcess   = null;
  let restartAttempts  = 0;
  let restartWindowEnd = 0;  // timestamp waarop de 5-min window afloopt
  let gaveUp           = false;

  function isProcessAlive(pid) {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  async function tryRestartMainBot(age) {
    const now = Date.now();
    // Reset teller als de 5-min window verlopen is
    if (now > restartWindowEnd) { restartAttempts = 0; restartWindowEnd = now + 5 * 60_000; gaveUp = false; }
    if (gaveUp) return; // al opgegeven in dit window

    restartAttempts++;
    if (restartAttempts > 3) {
      gaveUp = true;
      addEvent('restart_gave_up', { attempts: restartAttempts, ageSeconds: Math.floor(age / 1000) });
      await secLog(new EmbedBuilder()
        .setTitle('💀 Guardian — Herstart Opgegeven')
        .setColor(0xFF0000)
        .setDescription(`Na **3 herstartpogingen** in 5 minuten geeft Guardian het op.\n**Handmatige actie vereist!**`)
        .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
      );
      return;
    }

    addEvent('restart_attempt', { attempt: restartAttempts, ageSeconds: Math.floor(age / 1000) });
    mainBotProcess = spawn('node', [MAIN_BOT_PATH], {
      detached: true, stdio: 'ignore',
      cwd: path.join(__dirname, '..'),
    });
    mainBotProcess.unref();
    console.log(`[GUARDIAN] Herstart poging #${restartAttempts} main bot (PID: ${mainBotProcess.pid})`);

    await secLog(new EmbedBuilder()
      .setTitle('🔄 Guardian — Herstart Poging')
      .setColor(0xFF6B35)
      .setDescription(`Poging **${restartAttempts}/3** om de main bot te herstarten.\nMain bot offline voor: **${Math.floor(age / 1000)}s**`)
      .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
    );
  }

  setInterval(async () => {
    try {
      const stats    = JSON.parse(fs.readFileSync(MAIN_STATS_PATH, 'utf-8'));
      const age      = Date.now() - (stats.updatedAt || 0);
      const pidAlive = isProcessAlive(stats.pid);

      // Bot wordt als offline beschouwd als: heartbeat >2min oud OF PID dood
      const offline = age > 120_000 || (stats.pid && !pidAlive);

      if (offline) {
        const reason = !pidAlive && stats.pid ? `PID ${stats.pid} is gestopt` : `${Math.floor(age / 1000)}s geen heartbeat`;
        if (!alerted) {
          alerted = true;
          addEvent('main_bot_offline', { ageSeconds: Math.floor(age / 1000), pidAlive, pid: stats.pid });
          await secLog(new EmbedBuilder()
            .setTitle('🚨 Main Bot Offline Gedetecteerd')
            .setColor(0xFF0000)
            .setDescription(`De main bot is offline gedetecteerd:\n**${reason}**\nGuardian probeert te herstarten...`)
            .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
          );
        }
        await tryRestartMainBot(age);
      } else if (alerted) {
        alerted = false;
        restartAttempts = 0;
        gaveUp          = false;
        await secLog(new EmbedBuilder()
          .setTitle('✅ Main Bot Weer Online')
          .setColor(0x57F287)
          .setDescription('De main bot is weer bereikbaar en stuurt hartbeats.')
          .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
        );
      }
    } catch {} // bot-stats.json nog niet aangemaakt
  }, 30_000);
});

// ===========================================================================
//  INTERACTIONS
// ===========================================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;

  // ── RADIO / PIRATENRADIO ─────────────────────────────────────────────────
  if (commandName === 'radio' || commandName === 'piratenradio') {
    const map     = commandName === 'radio' ? RADIO_STATIONS : PIRATE_STATIONS;
    const station = map.get(interaction.options.getString('station'));
    if (!station) return interaction.reply({ content: '❌ Onbekend station.', flags: 64 });

    const vc = member.voice?.channel;
    if (!vc) return interaction.reply({ content: '❌ Ga eerst in een spraakkanaal.', flags: 64 });

    await interaction.deferReply();
    try {
      playRadio(vc, station.url, station.label, guild.id);
      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(`${commandName === 'piratenradio' ? '🏴‍☠️' : '📻'} Nu Speelend — ${station.label}`)
          .setDescription(`Stream gestart in <#${vc.id}>`)
          .setColor(commandName === 'piratenradio' ? 0xFF4757 : 0x5865F2)
          .setFooter({ text: 'Lage Landen RP — Guardian Music Bot' }).setTimestamp(),
      ]});
    } catch (e) { await interaction.editReply({ content: `❌ Fout: ${e.message}` }); }
    return;
  }

  // ── PLAY ────────────────────────────────────────────────────────────────
  if (commandName === 'play') {
    const vc = member.voice?.channel;
    if (!vc) return interaction.reply({ content: '❌ Ga eerst in een spraakkanaal.', flags: 64 });

    // Stop lopende radio
    const r = radioMap.get(guild.id);
    if (r) { try { r.connection.destroy(); } catch {} radioMap.delete(guild.id); }

    await interaction.deferReply();
    try {
      const { track } = await player.play(vc, interaction.options.getString('zoek'), {
        nodeOptions: {
          metadata:               { channel: interaction.channel },
          selfDeaf:               true,
          volume:                 80,
          leaveOnEmpty:           true,
          leaveOnEmptyCooldown:   30_000,
          leaveOnEnd:             true,
          leaveOnEndCooldown:     30_000,
        },
      });

      // Herstel opgeslagen queue na herstart (als <30 min oud)
      let restored = 0;
      try {
        if (fs.existsSync(GUARDIAN_QUEUE)) {
          const saved = JSON.parse(fs.readFileSync(GUARDIAN_QUEUE, 'utf-8'));
          const age   = Date.now() - (saved.savedAt || 0);
          if (saved.guildId === guild.id && age < 30 * 60_000 && saved.tracks?.length > 1) {
            // Voeg de rest van de opgeslagen queue toe (skip eerste = huidige nieuwe track)
            const q = player.nodes.get(guild.id);
            if (q) {
              for (const t of saved.tracks.slice(1)) {
                await player.play(vc, t.url, { nodeOptions: { metadata: { channel: interaction.channel }, volume: 80 } }).catch(() => {});
                restored++;
              }
            }
            clearSavedQueue();
            addEvent('queue_restored', { tracks: restored, guild: guild.id });
          } else {
            clearSavedQueue();
          }
        }
      } catch {}

      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle('▶️ Toegevoegd aan wachtrij')
          .setDescription(`**[${track.title}](${track.url})**`)
          .addFields(
            { name: '⏱️ Duur',    value: track.duration,                                                  inline: true },
            { name: '🎤 Artiest', value: track.author || '—',                                                  inline: true },
            ...(restored > 0 ? [{ name: '🔄 Queue hersteld', value: `${restored} nummer(s) van vóór herstart`, inline: false }] : []),
          )
          .setThumbnail(track.thumbnail)
          .setColor(0xFF0000)
          .setFooter({ text: `Aangevraagd door ${interaction.user.tag}` }).setTimestamp(),
      ]});
    } catch (e) { await interaction.editReply({ content: `❌ Kan niet afspelen: ${e.message}` }); }
    return;
  }

  // ── SKIP ────────────────────────────────────────────────────────────────
  if (commandName === 'skip') {
    const q = player.nodes.get(guild.id);
    if (!q?.isPlaying()) return interaction.reply({ content: '❌ Er speelt niks.', flags: 64 });
    q.node.skip();
    return interaction.reply({ content: '⏭️ Overgeslagen.' });
  }

  // ── STOP ────────────────────────────────────────────────────────────────
  if (commandName === 'stop') {
    const q = player.nodes.get(guild.id);
    const r = radioMap.get(guild.id);
    if (!q && !r) return interaction.reply({ content: '❌ Er speelt niks.', flags: 64 });
    if (q) {
      saveQueue(guild.id); // queue opslaan voor na herstart
      q.delete();
    }
    if (r) { try { r.connection.destroy(); } catch {} radioMap.delete(guild.id); }
    return interaction.reply({ content: '⏹️ Gestopt en kanaal verlaten.' });
  }

  // ── QUEUE ───────────────────────────────────────────────────────────────
  if (commandName === 'queue') {
    const r = radioMap.get(guild.id);
    if (r) return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('📻 Radio')
        .setDescription(`**${r.stationLabel}** speelt in <#${r.channel.id}>`)
        .setColor(0x5865F2),
    ]});
    const q = player.nodes.get(guild.id);
    if (!q?.isPlaying()) return interaction.reply({ content: '❌ Er speelt niks.', flags: 64 });
    const tracks = q.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. **${t.title}** — ${t.duration}`).join('\n') || '*Leeg*';
    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('📋 Wachtrij')
        .setDescription(`**Nu:** ${q.currentTrack?.title}\n\n${tracks}`)
        .setColor(0x5865F2).setFooter({ text: `${q.tracks.size} nummers` }),
    ]});
  }

  // ── VOLUME ──────────────────────────────────────────────────────────────
  if (commandName === 'volume') {
    const q = player.nodes.get(guild.id);
    if (!q?.isPlaying()) return interaction.reply({ content: '❌ Er speelt niks.', flags: 64 });
    q.node.setVolume(interaction.options.getInteger('niveau'));
    return interaction.reply({ content: `🔊 Volume: **${interaction.options.getInteger('niveau')}%**` });
  }

  // ── NP ──────────────────────────────────────────────────────────────────
  if (commandName === 'np') {
    const r = radioMap.get(guild.id);
    if (r) return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('📻 Radio').setDescription(`**${r.stationLabel}**`).setColor(0x5865F2),
    ]});
    const q = player.nodes.get(guild.id);
    if (!q?.currentTrack) return interaction.reply({ content: '❌ Er speelt niks.', flags: 64 });
    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('🎵 Nu Speelend')
        .setDescription(`**[${q.currentTrack.title}](${q.currentTrack.url})**\n\n${q.node.createProgressBar() ?? ''}`)
        .setThumbnail(q.currentTrack.thumbnail).setColor(0xFF0000)
        .setFooter({ text: `Aangevraagd door ${q.currentTrack.requestedBy?.tag ?? '?'}` }),
    ]});
  }

  // ── GUARDIAN STATUS ─────────────────────────────────────────────────────
  if (commandName === 'guardian-status') {
    const isStaff = member.permissions.has(PermissionFlagsBits.Administrator)
      || member.roles.cache.has(STAFF_ROLE_ID)
      || member.roles.cache.has(ADMIN_ROLE_ID);
    if (!isStaff) return interaction.reply({ content: '❌ Alleen staff.', flags: 64 });

    let mainStatus = '❓ Onbekend';
    let leeftijd   = '—';
    let pidStatus  = '—';
    try {
      const stats = JSON.parse(fs.readFileSync(MAIN_STATS_PATH, 'utf-8'));
      const age   = Date.now() - stats.updatedAt;
      mainStatus  = age < 60_000 ? '🟢 Online' : age < 180_000 ? '🟡 Twijfelachtig' : '🔴 Offline';
      leeftijd    = `${Math.floor(age / 1000)}s geleden`;
      if (stats.pid) {
        try { process.kill(stats.pid, 0); pidStatus = `🟢 PID ${stats.pid} leeft`; }
        catch { pidStatus = `🔴 PID ${stats.pid} dood`; }
      }
    } catch {}

    let recentEvents = '*Geen events*';
    try {
      const evts = JSON.parse(fs.readFileSync(GUARDIAN_LOG, 'utf-8'));
      recentEvents = evts.slice(-5).reverse()
        .map(e => `\`${new Date(e.ts).toLocaleString('nl-NL')}\` **${e.type}**`).join('\n') || '*Geen events*';
    } catch {}

    let savedQueueInfo = 'Nee';
    try {
      if (fs.existsSync(GUARDIAN_QUEUE)) {
        const q   = JSON.parse(fs.readFileSync(GUARDIAN_QUEUE, 'utf-8'));
        const age = Date.now() - (q.savedAt || 0);
        if (age < 30 * 60_000) savedQueueInfo = `${q.tracks?.length || 0} nummer(s) — ${Math.floor(age / 60000)}m geleden`;
        else savedQueueInfo = 'Verlopen (>30min)';
      }
    } catch {}

    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('🛡️ Guardian Status').setColor(0x5865F2)
        .addFields(
          { name: '🤖 Guardian',           value: '🟢 Online',                                                                         inline: true },
          { name: '🤖 Main Bot',            value: mainStatus,                                                                          inline: true },
          { name: '⏱️ Laatste heartbeat',  value: leeftijd,                                                                            inline: true },
          { name: '🔍 PID check',          value: pidStatus,                                                                           inline: true },
          { name: '🎵 Radio',              value: radioMap.has(guild.id) ? radioMap.get(guild.id).stationLabel : 'Nee',                inline: true },
          { name: '🎶 YouTube',            value: player.nodes.has(guild.id) ? 'Actief' : 'Nee',                                      inline: true },
          { name: '💾 Opgeslagen queue',   value: savedQueueInfo,                                                                      inline: true },
          { name: '📋 Recente events',     value: recentEvents,                                                                        inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp(),
    ]});
  }
});

// ===========================================================================
//  🚨 NOODRESPONS — Main bot GEBANNED
// ===========================================================================
client.on('guildBanAdd', async (ban) => {
  await ban.fetch().catch(() => {});
  if (ban.user.id !== MAIN_BOT_ID) return;

  // Wie heeft de ban uitgevoerd?
  const audit    = await ban.guild.fetchAuditLogs({ type: 22 /* BanAdd */, limit: 5 }).catch(() => null);
  const entry    = audit?.entries.find(e => e.target?.id === MAIN_BOT_ID);
  const executor = entry?.executor;
  const reason   = entry?.reason || ban.reason || 'Geen reden opgegeven';

  addEvent('main_bot_banned', {
    executorId:  executor?.id,
    executorTag: executor?.tag,
    reason,
  });

  // Alert sturen
  await secLog(new EmbedBuilder()
    .setTitle('🚨 NOODALARM — MAIN BOT GEBANNED')
    .setColor(0xFF0000)
    .setDescription('De hoofdbot is van de server geband! Guardian treedt op.')
    .addFields(
      { name: '🏴‍☠️ Gebanned door', value: executor ? `<@${executor.id}> \`${executor.tag}\`` : '`Onbekend`', inline: true },
      { name: '📝 Reden',           value: reason,                                                               inline: false },
    )
    .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
  );

  // Uitvoerder in quarantaine (tenzij serverowner)
  if (executor && executor.id !== ban.guild.ownerId) {
    const execMember = ban.guild.members.cache.get(executor.id)
      ?? await ban.guild.members.fetch(executor.id).catch(() => null);
    if (execMember) await quarantine(execMember, `🚨 Main bot gebanned (${reason})`);
  }

  // Probeer main bot te unbannen
  const unbanned = await ban.guild.members.unban(MAIN_BOT_ID, 'Guardian: automatische unban van main bot').catch(() => null);

  await secLog(new EmbedBuilder()
    .setTitle(unbanned ? '✅ Main Bot Succesvol Geunbanned' : '⚠️ Unban Mislukt — Handmatige actie vereist')
    .setColor(unbanned ? 0x57F287 : 0xFF6B35)
    .setDescription(unbanned
      ? 'De main bot is automatisch geunbanned en kan opnieuw worden uitgenodigd.'
      : 'Guardian kon de main bot niet automatisch unbannen. Voeg hem handmatig opnieuw toe.')
    .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
  );
});

// ===========================================================================
//  🚨 NOODRESPONS — Main bot GEKICKED
// ===========================================================================
client.on('guildMemberRemove', async (member) => {
  if (member.id !== MAIN_BOT_ID) return;

  // Controleer of het een kick was via audit log (type 20 = MemberKick)
  const audit = await member.guild.fetchAuditLogs({ type: 20, limit: 5 }).catch(() => null);
  const entry = audit?.entries.find(e => e.target?.id === MAIN_BOT_ID);
  if (!entry) return; // Vrijwillig verlaten of andere reden, geen kick

  const executor = entry.executor;

  addEvent('main_bot_kicked', {
    executorId:  executor?.id,
    executorTag: executor?.tag,
  });

  await secLog(new EmbedBuilder()
    .setTitle('🚨 NOODALARM — MAIN BOT GEKICKED')
    .setColor(0xFF6B35)
    .setDescription('De hoofdbot is van de server gekicked! Guardian treedt op.')
    .addFields(
      { name: '🏴‍☠️ Gekicked door', value: executor ? `<@${executor.id}> \`${executor.tag}\`` : '`Onbekend`', inline: true },
      { name: '⚡ Actie',            value: 'Uitvoerder wordt in quarantaine geplaatst.',                        inline: false },
    )
    .setFooter({ text: 'Lage Landen RP — Guardian Bot' }).setTimestamp()
  );

  if (executor && executor.id !== member.guild.ownerId) {
    const execMember = member.guild.members.cache.get(executor.id)
      ?? await member.guild.members.fetch(executor.id).catch(() => null);
    if (execMember) await quarantine(execMember, '🚨 Main bot gekicked');
  }
});

// ===========================================================================
//  LOGIN
// ===========================================================================
client.login(GUARDIAN_TOKEN).catch(e => {
  console.error('❌ [GUARDIAN] Login mislukt:', e.message);
  process.exit(1);
});

process.on('uncaughtException',  e => console.error('[GUARDIAN] Uncaught:', e));
process.on('unhandledRejection', e => console.error('[GUARDIAN] Rejection:', e));

// Queue opslaan bij afsluiten
function onShutdown() {
  try {
    const guild = client.guilds.cache.first();
    if (guild) saveQueue(guild.id);
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', onShutdown);
process.on('SIGINT',  onShutdown);
