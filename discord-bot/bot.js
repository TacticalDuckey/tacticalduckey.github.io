// ----------------------------------------------------------------------------
//  Lage Landen RP — Blacklist Manager | Partner Systeem | Ticket Systeem
//  discord.js v14 | Node.js 18+
// ----------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// --- .env laden -------------------------------------------------------------
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const [k, ...v] = t.split('=');
        if (k && v.length) process.env[k.trim()] = v.join('=').trim();
      }
    });
    console.log('✅ .env geladen');
  }
} catch (e) { console.warn('⚠️  .env niet geladen:', e.message); }

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder, REST, Routes, ActivityType,
  PermissionFlagsBits, ChannelType, Status, AttachmentBuilder
} = require('discord.js');
const { Player, QueueRepeatMode, BaseExtractor, Track } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const ytDlpWrap = require('yt-dlp-exec');
const _ytDlp   = ytDlpWrap.create
  ? ytDlpWrap.create(require('path').join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe'))
  : ytDlpWrap;
const Genius = require('genius-lyrics');
const geniusClient = new Genius.Client(); // geen API key nodig voor publieke lyrics

// --- Radio (@discordjs/voice isoliert systeem — NOOIT discord-player aanraken) -
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
// ffmpegPath wordt verderop gedeclareerd bij de discord-player setup (inclusief FFMPEG_PATH env)

// --- Constanten --------------------------------------------------------------
const STAFF_ROLE_ID        = '1458531506208374879';
const OWNER_ROLE_ID        = '1457747096601100441';
const CO_OWNER_ROLE_ID     = '1458223437158809892';
const ADMIN_ROLE_ID        = '1458542238312304761';
const WARN_ROLE_1          = '1458223437158809892';
const WARN_ROLE_2          = '1457747096601100441';
const BLACKLIST_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1471529070712848588';
const GUARDIAN_BOT_ID      = process.env.GUARDIAN_BOT_ID || '1478145770929786880'; // Guardian backup bot
const PARTNER_CHANNEL_ID   = '1457835992743547033';
const PARTNER_WEBSITE      = 'https://lagelandenrp.netlify.app/partnerschap-eisen.html';
const TICKET_LOG_CHANNEL   = '1458536429742460987';
const CHAT_LOG_CHANNEL     = '1472994861379748005';
const VOICE_LOG_CHANNEL    = '1458534873995280649';
const JOIN_LEAVE_CHANNEL   = '1472994956678402150';
const MOD_LOG_CHANNEL      = '1472995053504036965';
const WELCOME_CHANNEL      = '1457746991554760828';
const BOT_TOKEN            = process.env.BOT_TOKEN;
const DATA_PATH            = path.join(__dirname, 'partner-data.json');
const BOT_START_TIME       = Date.now();
const STATS_PATH           = path.join(__dirname, 'bot-stats.json');
const WARNS_PATH           = path.join(__dirname, 'warns.json');
const STRIKES_PATH         = path.join(__dirname, 'strikes.json');
const MODLOG_PATH          = path.join(__dirname, 'modlog.json');
const XP_PATH              = path.join(__dirname, 'xp.json');
const VERLOF_PATH          = path.join(__dirname, 'verlof.json');
const GIVEAWAY_PATH        = path.join(__dirname, 'giveaways.json');
const INACTIEF_PATH        = path.join(__dirname, 'inactief.json');
const SECURITY_CONFIG_PATH = path.join(__dirname, 'security-config.json');
const QUARANTINE_PATH      = path.join(__dirname, 'quarantine-data.json');
const SECURITY_EVENTS_PATH = path.join(__dirname, 'security-events.json');
const TEMPBAN_PATH         = path.join(__dirname, 'tempbans.json');
const SUGGESTION_PATH      = path.join(__dirname, 'suggestions.json');
const BACKUP_DIR           = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// -- Bekende phishing/scam domeinen --------------------------------------------------
const PHISHING_DOMAINS = new Set([
  'discord-nitro.gift','discordnitro.gift','discord.gift','free-nitro.club',
  'discordapp.gift','discord-free.gift','nitro-discord.com','discord-gift.org',
  'steam-community.com','steamcomunity.com','steamcommunnity.com','steemcommunity.com',
  'steamcommunity.gift','steam-trade.net','steamtrade.gift',
  'epicgames.gift','roblox.gift','minecraft.gift',
  'freerobuxx.com','freerobux.me','robuxgenerator.net',
  'bit.ly','tinyurl.com','t.co', // shortlinks die phishing verbergen
  'qr.ae','cutt.ly','short.io',
  'iplogger.org','grabify.link','bmwforum.co','yoütu.be',
  'discord.gift-codes.ru','discord-nitro.fun',
  'replit.com/join', // vaak misbruikt voor token grabbers
]);
const URL_REGEX = /https?:\/\/([\w.-]+)[/\w.\-?=#&%+]*/gi;

// Discord token regex (MFA + normal)
const TOKEN_REGEX = /[MNO][a-zA-Z0-9_-]{23,25}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,38}/g;
// Generic API key patterns
const APIKEY_REGEX = /(?:api[_-]?key|secret|token|password|passwd|auth)[\s"'=:]+([a-zA-Z0-9_\-./]{20,})/gi;

// Nuke tracker (in-memory)
const nukeTracker = { deletes: [] }; // { type, executorId, timestamp }

// Gecoördineerde join tracker
const coordJoinTracker = []; // [{ userId, createdAt, joinedAt }]

// Voice action tracker (disconnects/moves door één persoon)
const voiceActionTracker = new Map(); // executorId ? [timestamp, ...]

// Captcha store voor verificatie
const captchaStore = new Map(); // userId ? { answer, expiry }

// Levenshtein afstand (voor impersonation & ban evasion detectie)
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

// Dehoisting characters
const HOIST_REGEX = /^[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_{|}~?-??-?]/;

if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN niet gevonden!'); process.exit(1); }

// --- Persistente data --------------------------------------------------------
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')); }
  catch {
    return {
      partners: {},
      channels: {
        partnerCategoryId:        null,
        infoChannelId:            null,
        activePartnersChannelId:  null,
        reviewChannelId:          null,
        activePartnersMessageId:  null,
        ticketCategoryId:             null,
        ticketPanelChannelId:         null,
        ticketSupportCategoryId:      null,
        ticketReportCategoryId:       null,
        ticketSollicitatieCategoryId: null,
        ticketPartnerCategoryId:      null,
        reactietijdChannelId:         null,
        reactietijdMessageId:         null,
        suggestieChannelId:           null,
      },
      ticketStats: {
        totalOpened: 0,
        totalClosed: 0,
        byType: {
          support:      { opened: 0, closed: 0 },
          report:       { opened: 0, closed: 0 },
          sollicitatie: { opened: 0, closed: 0 },
          partner:      { opened: 0, closed: 0 },
        },
      },
      xpLevelRoles: {
        enabled: false,
        rewards: [], // [{ level: 5, roleId: '...' }]
      },
    };
  }
}
function saveData(d) { fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2)); }
let db = loadData();

// Zorg dat nieuwe velden bestaan in bestaande databases
if (!db.ticketStats) {
  db.ticketStats = { totalOpened: 0, totalClosed: 0, byType: { support: { opened:0,closed:0 }, report: { opened:0,closed:0 }, sollicitatie: { opened:0,closed:0 }, partner: { opened:0,closed:0 } } };
  saveData(db);
}
if (!db.xpLevelRoles) {
  db.xpLevelRoles = { enabled: false, rewards: [] };
  saveData(db);
}

// --- Warn data ----------------------------------------------------------------
function loadWarns()     { try { return JSON.parse(fs.readFileSync(WARNS_PATH,   'utf-8')); } catch { return {}; } }
function saveWarns(d)    { fs.writeFileSync(WARNS_PATH,   JSON.stringify(d, null, 2)); }
let warnsDB = loadWarns(); // userId ? [{ id, reason, by, byId, at }]

// --- Strike data (elke 25 warns = 1 strike) ----------------------------------
function loadStrikes()   { try { return JSON.parse(fs.readFileSync(STRIKES_PATH, 'utf-8')); } catch { return {}; } }
function saveStrikes(d)  { fs.writeFileSync(STRIKES_PATH, JSON.stringify(d, null, 2)); }
let strikesDB = loadStrikes(); // userId ? number

// --- Mod log data ---------------------------------------------------------------
function loadModLog()    { try { return JSON.parse(fs.readFileSync(MODLOG_PATH,   'utf-8')); } catch { return {}; } }
function saveModLog(d)   { fs.writeFileSync(MODLOG_PATH,   JSON.stringify(d, null, 2)); }
let modlogDB = loadModLog(); // userId ? [{ id, type, username, reason, by, byId, at }]

function addModLog(userId, username, type, reason, by, byId) {
  if (!modlogDB[userId]) modlogDB[userId] = [];
  modlogDB[userId].push({ id: Date.now(), type, username, reason, by, byId, at: Date.now() });
  saveModLog(modlogDB);
}

// --- Tempban data ------------------------------------------------------------
function loadTempbans()  { try { return JSON.parse(fs.readFileSync(TEMPBAN_PATH, 'utf-8')); } catch { return {}; } }
function saveTempbans(d) { fs.writeFileSync(TEMPBAN_PATH, JSON.stringify(d, null, 2)); }
let tempbansDB = loadTempbans();
const activeTempbanTimers = new Map(); // userId -> timeout handle

function scheduleUnban(userId, guildId, delayMs) {
  if (activeTempbanTimers.has(userId)) clearTimeout(activeTempbanTimers.get(userId));
  const timer = setTimeout(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      await guild.members.unban(userId, 'Tempban verlopen').catch(() => {});
      await modLog(new EmbedBuilder()
        .setTitle('🔓 Tempban Verlopen — Automatisch Vrijgegeven')
        .setColor(0x57F287)
        .addFields({ name: '👤 Gebruiker', value: `<@${userId}> (\`${userId}\`)`, inline: true })
        .setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
      ).catch(() => {});
    }
    delete tempbansDB[userId];
    saveTempbans(tempbansDB);
    activeTempbanTimers.delete(userId);
  }, Math.min(delayMs, 2147483647));
  activeTempbanTimers.set(userId, timer);
}

// --- Suggestion data ---------------------------------------------------------
function loadSuggestions()  { try { return JSON.parse(fs.readFileSync(SUGGESTION_PATH, 'utf-8')); } catch { return {}; } }
function saveSuggestions(d) { fs.writeFileSync(SUGGESTION_PATH, JSON.stringify(d, null, 2)); }
let suggestionsDB = loadSuggestions(); // messageId -> { voor: [], tegen: [], authorId, tekst }
const suggestionVotesCache = new Map(); // in-memory: messageId -> { voor: Set, tegen: Set, authorId, tekst }

// --- Gedeelde warn-drempel logica --------------------------------------------
// notifyFn(msg) ? stuurt een bericht naar het juiste kanaal/interactie
async function applyWarnThresholds(member, userId, notifyFn) {
  const count = (warnsDB[userId] || []).length;

  // Timeout-tiers (alleen op exacte aantallen) — start bij 5, elke 3 warns +3 min
  const TIMEOUT_TIERS = [
    { at:  5, ms:   180_000, label: '3 minuten'  },
    { at:  8, ms:   360_000, label: '6 minuten'  },
    { at: 11, ms:   540_000, label: '9 minuten'  },
    { at: 14, ms:   720_000, label: '12 minuten' },
    { at: 17, ms:   900_000, label: '15 minuten' },
    { at: 20, ms: 1_080_000, label: '18 minuten' },
    { at: 23, ms: 1_260_000, label: '21 minuten' },
  ];

  const tier = TIMEOUT_TIERS.find(t => t.at === count);
  if (tier) {
    await member.timeout(tier.ms, `AutoMod: ${count} waarschuwingen → timeout ${tier.label}`).catch(() => {});
    await notifyFn(`⏱️ <@${userId}> is automatisch ge-timeout voor **${tier.label}** (${count} warns).`);
    return;
  }

  // Bij 25 warns: reset warns + voeg 1 strike toe
  if (count >= 25) {
    warnsDB[userId] = [];
    saveWarns(warnsDB);
    if (!strikesDB[userId]) strikesDB[userId] = 0;
    strikesDB[userId]++;
    saveStrikes(strikesDB);
    const strikes = strikesDB[userId];

    await notifyFn(`⚠️ <@${userId}> heeft **25 waarschuwingen** bereikt — warns gereset. Strike **${strikes}** ontvangen.`);

    if (strikes >= 10) {
      await member.ban({ reason: `AutoMod: ${strikes} strikes` }).catch(() => {});
      await notifyFn(`🔨 <@${userId}> is automatisch **gebanned** (${strikes} strikes).`);
    } else if (strikes >= 5) {
      await member.kick(`AutoMod: ${strikes} strikes`).catch(() => {});
      await notifyFn(`👟 <@${userId}> is automatisch **gekickt** (${strikes} strikes).`);
    }
  }
}

// --- Security config ----------------------------------------------------------
const DEFAULT_SEC_CFG = {
  antiRaid:          { enabled: true,  joinThreshold: 8, joinWindowSec: 10, action: 'quarantine', autoLockdown: false, quarantineRoleId: null },
  accountAge:        { enabled: true,  minDays: 3, action: 'kick' },
  antiSpam:          { enabled: true,  msgThreshold: 7, windowSec: 5, mentionThreshold: 5, action: 'timeout', timeoutSec: 300 },
  antiInvite:        { enabled: true,  deleteMsg: true, warnUser: true },
  altDetection:      { enabled: true,  maxDays: 7, noAvatarFlag: true },
  webhookProtection: { enabled: true },
  antiProfanity:     { enabled: true },
  botTrap:       { enabled: false, channelId: null, action: 'quarantine', lastActivity: 0, warningMsgId: null, msgsSinceWarn: 0 },
  phishing:      { enabled: true,  action: 'ban'   },
  tokenScan:     { enabled: true  },
  nukeProt:      { enabled: true,  threshold: 5, windowSec: 10, action: 'ban' },
  verification:  { enabled: false, channelId: null, unverifiedRoleId: null, memberRoleId: null },
  usernameFilter:{ enabled: true,  dehoisting: true, blockedWords: [] },
  banEvasion:     { enabled: true },
  coordJoin:      { enabled: true,  windowMinutes: 30, threshold: 5 },
  impersonation:  { enabled: true },
  voiceSecurity:  { enabled: true,  threshold: 5, windowSec: 30 },
  autoBackup:     { enabled: false, channelId: null },
  captchaVerif:   { enabled: false },
  securityLogChannelId: null,
  lockdownActive: false,
  lockdownChannelStates: {},
};
// Controleert of een member de opgegeven rol heeft OF een rol met een hogere positie ("of hoger")
function hasRoleOrHigher(member, roleId) {
  // Betrouwbaarste check: administrator Discord perm (calculated by discord.js from all roles)
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  // Fallback: exacte rol of positie-check als role cache beschikbaar is
  if (member?.roles?.cache.has(roleId)) return true;
  const role = member?.guild?.roles.cache.get(roleId);
  if (!role) return false;
  return member.roles.cache.some(r => r.position >= role.position);
}

function loadSecurityConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(SECURITY_CONFIG_PATH, 'utf-8'));
    // Deep merge met defaults zodat nieuwe velden altijd bestaan
    return {
      ...DEFAULT_SEC_CFG, ...raw,
      antiRaid:          { ...DEFAULT_SEC_CFG.antiRaid,          ...raw.antiRaid },
      accountAge:        { ...DEFAULT_SEC_CFG.accountAge,        ...raw.accountAge },
      antiSpam:          { ...DEFAULT_SEC_CFG.antiSpam,          ...raw.antiSpam },
      antiInvite:        { ...DEFAULT_SEC_CFG.antiInvite,        ...raw.antiInvite },
      altDetection:      { ...DEFAULT_SEC_CFG.altDetection,      ...raw.altDetection },
      webhookProtection: { ...DEFAULT_SEC_CFG.webhookProtection, ...raw.webhookProtection },
    };
  } catch { return { ...DEFAULT_SEC_CFG }; }
}
function saveSecurityConfig(d) { fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify(d, null, 2)); }
let secCfg = loadSecurityConfig();

// Herlaad secCfg automatisch als het bestand verandert (bijv. via dashboard)
fs.watchFile(SECURITY_CONFIG_PATH, { interval: 1000 }, () => {
  try {
    const oldCfg = secCfg;
    secCfg = loadSecurityConfig();
    // Log welke features aan/uit zijn gezet
    const featureKeys = [
      'antiRaid','accountAge','antiSpam','antiInvite','altDetection','webhookProtection',
      'antiProfanity','botTrap','phishing','tokenScan','nukeProt','usernameFilter',
      'verification','captchaVerif','banEvasion','coordJoin','impersonation','voiceSecurity','autoBackup',
    ];
    for (const key of featureKeys) {
      const oldVal = oldCfg[key]?.enabled;
      const newVal = secCfg[key]?.enabled;
      if (oldVal !== newVal) {
        const staat = newVal ? '✅ AAN' : '❌ UIT';
        console.log(`[Security] ${key} is ${staat} gezet via dashboard.`);
      }
    }
    // Log numerieke/overige velden die veranderd zijn
    const simpleKeys = ['securityLogChannelId'];
    for (const key of simpleKeys) {
      if (oldCfg[key] !== secCfg[key]) {
        console.log(`[Security] ${key} gewijzigd: ${oldCfg[key]} → ${secCfg[key]}`);
      }
    }
  } catch (e) {
    console.error('[Security] Fout bij herladen config:', e.message);
  }
});

function loadQuarantine()    { try { return JSON.parse(fs.readFileSync(QUARANTINE_PATH, 'utf-8')); } catch { return {}; } }
function saveQuarantine(d)   { fs.writeFileSync(QUARANTINE_PATH, JSON.stringify(d, null, 2)); }
let quarantineDB = loadQuarantine(); // userId ? { userId, username, quarantinedAt, reason, savedRoles }

function loadSecurityEvents() { try { return JSON.parse(fs.readFileSync(SECURITY_EVENTS_PATH, 'utf-8')); } catch { return []; } }
function addSecurityEvent(type, data) {
  const events = loadSecurityEvents();
  events.unshift({ id: Date.now(), type, data, at: Date.now() });
  if (events.length > 500) events.splice(500);
  try { fs.writeFileSync(SECURITY_EVENTS_PATH, JSON.stringify(events, null, 2)); } catch {}
}

// --- Security trackers (in-memory) -------------------------------------------
const joinTracker  = [];        // [{ userId, timestamp }] — voor anti-raid
const msgTracker   = new Map(); // userId ? [timestamp, ...]          — voor anti-spam
const pendingModActions = new Map(); // requestId ? { type, targetId, targetTag, reason, requesterId } — voor goedkeuring
const dupTracker   = new Map(); // userId ? { content, count, lastSeen } — voor duplicaat-spam
const crossChanTracker = new Map(); // userId ? { content, channels: Set, lastSeen } — cross-channel
const suspiciousDB = new Map(); // userId ? { reason, flaggedAt, username }

// --- XP data -----------------------------------------------------------------
function loadXP()        { try { return JSON.parse(fs.readFileSync(XP_PATH, 'utf-8')); } catch { return {}; } }
function saveXP(d)       { fs.writeFileSync(XP_PATH, JSON.stringify(d, null, 2)); }
let xpDB = loadXP();      // userId ? { xp, level }
const xpCooldown = new Map(); // userId ? last-gain timestamp
function getLevel(xp)    { return Math.floor(Math.sqrt(xp / 100)); }
function xpForLevel(lvl) { return lvl * lvl * 100; }

// --- Verlof data --------------------------------------------------------------
function loadVerlof()    { try { return JSON.parse(fs.readFileSync(VERLOF_PATH, 'utf-8')); } catch { return []; } }
function saveVerlof(d)   { fs.writeFileSync(VERLOF_PATH, JSON.stringify(d, null, 2)); }
let verlofDB = loadVerlof(); // [{ id, userId, username, van, tot, reden, ingediend, status, goedgekeurdDoor }]

// --- Giveaway data ------------------------------------------------------------
function loadGiveaways() { try { return JSON.parse(fs.readFileSync(GIVEAWAY_PATH, 'utf-8')); } catch { return []; } }
function saveGiveaways(d){ fs.writeFileSync(GIVEAWAY_PATH, JSON.stringify(d, null, 2)); }
let giveawayDB = loadGiveaways(); // [{ id, channelId, messageId, guildId, prize, endsAt, hostId, winnersCount, participants, ended }]
const giveawayTimers = new Map(); // id ? timeout handle

function parseDuration(str) {
  const m = String(str).match(/^(\d+)(d|h|m|s)$/i);
  if (!m) return null;
  const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return parseInt(m[1]) * (units[m[2].toLowerCase()] || 0);
}

async function endGiveaway(gw) {
  if (gw.ended) return;
  gw.ended = true;
  giveawayTimers.delete(gw.id);
  try {
    const channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) { saveGiveaways(giveawayDB); return; }
    const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
    const participants = gw.participants || [];
    const winnersCount = Math.min(gw.winnersCount || 1, participants.length);
    let winnerMentions, description;
    if (participants.length === 0) {
      description = '😔 Niemand heeft meegedaan met deze giveaway.';
      winnerMentions = '*Geen winnaars*';
    } else {
      const winners = [...participants].sort(() => Math.random() - 0.5).slice(0, winnersCount);
      gw.winners = winners;
      winnerMentions = winners.map(id => `<@${id}>`).join(', ');
      description = `🎉 Gefeliciteerd ${winnerMentions}!\n\nJe hebt **${gw.prize}** gewonnen!`;
    }
    const endEmbed = new EmbedBuilder()
      .setTitle('🎊 GIVEAWAY AFGELOPEN')
      .setDescription(description)
      .addFields(
        { name: '🏆 Prijs',       value: gw.prize,                inline: true },
        { name: '🎉 Winnaar(s)', value: winnerMentions,           inline: true },
        { name: '👥 Deelnemers', value: `${participants.length}`, inline: true },
      )
      .setColor(0xFFD700)
      .setFooter({ text: 'Lage Landen RP — Giveaway Afgelopen' })
      .setTimestamp();
    if (msg) await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    if (participants.length > 0)
      await channel.send(`🎊 De giveaway voor **${gw.prize}** is afgelopen! Winnaar(s): ${winnerMentions}`).catch(() => {});
  } catch (e) { console.error('❌ Giveaway end fout:', e); }
  saveGiveaways(giveawayDB);
}

// --- Inactief data ------------------------------------------------------------
function loadInactief()  { try { return JSON.parse(fs.readFileSync(INACTIEF_PATH, 'utf-8')); } catch { return {}; } }
function saveInactief(d) { fs.writeFileSync(INACTIEF_PATH, JSON.stringify(d, null, 2)); }
let inactiefDB = loadInactief(); // userId ? { lastMessage, username, gemeld: [{van, tot, reden}] }

// --- In-memory sessie opslag -------------------------------------------------
// userId -> { bericht }  pending partner (voor review of weet-je-het-zeker)
const pendingPartner = new Map();
// channelId -> true  partner tickets die al een begroeting hebben gekregen
const partnerTicketGreeted = new Set();
// userId -> { kanaalId, kleur, doTag, rol, doTijdstip, doLogo, doAuteur }  pending embed
const pendingEmbed = new Map();

// --- Scheldwoorden filter ----------------------------------------------------
const SLUR_LIST = [
  // -- NL: ziektes als scheldwoord ---------------------------------------------
  'kanker','kk','kkr','kankerd','kankeren','gekanker','tyfus','typhus','tyfuslijer',
  'tering','teringlijer','teringhond','teringwijf','klere','klerelijer','klerezooi',
  'klote','klotemongool','kolere','kolerejong','pest','pestkop','pestlijder',
  'godverdomme','godver','godverdegodver','verdomme','verdomd','verdorie',
  'pokkelijer','pokken','pokkezooi','pokkewijf','tyfuswijf','tyfushond',

  // -- NL: seksueel ------------------------------------------------------------
  'kut','kutwijf','kutje','kutzooitje','lul','lulhannes','lulletje','lulverhaal',
  'pik','piemel','ballen','kloten','schaamlip','schaamhaar','clitoris',
  'vagina','penis','anus','kont','kontje','kontgat',
  'pijpen','beffen','aftrekken','neuk','neuken','geneukt','neuker',
  'seks','seksueel','seksfilm','sextape','ejaculat','zaad','sperma',
  'dildo','vibrator','porren','pornoster','pornosite','naakt','naaktfoto',
  'bloot','blootstellen','tieten','tepel','borsten','klaarkomen',

  // -- NL: seksuele belediging --------------------------------------------------
  'hoer','hoeren','gehoer','slet','slutje','tring','trut','kutwijf',
  'teef','takkewijf','stommewijf','wijf','kech','snol','del','prostituee',

  // -- NL: beledigend/discriminerend -------------------------------------------
  'eikel','eikelaar','idioot','stommeling','stomkop','sukkel','loser','oen',
  'mongool','mong','mongootje','debiel','debilo','spastisch','spast','spasticus',
  'autist','autistisch','nerd','softie','zwakkeling','huffter','rotzak','smeerlap',
  'schoft','schurk','klootzak','lul','klootzakken','lummel','lummels','slapjanus',
  'etterbak','etterbal','etter','rotzooitje','zeikerig','zeikerd','zeurkous',
  'aap','apen','apenkop','beest','varken','varkenslijer','hond','hondenlul',
  'rat','rattenstreek','lafaard','feige','lafbek','angsthaas',

  // -- NL: LGBTQ+ beledigingen --------------------------------------------------
  'flikker','flikkers','nicht','nichten','homo','homofiel','homoseksueel',
  'neef','mietje','mietjes','flikkerij','lesbo','lesbiaan',
  'travestiet','transhoer','transslet',

  // -- NL: racistisch ----------------------------------------------------------
  'neger','negers','negerin','zwartje','aapje','buitenlander','allochtoon',
  'makak','kameel','sandslet','zandneger','poepert','kaaskop',

  // -- NL: drugs / zelfbeschadiging --------------------------------------------
  'selfharm','zelfmoord','ik wil dood','opknopen','overdosis','pillen slikken',
  'aan de drugs','junk','junkie','junks','crackhoer','pillenslikker',

  // -- NL: gevaarlijk gedrag ----------------------------------------------------
  'doorgaan met leven niet waard','ga dood','rot op','maak jezelf af',
  'sterf','sterf maar','lijk','doodsbedreiging',

  // -- EN: vloeken / seksueel ---------------------------------------------------
  'fuck','fucker','fuckers','fucking','fucked','fuckhead','fucks','fuckwit',
  'fck','f u c k','fu ck','f*ck','f**k','fvck','phuck','fook','fook off',
  'shit','shits','shitting','shithead','shitter','shitty','bullshit','horseshit',
  'sh1t','sh!t','$hit','s.h.i.t',
  'ass','asshole','asshat','asswipe','jackass','dumbass','smartass','fatass',
  'a55','@ss','a$s',
  'bitch','bitches','bitching','bitchy','son of a bitch','b1tch','b!tch','bi+ch',
  'bastard','bastards',
  'cunt','cunts','c*nt','cnt','c.u.n.t',
  'dick','dicks','dickhead','dickface','dickwad','d1ck','d!ck','dik',
  'cock','cocks','cocksucker','cock sucker','c0ck','c*ck',
  'pussy','pussies','p*ssy','pvssy',
  'faggot','faggots','fag','fags','f4g','f@g',
  'motherfucker','motherf*cker','mf','mofo',
  'whore','whores','wh0re','wh*re',
  'slut','sluts','sl*t','$lut',
  'hoes','skank','skanks','thot','thots',
  'twat','twats','tw@t',
  'wanker','wankers','wank','wanking',
  'arsehole','arseholes','arse',
  'prick','pricks',
  'tosser','tossers',
  'bellend','bell end',
  'prick','prick head',
  'dumbfuck','dumb fuck','dipshit','dip shit','shithole','shit hole',
  'goddamn','god damn','goddam',
  'bollocks','bloody hell','sod off',
  'knob','knobhead','knob head',
  'minge','chode','boner','erection',
  'blowjob','blow job','handjob','hand job','rimjob','rim job',
  'gangbang','gang bang','threesome','orgy','creampie','cum shot','cumshot',
  'ejaculate','orgasm','masturbat','masturbation','jerk off','jerkoff',
  'titties','titty','boob','boobs','nipple','nipples','naked','nudity','nude',
  'porn','porno','pornography','pornstar','xxx','xnxx','onlyfans','nsfw',
  'sex tape','sextape','sex video',
  'rape','rapist','raping','raped','molest','molestation','pedophile','pedo',
  'child porn','cp','loli','shotacon','underage sex',
  'incest','beastiality','bestiality',

  // -- EN: racistisch / haatspraak ----------------------------------------------
  'nigger','niggers','nigga','niggas','niga','n1gger','n1gga','n word',
  'negro','negros','spic','spics','chink','chinks','gook','gooks',
  'kike','kikes','wetback','wetbacks','beaner','beaners',
  'cracker','redneck','redskin','towelhead','sandnigger','camel jockey',
  'zipperhead','slant eye','jungle bunny','coon','jigaboo','sambo',
  'white trash','trailer trash',

  // -- EN: beledigend -----------------------------------------------------------
  'retard','retards','retarded','ret*rd',
  'moron','morons','imbecile','imbeciles',
  'idiot','idiots','stupid','dumb','dumbass',
  'loser','losers','freak','weirdo','creep',
  'ugly','fatass','lardass','pig','swine',

  // -- EN: LGBTQ+ beledigingen --------------------------------------------------
  'queer','dyke','tranny','shemale','ladyboy','fudgepacker','pillow biter',

  // -- EN: zelfbeschadiging / geweld --------------------------------------------
  'kys','kill yourself','kms','kill myself','hang yourself','go die',
  'slit your wrists','end your life','neck yourself','suicide method',
  'how to kill','shoot yourself','self harm','selfharm','cutting yourself',
  'overdose','drug dealer','buy drugs','sell drugs',

  // -- EN: extremisme ------------------------------------------------------------
  'nazi','nazis','heil','white power','white supremacy','kkk','ku klux',
  'jihad','terrorist','bomb threat','school shooting','mass shooting',
  'ethnic cleansing','genocide','holocaust denial',

  // -- DE: vloeken / seksueel ---------------------------------------------------
  'scheisse','scheiße','kacke','arschloch','arsch','wichser','wichsen',
  'hurensohn','hure','fotze','möse','schwanz','ficken','fick','gefickt',
  'verpiss','verpiss dich','schlampe','dummkopf','vollidiot','depp','trottel',
  'schwuchtel','schwuler','tunte','transe','miststück','dreckssau','drecksau',
  'verdammt','scheisskopf','mistkerl','blöde kuh','volltrottel','vollidiot',
  'wixer','pisser','doofer','bescheuert','bekloppt','verpisst',
  'nuttensohn','nutte','huso',

  // -- DE: racistisch ------------------------------------------------------------
  'rassist','rassismus','nazi','ausländer raus','neger','kanake','kanaken',

  // -- FR: vloeken / beledigend -------------------------------------------------
  'putain','merde','connard','connasse','salope','pute','enculé','encule',
  'fils de pute','va te faire','nique ta mere','nique','bâtard','batard',
  'con','conne','couilles','bite','chatte','foutre','baiser','niquer',
  'pd','pédé','gouine','tapette','antillais','bougnoule','bamboula',

  // -- TR / AR: veelgebruikte beledigingen --------------------------------------
  'orospu','orospu cocugu','sik','sikerim','amk','bok','göt','ibne',
  'kys tr','git ol','yarrak',
  'ibn el sharmouta','kuss','kuss ommak','sharmouta','ibn el',

  // -- Leet-speak & omschrijvingen ----------------------------------------------
  'n1gg','n!gger','n.i.g.g.e.r','ni99er','ni99a',
  'f4g','f@ggot','f4gg0t',
  'b1tch','b!tch','bi7ch',
  'a55','@ss','a$shole',
  'sh1t','$h1t','5hit',
  'fuk','fvck','phuck','f_ck',
  'cnt','c0ck','c*ck','d1ck','d!ck',
  'p*ssy','pu55y','pus5y',
  'wh0re','wh*re','wh0r3',
  's1ut','$lut','sl*t',
  'r3tard','ret4rd',
  'k1ll','kil1','kys1',
  'h0e','h03',
  'pr1ck','pr!ck',
  'tw4t','tw@t',

  // -- ES: Spaans ---------------------------------------------------------------
  'puta','putas','puto','putos','pendejo','pendeja','pinche','chinga','chingada',
  'maricon','maricón','joto','culero','cabron','cabrón','mierda','coño',
  'verga','polla','culo','follar','joder','hostia','gilipollas','capullo',
  'subnormal','imbécil','zorra','furcia','bastardo','mamón','pajero',
  'mamasita','hijodeputa','hijo de puta','vete a la mierda','me cago',
  'negrito','sudaca','indio','moro','cholo','spick',

  // -- PT: Portugees ------------------------------------------------------------
  'porra','caralho','foda','fodase','foda-se','viado','bicha','cuzão','xereca',
  'buceta','piroca','puta merda','vai se foder','sua mae','cachorra','vadia',
  'negão','macaco','crioulo','boceta',

  // -- IT: Italiaans ------------------------------------------------------------
  'cazzo','minchia','vaffanculo','fanculo','stronzo','bastardo','puttana',
  'troia','figlio di puttana','merda','coglione','porco dio','porco','bestia',
  'negro','finocchio','frocio','ricchione',

  // -- PL: Pools ----------------------------------------------------------------
  'kurwa','kurwy','chuj','pierdol','pierdolic','jebac','jebany','skurwysyn',
  'skurwiel','suka','suczka','dupa','dupek','ciota','pedal','spierdalaj',
  'zajebiscie','pierdolone','cwel','kutas','pizda','whore pl',

  // -- RU/UA: Russisch/Oekraïens (Latijns schrift) ------------------------------
  'blyad','blyat','cyka','suka','pizda','pidor','pidoras','mudak','uebok',
  'nahui','poshel nahui','huy','chmo','zalupa','ebat','jebat','svoloch',
  'mraz','ublyudok','shluha','blya','pizdec','kurva','blyadi',

  // -- Online slang (gevaarlijk) ------------------------------------------------
  'kys','kms','unalive','unaliving','i wanna die','wanna kill','kill urself',
  'drink bleach','jump off','go hang','rope yourself','off yourself',
  'end it all','take the l permanently','delete yourself',

  // -- Grooming / online veiligheid (bescherming minderjarigen) ----------------
  'send nudes','send pics','show me','flash me','are you alone',
  'dont tell your parents','keep this secret','our secret','wanna meet',
  'how old are you for real','age play','ageplay','ddlg','mdlb','cgl',
  'little space','littlespace','baby girl for daddy','daddy dom',
  'nonce','paedo','pedo','groomer','grooming','predator','child grooming',
  'minor attracted','map speak','nomap','pro contact',
  'snap me','kik me','dm me nudes','teen nude','young nude','preteen',
  'lolita','loli','shota','shotacon','toddlercon','cub porn',

  // -- Drugs / illegaal --------------------------------------------------------
  'koop drugs','drugs kopen','wiet kopen','coke kopen','xtc kopen',
  'buy weed','buy coke','buy meth','buy heroin','buy pills','buy mdma',
  'dealer','drug dealer','drugs dealer','plug me','hit me up for',
  'meth head','crackhead','crack addict','heroin addict','junkie','junk',
  'cocaine','heroine','methamphetamine','crystal meth','fentanyl','xanax',
  'ketamine for sale','lsd tabs','shrooms for sale',

  // -- Extremisme / terrorisme --------------------------------------------------
  'kill all','death to','gas the','oven the','bring back slavery',
  'race war','race traitor','great replacement','white genocide',
  'zionist conspiracy','jewish conspiracy','n word pass',
  '1488','88','hh','sieg heil','14 words','blood and soil',
  'incel','inceldom','blackpill','femoid','foid','roastie','chad virgin',
  'elliot rodger','mass shooter','school shooter hero',
  'isis','islamic state','al qaeda','jihadi','praise allah bomb',
  'bomb making','how to make a bomb','pipe bomb',

  // -- Haatdragende afkortingen & symbolen -------------------------------------
  'wpww','rah','rwds','ava','rwss','grr','bh','boogaloo',
  '4chan raid','pol raid','discord raid','server raid call',

  // -- Extra EN leet/varianten --------------------------------------------------
  'fck you','fk u','fk off','stfu','shut the fck up','gtfo','go fk yourself',
  'eat sh1t','eat $hit','ba$tard','@sshole ','a.s.s.h.o.l.e',
  'c.u.n.t','d.i.c.k','f.u.c.k','s.h.i.t','b.i.t.c.h',
  'motha fucka','muthafucka','mutha fucka','muhfucka',
  'kunt','kunts','fvck off','phuck off','sheit','shiit','shyt',
  'ahole','a hole','asswhipe','asswhole','azzhole',
  'biatch','beyotch','bytch','beeyotch',
  'dilhole','dillweed','douchecanoe','douche bag','douchebag','douchebags',
  'scumbag','scumball','scumbucket','sleazeball','sleazebag',
  'numbnuts','numnuts','nutsack','ball sack','ballsack','scrote','scrotes',
  'taint','gooch','chode','chad','virgin loser','brainlet',
  'soyboy','soy boy','cuck','cuckold','beta male','omega male',
  'manwhore','man whore','femboy','trap hentai','futa','futanari',
];
const SLUR_REGEX = new RegExp(
  '(?<![\\w\\d])(' + SLUR_LIST.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w\\d])',
  'gi'
);
function checkProfanity(text) {
  return [...new Set([...text.matchAll(SLUR_REGEX)].map(m => m[1].toLowerCase()))];
}

// --- Rotating statuses -------------------------------------------------------
const STATUSES = [
  { name: 'Blacklists aan het checken...', type: ActivityType.Watching },
  { name: 'Servers bewaken...',            type: ActivityType.Watching },
  { name: 'Blacklist Manager | Actief',    type: ActivityType.Playing  },
  { name: 'Lage Landen RP beschermen',     type: ActivityType.Playing  },
  { name: 'Partner aanvragen verwerken...',type: ActivityType.Watching },
  { name: 'Tickets verwerken...',          type: ActivityType.Watching },
  { name: 'Verdachte servers opsporen...',  type: ActivityType.Watching },
  { name: 'De blacklist groeit...',         type: ActivityType.Watching },
  { name: 'Niemand ontsnapt de blacklist', type: ActivityType.Playing  },
];
let statusIdx = 0;

// --- Discord client ----------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks, // ✅ voor webhook beveiliging
  ],
  // Stel browser in als Discord iOS — voorkomt dat Discord de bot weggooit uit spraakkanalen
  ws: { properties: { browser: 'Discord iOS' } },
});

// --- Discord Player (muziek) -------------------------------------------------
// Zet ffmpeg-static pad zodat @discordjs/voice het zeker vindt op Windows
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;
console.log('🔧 ffmpeg pad:', ffmpegPath);

// Onderdruk youtubei.js Text/Info spam (bijv. "Unable to find matching run")
try {
  const { Log } = require('youtubei.js');
  Log.setLevel(Log.Level.ERROR); // Alleen echte errors tonen, geen Text/Warning spam
} catch { /* Geen crashen als import faalt */ }

// --- Custom Muziek Engine (vervangt discord-player — direct @discordjs/voice, zelfde aanpak als radio) ---
const path_m        = require('path');
const fs_m          = require('fs');
const os_m          = require('os');
const { execFile }  = require('child_process');
const { promisify } = require('util');
const execFileM     = promisify(execFile);
const ytDlpBin_m    = path_m.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');

// Zoek een nummer via yt-dlp — geeft track-object terug of null
async function searchMusic(query) {
  const isUrl = /^https?:\/\//.test(query.trim());
  if (isUrl) {
    const r = await execFileM(ytDlpBin_m, [
      query, '--dump-json', '--no-warnings', '--no-playlist',
    ], { timeout: 20_000 }).catch(err => ({ stdout: err.stdout || '' }));
    const line = (r.stdout || '').trim().split('\n')[0];
    if (!line) return null;
    try {
      const info = JSON.parse(line);
      const sec  = Math.floor(info.duration || 0);
      return { title: info.title || query, url: info.webpage_url || query,
               author: info.uploader || info.channel || 'Onbekend',
               duration: `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,
               thumbnail: info.thumbnail || null };
    } catch { return null; }
  } else {
    const r = await execFileM(ytDlpBin_m, [
      `ytsearch1:${query}`, '--flat-playlist',
      '--print', '%(id)s|%(title)s|%(duration)s|%(uploader,channel)s|%(thumbnail)s',
      '--no-warnings',
    ], { timeout: 15_000 }).catch(e => ({ stdout: e.stdout || '' }));
    const line = (r.stdout || '').trim().split('\n')[0];
    if (!line) return null;
    const [id, title, dur, author, thumb] = line.split('|');
    if (!id || !title) return null;
    const sec = parseInt(dur) || 0;
    return { title: title.trim(), url: `https://www.youtube.com/watch?v=${id}`,
             author: (author || 'Onbekend').trim(),
             duration: `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,
             thumbnail: thumb?.trim() || null };
  }
}

// musicMap: per-guild muziekstatus
// { tracks[], currentTrack, connection, audioPlayer, ffmpeg, loop, textChannel, startedAt }
const musicMap = new Map();

function getMusicState(guildId) { return musicMap.get(guildId) || null; }
function isMusicPlaying(guildId) {
  const s = musicMap.get(guildId);
  return !!(s && [AudioPlayerStatus.Playing, AudioPlayerStatus.Buffering].includes(s.audioPlayer?.state?.status));
}
function isMusicPaused(guildId) {
  const s = musicMap.get(guildId);
  return !!(s && s.audioPlayer?.state?.status === AudioPlayerStatus.Paused);
}

// Download via yt-dlp → tmp-bestand → ffmpeg → StreamType.Raw (precies zoals radio)
async function streamTrack(guildId, track) {
  const state = musicMap.get(guildId);
  if (!state) return;

  // Stop oude ffmpeg
  if (state.ffmpeg) { try { state.ffmpeg.kill('SIGKILL'); } catch {} state.ffmpeg = null; }

  console.log(`▶️ stream URL ophalen: ${track.title}`);

  // Haal directe stream URL op via yt-dlp --get-url (geen download nodig, < 3s)
  let streamUrl;
  try {
    const r = await execFileM(ytDlpBin_m, [
      track.url,
      '-f', 'bestaudio[ext=webm]/bestaudio/best',
      '--get-url', '--no-warnings', '--no-playlist',
    ], { timeout: 15_000 }).catch(err => ({ stdout: err.stdout || '' }));
    streamUrl = (r.stdout || '').trim().split('\n')[0];
    if (!streamUrl || !streamUrl.startsWith('http')) throw new Error('geen geldige URL');
  } catch (e) {
    console.error(`❌ URL ophalen mislukt "${track.title}":`, e.message);
    setTimeout(() => advanceQueue(guildId), 1000);
    return;
  }

  console.log(`▶️ ffmpeg start (direct stream): ${track.title}`);
  // ffmpeg leest rechtstreeks van YouTube CDN — exact zoals radio maar dan YouTube ipv radio-URL
  const ff = spawn(ffmpegPath, [
    '-reconnect',          '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max','5',
    '-re',                             // real-time input (voorkomt doorspoelen)
    '-thread_queue_size',  '4096',     // grote input queue voorkomt lag
    '-analyzeduration',    '0',        // geen lange analyze-pause aan het begin
    '-loglevel', 'warning',
    '-i', streamUrl,
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  ff.stderr.on('data', d => console.error(`[ffmpeg] ${d.toString().trim()}`));
  ff.stdout.once('data', () => console.log(`▶️ ffmpeg audio data stroomt: ${track.title}`));
  ff.on('close', code => console.log(`▶️ ffmpeg klaar (code ${code}): ${track.title}`));
  ff.on('error', err => console.error('❌ ffmpeg spawn fout:', err.message));

    state.ffmpeg    = ff;
    state.startedAt = Date.now();

    console.log(`▶️ createAudioResource aanmaken...`);
    const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw });
    console.log(`▶️ audioPlayer.play() aanroepen...`);
    state.audioPlayer.play(resource);
    state.audioPlayer.once(AudioPlayerStatus.Playing, () => console.log(`✅ AudioPlayer speelt: ${track.title}`));
    state.audioPlayer.once(AudioPlayerStatus.Idle,    () => console.log(`📭 AudioPlayer idle na: ${track.title}`));
}

// Ga naar volgende track in wachtrij
async function advanceQueue(guildId) {
  const state = musicMap.get(guildId);
  if (!state) return;

  if (state.loop === 'track' && state.currentTrack) {
    await streamTrack(guildId, state.currentTrack).catch(e => console.error('❌ Loop track fout:', e.message));
    return;
  }
  if (state.loop === 'queue' && state.currentTrack) {
    state.tracks.push({ ...state.currentTrack });
  }

  const next = state.tracks.shift() || null;
  state.currentTrack = next;

  if (!next) {
    console.log('📭 Wachtrij leeg — disconnect na 30s');
    const old = npMessages.get(guildId);
    if (old) { clearInterval(old.interval); old.message?.delete().catch(() => {}); npMessages.delete(guildId); }
    setTimeout(() => { const s = musicMap.get(guildId); if (s && !s.currentTrack) stopMusicEngine(guildId); }, 30_000);
    return;
  }

  console.log(`⏭️ Volgende: ${next.title}`);
  voteSkipMap.delete(guildId);
  await sendNpMessage(guildId, next).catch(() => {});
  await streamTrack(guildId, next).catch(e => {
    console.error('❌ Stream fout:', e.message);
    setTimeout(() => advanceQueue(guildId), 1000);
  });
}

function stopMusicEngine(guildId) {
  const state = musicMap.get(guildId);
  if (!state) return;
  try { state.ffmpeg?.kill('SIGKILL'); } catch {}
  try { state.audioPlayer?.stop(true); } catch {}
  try { state.connection?.destroy(); } catch {}
  const old = npMessages.get(guildId);
  if (old) { clearInterval(old.interval); old.message?.delete().catch(() => {}); npMessages.delete(guildId); }
  musicMap.delete(guildId);
  console.log(`⏹️ Muziek gestopt [${guildId}]`);
}

function skipCurrentTrack(guildId) {
  const state = musicMap.get(guildId);
  if (!state) return false;
  if (state.ffmpeg) { try { state.ffmpeg.kill('SIGKILL'); } catch {} state.ffmpeg = null; }
  state.audioPlayer.stop(true); // → Idle event → advanceQueue
  return true;
}

async function startMusicEngine(vc, track, textChannel) {
  const guildId = vc.guild.id;
  if (musicMap.has(guildId)) stopMusicEngine(guildId);

  const connection  = joinVoiceChannel({
    channelId: vc.id, guildId: guildId,
    adapterCreator: vc.guild.voiceAdapterCreator, selfDeaf: true,
  });
  const audioPlayer = createAudioPlayer();
  connection.subscribe(audioPlayer);

  const state = { tracks: [], currentTrack: track, connection, audioPlayer,
                  ffmpeg: null, loop: 'off', textChannel, startedAt: null };
  musicMap.set(guildId, state);

  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    if (!musicMap.get(guildId)) return;
    advanceQueue(guildId).catch(e => console.error('❌ advanceQueue fout:', e.message));
  });
  audioPlayer.on('error', err => {
    console.error('❌ AudioPlayer fout:', err.message);
    setTimeout(() => advanceQueue(guildId), 1000);
  });
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch { stopMusicEngine(guildId); }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 12_000);
  } catch {
    stopMusicEngine(guildId);
    throw new Error('Kan niet verbinden met voice kanaal (timeout)');
  }

  voteSkipMap.delete(guildId);
  await sendNpMessage(guildId, track).catch(() => {});
  await streamTrack(guildId, track);
  return state;
}

console.log('✅ Muziek engine geladen (direct @discordjs/voice)');

// --- Muziek state -------------------------------------------------------------
const npMessages       = new Map(); // guildId → { message, interval }
const voteSkipMap      = new Map(); // guildId → Set van userId die gestemd hebben
const musicQuality     = new Map(); // guildId → 'laag'|'medium'|'hoog'
const playCooldown     = new Map(); // userId → timestamp laatste /play (anti-spam)
const radioCooldown    = new Map(); // userId → timestamp laatste /radio of /piraten (anti-spam)
const RADIO_COOLDOWN   = 30_000;    // 30 seconden
const ticketClaimedBy  = new Map(); // channelId ? { userId, tag } — wie heeft het ticket geclaimed
const ticketLastActivity = new Map(); // channelId ? Date.now() — laatste berichtmoment
const ticketCloseWarned  = new Map(); // channelId ? Date.now() — wanneer auto-close waarschuwing verstuurd
const TICKET_WARN_MS  = 48 * 60 * 60_000; // 48u geen activiteit → waarschuwing
const TICKET_CLOSE_MS = 24 * 60 * 60_000; // 24u na waarschuwing → auto-sluiten

// --- Radio Stations (25 max — Discord keuze-limiet) -------------------------
const RADIO_STATIONS = {
  'npo1':      { label: '🇳🇱 NPO Radio 1 — Nieuws & Sport',   url: 'https://icecast.omroep.nl/radio1-bb-mp3' },
  'npo2':      { label: '🎵 NPO Radio 2 — NL Hits',          url: 'https://icecast.omroep.nl/radio2-bb-mp3' },
  'npo3fm':    { label: '🎸 NPO 3FM — Pop & Rock',           url: 'https://icecast.omroep.nl/3fm-bb-mp3' },
  'npo4':      { label: '🎻 NPO Radio 4 — Klassiek',         url: 'https://icecast.omroep.nl/radio4-bb-mp3' },
  'funx':      { label: '🔥 NPO FunX — Urban',               url: 'https://icecast.omroep.nl/funx-bb-mp3' },
  'r538':      { label: '📻 Radio 538 — Top 40',             url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3' },
  '100nl':     { label: '🇳🇱 100%NL — Nederlandstalig',       url: 'https://stream.100p.nl/100pctnl.mp3' },
  'qmusic':    { label: '🎶 Q-Music NL',                     url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/QMUSIC.mp3' },
  'skyradio':  { label: '☁️ Sky Radio — Non-Stop Hits',      url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3' },
  'skyhits':   { label: '⭐ Sky Hits',                        url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SRGSTR01.mp3' },
  'veronica':  { label: '📻 Radio Veronica',                 url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/VERONICA.mp3' },
  'joe':       { label: '🎵 Joe NL — 70s 80s 90s',           url: 'https://stream.joe.nl/joe/mp3' },
  'bnr':       { label: '📰 BNR Nieuwsradio',                url: 'https://stream.bnr.nl/bnr_mp3_128_20' },
  'arrow':     { label: '🎸 Arrow Classic Rock',             url: 'https://stream.gal.io/arrow' },
  'arrowrock': { label: '🎸 Arrow Rock Radio',               url: 'https://stream.arrowrockradio.com/arrowrockradio' },
  'grandprix': { label: '🏎️ Grand Prix Radio',               url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/GRAND_PRIX_RADIO.mp3' },
  'qdance':    { label: '💥 Q-Dance Radio — Hardstyle',      url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/Q_DANCE.mp3' },
  'hardcore':  { label: '💥 Masters of Hardcore',             url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/MASTERSOFHARDCORE.mp3' },
  'slam':      { label: '💃 Slam! — Dance & Hits',           url: 'https://stream.slam.nl/slam/mp3-128' },
  'soul':      { label: '🎷 Soul Radio',                     url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SOULRADIO.mp3' },
  'jazzworld': { label: '🎷 Jazz & World Radio',             url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/JAZZANDWORLD.mp3' },
  'radionl':   { label: '🐄 RadioNL — Boerenmuziek',         url: 'https://stream.radionl.fm/radionl' },
  'r8fm':      { label: '💿 Radio 8FM — Dance',              url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/8FM.mp3' },
  'noordzee':  { label: '🌊 Radio Noordzee',                 url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR17.mp3' },
  'fouteuur':  { label: '🎉 Q-Music Foute Uur',              url: 'http://icecast-qmusicnl-cdp.triple-it.nl/Qmusic_nl_fouteuur.mp3' },
};

// --- Piraten Stations (geheime zenders — zelfde infra als radio) -------------
const PIRATE_STATIONS = {
  'friesland1':  { label: '🏴‍☠️ Drachtster Piraten — Friesland 1',    url: 'http://77.168.22.74:9022/stream' },
  'lwrdpiraten': { label: '🏴‍☠️ Leeuwarder Piraten — Friesland 2',    url: 'https://server-26.stream-server.nl:8644/stream' },
  'kleinepiraat':{ label: '🏴‍☠️ Kleine Piraat',                        url: 'https://radio.streampanel.nl:7035/stream?type=.mp3' },
  'piratclub':   { label: '🏴‍☠️ De Piraten Club',                     url: 'http://213.202.241.176:8417/stream' },
  'geluktwente': { label: '🏴‍☠️ Firma Geluk in Tuk — Twente',         url: 'http://piratenstreams.nl:9016/stream' },
  'gigantvandre':{ label: '🏴‍☠️ Gigant van Drenthe',                  url: 'https://cast.accessweb.be:1245/stream' },
  'muziekteam':  { label: '🏴‍☠️ Muziekteam',                          url: 'https://mcp-1.streampanel.nl:8036/stream' },
  'vechtdalnl':  { label: '🏴‍☠️ Vechtdal NL — Piratenmuziek',        url: 'https://streams.rtvvechtdal.nl/VechtdalNL.mp3' },
  'twente1':     { label: '🏴‍☠️ PiratenHits Twente',                  url: 'http://server-23.stream-server.nl:8454/;type=mp3' },
  'twente2':     { label: '🏴‍☠️ Piraten Stream Twente',               url: 'https://stream.piratentwente.com:8022/live' },
  'veluwe':      { label: '🏴‍☠️ De Veluwse Piraten',                  url: 'https://server-26.stream-server.nl:18624/' },
  'lomp':        { label: '🏴‍☠️ LOMP Radio — NL Piraten',             url: 'https://streams.lomp.nl:9009/lomp' },
  'hollands':    { label: '🏴‍☠️ De Hollandse Piraten',                url: 'https://server-28.stream-server.nl:8884/stream' },
  'piratengig':  { label: '🏴‍☠️ De Piraten Gigant',                   url: 'https://server-24.stream-server.nl:18402/stream' },
  'olympia':     { label: '🏴‍☠️ Olympia Radio — 100% Piratenhits',   url: 'https://streams.olympia-streams.nl/olympia' },
  'piratenhits': { label: '🏴‍☠️ Piratenhits.FM',                      url: 'https://mscp3.live-streams.nl:8332/radio' },
  'piratenfam':  { label: '🏴‍☠️ Piratenfamilie.nl',                   url: 'https://server-27.stream-server.nl:18726/stream' },
  'echte':       { label: '🏴‍☠️ Echtepiraten.nl',                     url: 'https://azuraserv3.live-streams.nl:8040/stream.mp3' },
  'piratenkanj': { label: '🏴‍☠️ Piratenkanjers',                      url: 'https://ex52.voordeligstreamen.nl/8095/stream' },
  'goud':        { label: '🏴‍☠️ GoudePiratenHits',                    url: 'https://mcp-1.streampanel.nl:8034/stream' },
  'bestepiraat': { label: '🏴‍☠️ De Beste Piraten',                    url: 'https://mn-ict.nl/stream/8348' },
  'bestehits':   { label: '🏴‍☠️ De Beste Piratenhits',                url: 'https://radio.streampanel.nl:1445/stream' },
  'inetpiraat':  { label: '🏴‍☠️ Internet Piraten',                    url: 'http://213.202.241.176:8678/stream' },
  'zolderpir':   { label: '🏴‍☠️ Zolderpiraten',                       url: 'https://server-24.stream-server.nl:18410/stream' },
  'pirvrienden': { label: '🏴‍☠️ Piraten Vrienden',                    url: 'http://streamserv5.digipal.nl:8002' },
};

// Radio state Map — volledig geïsoleerd van discord-player
const radioMap = new Map(); // guildId ? { audioPlayer, connection, ffmpeg, label }

// FFmpeg filter presets — setFilters(false)=reset alles, setFilters([...])=activeer
const FILTER_MAP = {
  reset:     [],
  bassboost: ['bassboost_high'],
  nightcore: ['nightcore'],
  vaporwave: ['vaporwave'],
  '8d':      ['8D'],
  karaoke:   ['karaoke'],
};

// Geblokkeerde zoektermen in /play
// Normaliseer leet-speak zodat p0rn / d!ldo / s3x etc ook geblokkeerd worden
function normalizeLeet(str) {
  return str.toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/\$/g, 's')
    .replace(/@/g, 'a').replace(/!/g, 'i').replace(/\+/g, 't')
    .replace(/[|]/g, 'i').replace(/\*/g, 'x')
    .replace(/[^a-z0-9\s]/g, ''); // strip resterende speciale tekens
}

const MAX_QUEUE_SIZE  = 50;  // max nummers totaal in de wachtrij
const MAX_PER_USER    = 5;   // max nummers per gebruiker in de wachtrij
const MAX_DURATION_S  = 10 * 60; // max 10 minuten per track
const PLAY_COOLDOWN   = 5_000;   // 5 seconden cooldown tussen /play aanvragen

const MUSIC_BLOCKLIST = [
  // Fout/aanstootgevend — nazi/oorlog propaganda
  'erika', 'horst wessel', 'sieg heil', 'heil hitler', 'nazi', 'third reich',
  'adolf hitler', 'hitler', 'ss march', 'waffen ss', 'nsdap', 'führer',
  // Porno / sex — Engels
  'porn', 'porno', 'sex sound', 'moaning', 'moan', 'hentai', 'xxx', 'onlyfans',
  'nsfw', 'nude', 'naked', 'blowjob', 'cumshot', 'orgasm', 'fetish',
  'penis', 'vagina', 'anal', 'creampie', 'dildo', 'vibrator', 'masturbat',
  'erotic', 'erotica', 'jerk off', 'jerk-off', 'handjob', 'titties', 'boobs',
  'pussy', 'cock', 'dick', 'boner', 'horny', 'cum ', 'cumming', 'squirt',
  'gangbang', 'facial', 'deepthroat', 'rimjob', 'fisting', 'threesome',
  'sexueel', 'sextape', 'sex tape',
  // Porno / sex — Nederlands slang
  'lul', 'pik ', ' pik', 'kut ', ' kut', 'kuttenlul', 'neuk', 'neuken',
  'beffen', 'pijpen', 'aftrekken', 'tieten', 'kontje', 'naakt', 'seks',
  'geile', 'geil ', 'hoer', 'slet', 'teef', 'seksueel', 'seksvideo',
  'klaarkomen', 'ejaculat', 'schaamlip', 'clitoris', 'schaamhaar',
  // Gore
  'gore', 'beheading', 'execution video', 'snuff', 'torture audio', 'uncensored footage',
  'brutal footage', 'death video',
];

function buildNpEmbed_m(state, track, guildId) {
  const elapsed  = state?.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  const durParts = (track?.duration || '0:00').split(':').map(Number);
  const durSec   = durParts.length === 3 ? durParts[0]*3600+durParts[1]*60+durParts[2] : durParts[0]*60+(durParts[1]||0);
  const pct      = durSec > 0 ? Math.min(elapsed / durSec, 1) : 0;
  const filled   = Math.round(pct * 20);
  const bar      = '▓'.repeat(filled) + '░'.repeat(20 - filled);
  const elpStr   = `${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
  const loopLabel = state?.loop === 'track' ? '🔂 Track' : state?.loop === 'queue' ? '🔁 Queue' : '➡️ Normaal';
  const queueSize = state?.tracks?.length || 0;
  const embed = new EmbedBuilder()
    .setTitle('🎵 Nu Speelt')
    .setDescription(track?.url ? `**[${track.title}](${track.url})**` : `**${track?.title || '?'}**`)
    .addFields(
      { name: '🎤 Artiest',  value: track?.author   || 'Onbekend', inline: true },
      { name: '⏱️ Duur',     value: track?.duration || '?',        inline: true },
      { name: '📋 Wachtrij', value: `${queueSize} nummer${queueSize !== 1 ? 's' : ''}`, inline: true },
      { name: `${bar}`,      value: `\`${elpStr} / ${track?.duration || '?'}\``, inline: false },
      { name: '🔁 Loop',     value: loopLabel, inline: true },
    )
    .setColor(0x1DB954)
    .setFooter({ text: `Aangevraagd door ${track?.requestedBy?.username || '?'} | Lage Landen RP` })
    .setTimestamp();
  const thumb = track?.thumbnail?.startsWith?.('http') ? track.thumbnail : null;
  if (thumb) embed.setThumbnail(thumb);
  return embed;
}

async function sendNpMessage(guildId, track) {
  const old = npMessages.get(guildId);
  if (old) { clearInterval(old.interval); old.message?.delete().catch(() => {}); npMessages.delete(guildId); }
  const state = musicMap.get(guildId);
  const ch    = state?.textChannel;
  if (!ch) return;
  const msg = await ch.send({ embeds: [buildNpEmbed_m(state, track, guildId)] }).catch(() => null);
  if (!msg) return;
  const interval = setInterval(async () => {
    const s = musicMap.get(guildId);
    if (!s?.currentTrack) return;
    await msg.edit({ embeds: [buildNpEmbed_m(s, s.currentTrack, guildId)] }).catch(() => {});
  }, 15_000);
  npMessages.set(guildId, { message: msg, interval });
}


// ----------------------------------------------------------------------------
//  HELPER — Ticket transcript loggen
// ----------------------------------------------------------------------------
async function logTicketTranscript(channel, closedBy) {
  const logCh = await client.channels.fetch(TICKET_LOG_CHANNEL).catch(() => null);
  if (!logCh) return;

  // Alle berichten ophalen (paginatie, max 500)
  let allMessages = [];
  let lastId = null;
  for (let i = 0; i < 5; i++) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  // Chronologisch sorteren (oudste eerst)
  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Ticket type bepalen uit kanaalnaam
  const chanName = channel.name;
  let ticketType = 'Onbekend';
  if (chanName.includes('support'))           ticketType = 'Support';
  else if (chanName.includes('report'))       ticketType = 'Report';
  else if (chanName.includes('sollicitatie')) ticketType = 'Sollicitatie';
  else if (chanName.includes('partner'))      ticketType = 'Partner';

  const openedAt = allMessages.length > 0
    ? new Date(allMessages[0].createdTimestamp).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })
    : 'Onbekend';
  const closedAt = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

  const typeAccent = { Support: '#5865F2', Report: '#FF6B6B', Sollicitatie: '#57F287', Partner: '#FFA500', Onbekend: '#99AAB5' };
  const accent = typeAccent[ticketType] ?? '#99AAB5';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarHtml(author) {
    const url = author.displayAvatarURL({ extension: 'png', size: 64 });
    const initials = escapeHtml((author.username || '?').slice(0, 2).toUpperCase());
    return `<img class="avatar" src="${escapeHtml(url)}" alt="${initials}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="avatar-fallback" style="display:none">${initials}</span>`;
  }

  const messagesHtml = allMessages.map(msg => {
    const ts = new Date(msg.createdTimestamp).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
    const isBot = msg.author.bot;
    const roleColor = isBot ? '#5865F2' : '#ffffff';
    let contentHtml = '';
    if (msg.content) contentHtml += `<div class="msg-content">${escapeHtml(msg.content)}</div>`;
    if (msg.embeds.length) {
      for (const emb of msg.embeds) {
        const title = emb.title ? escapeHtml(emb.title) : '';
        const desc  = emb.description ? escapeHtml(emb.description) : '';
        contentHtml += `<div class="embed" style="border-left:4px solid ${emb.color ? '#' + emb.color.toString(16).padStart(6,'0') : accent}"><strong>${title}</strong>${desc ? '<br>' + desc : ''}</div>`;
      }
    }
    if (msg.attachments.size) {
      for (const att of msg.attachments.values()) {
        const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name || '');
        contentHtml += isImg
          ? `<div class="attachment"><a href="${escapeHtml(att.url)}" target="_blank"><img class="att-img" src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}"></a></div>`
          : `<div class="attachment">📎 <a href="${escapeHtml(att.url)}" target="_blank">${escapeHtml(att.name)}</a></div>`;
      }
    }
    if (!contentHtml) contentHtml = '<div class="msg-content empty">[Leeg bericht]</div>';
    return `<div class="msg${isBot ? ' bot' : ''}">
      <div class="msg-avatar">${avatarHtml(msg.author)}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-author" style="color:${roleColor}">${escapeHtml(msg.member?.displayName || msg.author.username)}</span>
          <span class="msg-tag">${escapeHtml(msg.author.tag)}</span>
          <span class="msg-ts">${escapeHtml(ts)}</span>
        </div>
        ${contentHtml}
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript — #${escapeHtml(chanName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#313338;color:#dcddde;font-family:'gg sans','Noto Sans',Whitney,sans-serif;font-size:15px;line-height:1.5}
header{background:#1e1f22;padding:24px 32px;border-bottom:2px solid ${accent}}
header h1{color:${accent};font-size:22px;margin-bottom:8px}
.meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px}
.meta-item{background:#2b2d31;border-radius:8px;padding:8px 14px}
.meta-label{font-size:11px;color:#949ba4;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.meta-value{color:#e3e5e8;font-size:13px;margin-top:2px}
.messages{max-width:860px;margin:0 auto;padding:24px 16px}
.msg{display:flex;gap:16px;padding:8px 0;border-bottom:1px solid #2b2d31}
.msg.bot .msg-author{color:#5865F2!important}
.msg-avatar{flex-shrink:0;width:40px;height:40px;position:relative}
.avatar,.avatar-fallback{width:40px;height:40px;border-radius:50%}
.avatar-fallback{background:#5865F2;color:#fff;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.msg-body{flex:1;min-width:0}
.msg-header{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.msg-author{font-weight:600;font-size:15px}
.msg-tag{color:#949ba4;font-size:12px}
.msg-ts{color:#949ba4;font-size:11px;margin-left:auto}
.msg-content{color:#dcddde;word-break:break-word}
.msg-content.empty{color:#5d6168;font-style:italic}
.embed{background:#2b2d31;border-radius:0 4px 4px 0;padding:10px 12px;margin-top:6px;color:#dcddde;font-size:13px;word-break:break-word}
.attachment{margin-top:6px}
.attachment a{color:#00aff4;text-decoration:none}
.attachment a:hover{text-decoration:underline}
.att-img{max-width:300px;max-height:200px;border-radius:4px;margin-top:4px}
footer{text-align:center;padding:24px;color:#4f545c;font-size:12px;border-top:1px solid #2b2d31;margin-top:32px}
</style>
</head>
<body>
<header>
  <h1>📋 Ticket Transcript — ${escapeHtml(ticketType)}</h1>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">Kanaal</div><div class="meta-value">#${escapeHtml(chanName)}</div></div>
    <div class="meta-item"><div class="meta-label">Geopend op</div><div class="meta-value">${escapeHtml(openedAt)}</div></div>
    <div class="meta-item"><div class="meta-label">Gesloten op</div><div class="meta-value">${escapeHtml(closedAt)}</div></div>
    <div class="meta-item"><div class="meta-label">Gesloten door</div><div class="meta-value">${escapeHtml(closedBy.tag)} (${escapeHtml(closedBy.id)})</div></div>
    <div class="meta-item"><div class="meta-label">Berichten</div><div class="meta-value">${allMessages.length}</div></div>
  </div>
</header>
<div class="messages">
${messagesHtml}
</div>
<footer>Lage Landen RP — Automatisch gegenereerd transcript</footer>
</body>
</html>`;

  const buf      = Buffer.from(html, 'utf-8');
  const filename = `transcript-${chanName}-${Date.now()}.html`;
  const attachment = new AttachmentBuilder(buf, { name: filename });

  const typeColors = { Support: 0x5865F2, Report: 0xFF6B6B, Sollicitatie: 0x57F287, Partner: 0xFFA500, Onbekend: 0x99AAB5 };
  const embed = new EmbedBuilder()
    .setTitle(`📋 Ticket Transcript — ${ticketType}`)
    .addFields(
      { name: '🏷️ Type',         value: ticketType,            inline: true },
      { name: '💬 Berichten',     value: `${allMessages.length}`, inline: true },
      { name: '\u200B',           value: '\u200B',              inline: true },
      { name: '📢 Kanaal',        value: `#${chanName}`,        inline: true },
      { name: '👤 Gesloten door', value: `${closedBy.tag}`,     inline: true },
      { name: '\u200B',           value: '\u200B',              inline: true },
      { name: '📅 Geopend op',    value: openedAt,              inline: true },
      { name: '📅 Gesloten op',   value: closedAt,              inline: true },
    )
    .setColor(typeColors[ticketType] ?? 0x99AAB5)
    .setFooter({ text: `Lage Landen RP — Ticket Logs` })
    .setTimestamp();

  await logCh.send({ embeds: [embed], files: [attachment] }).catch(e => console.error('❌ Transcript log fout:', e));
}

// ----------------------------------------------------------------------------
//  HELPER — Reactietijd embed bijwerken
// ----------------------------------------------------------------------------
async function updateReactietijdEmbed(guild) {
  const chanId = db.channels.reactietijdChannelId;
  if (!chanId) return;
  const chan = await client.channels.fetch(chanId).catch(() => null);
  if (!chan) return;

  // Open tickets tellen (over alle type-categorieën)
  await guild.channels.fetch().catch(() => {});
  const ticketCatIds = [
    db.channels.ticketSupportCategoryId,
    db.channels.ticketReportCategoryId,
    db.channels.ticketSollicitatieCategoryId,
    db.channels.ticketPartnerCategoryId,
    db.channels.ticketCategoryId,
  ].filter(Boolean);
  const openTickets = guild.channels.cache.filter(c =>
    ticketCatIds.includes(c.parentId) &&
    c.name.startsWith('\u276Aticket\u276B-')
  ).size;

  // Online staff tellen (niet offline/invisible)
  await guild.members.fetch().catch(() => {});
  const onlineStaff = guild.members.cache.filter(m =>
    m.roles.cache.has(STAFF_ROLE_ID) &&
    m.presence &&
    m.presence.status !== 'offline' &&
    m.presence.status !== 'invisible'
  ).size;

  // Drukte berekenen
  const ratio = onlineStaff === 0 ? Infinity : openTickets / onlineStaff;

  let kleur, status, emoji, reactietijd, uitleg;
  if (onlineStaff === 0) {
    kleur      = 0xFF0000;
    status     = 'Geen Staff Online';
    emoji      = '🔴';
    reactietijd = '60+ minuten';
    uitleg     = 'Er is momenteel **geen staff online**. Je ticket wordt beantwoord zodra een stafflid online komt.';
  } else if (ratio <= 1.5) {
    kleur      = 0x57F287;
    status     = 'Rustig';
    emoji      = '🟢';
    reactietijd = '~5 minuten';
    uitleg     = 'Het is **rustig**. Er zijn genoeg staffleden beschikbaar om snel te helpen.';
  } else if (ratio <= 3) {
    kleur      = 0xFFA500;
    status     = 'Druk';
    emoji      = '🟡';
    reactietijd = '~15 minuten';
    uitleg     = 'Het is **redelijk druk**. Het kan even duren voordat een stafflid je ticket oppakt.';
  } else {
    kleur      = 0xFF6B6B;
    status     = 'Zeer Druk';
    emoji      = '🔴';
    reactietijd = '30+ minuten';
    uitleg     = 'Het is **erg druk**. We doen ons best zo snel mogelijk te reageren.';
  }

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Ticket Reactietijd — Lage Landen RP`)
    .setDescription(uitleg)
    .addFields(
      { name: '📊 Status',             value: `**${status}**`,          inline: true },
      { name: '⏱️ Verwachte reactietijd', value: `**${reactietijd}**`, inline: true },
      { name: '\u200B',               value: '\u200B',                 inline: true },
      { name: '🏴‍☠️ Staff online',       value: `**${onlineStaff}**`,    inline: true },
      { name: '🎫 Open tickets',        value: `**${openTickets}**`,    inline: true },
      { name: '\u200B',               value: '\u200B',                 inline: true },
    )
    .setColor(kleur)
    .setFooter({ text: 'Wordt automatisch bijgewerkt | Lage Landen RP' })
    .setTimestamp();

  if (db.channels.reactietijdMessageId) {
    try {
      const msg = await chan.messages.fetch(db.channels.reactietijdMessageId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch { /* bericht weg, opnieuw sturen */ }
  }
  const msg = await chan.send({ embeds: [embed] });
  db.channels.reactietijdMessageId = msg.id;
  saveData(db);
}

// ----------------------------------------------------------------------------
//  HELPER — Actieve Partners overzicht embed bijwerken
// ----------------------------------------------------------------------------
async function updatePartnersEmbed(guild) {
  const chanId = db.channels.activePartnersChannelId;
  if (!chanId) return;
  const chan = await client.channels.fetch(chanId).catch(() => null);
  if (!chan) return;

  const partners = Object.values(db.partners);
  const infoCh   = db.channels.infoChannelId ? `<#${db.channels.infoChannelId}>` : 'het partner-info kanaal';

  const desc = partners.length === 0
    ? `*Er zijn momenteel geen actieve partners.*\n\nWil jij partner worden? Klik op **Partnerschap Aanvragen** in ${infoCh}!`
    : partners.map((p, i) => {
        const who = p.staffPlaced
          ? `**${p.serverName}**`
          : `<@${p.userId}> — **${p.serverName}**`;
        return `**${i + 1}.** ${who}\n` +
          `🔗 [Bekijk bericht](https://discord.com/channels/${guild.id}/${PARTNER_CHANNEL_ID}/${p.messageId}) • Actief sinds <t:${Math.floor(p.approvedAt / 1000)}:D>`;
      }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🤝 Actieve Partners — Lage Landen RP')
    .setDescription(desc)
    .setColor(0x57F287)
    .setFooter({ text: `${partners.length} actieve partner(s) | Lage Landen RP` })
    .setTimestamp();

  if (db.channels.activePartnersMessageId) {
    try {
      const msg = await chan.messages.fetch(db.channels.activePartnersMessageId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch { /* bericht weg, nieuw sturen */ }
  }
  const msg = await chan.send({ embeds: [embed] });
  db.channels.activePartnersMessageId = msg.id;
  saveData(db);
}

// ----------------------------------------------------------------------------
//  SETUP — Partner categorie + kanalen
// ----------------------------------------------------------------------------
async function setupPartnerCategory(guild) {
  const exists = async (id) => {
    if (!id) return false;
    try { await client.channels.fetch(id); return true; } catch { return false; }
  };

  // Categorie
  let cat;
  if (!await exists(db.channels.partnerCategoryId)) {
    cat = await guild.channels.create({ name: '🤝 Partnerschap', type: ChannelType.GuildCategory });
    db.channels.partnerCategoryId = cat.id;
    console.log('✅ Partner categorie aangemaakt');
  } else {
    cat = await client.channels.fetch(db.channels.partnerCategoryId);
  }

  // ?? partner-info — aanvraagknop
  if (!await exists(db.channels.infoChannelId)) {
    const ch = await guild.channels.create({
      name: '🤝partner-info',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone,  allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id,        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        { id: STAFF_ROLE_ID,         allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    });
    db.channels.infoChannelId = ch.id;

    const embed = new EmbedBuilder()
      .setTitle('🤝 Partnerschap — Lage Landen RP')
      .setDescription(
        '**Welkom bij het partnerschap systeem van Lage Landen RP!**\n\n' +
        'Lees de partnerschapseisen **goed door** voordat je een aanvraag indient.\n\n' +
        `🔗 **[Klik hier om de partnerschapseisen te bekijken](${PARTNER_WEBSITE})**\n\n` +
        '> Wil je een partnerschap aanvragen? Klik op de knop hieronder.\n' +
        '> Er wordt een privé ticket aangemaakt waarin je je partnerbericht kunt indienen.\n' +
        '> Een stafflid beoordeelt je aanvraag zo snel mogelijk.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Lage Landen RP — Partner Systeem' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('partner_ticket').setLabel('🤝 Partner Ticket Aanmaken').setStyle(ButtonStyle.Primary),
    );
    await ch.send({ embeds: [embed], components: [row] });
    console.log('✅ partner-info aangemaakt + embed verstuurd');
  }

  // ?? actieve-partners — live overzicht
  if (!await exists(db.channels.activePartnersChannelId)) {
    const ch = await guild.channels.create({
      name: '🤝actieve-partners',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id,       allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        { id: STAFF_ROLE_ID,        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    });
    db.channels.activePartnersChannelId = ch.id;
    console.log('✅ actieve-partners aangemaakt');
  }

  // ?? partner-aanvragen — staff review
  if (!await exists(db.channels.reviewChannelId)) {
    const ch = await guild.channels.create({
      name: '🤝partner-aanvragen',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        { id: STAFF_ROLE_ID,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    });
    db.channels.reviewChannelId = ch.id;
    console.log('✅ partner-aanvragen aangemaakt');
  }

  saveData(db);
  await updatePartnersEmbed(guild);
  console.log('✅ Partner setup volledig klaar');
}

// ----------------------------------------------------------------------------
//  SETUP — Ticket categorie + panel
// ----------------------------------------------------------------------------
async function setupTicketCategory(guild) {
  const exists = async (id) => {
    if (!id) return false;
    try { await client.channels.fetch(id); return true; } catch { return false; }
  };

  // Hoofd-categorie voor panel + reactietijd
  let cat;
  if (!await exists(db.channels.ticketCategoryId)) {
    cat = await guild.channels.create({ name: '🎫 Tickets', type: ChannelType.GuildCategory });
    db.channels.ticketCategoryId = cat.id;
    console.log('✅ Ticket hoofd-categorie aangemaakt');
  } else {
    cat = await client.channels.fetch(db.channels.ticketCategoryId);
  }

  // Per-type categorieën
  const typeCategories = [
    { key: 'ticketSupportCategoryId',      name: '🔵 Support Tickets' },
    { key: 'ticketReportCategoryId',        name: '🔴 Report Tickets' },
    { key: 'ticketSollicitatieCategoryId',  name: '🟢 Sollicitatie Tickets' },
    { key: 'ticketPartnerCategoryId',       name: '🤝 Partner Tickets' },
  ];
  for (const { key, name } of typeCategories) {
    if (!await exists(db.channels[key])) {
      const typeCat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
      db.channels[key] = typeCat.id;
      console.log(`✅ Categorie aangemaakt: ${name}`);
    }
  }

  // ????tickets panel
  if (!await exists(db.channels.ticketPanelChannelId)) {
    const ch = await guild.channels.create({
      name: '\u276Atickets\u276B',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id,  allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        { id: STAFF_ROLE_ID,   allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    });
    db.channels.ticketPanelChannelId = ch.id;

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket Systeem — Lage Landen RP')
      .setDescription(
        '**Welkom bij het ticket systeem van Lage Landen RP!**\n\n' +
        'Kies hieronder het type ticket dat je wilt aanmaken:\n\n' +
        '🔵 **Support** — Vragen, problemen of hulp nodig\n' +
        '🔴 **Report** — Meld een speler of probleem\n' +
        '🟢 **Sollicitatie** — Solliciteer voor een functie\n\n' +
        '> ℹ️ Eén open ticket per type per persoon.\n' +
        '> Misbruik van het ticket systeem kan leiden tot sancties.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_support').setLabel('🔵 Support').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_report').setLabel('🔴 Report').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_sollicitatie').setLabel('🟢 Sollicitatie').setStyle(ButtonStyle.Success),
    );
    await ch.send({ embeds: [embed], components: [row] });
    console.log('✅ Ticket panel aangemaakt');
  }

  // ?? reactietijd — status kanaal
  if (!await exists(db.channels.reactietijdChannelId)) {
    const ch = await guild.channels.create({
      name: '⏱️reactietijd',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        { id: STAFF_ROLE_ID,  allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ]
    });
    db.channels.reactietijdChannelId = ch.id;
    console.log('✅ reactietijd kanaal aangemaakt');
  }

  // ------------------------------------------------------------------
  //  MIGRATIE — bestaande ticket-kanalen naar juiste categorie zetten
  // ------------------------------------------------------------------
  await guild.channels.fetch().catch(() => {});

  // Kanaalnaam-patroon → doelcategorie-ID
  // Prioriteit-emoji (🟡/🔴/🚨) mag optioneel tussen ❪ticket❫- en het type staan
  const PRIO_OPT = '(?:🟡-|🔴-|🚨-)?';
  const migrationRules = [
    { pattern: new RegExp(`^\u276Aticket\u276B-${PRIO_OPT}support-`),      catId: db.channels.ticketSupportCategoryId      },
    { pattern: new RegExp(`^\u276Aticket\u276B-${PRIO_OPT}report-`),        catId: db.channels.ticketReportCategoryId        },
    { pattern: new RegExp(`^\u276Aticket\u276B-${PRIO_OPT}sollicitatie-`),  catId: db.channels.ticketSollicitatieCategoryId  },
    { pattern: new RegExp(`^\u276Aticket\u276B-${PRIO_OPT}partner-`),       catId: db.channels.ticketPartnerCategoryId       },
  ];

  const allTicketChannels = guild.channels.cache.filter(c =>
    c.type === ChannelType.GuildText && c.name.startsWith('\u276Aticket\u276B-')
  );

  let migrated = 0;
  for (const [, chan] of allTicketChannels) {
    const rule = migrationRules.find(r => r.pattern.test(chan.name));
    if (!rule || !rule.catId) continue;
    if (chan.parentId === rule.catId) continue; // al goed
    await chan.setParent(rule.catId, { lockPermissions: false }).catch(e =>
      console.warn(`⚠️ Kon ${chan.name} niet verplaatsen:`, e.message)
    );
    console.log(`🔁 Ticket verplaatst: #${chan.name}`);
    migrated++;
  }
  if (migrated > 0) console.log(`✅ ${migrated} ticket(s) naar juiste categorie verplaatst`);

  saveData(db);
  await updateReactietijdEmbed(guild);
  console.log('✅ Ticket setup volledig klaar');
}

// ----------------------------------------------------------------------------
//  HELPER — Partner ticket aanmaken
// ----------------------------------------------------------------------------
async function createPartnerTicket(interaction) {
  const guild    = interaction.guild;
  const user     = interaction.user;
  const chanName = `\u276Aticket\u276B-partner-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 100);

  if (db.partners[user.id]) {
    const p = db.partners[user.id];
    return interaction.reply({
      content: `⚠️ Je hebt al een actief partnerschap. [Bekijk je bericht](https://discord.com/channels/${guild.id}/${PARTNER_CHANNEL_ID}/${p.messageId})`,
      flags: 64
    });
  }

  const existing = guild.channels.cache.find(c => c.name === chanName);
  if (existing) {
    return interaction.reply({ content: `⚠️ Je hebt al een open partner ticket: <#${existing.id}>`, flags: 64 });
  }

  await safeDefer(interaction, { flags: 64 });
  if (!interaction.deferred && !interaction.replied) return;

  const ticket = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: db.channels.ticketPartnerCategoryId || db.channels.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: STAFF_ROLE_ID,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
    ]
  });

  const embed = new EmbedBuilder()
    .setTitle('🤝 Partner Ticket — Lage Landen RP')
    .setDescription(
      `Welkom <@${user.id}>!\n\n` +
      `Bedankt voor je interesse in een partnerschap met **Lage Landen RP**!\n\n` +
      `🔗 **[Bekijk de partnerschapseisen](${PARTNER_WEBSITE})**\n\n` +
      `Heb je de eisen gelezen en ben je akkoord? Druk op de knop hieronder om je partnerbericht in te dienen.\n` +
      `Een stafflid beoordeelt je aanvraag daarna zo snel mogelijk.`
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Lage Landen RP — Partner Systeem' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('partner_bericht_versturen').setLabel('📨 Stuur Partner Bericht').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_sluit').setLabel('🔒 Sluit Ticket').setStyle(ButtonStyle.Secondary),
  );

  await ticket.send({ content: `<@${user.id}> | <@&${STAFF_ROLE_ID}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Je partner ticket is aangemaakt: <#${ticket.id}>` });

  // DM naar de partner-aanvrager
  user.send({ embeds: [
    new EmbedBuilder()
      .setTitle('🤝 Partner Ticket Aangemaakt — Lage Landen RP')
      .setDescription(
        `Je partner ticket is aangemaakt!\n\n` +
        `📌 **Kanaal:** <#${ticket.id}>\n` +
        `🔗 **Direct link:** https://discord.com/channels/${guild.id}/${ticket.id}\n\n` +
        `Lees de partner eisen goed door en klik op de knop om je aanvraag in te dienen.`
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Lage Landen RP — Partner Systeem' })
      .setTimestamp()
  ]}).catch(() => {});

  // Ticket stats bijhouden
  if (!db.ticketStats) db.ticketStats = { totalOpened: 0, totalClosed: 0, byType: { support: { opened:0,closed:0 }, report: { opened:0,closed:0 }, sollicitatie: { opened:0,closed:0 }, partner: { opened:0,closed:0 } } };
  db.ticketStats.totalOpened++;
  if (db.ticketStats.byType.partner) db.ticketStats.byType.partner.opened++;
  saveData(db);

  updateReactietijdEmbed(guild).catch(() => {});
}

// ----------------------------------------------------------------------------
//  HELPER — Bekende tijdelijke Discord-fouten negeren
// ----------------------------------------------------------------------------
function isIgnorableError(e) {
  if (!e) return false;
  const code   = e.code   ?? e.status ?? 0;
  const status = e.status ?? 0;
  // 10062 = Unknown Interaction (verlopen, >3s na klik)
  // 10008 = Unknown Message
  // 40060 = Interaction already acknowledged
  // 503   = Discord tijdelijk niet beschikbaar
  return [10062, 10008, 40060].includes(code) || status === 503;
}

// Wrapper: deferReply die verlopen interacties stil slikt
async function safeDefer(interaction, opts = { flags: 64 }) {
  try {
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply(opts);
  } catch (e) {
    if (isIgnorableError(e)) return;   // stil negeren
    throw e;                            // andere fouten doorsturen
  }
}

// ----------------------------------------------------------------------------
//  HELPER — Ticket kanaal aanmaken
// ----------------------------------------------------------------------------
async function createTicket(interaction, type) {
  const guild    = interaction.guild;
  const user     = interaction.user;
  const typeLow  = type.toLowerCase();
  const chanName = `\u276Aticket\u276B-${typeLow}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 100);

  const existing = guild.channels.cache.find(c => c.name === chanName);
  if (existing) {
    return interaction.reply({ content: `⚠️ Je hebt al een open **${type}** ticket: <#${existing.id}>`, flags: 64 });
  }

  await safeDefer(interaction, { flags: 64 });
  if (!interaction.deferred && !interaction.replied) return;

  const typeCategoryMap = {
    Support:      db.channels.ticketSupportCategoryId,
    Report:       db.channels.ticketReportCategoryId,
    Sollicitatie: db.channels.ticketSollicitatieCategoryId,
  };
  const parentCat = typeCategoryMap[type] || db.channels.ticketCategoryId;

  const ticket = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: parentCat,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id,         allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: STAFF_ROLE_ID,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
    ]
  });

  const typeInfo = {
    Support: {
      color: 0x5865F2, emoji: '🔵',
      desc: `Welkom <@${user.id}>!\n\nBeschrijf zo duidelijk mogelijk je probleem of vraag. Ons staff team helpt je zo snel mogelijk!\n\n**Wat is je probleem of vraag?**`,
    },
    Report: {
      color: 0xFF6B6B, emoji: '🔴',
      desc: `Welkom <@${user.id}>!\n\nBeschrijf duidelijk wie je meldt en waarom. Voeg bewijs toe indien mogelijk.\n\n**Wie meld je, en waarom?**`,
    },
    Sollicitatie: {
      color: 0x57F287, emoji: '🟢',
      desc: `Welkom <@${user.id}>!\n\n` +
        `Voordat een stafflid contact met je opneemt, sturen wij je alvast een paar korte vragen. **Beantwoord deze zo snel mogelijk in dit kanaal** — zo heeft het team al een beeld van je!\n\n` +
        `📝 **Stuur kort je antwoorden:**\n\n` +
        `**1.** Voor welk team wil je solliciteren?\n` +
        `*(bijv. Politie, Ambulance, Brandweer, Staff, Developer, Scripter…)*\n\n` +
        `**2.** Is dit een spoedsollicitatie? (ja/nee)\n` +
        `*(spoed = je bent dringend nodig of beschikbaar op korte termijn)*\n\n` +
        `**3.** Wat is je leeftijd?\n\n` +
        `**4.** Heb je ervaring bij andere servers of in deze rol? Zo ja, welke?\n\n` +
        `**5.** Waarom wil je bij Lage Landen RP?\n\n` +
        `> ✅ Een stafflid neemt zo snel mogelijk contact met je op na jouw antwoorden.`,
    },
  };

  const info = typeInfo[type];
  const embed = new EmbedBuilder()
    .setTitle(`${info.emoji} ${type} Ticket — Lage Landen RP`)
    .setDescription(info.desc)
    .setColor(info.color)
    .setFooter({ text: `Ticket van ${user.tag} | Lage Landen RP` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_sluit').setLabel('🔒 Sluit Ticket').setStyle(ButtonStyle.Secondary),
  );

  await ticket.send({ content: `<@${user.id}> | <@&${STAFF_ROLE_ID}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Je ticket is aangemaakt: <#${ticket.id}>` });

  // DM naar de ticketopener
  user.send({ embeds: [
    new EmbedBuilder()
      .setTitle(`${info.emoji} Ticket Aangemaakt — Lage Landen RP`)
      .setDescription(
        `Je **${type}** ticket is aangemaakt!\n\n` +
        `📌 **Kanaal:** <#${ticket.id}>\n` +
        `🔗 **Direct link:** https://discord.com/channels/${guild.id}/${ticket.id}\n\n` +
        `Een stafflid pakt je ticket zo snel mogelijk op. Houd je DMs open voor updates.`
      )
      .setColor(info.color)
      .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
      .setTimestamp()
  ]}).catch(() => {});

  // Ticket stats bijhouden
  if (!db.ticketStats) db.ticketStats = { totalOpened: 0, totalClosed: 0, byType: { support: { opened:0,closed:0 }, report: { opened:0,closed:0 }, sollicitatie: { opened:0,closed:0 }, partner: { opened:0,closed:0 } } };
  db.ticketStats.totalOpened++;
  const statKey = typeLow;
  if (db.ticketStats.byType[statKey]) db.ticketStats.byType[statKey].opened++;
  saveData(db);

  updateReactietijdEmbed(guild).catch(() => {});
}

// ----------------------------------------------------------------------------
//  RADIO HELPER FUNCTIES (gebruikt @discordjs/voice direct — geïsoleerd)
// ----------------------------------------------------------------------------
function stopRadio(guildId) {
  const state = radioMap.get(guildId);
  if (!state) return false;
  try { state.ffmpeg?.kill?.('SIGKILL'); } catch {}
  try { state.audioPlayer?.stop?.(true); } catch {}
  try { state.subscription?.unsubscribe?.(); } catch {}
  try { state.connection?.destroy?.(); } catch {}
  radioMap.delete(guildId);
  console.log(`🛑 Radio gestopt voor guild ${guildId}`);
  return true;
}

function spawnRadioFfmpeg(url) {
  return spawn(ffmpegPath, [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '10',
    '-icy', '0',
    '-user_agent', 'Mozilla/5.0 (compatible; ffmpeg)',
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-i', url,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
}

async function startRadio(vc, stationId, customUrl, customLabel) {
  const guildId = vc.guild.id;
  // Zoek in beide lijsten op, of gebruik rechtstreekse URL (piraten/custom)
  const station = customUrl
    ? { url: customUrl, label: customLabel || stationId }
    : (RADIO_STATIONS[stationId] || PIRATE_STATIONS[stationId]);
  if (!station) throw new Error('Onbekend radiostation');

  // Stop muziek engine als die actief is (vrijmaken voice connectie)
  if (musicMap.has(guildId)) {
    stopMusicEngine(guildId);
    await new Promise(r => setTimeout(r, 400));
  }

  // Stop bestaande radio
  stopRadio(guildId);

  // Verbinding maken via @discordjs/voice (NIET via discord-player)
  const connection = joinVoiceChannel({
    channelId:      vc.id,
    guildId:        guildId,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf:       true,
  });

  const audioPlayer = createAudioPlayer();
  const ffmpeg = spawnRadioFfmpeg(station.url);
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });
  const subscription = connection.subscribe(audioPlayer);

  // Sla state op VOOR play() – event handlers hebben het nodig
  radioMap.set(guildId, { audioPlayer, connection, ffmpeg, label: station.label, subscription, retries: 0 });

  // Wacht tot VoiceConnection klaar is
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 12_000);
  } catch {
    stopRadio(guildId);
    throw new Error('Kan niet verbinden met voice kanaal (timeout)');
  }

  audioPlayer.play(resource);

  // Auto-herstart als stream uitvalt (bijv. door netwerk) — max 10 pogingen
  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    if (!radioMap.has(guildId)) return; // Handmatig gestopt
    const st = radioMap.get(guildId);
    const retries = (st.retries || 0) + 1;
    if (retries > 10) {
      console.warn(`⚠️ Radio stream (guild ${guildId}) heeft 10x gefaald — opgegeven.`);
      stopRadio(guildId);
      return;
    }
    console.log(`🔄 Radio stream onderbroken (guild ${guildId}) — herstart over 2s... (poging ${retries}/10)`);
    try { st.ffmpeg?.kill?.('SIGKILL'); } catch {}
    radioMap.set(guildId, { ...st, retries });
    setTimeout(() => {
      if (!radioMap.has(guildId)) return;
      const newFfmpeg = spawnRadioFfmpeg(station.url);
      const newResource = createAudioResource(newFfmpeg.stdout, { inputType: StreamType.Raw });
      radioMap.set(guildId, { ...radioMap.get(guildId), ffmpeg: newFfmpeg });
      st.audioPlayer.play(newResource);
    }, 2_000);
  });

  // Reset retry-teller als de stream succesvol speelt
  audioPlayer.on(AudioPlayerStatus.Playing, () => {
    const st = radioMap.get(guildId);
    if (st && st.retries > 0) radioMap.set(guildId, { ...st, retries: 0 });
  });

  // Verbinding verbroken door Discord ? probeer te herverbinden, anders stoppen
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // rejoin() stuurt een herverbindingsverzoek terug naar Discord
      connection.rejoin();
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      stopRadio(guildId);
    }
  });

  audioPlayer.on('error', err => {
    console.error(`❌ Radio audio fout (guild ${guildId}): ${err.message}`);
  });

  return station.label;
}

// ----------------------------------------------------------------------------
//  BEVEILIGING — Helpers (quarantaine, lockdown, logging)
// ----------------------------------------------------------------------------

async function securityLog(embed) {
  const chanId = secCfg.securityLogChannelId || MOD_LOG_CHANNEL;
  const logCh  = await client.channels.fetch(chanId).catch(() => null);
  if (logCh) await logCh.send({ embeds: [embed] }).catch(() => {});
}

// Verwijder recente berichten van een gebruiker in alle kanalen (max 14 dagen oud vanwege Discord limiet)
async function purgeUserMessages(guild, userId, windowMinutes = 15) {
  const cutoff   = Date.now() - windowMinutes * 60 * 1000;
  const SKIP     = new Set([ChannelType.GuildCategory, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);
  let   deleted  = 0;

  for (const [, channel] of guild.channels.cache) {
    if (SKIP.has(channel.type)) continue;
    if (!channel.isTextBased?.()) continue;
    try {
      // Haal de laatste 100 berichten op (Discord bulk delete max 14 dagen)
      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!messages) continue;

      const toDelete = messages.filter(m =>
        m.author.id === userId &&
        m.createdTimestamp > cutoff &&
        Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000 // bulk delete limiet
      );
      if (toDelete.size === 0) continue;

      if (toDelete.size === 1) {
        await toDelete.first().delete().catch(() => {});
      } else {
        await channel.bulkDelete(toDelete, true).catch(() => {});
      }
      deleted += toDelete.size;
    } catch { /* kanaal niet toegankelijk, skip */ }
  }
  return deleted;
}

async function applyQuarantine(member, reason = 'Beveiliging — Verdacht') {
  // Verwijder recente berichten van de gebruiker in alle kanalen
  purgeUserMessages(member.guild, member.id).catch(() => {});

  let qRoleId = secCfg.antiRaid.quarantineRoleId;
  let qRole   = qRoleId ? member.guild.roles.cache.get(qRoleId) : null;

  // Maak quarantaine-rol aan als die nog niet bestaat
  if (!qRole) {
    qRole = await member.guild.roles.create({
      name: '🔒 Quarantaine',
      color: 0x808080,
      permissions: [],
      reason: 'Auto-aangemaakt door beveiligingssysteem',
    }).catch(() => null);
    if (!qRole) return false;
    secCfg.antiRaid.quarantineRoleId = qRole.id;
    saveSecurityConfig(secCfg);
    // Verwijder rechten voor quarantaine-rol in alle kanalen
    for (const [, ch] of member.guild.channels.cache) {
      if (ch.type !== 0 && ch.type !== 5) continue;
      await ch.permissionOverwrites.edit(qRole, { ViewChannel: false, SendMessages: false }).catch(() => {});
    }
  }

  // Haal of maak het quarantaine kanaal aan
  let qChannel = secCfg.quarantineChannelId
    ? member.guild.channels.cache.get(secCfg.quarantineChannelId)
    : null;

  if (!qChannel) {
    // Zoek een bestaand kanaal op naam
    qChannel = member.guild.channels.cache.find(c => c.name === '🔒quarantaine' && c.type === 0) || null;
    if (!qChannel) {
      qChannel = await member.guild.channels.create({
        name: '🔒quarantaine',
        type: 0, // GuildText
        topic: 'Quarantaine kanaal — Gequarantaineerde leden kunnen hier typen. Staff kan meelezen.',
        rateLimitPerUser: 30, // 30 seconden slowmode
        permissionOverwrites: [
          { id: member.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: qRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], deny: [PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
        ],
        reason: 'Auto-aangemaakt door quarantaine systeem',
      }).catch(() => null);
    }
    if (qChannel) {
      secCfg.quarantineChannelId = qChannel.id;
      saveSecurityConfig(secCfg);
    }
  }

  // Bewaar huidige rollen
  const savedRoles = member.roles.cache
    .filter(r => r.id !== member.guild.id && !r.managed)
    .map(r => r.id);

  quarantineDB[member.id] = {
    userId:         member.id,
    username:       member.user.tag,
    quarantinedAt:  Date.now(),
    reason,
    savedRoles,
  };
  saveQuarantine(quarantineDB);

  // Vervang alle rollen door quarantaine-rol
  try {
    await member.roles.set([qRole], reason);
  } catch {
    try { await member.roles.add(qRole, reason); } catch { return false; }
  }

  // Blokkeer de gebruiker expliciet op elk kanaal (user-level override)
  // Sla alleen categorieën en threads over — die hebben geen eigen permissionOverwrites
  const SKIP_TYPES = new Set([
    ChannelType.GuildCategory,
    ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread,
  ]);
  for (const [, ch] of member.guild.channels.cache) {
    if (SKIP_TYPES.has(ch.type)) continue;
    if (qChannel && ch.id === qChannel.id) {
      // Quarantaine-kanaal: gebruiker mag zien + typen
      await ch.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks:  false,
        AttachFiles: false,
      }, { reason: `Quarantaine: ${reason}` }).catch(() => {});
    } else {
      // Alle andere kanalen: onzichtbaar maken
      await ch.permissionOverwrites.edit(member.id, {
        ViewChannel: false,
      }, { reason: `Quarantaine: ${reason}` }).catch(() => {});
    }
  }

  suspiciousDB.set(member.id, { reason, flaggedAt: Date.now(), username: member.user.tag });
  addSecurityEvent('quarantine', { userId: member.id, username: member.user.tag, reason });

  // Stuur welkomstbericht in quarantaine kanaal
  if (qChannel) {
    await qChannel.send({ embeds: [
      new EmbedBuilder()
        .setTitle('🔒 Gebruiker in Quarantaine')
        .setDescription(`<@${member.id}> is in quarantaine geplaatst.\n\n🔴 **Reden:** ${reason}\n\n*Je kunt in dit kanaal typen. Staff leest mee. Er geldt een slowmode van 30 seconden.*`)
        .setColor(0xFF6B6B)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🪪 User ID', value: member.id, inline: true },
          { name: '📅 Account leeftijd', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Quarantaine' })
        .setTimestamp()
    ]}).catch(() => {});
    // Stuur ook info naar de gebruiker zelf
    await member.user.send({ embeds: [
      new EmbedBuilder()
        .setTitle('🔒 Je bent in quarantaine geplaatst')
        .setDescription(`Je bent in quarantaine geplaatst op **Lage Landen RP**.\n\n🔴 **Reden:** ${reason}\n\nJe hebt toegang tot het quarantaine kanaal. Je kunt een bericht sturen om meer uitleg te vragen. Wacht op een reactie van het staff team.`)
        .setColor(0xFF6B6B)
        .setFooter({ text: 'Lage Landen RP' })
    ]}).catch(() => {});
  }

  await securityLog(new EmbedBuilder()
    .setTitle('🔒 Gebruiker in Quarantaine Geplaatst')
    .setColor(0xFF6B6B)
    .addFields(
      { name: '👤 Gebruiker',     value: `<@${member.id}> \`${member.user.tag}\``,              inline: true  },
      { name: '🪪 ID',            value: member.id,                                              inline: true  },
      { name: '📝 Reden',         value: reason,                                                 inline: false },
      { name: '📅 Account Leeftijd', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'Lage Landen RP — Anti-Raid Beveiliging' })
    .setTimestamp()
  );
  return true;
}

async function removeQuarantineUser(guild, userId) {
  const data = quarantineDB[userId];
  if (!data) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const rolesToRestore = (data.savedRoles || [])
      .map(rid => guild.roles.cache.get(rid))
      .filter(Boolean);
    try {
      await member.roles.set(rolesToRestore, 'Quarantaine opgeheven');
    } catch {
      const qRoleId = secCfg.antiRaid.quarantineRoleId;
      if (qRoleId) await member.roles.remove(qRoleId).catch(() => {});
    }
  }

  // Verwijder alle user-level kanaaloverschrijvingen die bij quarantaine zijn gezet
  const SKIP_TYPES_R = new Set([
    ChannelType.GuildCategory,
    ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread,
  ]);
  for (const [, ch] of guild.channels.cache) {
    if (SKIP_TYPES_R.has(ch.type)) continue;
    const hasOverride = ch.permissionOverwrites?.cache?.has(userId);
    if (hasOverride) await ch.permissionOverwrites.delete(userId, 'Quarantaine opgeheven').catch(() => {});
  }

  // Bericht in quarantaine kanaal
  if (secCfg.quarantineChannelId) {
    const qChannel = guild.channels.cache.get(secCfg.quarantineChannelId);
    if (qChannel) {
      await qChannel.send({ embeds: [
        new EmbedBuilder()
          .setTitle('✅ Gebruiker Vrijgelaten')
          .setDescription(`<@${userId}> is vrijgelaten uit quarantaine.${data.username ? `\n👤 **${data.username}**` : ''}`)
          .setColor(0x57F287)
          .setFooter({ text: 'Lage Landen RP — Quarantaine' })
          .setTimestamp()
      ]}).catch(() => {});
    }
  }

  delete quarantineDB[userId];
  saveQuarantine(quarantineDB);
  suspiciousDB.delete(userId);
  addSecurityEvent('unquarantine', { userId, username: data.username });
  return true;
}

// ----------------------------------------------------------------------------
//  BACKUP SYSTEEM
// ----------------------------------------------------------------------------
// Thread channel types — deze hebben geen permissionOverwrites
const THREAD_TYPES = new Set([
  ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread,
]);

function safePermOverwrites(ch) {
  try {
    if (!ch.permissionOverwrites?.cache) return [];
    return [...ch.permissionOverwrites.cache.values()].map(o => ({
      id: o.id, type: o.type,
      allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString(),
    }));
  } catch { return []; }
}

async function createServerBackup(guild, createdBy = 'Onbekend') {
  const serverInfo = {
    name: guild.name,
    description: guild.description ?? null,
    iconURL: guild.iconURL({ size: 4096 }) ?? null,
    bannerURL: typeof guild.bannerURL === 'function' ? (guild.bannerURL({ size: 4096 }) ?? null) : null,
    verificationLevel: guild.verificationLevel,
    explicitContentFilter: guild.explicitContentFilter,
    afkTimeout: guild.afkTimeout,
    afkChannelId: guild.afkChannelId ?? null,
    systemChannelId: guild.systemChannelId ?? null,
    rulesChannelId: guild.rulesChannelId ?? null,
    preferredLocale: guild.preferredLocale,
  };

  const roles = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id, name: r.name, color: r.color, hoist: r.hoist,
      mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(),
      position: r.position, icon: r.iconURL?.() ?? null, unicodeEmoji: r.unicodeEmoji ?? null,
    }));

  const categories = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(c => ({
      id: c.id, name: c.name, position: c.position,
      permissionOverwrites: safePermOverwrites(c),
    }));

  const channels = [...guild.channels.cache.values()]
    .filter(c => c.type !== ChannelType.GuildCategory && !THREAD_TYPES.has(c.type))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .map(c => ({
      id: c.id, name: c.name, type: c.type, position: c.position ?? 0,
      parentId: c.parentId ?? null, topic: c.topic ?? null,
      nsfw: c.nsfw ?? false, rateLimitPerUser: c.rateLimitPerUser ?? 0,
      bitrate: c.bitrate ?? null, userLimit: c.userLimit ?? null,
      permissionOverwrites: safePermOverwrites(c),
    }));

  const emojis = [...guild.emojis.cache.values()].map(e => ({
    id: e.id, name: e.name, url: e.imageURL(), animated: e.animated,
    roles: [...e.roles.cache.keys()],
  }));

  let bans = [];
  try {
    const banList = await guild.bans.fetch();
    bans = [...banList.values()].map(b => ({
      userId: b.user.id, username: b.user.tag, reason: b.reason ?? null,
    }));
  } catch {}

  const id = `backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const backup = {
    id, createdAt: Date.now(), createdBy,
    guildId: guild.id, guildName: guild.name, memberCount: guild.memberCount,
    server: serverInfo, roles, categories, channels, emojis, bans,
    stats: { roles: roles.length, categories: categories.length, channels: channels.length, emojis: emojis.length, bans: bans.length },
  };

  fs.writeFileSync(path.join(BACKUP_DIR, `${id}.json`), JSON.stringify(backup, null, 2));
  return backup;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf-8'));
        return { id: d.id, createdAt: d.createdAt, createdBy: d.createdBy, guildName: d.guildName, stats: d.stats };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function loadBackup(id) {
  const file = path.join(BACKUP_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function deleteBackup(id) {
  const file = path.join(BACKUP_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file); return true;
}

async function restoreFromBackup(guild, backup) {
  const log = [];
  // Rollen aanmaken die niet meer bestaan
  for (const r of backup.roles) {
    const exists = guild.roles.cache.find(gr => gr.name === r.name);
    if (!exists) {
      const created = await guild.roles.create({
        name: r.name, color: r.color, hoist: r.hoist,
        mentionable: r.mentionable, permissions: BigInt(r.permissions),
        reason: `Backup restore: ${backup.id}`,
      }).catch(e => { log.push(`❌ Rol: ${r.name} — ${e.message}`); return null; });
      if (created) log.push(`✅ Rol aangemaakt: ${r.name}`);
    }
  }
  // Categorieën aanmaken die niet meer bestaan
  for (const cat of backup.categories) {
    const exists = guild.channels.cache.find(c => c.name === cat.name && c.type === ChannelType.GuildCategory);
    if (!exists) {
      const created = await guild.channels.create({
        name: cat.name, type: ChannelType.GuildCategory,
        reason: `Backup restore: ${backup.id}`,
      }).catch(e => { log.push(`❌ Categorie: ${cat.name} — ${e.message}`); return null; });
      if (created) log.push(`✅ Categorie aangemaakt: ${cat.name}`);
    }
  }
  // Kanalen aanmaken die niet meer bestaan
  for (const ch of backup.channels) {
    if (ch.type === ChannelType.GuildCategory) continue;
    const exists = guild.channels.cache.find(c => c.name === ch.name && c.type === ch.type);
    if (!exists) {
      const parentCh = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.id === ch.parentId);
      const opts = {
        name: ch.name, type: ch.type,
        parent: parentCh?.id ?? undefined,
        nsfw: ch.nsfw, rateLimitPerUser: ch.rateLimitPerUser || 0,
        reason: `Backup restore: ${backup.id}`,
      };
      if (ch.topic) opts.topic = ch.topic;
      if (ch.bitrate) opts.bitrate = ch.bitrate;
      if (ch.userLimit) opts.userLimit = ch.userLimit;
      const created = await guild.channels.create(opts).catch(e => {
        log.push(`❌ Kanaal: #${ch.name} — ${e.message}`); return null;
      });
      if (created) log.push(`✅ Kanaal aangemaakt: #${ch.name}`);
    }
  }
  return log;
}

// Bijhouden van restore-bevestigingen (userId -> backupId)
const pendingRestores = new Map();

async function lockdownServer(guild, reason = 'Handmatig') {
  secCfg.lockdownActive        = true;
  secCfg.lockdownChannelStates = {};
  secCfg.lockdownMessages      = {};
  saveSecurityConfig(secCfg);

  const everyoneRole  = guild.roles.everyone;
  const lockdownEmbed = new EmbedBuilder()
    .setTitle('🔒 SERVER LOCKDOWN ACTIEF')
    .setDescription(`**De server is tijdelijk vergrendeld.**\nJe kunt niet typen in dit kanaal totdat de lockdown wordt opgeheven.\n\n✅ **Nog toegankelijk:** #chat · #media · #commands · #dev-hoek\n\n📌 Reden: ${reason}`)
    .setColor(0xFF0000)
    .setFooter({ text: 'Lage Landen RP — Noodbeheer' })
    .setTimestamp();

  // Kanalen die altijd open blijven tijdens lockdown
  const LOCKDOWN_EXEMPT_NAMES = ['chat', 'media', 'commands', 'dev-hoek'];

  for (const [, channel] of guild.channels.cache) {
    if (channel.type !== 0 && channel.type !== 5) continue;
    // Sla quarantaine kanaal over (die moet altijd bereikbaar blijven)
    if (secCfg.quarantineChannelId && channel.id === secCfg.quarantineChannelId) continue;
    // Sla vrijgestelde kanalen over (chat, media, commands, dev-hoek)
    const chName = channel.name.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (LOCKDOWN_EXEMPT_NAMES.some(n => chName === n || chName.endsWith(n))) continue;

    const existing = channel.permissionOverwrites.cache.get(everyoneRole.id);
    const isDenied  = existing?.deny.has(PermissionFlagsBits.SendMessages);
    if (isDenied) continue;

    const wasAllowed = existing?.allow.has(PermissionFlagsBits.SendMessages);
    secCfg.lockdownChannelStates[channel.id] = wasAllowed ? 'allow' : 'neutral';
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false }, { reason: `Lockdown: ${reason}` }).catch(() => {});

    // Stuur lockdown bericht
    const msg = await channel.send({ embeds: [lockdownEmbed] }).catch(() => null);
    if (msg) secCfg.lockdownMessages[channel.id] = msg.id;
  }
  saveSecurityConfig(secCfg);
  addSecurityEvent('lockdown', { reason });

  await securityLog(new EmbedBuilder()
    .setTitle('🔒 SERVER LOCKDOWN ACTIEF')
    .setDescription(`**Alle kanalen zijn nu read-only.**\n\nReden: ${reason}`)
    .setColor(0xFF0000)
    .setFooter({ text: 'Lage Landen RP — Noodbeheer' })
    .setTimestamp()
  );
}

async function unlockdownServer(guild, reason = 'Handmatig') {
  secCfg.lockdownActive = false;
  saveSecurityConfig(secCfg);

  const everyoneRole = guild.roles.everyone;

  // Herstel kanalen
  for (const [chanId, state] of Object.entries(secCfg.lockdownChannelStates || {})) {
    const channel = guild.channels.cache.get(chanId);
    if (!channel) continue;
    const perm = state === 'allow' ? true : null;
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: perm }, { reason: `Lockdown opgeheven: ${reason}` }).catch(() => {});
  }

  // Verwijder lockdown berichten
  for (const [chanId, msgId] of Object.entries(secCfg.lockdownMessages || {})) {
    const channel = guild.channels.cache.get(chanId);
    if (!channel) continue;
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  secCfg.lockdownChannelStates = {};
  secCfg.lockdownMessages      = {};
  saveSecurityConfig(secCfg);
  addSecurityEvent('unlockdown', { reason });

  await securityLog(new EmbedBuilder()
    .setTitle('✅ Server Lockdown Opgeheven')
    .setDescription(`**Alle kanalen zijn hersteld.**\n\nReden: ${reason}`)
    .setColor(0x57F287)
    .setFooter({ text: 'Lage Landen RP — Noodbeheer' })
    .setTimestamp()
  );
}

// ----------------------------------------------------------------------------
//  SLASH COMMANDS registreren
// ----------------------------------------------------------------------------
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('blacklist-check')
      .setDescription('Zoek of een server op de blacklist staat')
      .addStringOption(o => o.setName('naam').setDescription('Servernaam (gedeeltelijk)').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Bekijk bot statistieken')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('partnerlijst')
      .setDescription('[STAFF] Bekijk alle actieve partners')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('partnerverwijder')
      .setDescription('[STAFF] Verwijder partnerschap van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De partner').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('[STAFF] Herstel/maak categorieën en kanalen aan')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('partnerbericht')
      .setDescription('[STAFF] Stuur het officiële partnerbericht in een kanaal')
      .addChannelOption(o => o.setName('kanaal').setDescription('Kanaal om het bericht in te sturen (standaard: huidig kanaal)').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('site')
      .setDescription('Bekijk de website van Lage Landen RP')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('regels')
      .setDescription('[STAFF] Stuur de serverregels in een kanaal')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('faq')
      .setDescription('[STAFF] Stuur de veelgestelde vragen in een kanaal')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('staffpartner')
      .setDescription('[STAFF] Plaats direct een partnerschap in #partners')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('partnerboard')
      .setDescription('[STAFF] Bekijk het partner leaderboard')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('📝 [STAFF] Maak en stuur een volledig aangepaste embed in een kanaal')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addChannelOption(o => o.setName('kanaal').setDescription('Kanaal om de embed in te sturen (standaard: huidig kanaal)').setRequired(false))
      .addStringOption(o => o.setName('kleur').setDescription('Kleur van de embed zijbalk').setRequired(false)
        .addChoices(
          { name: '🔵 Blauw (standaard)',  value: '5865F2' },
          { name: '🟢 Groen',              value: '57F287' },
          { name: '🔴 Rood',               value: 'FF4757' },
          { name: '🟠 Oranje',             value: 'FFA500' },
          { name: '🟡 Geel / Goud',        value: 'FFD700' },
          { name: '🟣 Paars',              value: 'AA00FF' },
          { name: '🩷 Roze',               value: 'FF69B4' },
          { name: '⚫ Donker',             value: '2B2D31' },
        ))
      .addBooleanOption(o => o.setName('tag').setDescription('Een rol taggen bij het sturen? (standaard: nee)').setRequired(false))
      .addStringOption(o => o.setName('rol').setDescription('Welke rol taggen? (alleen als tag = ja)').setRequired(false)
        .addChoices(
          { name: '📢 @Lid',        value: 'lid'       },
          { name: '🛡️ @Staff',      value: 'staff'     },
          { name: '👑 @everyone',   value: 'everyone'  },
        ))
      .addBooleanOption(o => o.setName('tijdstip').setDescription('Tijdstip onderaan de embed tonen? (standaard: aan)').setRequired(false))
      .addBooleanOption(o => o.setName('serverlogo').setDescription('Server logo als thumbnail rechts in de embed? (standaard: uit)').setRequired(false))
      .addBooleanOption(o => o.setName('auteur').setDescription('Jouw naam bovenaan de embed tonen als auteur? (standaard: uit)').setRequired(false))
      .addAttachmentOption(o => o.setName('foto').setDescription('Foto direct uploaden als afbeelding in de embed (sneak peek stijl)').setRequired(false))
      .addStringOption(o => o.setName('grootte').setDescription('Grootte/stijl van de embed (standaard: medium)').setRequired(false)
        .addChoices(
          { name: '📦 Klein — simpel, alleen titel & tekst',        value: 'klein'  },
          { name: '📋 Medium — standaard met footer & foto',         value: 'medium' },
          { name: '🏆 Groot — volledig met thumbnail, auteur & meer', value: 'groot'  },
        ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('sneakpeak')
      .setDescription('[STAFF] Stuur een sneak peek met foto(s) en tag @Lid')
      .addStringOption(o => o.setName('tekst').setDescription('De sneak peek tekst (boven de foto)').setRequired(true).setMinLength(5).setMaxLength(2000))
      .addAttachmentOption(o => o.setName('afbeelding1').setDescription('Eerste afbeelding').setRequired(true))
      .addStringOption(o => o.setName('ondertekst').setDescription('Tekst onder de foto (optioneel)').setRequired(false).setMaxLength(500))
      .addAttachmentOption(o => o.setName('afbeelding2').setDescription('Extra afbeelding (optioneel)').setRequired(false))
      .addAttachmentOption(o => o.setName('afbeelding3').setDescription('Extra afbeelding (optioneel)').setRequired(false))
      .addAttachmentOption(o => o.setName('afbeelding4').setDescription('Extra afbeelding (optioneel)').setRequired(false))
      .addAttachmentOption(o => o.setName('afbeelding5').setDescription('Extra afbeelding (optioneel)').setRequired(false))
      .addBooleanOption(o => o.setName('tag').setDescription('Tag @Lid? (standaard: aan)').setRequired(false))
      .toJSON(),

    // -- MODERATIE COMMANDO'S ---------------------------------------------------
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('🔨 [STAFF] Ban een gebruiker permanent van de server')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de ban').setRequired(true))
      .addIntegerOption(o => o.setName('verwijder-dagen').setDescription('Berichten verwijderen van X dagen (0–7)').setRequired(false).setMinValue(0).setMaxValue(7))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('⏱️ [STAFF] Timeout een gebruiker (directe actie, geen goedkeuring nodig)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('minuten').setDescription('Duur in minuten (max 40320 = 28 dagen)').setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de timeout').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('👢 [STAFF] Kick een gebruiker — vereist goedkeuring in security log')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de kick').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('🔇 [STAFF] Mute een gebruiker (28 dagen timeout) — vereist goedkeuring in security log')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de mute').setRequired(true))
      .toJSON(),

    // -- WARN SYSTEEM ----------------------------------------------------------
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('[STAFF] Geef een waarschuwing aan een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de waarschuwing').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Bekijk de waarschuwingen van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('unwarn')
      .setDescription('[STAFF] Verwijder een waarschuwing van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('nummer').setDescription('Waarschuwing nummer (leeg = laatste)').setRequired(false).setMinValue(1))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('clearwarns')
      .setDescription('[STAFF] Verwijder alle waarschuwingen van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .toJSON(),

    // -- VERLOF SYSTEEM --------------------------------------------------------
    new SlashCommandBuilder()
      .setName('verlof')
      .setDescription('[STAFF] Dien een verlofaanvraag in')
      .addStringOption(o => o.setName('van').setDescription('Startdatum (DD-MM-YYYY)').setRequired(true))
      .addStringOption(o => o.setName('tot').setDescription('Einddatum (DD-MM-YYYY)').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden voor het verlof').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('verlof-overzicht')
      .setDescription('[STAFF] Bekijk alle verlofaanvragen')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('verlof-beslissing')
      .setDescription('[STAFF] Keur een verlofaanvraag goed of wijs af')
      .addStringOption(o => o.setName('id').setDescription('Verlof ID').setRequired(true))
      .addStringOption(o => o.setName('beslissing').setDescription('Goedkeuren of afwijzen').setRequired(true)
        .addChoices({ name: '✅ Goedkeuren', value: 'goedgekeurd' }, { name: '❌ Afwijzen', value: 'afgewezen' }))
      .toJSON(),

    // -- INACTIEF SYSTEEM ------------------------------------------------------
    new SlashCommandBuilder()
      .setName('inactief-check')
      .setDescription('[STAFF] Bekijk welke staffleden inactief zijn')
      .addIntegerOption(o => o.setName('dagen').setDescription('Drempel in dagen (standaard: 7)').setRequired(false).setMinValue(1).setMaxValue(30))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('inactief-meld')
      .setDescription('[STAFF] Meld jezelf inactief voor een periode')
      .addStringOption(o => o.setName('van').setDescription('Startdatum (DD-MM-YYYY)').setRequired(true))
      .addStringOption(o => o.setName('tot').setDescription('Einddatum (DD-MM-YYYY)').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden van inactiviteit').setRequired(true))
      .toJSON(),

    // -- XP / NIVEAU SYSTEEM ---------------------------------------------------
    new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Bekijk jouw level en XP rank')
      .addUserOption(o => o.setName('gebruiker').setDescription('Bekijk iemand anders (optioneel)').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('leaderboard-xp')
      .setDescription('Bekijk de top 10 XP leaderboard')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('xp-reset')
      .setDescription('[STAFF] Reset de XP van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('xp-geef')
      .setDescription('[STAFF] Geef XP aan een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('xp').setDescription('Hoeveelheid XP').setRequired(true).setMinValue(1).setMaxValue(10000))
      .toJSON(),

    // -- GIVEAWAY SYSTEEM ------------------------------------------------------
    new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('[STAFF] Giveaway beheer')
      .addSubcommand(sub => sub
        .setName('start')
        .setDescription('Start een nieuwe giveaway')
        .addStringOption(o => o.setName('prijs').setDescription('Wat wordt er weggegeven?').setRequired(true))
        .addStringOption(o => o.setName('duur').setDescription('Duur: 1m / 1h / 1d (min. 1m)').setRequired(true))
        .addChannelOption(o => o.setName('kanaal').setDescription('Kanaal (standaard: huidig kanaal)').setRequired(false))
        .addIntegerOption(o => o.setName('winnaars').setDescription('Aantal winnaars (standaard: 1)').setRequired(false).setMinValue(1).setMaxValue(10))
      )
      .addSubcommand(sub => sub
        .setName('stop')
        .setDescription('Stop een actieve giveaway vroegtijdig')
        .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('lijst')
        .setDescription('Bekijk alle actieve giveaways')
      )
      .toJSON(),

    // -- MUZIEK SYSTEEM --------------------------------------------------------
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('🎵 Speel een nummer af via YouTube of SoundCloud')
      .addStringOption(o => o.setName('query').setDescription('Naam, artiest of URL').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('skip')
      .setDescription('⏭️ [Staff] Sla het huidige nummer direct over')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('⏹️ [Staff] Stop de muziek en verlaat het voice kanaal')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('queue')
      .setDescription('📋 Bekijk de huidige wachtrij')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('pause')
      .setDescription('⏸️ [Staff] Pauzeer of hervat de muziek')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('np')
      .setDescription('🎵 Bekijk het huidige nummer')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('volume')
      .setDescription('🔊 [Staff] Pas het volume aan (1–150)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption(o => o.setName('waarde').setDescription('Volume 1–150').setRequired(true).setMinValue(1).setMaxValue(150))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('🔀 [Staff] Zet de wachtrij in willekeurige volgorde')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('loop')
      .setDescription('🔁 [Staff] Zet loop aan/uit (track, queue of uit)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption(o => o.setName('modus').setDescription('Loop modus').setRequired(true)
        .addChoices(
          { name: '🔂 Huidig nummer herhalen', value: 'track' },
          { name: '🔁 Hele wachtrij herhalen', value: 'queue' },
          { name: '➡️ Loop uitschakelen',       value: 'uit'   },
        ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('autoplay')
      .setDescription('▶️ [Staff] Autoplay aan/uit — speelt gerelateerde nummers af als wachtrij leeg is')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('lyrics')
      .setDescription('🎤 Haal de songtekst op van het huidige nummer of een zoekopdracht')
      .addStringOption(o => o.setName('zoek').setDescription('Songtitel (leeg = huidig nummer)').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('skippen')
      .setDescription('🗳️ Stem om het huidige nummer te skippen (meerderheid beslist)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('filters')
      .setDescription('🎛️ [Staff] Pas een audio-filter toe')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption(o => o.setName('filter').setDescription('Kies een filter').setRequired(true)
        .addChoices(
          { name: '🎵 Geen filter (reset)',   value: 'reset'      },
          { name: '🔊 Bassboost',              value: 'bassboost'  },
          { name: '⚡ Nightcore',              value: 'nightcore'  },
          { name: '🌊 Vaporwave',              value: 'vaporwave'  },
          { name: '🎧 8D Audio',               value: '8d'         },
          { name: '🎤 Karaoke',                value: 'karaoke'    },
        ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('kwaliteit')
      .setDescription('⚙️ [Staff] Stel de audio kwaliteit in (lager = minder CPU gebruik)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption(o => o.setName('modus').setDescription('Kwaliteitsniveau').setRequired(true)
        .addChoices(
          { name: '🔵 Laag (48kbps) — minste CPU',    value: 'laag'   },
          { name: '🟡 Medium (96kbps) — aanbevolen',  value: 'medium' },
          { name: '🔴 Hoog (192kbps) — meeste CPU',   value: 'hoog'   },
        ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('skipall')
      .setDescription('🗑️ [Staff] Wis de hele wachtrij (huidig nummer blijft spelen)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),

    // -- RADIO SYSTEEM ----------------------------------------------------------
    new SlashCommandBuilder()
      .setName('radio')
      .setDescription('📻 Speel een live Nederlands radiostation af')
      .addStringOption(o => o
        .setName('station')
        .setDescription('Kies een radiostation')
        .setRequired(true)
        .addChoices(
          ...Object.entries(RADIO_STATIONS).map(([id, s]) => ({ name: s.label, value: id }))
        ))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('radiostoppen')
      .setDescription('⏹️ [Staff] Stop het radiostation of de piraten stream')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('piraten')
      .setDescription('🏴‍☠️ Speel een geheime piratenzender af')
      .addStringOption(o => o
        .setName('zender')
        .setDescription('Kies een piratenzender')
        .setRequired(true)
        .addChoices(
          ...Object.entries(PIRATE_STATIONS).map(([id, s]) => ({ name: s.label, value: id }))
        ))
      .toJSON(),

    // -- BEVEILIGING -----------------------------------------------------------
    new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('🔒 [STAFF] Zet de hele server in lockdown (alle kanalen read-only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption(o => o.setName('reden').setDescription('Reden voor de lockdown').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('unlockdown')
      .setDescription('🔓 [STAFF] Hef de server lockdown op')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption(o => o.setName('reden').setDescription('Reden voor het opheffen').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('quarantaine')
      .setDescription('🔒 [STAFF] Zet een gebruiker in quarantaine (rollen weg, geen toegang)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .addStringOption(o => o.setName('reden').setDescription('Reden').setRequired(false))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('quarantaine-ophef')
      .setDescription('🔓 [STAFF] Hef quarantaine op van één gebruiker (rollen terug)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('quarantaine-alles-ophef')
      .setDescription('🔓 [STAFF] Hef quarantaine op van ALLE gebruikers tegelijk')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('quarantaine-lijst')
      .setDescription('📋 [STAFF] Bekijk alle gebruikers die momenteel in quarantaine zitten')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('security-status')
      .setDescription('🏴‍☠️ [STAFF] Bekijk de huidige beveiligingsstatus en instellingen')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON(),
    new SlashCommandBuilder()
      .setName('verdacht')
      .setDescription('🏴‍☠️ [STAFF] Bekijk recent geflagde verdachte gebruikers')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON(),
    // -- VERIFICATIE + AUDIT + NUKE CONFIG -------------------------------------------------------
    new SlashCommandBuilder()
      .setName('verificatie-setup')
      .setDescription('🔐 [BEHEER] Stel de verificatie gate in voor nieuwe leden')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(sub => sub
        .setName('aanmaken')
        .setDescription('Maak verificatiekanaal + rollen aan en activeer de gate')
        .addRoleOption(o => o.setName('lid-rol').setDescription('Rol die leden krijgen NA verificatie (bijv. @Lid)').setRequired(true))
        .addChannelOption(o => o.setName('kanaal').setDescription('Bestaand kanaal gebruiken (leeg = nieuw aanmaken)').setRequired(false))
      )
      .addSubcommand(sub => sub.setName('uit').setDescription('Zet verificatie gate uit'))
      .addSubcommand(sub => sub.setName('status').setDescription('Bekijk huidige verificatie instellingen'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('audit')
      .setDescription('🔍 [BEHEER] Controleer gevaarlijke permissies per rol')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    // -- BOT TRAP ---------------------------------------------------------------
    new SlashCommandBuilder()
      .setName('bottrap')
      .setDescription('🛡️ [BEHEER] Honeypot kanaal instellen en beheren')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(sub => sub
        .setName('setup')
        .setDescription('Maak het honeypot kanaal aan of koppel een bestaand kanaal')
        .addChannelOption(o => o.setName('kanaal').setDescription('Bestaand kanaal gebruiken (leeg = nieuw aanmaken)').setRequired(false))
        .addStringOption(o => o.setName('actie').setDescription('Wat doen bij detectie?').setRequired(false)
          .addChoices(
            { name: '🔒 Quarantaine (standaard)', value: 'quarantine' },
            { name: '👢 Kick',                    value: 'kick'       },
            { name: '🔨 Ban',                     value: 'ban'        },
          ))
      )
      .addSubcommand(sub => sub
        .setName('aan')
        .setDescription('Zet de bot trap aan')
      )
      .addSubcommand(sub => sub
        .setName('uit')
        .setDescription('Zet de bot trap uit')
      )
      .addSubcommand(sub => sub
        .setName('status')
        .setDescription('Bekijk de huidige bot trap instellingen')
      )
      .toJSON(),

    // -- BACKUP SYSTEEM --------------------------------------------------------
    new SlashCommandBuilder()
      .setName('backup')
      .setDescription('💾 [BEHEER] Server backup beheer')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(sub => sub
        .setName('maken')
        .setDescription('Maak een nieuwe backup van de server')
      )
      .addSubcommand(sub => sub
        .setName('lijst')
        .setDescription('Bekijk alle beschikbare backups')
      )
      .addSubcommand(sub => sub
        .setName('bekijken')
        .setDescription('Bekijk de inhoud van een specifieke backup')
        .addStringOption(o => o.setName('id').setDescription('Backup ID (zie /backup lijst)').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('restore')
        .setDescription('Herstel server vanuit backup (maakt ontbrekende rollen/kanalen aan)')
        .addStringOption(o => o.setName('id').setDescription('Backup ID').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('verwijder')
        .setDescription('Verwijder een backup bestand')
        .addStringOption(o => o.setName('id').setDescription('Backup ID').setRequired(true))
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName('security-config')
      .setDescription('⚙️ [BEHEER] Pas beveiligingsinstellingen aan')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption(o => o.setName('instelling').setDescription('Welke instelling').setRequired(true)
        .addChoices(
          { name: '🏴‍☠️ Anti-Raid aan/uit',             value: 'antiraid_toggle'    },
          { name: '📅 Account Age Gate aan/uit',        value: 'accountage_toggle'  },
          { name: '💬 Anti-Spam aan/uit',               value: 'antispam_toggle'    },
          { name: '🔗 Anti-Invite aan/uit',             value: 'antiinvite_toggle'  },
          { name: '🪝 Webhook Bescherming aan/uit',     value: 'webhook_toggle'     },
          { name: '🚨 Raid Drempel (aantal joins)',      value: 'raid_threshold'     },
          { name: '⏱️ Raid Tijdvenster (seconden)',     value: 'raid_window'        },
          { name: '📅 Min. Account Leeftijd (dagen)',   value: 'min_age'            },
          { name: '⏱️ Spam Timeout Duur (seconden)',     value: 'spam_timeout'       },
          { name: '📢 Security Log Kanaal (kanaal-ID)', value: 'log_channel'        },
          { name: '⚡ Raid Actie (quarantine/kick/ban)', value: 'raid_action'       },
          { name: '⚡ Spam Actie (timeout/kick/ban)',   value: 'spam_action'        },
          { name: '⚡ Age Gate Actie (kick/ban)',       value: 'age_action'         },
          { name: '🔒 Auto-Lockdown bij raid aan/uit',  value: 'auto_lockdown'      },
          { name: '🔐 Captcha rekensom verificatie aan/uit', value: 'captcha_toggle'   },
          { name: '🔇 Anti-Profanity aan/uit',               value: 'profanity_toggle'  },
          { name: '⚠️ Ban Evasion detectie aan/uit',         value: 'banevasion_toggle' },
          { name: '⚠️ Gecoördineerd joinen aan/uit',         value: 'coordjoin_toggle'  },
          { name: '⚠️ Impersonation detectie aan/uit',       value: 'impersonation_toggle' },
          { name: '🎙️ Voice Security aan/uit',               value: 'voice_toggle'      },
          { name: '💾 Auto Backup aan/uit',                  value: 'autobackup_toggle' },
        ))
      .addStringOption(o => o.setName('waarde').setDescription('Nieuwe waarde (bijv: true, false, 10, kanaal-ID)').setRequired(false))
      .toJSON(),

  // -- TEMPBAN
  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('⏳ [STAFF] Ban een gebruiker tijdelijk')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
    .addStringOption(o => o.setName('duur').setDescription('Duur bijv: 1u, 12u, 1d, 7d, 30d').setRequired(true))
    .addStringOption(o => o.setName('reden').setDescription('Reden voor de tempban').setRequired(true))
    .toJSON(),

  // -- HISTORY
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('📋 [STAFF] Bekijk de straf history van een gebruiker')
    .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
    .toJSON(),

  // -- SUGGESTIE
  new SlashCommandBuilder()
    .setName('suggestie')
    .setDescription('💡 Dien een suggestie in voor de server')
    .addStringOption(o => o.setName('tekst').setDescription('Jouw suggestie').setRequired(true).setMinLength(10).setMaxLength(1000))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('suggestie-kanaal')
    .setDescription('⚙️ [STAFF] Stel het suggestie kanaal in')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanaal').setDescription('Het kanaal voor suggesties').setRequired(true))
    .toJSON(),

  // -- TICKET CLAIM
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('🎫 [STAFF] Claim dit ticket — jij bent nu verantwoordelijk')
    .toJSON(),

  // -- TICKET VOEG TOE
  new SlashCommandBuilder()
    .setName('voegtoe')
    .setDescription('🎫 [STAFF] Voeg een gebruiker toe aan dit ticket')
    .addUserOption(o => o.setName('gebruiker').setDescription('De gebruiker om toe te voegen').setRequired(true))
    .toJSON(),

  // -- TICKET PRIORITEIT
  new SlashCommandBuilder()
    .setName('prioriteit')
    .setDescription('🎫 [STAFF] Stel de prioriteit van dit ticket in')
    .addStringOption(o => o.setName('niveau')
      .setDescription('Prioriteitsniveau')
      .setRequired(true)
      .addChoices(
        { name: '🟡 Normaal',  value: 'normaal'  },
        { name: '🔴 Hoog',     value: 'hoog'     },
        { name: '🚨 Urgent',   value: 'urgent'   },
      ))
    .toJSON(),

  // -- TICKET OVERDRAGEN
  new SlashCommandBuilder()
    .setName('overdragen')
    .setDescription('🎫 [STAFF] Draag dit ticket over aan een ander stafflid')
    .addUserOption(o => o.setName('stafflid').setDescription('Het stafflid dat het ticket overneemt').setRequired(true))
    .toJSON(),

  // -- SERVER INFO
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('📊 Bekijk de statistieken van de server')
    .toJSON(),

  // -- TICKET STATS
  new SlashCommandBuilder()
    .setName('ticket-stats')
    .setDescription('📊 [STAFF] Bekijk ticket statistieken')
    .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    const app = await client.application.fetch();
    // Verwijder globale commands om duplicaten te voorkomen
    await rest.put(Routes.applicationCommands(app.id), { body: [] });
    const guild = client.guilds.cache.first();
    if (!guild) return;
    await rest.put(Routes.applicationGuildCommands(app.id, guild.id), { body: commands });
    console.log(`✅ ${commands.length} slash commands geregistreerd in: ${guild.name}`);
  } catch (e) { console.error('❌ Slash command registratie fout:', e); }
}

// ----------------------------------------------------------------------------
//  READY
// ----------------------------------------------------------------------------
// --- Bot Trap helpers (module-niveau zodat messageDelete er ook bij kan) -------------
const WARN_EMBED = () => new EmbedBuilder()
  .setTitle('⛔ NIET TYPEN IN DIT KANAAL')
  .setDescription(
    '## 🔒 BEVEILIGINGSKANAAL — VERBODEN TOEGANG\n\n' +
    '**Dit kanaal is een beveiligingsval.**\n\n' +
    '> ❌ **Stuur NOOIT een bericht in dit kanaal.**\n' +
    '> ❌ **Reageer NOOIT op berichten in dit kanaal.**\n' +
    '> ❌ **Klik NOOIT op links die hier worden geplaatst.**\n\n' +
    'Iedereen die hier typt wordt **automatisch en direct** gesanctioneerd — zonder uitzondering.\n\n' +
    '*Dit kanaal is alleen zichtbaar om kwaadwillende bots en raiders te detecteren. ' +
    'Als normale speler hoef je hier niets te doen. Scroll gewoon verder.*'
  )
  .setColor(0xFF0000)
  .setFooter({ text: '🛡️ Lage Landen RP Beveiligingssysteem — Automatisch systeem actief' })
  .setTimestamp();

async function repostBotTrapWarning(ch) {
  // Verwijder oude waarschuwing als die er nog is
  if (secCfg.botTrap.warningMsgId) {
    const old = await ch.messages.fetch(secCfg.botTrap.warningMsgId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }
  // Verwijder ook eventuele pins van de oude waarschuwing
  const pins = await ch.messages.fetchPinned().catch(() => null);
  if (pins) for (const [, p] of pins) if (p.author.id === client.user.id) await p.unpin().catch(() => {});
  // Stuur nieuwe waarschuwing als stil bericht (geen notificatie) en pin
  const warnMsg = await ch.send({ embeds: [WARN_EMBED()], flags: 4096 }).catch(() => null);
  if (warnMsg) {
    await warnMsg.pin().catch(() => {});
    secCfg.botTrap.warningMsgId = warnMsg.id;
    saveSecurityConfig(secCfg);
  }
}

client.on('ready', async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
  await registerSlashCommands();
  const guild = client.guilds.cache.first();
  if (guild) {
    await setupPartnerCategory(guild);
    await setupTicketCategory(guild);

    // Herstel actieve giveaways na herstart
    const now = Date.now();
    for (const gw of giveawayDB) {
      if (gw.ended) continue;
      const remaining = gw.endsAt - now;
      if (remaining <= 0) {
        await endGiveaway(gw).catch(() => {});
      } else {
        const timer = setTimeout(() => endGiveaway(gw), remaining);
        giveawayTimers.set(gw.id, timer);
        console.log(`🎊 Giveaway "${gw.prize}" hersteld — nog ${Math.ceil(remaining/60000)}m`);
      }
    }

    // Herstel actieve tempbans na herstart
    tempbansDB = loadTempbans();
    for (const [userId, data] of Object.entries(tempbansDB)) {
      const remaining = data.expiresAt - Date.now();
      if (remaining <= 0) {
        guild.members.unban(userId, 'Tempban verlopen (herstart)').catch(() => {});
        delete tempbansDB[userId];
      } else {
        scheduleUnban(userId, data.guildId || guild.id, remaining);
        console.log(`⏳ Tempban hersteld voor ${userId} — nog ${Math.ceil(remaining/60000)}m`);
      }
    }
    saveTempbans(tempbansDB);
  }
  client.user.setActivity(STATUSES[0].name, { type: STATUSES[0].type });

  // XP autosave elke minuut
  setInterval(() => { saveXP(xpDB); saveInactief(inactiefDB); }, 60_000);

  // -- Ticket auto-close: elk uur controleren op inactieve tickets -----------
  setInterval(async () => {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const ticketCatIds = [
      db.channels.ticketSupportCategoryId,
      db.channels.ticketReportCategoryId,
      db.channels.ticketSollicitatieCategoryId,
      db.channels.ticketPartnerCategoryId,
      db.channels.ticketCategoryId,
    ].filter(Boolean);
    const now = Date.now();
    const ticketChannels = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText &&
      ticketCatIds.includes(c.parentId) &&
      c.name.startsWith('\u276Aticket\u276B-')
    );
    for (const [, ch] of ticketChannels) {
      const lastAct = ticketLastActivity.get(ch.id) || ch.createdTimestamp;
      const warned  = ticketCloseWarned.get(ch.id);
      if (warned) {
        // Al gewaarschuwd — sluit na TICKET_CLOSE_MS
        if (now - warned >= TICKET_CLOSE_MS) {
          ticketCloseWarned.delete(ch.id);
          ticketLastActivity.delete(ch.id);
          await logTicketTranscript(ch, client.user).catch(() => {});
          await ch.delete('Auto-close: inactiviteit na waarschuwing').catch(() => {});
          updateReactietijdEmbed(guild).catch(() => {});
        }
      } else if (now - lastAct >= TICKET_WARN_MS) {
        // Nog niet gewaarschuwd — stuur waarschuwing
        ticketCloseWarned.set(ch.id, now);
        const warnEmbed = new EmbedBuilder()
          .setTitle('⏰ Ticket Inactiviteit Waarschuwing')
          .setDescription(
            '**Dit ticket wordt automatisch gesloten over 24 uur** wegens inactiviteit.\n\n' +
            'Stuur een bericht in dit kanaal om het ticket actief te houden, of sluit het handmatig met de knop hieronder.'
          )
          .setColor(0xFFA500)
          .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_sluit').setLabel('🔒 Nu Sluiten').setStyle(ButtonStyle.Secondary),
        );
        await ch.send({ embeds: [warnEmbed], components: [row] }).catch(() => {});
      }
    }
  }, 60 * 60_000); // elk uur

  // Schrijf stats elke 15 seconden naar bot-stats.json (voor control panel)
  const writeStats = () => {
    try {
      const mem = process.memoryUsage();
      const mainGuild = client.guilds.cache.first();
      fs.writeFileSync(STATS_PATH, JSON.stringify({
        online:    true,
        tag:       client.user.tag,
        id:        client.user.id,
        ping:      client.ws.ping,
        uptime:    Date.now() - BOT_START_TIME,
        rss:       Math.round(mem.rss      / 1024 / 1024),
        heapUsed:  Math.round(mem.heapUsed / 1024 / 1024),
        guilds:    client.guilds.cache.size,
        partners:     Object.keys(db.partners).length,
        guildName:    mainGuild ? mainGuild.name : 'Onbekend',
        members:      mainGuild ? mainGuild.memberCount : 0,
        updatedAt:    Date.now(),
        pid:          process.pid,
        ticketStats:  db.ticketStats  || { totalOpened: 0, totalClosed: 0, byType: { support:{opened:0,closed:0}, report:{opened:0,closed:0}, sollicitatie:{opened:0,closed:0}, partner:{opened:0,closed:0} } },
        xpLevelRoles: db.xpLevelRoles || { enabled: false, rewards: [] },
      }));
    } catch { /* negeer */ }
  };
  writeStats();
  setInterval(writeStats, 15_000);

  // ── Rate-limit detectie ───────────────────────────────────────────────────
  let rateLimitCount  = 0;
  let rateLimitWindow = Date.now();
  client.rest.on('rateLimited', async (info) => {
    const now = Date.now();
    if (now - rateLimitWindow > 60_000) { rateLimitCount = 0; rateLimitWindow = now; }
    rateLimitCount++;
    const msg = `⚠️ Rate-limited — route: \`${info.route}\` | reset in ${info.timeToReset}ms | #${rateLimitCount} dit uur`;
    console.warn('[RATELIMIT]', msg);
    addSecurityEvent('rate_limited', { route: info.route, timeToReset: info.timeToReset, count: rateLimitCount });
    // Stuur alert naar security-log als er veel rate-limits zijn (>5 in 1 min)
    if (rateLimitCount >= 5) {
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Rate-limit Waarschuwing')
        .setColor(0xFFA500)
        .setDescription(`De bot is de afgelopen minuut **${rateLimitCount}x** rate-limited.\nMogelijk spam of een aanval.`)
        .addFields(
          { name: '🔗 Route',        value: `\`${info.route}\``,             inline: true },
          { name: '⏱️ Reset over',   value: `${info.timeToReset}ms`,         inline: true },
          { name: '📊 Totaal',       value: `${rateLimitCount}x dit uur`,    inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Security' }).setTimestamp()
      ).catch(() => {});
      rateLimitCount = 0; // reset na alert zodat hij niet elke keer opnieuw stuurt
      rateLimitWindow = Date.now();
    }
  });

  setInterval(() => {
    statusIdx = (statusIdx + 1) % STATUSES.length;
    client.user.setActivity(STATUSES[statusIdx].name, { type: STATUSES[statusIdx].type });
  }, 30_000);

  // -- Bot Trap: valse activiteit elke 2–5 uur -------------------------------
  const BOT_TRAP_MESSAGES = [
    'is er iemand?', 'hoi', 'hey allemaal 👀', 'wat is er loos?',
    'iemand online?', 'hallo?', 'man het is stil hier 😅', 'anyone?',
    'hoi hoi', 'lekker rustig vandaag', 'goeiemorgen iedereen',
    'wie is er allemaal?', '...', 'yo', 'salut',
  ];
  async function sendBotTrapActivity() {
    if (!secCfg.botTrap?.enabled || !secCfg.botTrap?.channelId) return;
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const ch = guild.channels.cache.get(secCfg.botTrap.channelId);
    if (!ch) return;

    // Stuur nep-activiteitsbericht — stil (geen notificatie/unread dot voor leden)
    const nep = BOT_TRAP_MESSAGES[Math.floor(Math.random() * BOT_TRAP_MESSAGES.length)];
    await ch.send({ content: nep, flags: 4096 }).catch(() => {});
    secCfg.botTrap.lastActivity = Date.now();

    // Herplaats waarschuwing elke 30 nep-berichten
    secCfg.botTrap.msgsSinceWarn = (secCfg.botTrap.msgsSinceWarn || 0) + 1;
    if (secCfg.botTrap.msgsSinceWarn >= 20) {
      secCfg.botTrap.msgsSinceWarn = 0;
      await repostBotTrapWarning(ch);
    }
    saveSecurityConfig(secCfg);
  }
  // Stuur direct een bericht bij opstarten (1 min delay) en dan elke 2–4 uur
  setTimeout(async () => {
    await sendBotTrapActivity();
    setInterval(sendBotTrapActivity, (2 * 60 + Math.floor(Math.random() * 120)) * 60_000);
  }, 60_000);

  // -- Automatische dagelijkse server backup -------------------------------------
  async function runAutoBackup() {
    if (!secCfg.autoBackup?.enabled || !secCfg.autoBackup?.channelId) return;
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const ch = guild.channels.cache.get(secCfg.autoBackup.channelId);
    if (!ch) return;
    const backup = {
      timestamp:    Date.now(),
      date:         new Date().toISOString(),
      guildName:    guild.name,
      memberCount:  guild.memberCount,
      roles:        [...guild.roles.cache.values()].map(r => ({
        id: r.id, name: r.name, color: r.hexColor,
        permissions: r.permissions.bitfield.toString(),
        position: r.position, hoist: r.hoist, mentionable: r.mentionable,
      })),
      channels:     [...guild.channels.cache.values()].map(c => ({
        id: c.id, name: c.name, type: c.type,
        parentId: c.parentId, position: c.position ?? 0,
      })),
      securityConfig: (({ lockdownChannelStates, ...rest }) => rest)(secCfg),
    };
    const buf = Buffer.from(JSON.stringify(backup, null, 2), 'utf-8');
    const att = new AttachmentBuilder(buf, { name: `backup-${new Date().toISOString().slice(0, 10)}.json` });
    await ch.send({
      content: `💾 **Automatische Server Backup** — <t:${Math.floor(Date.now() / 1000)}:F>\n> Rollen: ${backup.roles.length} | Kanalen: ${backup.channels.length} | Leden: ${backup.memberCount}`,
      files: [att],
    }).catch(() => {});
    console.log('💾 Automatische backup gestuurd naar #' + ch.name);
  }
  // Start na 10s (zodat guildcache klaar is) en dan elke 24u
  setTimeout(() => { runAutoBackup(); setInterval(runAutoBackup, 24 * 60 * 60_000); }, 10_000);
});

// ----------------------------------------------------------------------------
//  ANTI-PHISHING + TOKEN SCANNER
// ----------------------------------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;
  const content = message.content || '';

  // -- Token scanner --
  if (secCfg.tokenScan?.enabled) {
    const tokenMatch = content.match(TOKEN_REGEX);
    const apiKeyMatch = content.match(APIKEY_REGEX);
    if (tokenMatch || apiKeyMatch) {
      await message.delete().catch(() => {});
      const member = message.member;
      addSecurityEvent('token_detected', { userId: message.author.id, username: message.author.tag });
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Token / API Key Gedetecteerd!')
        .setColor(0xFF4757)
        .setDescription('Een bericht met een mogelijk Discord token of API key is automatisch verwijderd.')
        .addFields(
          { name: '👤 Gebruiker', value: `<@${message.author.id}> \`${message.author.tag}\``, inline: true },
          { name: '📢 Kanaal',   value: `<#${message.channel.id}>`,                              inline: true },
          { name: '🏷️ Type',      value: tokenMatch ? 'Discord Token' : 'API Key/Secret',              inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Token Scanner' }).setTimestamp()
      );
      await message.author.send({ embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Beveiligingswaarschuwing')
          .setDescription('Jouw bericht op **Lage Landen RP** bevatte wat eruitzag als een Discord token of API key en is automatisch verwijderd.\n\n**Als dit jouw eigen token was: verander hem onmiddellijk!**\n\nGa naar: Discord → Instellingen → Mijn account → Wijzig wachtwoord.')
          .setColor(0xFF4757)
      ]}).catch(() => {});
      return;
    }
  }

  // -- Anti-phishing --
  if (secCfg.phishing?.enabled) {
    URL_REGEX.lastIndex = 0;
    let match;
    let foundDomain = null;
    while ((match = URL_REGEX.exec(content)) !== null) {
      const domain = match[1].toLowerCase().replace(/^www\./, '');
      if (PHISHING_DOMAINS.has(domain)) { foundDomain = domain; break; }
    }
    if (foundDomain) {
      await message.delete().catch(() => {});
      const member = message.member;
      const action = secCfg.phishing.action || 'ban';
      addSecurityEvent('phishing', { userId: message.author.id, username: message.author.tag, domain: foundDomain, action });
      await securityLog(new EmbedBuilder()
        .setTitle('🚨 Phishing Link Geblokkeerd!')
        .setColor(0xFF0000)
        .addFields(
          { name: '👤 Gebruiker', value: `<@${message.author.id}> \`${message.author.tag}\``, inline: true },
          { name: '🌐 Domein',   value: `\`${foundDomain}\``,                                   inline: true },
          { name: '⚡ Actie',     value: action,                                                    inline: true },
          { name: '📢 Kanaal',   value: `<#${message.channel.id}>`,                              inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Anti-Phishing' }).setTimestamp()
      );
      if (member) {
        await member.user.send({ embeds: [
          new EmbedBuilder()
            .setTitle('❌ Je bent verwijderd van Lage Landen RP')
            .setDescription(`Je hebt een phishing/scam link verstuurd (domein: \`${foundDomain}\`).\nDit is een automatische actie van ons beveiligingssysteem.`)
            .setColor(0xFF0000)
        ]}).catch(() => {});
        if (action === 'ban') {
          await message.guild.members.ban(message.author.id, { reason: `Phishing link: ${foundDomain}`, deleteMessageSeconds: 86400 }).catch(() => {});
        } else if (action === 'kick') {
          await purgeUserMessages(message.guild, message.author.id).catch(() => {});
          await member.kick(`Phishing link: ${foundDomain}`).catch(() => {});
        } else {
          await applyQuarantine(member, `⚠️ Phishing link verstuurd: ${foundDomain}`);
        }
      }
      return;
    }
  }
});

// ----------------------------------------------------------------------------
//  NUKE DETECTIE — snelle kanaal/rol verwijderingen
// ----------------------------------------------------------------------------
async function handleNukeEvent(guild, type) {
  if (!secCfg.nukeProt?.enabled) return;
  const now = Date.now();
  const windowMs = (secCfg.nukeProt.windowSec || 10) * 1000;
  nukeTracker.deletes.push({ type, timestamp: now });
  // Verwijder oude events buiten het venster
  nukeTracker.deletes = nukeTracker.deletes.filter(e => now - e.timestamp <= windowMs);

  if (nukeTracker.deletes.length < (secCfg.nukeProt.threshold || 5)) return;

  // Drempel bereikt — haal de uitvoerder op via audit log
  const auditType = type === 'channel' ? 12 /* ChannelDelete */ : 32 /* RoleDelete */;
  const audit = await guild.fetchAuditLogs({ type: auditType, limit: 1 }).catch(() => null);
  const executor = audit?.entries.first()?.executor;

  nukeTracker.deletes = []; // reset

  addSecurityEvent('nuke_detected', { type, count: nukeTracker.deletes.length, executorId: executor?.id, executorTag: executor?.tag });

  await securityLog(new EmbedBuilder()
    .setTitle('🚨 NUKE GEDETECTEERD — Massale verwijderingen!')
    .setColor(0xFF0000)
    .setDescription(`**${nukeTracker.deletes.length + 1}+** ${type === 'channel' ? 'kanalen' : 'rollen'} zijn in **${secCfg.nukeProt.windowSec}s** verwijderd!`)
    .addFields(
      { name: '👤 Uitvoerder', value: executor ? `<@${executor.id}> \`${executor.tag}\`` : 'Onbekend', inline: true },
      { name: '⚡ Actie',      value: secCfg.nukeProt.action || 'ban',                                    inline: true },
    )
    .setFooter({ text: 'Lage Landen RP — Nuke Bescherming' }).setTimestamp()
  );

  // Lockdown de server
  if (!secCfg.lockdownActive) await lockdownServer(guild, 'Automatisch — Nuke gedetecteerd').catch(() => {});

  // Straf de uitvoerder
  if (executor && executor.id !== client.user.id) {
    const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
    if (member && !member.permissions.has(PermissionFlagsBits.Administrator)) {
      if (secCfg.nukeProt.action === 'ban') {
        await guild.members.ban(executor.id, { reason: 'Nuke detectie: massale verwijderingen', deleteMessageSeconds: 86400 }).catch(() => {});
      } else if (secCfg.nukeProt.action === 'kick') {
        await purgeUserMessages(guild, executor.id).catch(() => {});
        await member.kick('Nuke detectie: massale verwijderingen').catch(() => {});
      } else if (member) {
        await applyQuarantine(member, '🚨 Nuke detectie: massale verwijderingen');
      }
    }
  }
}

client.on('channelDelete', async (channel) => {
  if (!channel.guild) return;
  await handleNukeEvent(channel.guild, 'channel');
});

client.on('roleDelete', async (role) => {
  if (!role.guild) return;
  await handleNukeEvent(role.guild, 'role');
});

// ----------------------------------------------------------------------------
//  USERNAME FILTER — dehoisting + guildMemberUpdate
// ----------------------------------------------------------------------------
async function applyUsernameFilter(member) {
  if (!secCfg.usernameFilter?.enabled) return;
  const nick    = member.nickname || member.user.username;
  const blocked = (secCfg.usernameFilter.blockedWords || []).map(w => w.toLowerCase());

  let newNick = null;
  if (secCfg.usernameFilter.dehoisting && HOIST_REGEX.test(nick)) {
    newNick = `Gebruiker ${member.id.slice(-4)}`;
    addSecurityEvent('dehoisting', { userId: member.id, username: member.user.tag, original: nick });
  }
  if (!newNick && blocked.some(w => nick.toLowerCase().includes(w))) {
    newNick = `Gebruiker ${member.id.slice(-4)}`;
    addSecurityEvent('username_blocked', { userId: member.id, username: member.user.tag, original: nick });
  }
  if (newNick) {
    await member.setNickname(newNick, 'Username filter').catch(() => {});
    await securityLog(new EmbedBuilder()
      .setTitle('✏️ Gebruikersnaam Aangepast')
      .setColor(0xFFA502)
      .addFields(
        { name: '👤 Gebruiker',  value: `<@${member.id}> \`${member.user.tag}\``, inline: true },
        { name: '🔤 Oud',        value: nick,                                       inline: true },
        { name: '✅ Nieuw',      value: newNick,                                     inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Username Filter' }).setTimestamp()
    );
  }
}

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Alleen bij nicknaam/username wijzigingen
  if (oldMember.nickname === newMember.nickname && oldMember.user.username === newMember.user.username) return;
  await applyUsernameFilter(newMember);
});

// ----------------------------------------------------------------------------
//  BOT TRAP — detecteer berichten in honeypot kanaal
// ----------------------------------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot && message.author.id === client.user.id) return; // eigen berichten negeren
  if (!secCfg.botTrap?.enabled || !secCfg.botTrap?.channelId) return;
  if (message.channel.id !== secCfg.botTrap.channelId) return;
  if (message.author.bot && !message.webhookId) return; // echte bots negeren (alleen webhooks en gebruikers vangen)

  const guild = message.guild;
  const member = message.member || await guild.members.fetch(message.author.id).catch(() => null);

  // Verwijder het bericht meteen
  await message.delete().catch(() => {});

  // Staf negeren
  if (member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const action = secCfg.botTrap.action || 'quarantine';
  addSecurityEvent('bottrap', { userId: message.author.id, username: message.author.tag, action, content: message.content?.slice(0, 100) });

  await securityLog(new EmbedBuilder()
    .setTitle('🚨 Bot Trap Geactiveerd!')
    .setColor(0xFF4757)
    .setDescription(`Een gebruiker heeft een bericht gestuurd in het honeypot kanaal!`)
    .addFields(
      { name: '👤 Gebruiker', value: `<@${message.author.id}> \`${message.author.tag}\``, inline: true },
      { name: '🤖 Bot?',      value: message.author.bot ? '✅ Ja' : '❌ Nee',             inline: true },
      { name: '💬 Bericht',   value: `\`${(message.content || '[geen tekst]').slice(0, 200)}\``,       inline: false },
      { name: '⚡ Actie',     value: action,                                                             inline: true },
    )
    .setFooter({ text: 'Lage Landen RP — Bot Trap' }).setTimestamp()
  );

  if (!member) return;
  if (action === 'quarantine') {
    await applyQuarantine(member, '🚨 Bot Trap — bericht in honeypot kanaal');
  } else if (action === 'kick') {
    await purgeUserMessages(guild, message.author.id).catch(() => {});
    await member.kick('Bot Trap: bericht in honeypot kanaal').catch(() => {});
  } else if (action === 'ban') {
    await guild.members.ban(message.author.id, { reason: 'Bot Trap: bericht in honeypot kanaal', deleteMessageSeconds: 86400 }).catch(() => {});
  }
});

// ----------------------------------------------------------------------------
//  CHAT LOGS — elk bericht loggen
// ----------------------------------------------------------------------------
const NOLOG_CHANNELS = new Set([CHAT_LOG_CHANNEL, VOICE_LOG_CHANNEL, JOIN_LEAVE_CHANNEL, MOD_LOG_CHANNEL, TICKET_LOG_CHANNEL]);

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (NOLOG_CHANNELS.has(message.channel.id)) return;
  if (message.channel.name?.startsWith('\u276Aticket\u276B')) return;
  const logCh = await client.channels.fetch(CHAT_LOG_CHANNEL).catch(() => null);
  if (!logCh) return;
  const isThread = !!message.channel.parentId;
  const channelDisplay = isThread
    ? `<#${message.channel.parentId}> → thread **${message.channel.name}**`
    : `<#${message.channel.id}>`;
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setTitle('💬 Nieuw Bericht')
    .addFields(
      { name: '👤 Gebruiker', value: `<@${message.author.id}> \`${message.author.tag}\``, inline: true },
      { name: '📢 Kanaal',    value: channelDisplay,                                         inline: true },
      { name: '⏰ Tijdstip',  value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: false },
    )
    .setColor(0x5865F2)
    .setFooter({ text: `Bericht ID: ${message.id}` })
    .setTimestamp(message.createdAt);
  if (message.content) embed.setDescription(message.content.slice(0, 4000));
  if (message.attachments.size) {
    embed.addFields({ name: `📎 Bijlagen (${message.attachments.size})`, value: [...message.attachments.values()].map(a => `[${a.name}](${a.url})`).join('\n').slice(0, 1024) });
  }
  await logCh.send({ embeds: [embed] }).catch(() => {});
});

// ----------------------------------------------------------------------------
//  XP SYSTEEM + INACTIEF TRACKING
// ----------------------------------------------------------------------------
const XP_IGNORE_CHANNELS = new Set([
  CHAT_LOG_CHANNEL, VOICE_LOG_CHANNEL, JOIN_LEAVE_CHANNEL,
  MOD_LOG_CHANNEL, TICKET_LOG_CHANNEL, BLACKLIST_CHANNEL_ID,
]);
const XP_COOLDOWN_MS = 60_000; // 60 seconden cooldown per gebruiker

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild)     return;
  if (XP_IGNORE_CHANNELS.has(message.channel.id)) return;
  if (message.channel.name?.startsWith('\u276Aticket\u276B')) return;

  const userId = message.author.id;
  const now    = Date.now();

  // -- Inactief tracking voor staffleden ------------------------------------
  const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
  if (member && hasRoleOrHigher(member, STAFF_ROLE_ID)) {
    inactiefDB[userId] = {
      ...inactiefDB[userId],
      lastMessage: now,
      username: message.author.tag,
    };
  }

  // -- XP cooldown check -----------------------------------------------------
  const lastGain = xpCooldown.get(userId) || 0;
  if (now - lastGain < XP_COOLDOWN_MS) return;
  xpCooldown.set(userId, now);

  // -- XP berekenen ----------------------------------------------------------
  const gain = Math.floor(Math.random() * 11) + 15; // 15–25 XP per bericht
  if (!xpDB[userId]) xpDB[userId] = { xp: 0, level: 0, username: message.author.tag };
  const entry = xpDB[userId];
  entry.username = message.author.tag;
  const prevLevel = entry.level;
  entry.xp += gain;
  entry.level = getLevel(entry.xp);

  // -- Level-up melding ------------------------------------------------------
  if (entry.level > prevLevel) {
    const lvl = entry.level;
    const embed = new EmbedBuilder()
      .setTitle('⬆️ Level Up!')
      .setDescription(
        `<@${userId}> is nu level **${lvl}**! 🎉\n\n` +
        `XP: \`${entry.xp}\` / \`${xpForLevel(lvl + 1)}\` voor level ${lvl + 1}`
      )
      .setColor(0x5865F2)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Lage Landen RP — XP Systeem' })
      .setTimestamp();
    const lvlUpCh = await client.channels.fetch('1458204343634497656').catch(() => null);
    const target  = lvlUpCh || message.channel;
    await target.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
    console.log(`⬆️ ${message.author.tag} bereikte level ${lvl}`);

    // XP level rol beloningen
    if (db.xpLevelRoles?.enabled && db.xpLevelRoles.rewards?.length > 0) {
      const guild4xp  = client.guilds.cache.first();
      const mem4xp    = guild4xp?.members.cache.get(userId) || await guild4xp?.members.fetch(userId).catch(() => null);
      if (mem4xp) {
        for (const reward of db.xpLevelRoles.rewards) {
          if (reward.level === lvl && reward.roleId) {
            await mem4xp.roles.add(reward.roleId, `XP Level ${lvl} beloning`).catch(() => {});
            console.log(`🎖️ Rol ${reward.roleId} toegevoegd aan ${message.author.tag} voor level ${lvl}`);
          }
        }
      }
    }
  }
});

// ----------------------------------------------------------------------------
//  ANTI-SPAM / ANTI-INVITE systeem
// ----------------------------------------------------------------------------
const DISCORD_INVITE_REGEX = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9-]+/gi;

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;
  // Staff is vrijgesteld van anti-spam/anti-invite/anti-profanity
  if (hasRoleOrHigher(member, STAFF_ROLE_ID)) return;

  const cfg    = secCfg;
  const now    = Date.now();
  const userId = message.author.id;

  // -- Quarantaine: berichten van gequarantainde leden verwijderen ----------
  const qRoleId = cfg.antiRaid?.quarantineRoleId;
  if (qRoleId && member.roles.cache.has(qRoleId)) {
    await message.delete().catch(() => {});
    return;
  }

  // -- Anti-Invite ----------------------------------------------------------
  if (cfg.antiInvite?.enabled && message.content) {
    const hasInvite = DISCORD_INVITE_REGEX.test(message.content);
    DISCORD_INVITE_REGEX.lastIndex = 0;
    if (hasInvite) {
      if (cfg.antiInvite.deleteMsg) await message.delete().catch(() => {});
      addSecurityEvent('invite_blocked', { userId, username: message.author.tag, content: message.content.slice(0, 200) });
      if (cfg.antiInvite.warnUser) {
        const warn = await message.channel.send({
          content: `<@${userId}> ⚠️ Adverteren van andere Discord servers is niet toegestaan!`,
        }).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
      }
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Discord Invite Geblokkeerd')
        .setColor(0xFFA500)
        .addFields(
          { name: '👤 Gebruiker', value: `<@${userId}> \`${message.author.tag}\``, inline: true },
          { name: '📢 Kanaal',   value: `<#${message.channel.id}>`,               inline: true },
          { name: '💬 Bericht',  value: message.content.slice(0, 500),             inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Anti-Invite' }).setTimestamp()
      );
      return;
    }
  }

  // -- Anti-Spam ------------------------------------------------------------
  if (cfg.antiSpam?.enabled) {
    const content = message.content || '';
    let spamReason = null;

    // 1. Berichtfrequentie
    const timestamps = msgTracker.get(userId) || [];
    timestamps.push(now);
    const windowMs = (cfg.antiSpam.windowSec || 5) * 1000;
    const recent   = timestamps.filter(t => now - t < windowMs);
    msgTracker.set(userId, recent);
    if (recent.length >= (cfg.antiSpam.msgThreshold || 7))
      spamReason = `Spam: ${recent.length} berichten in ${cfg.antiSpam.windowSec || 5}s`;

    // 2. Mass mention
    const mentionCount = (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
    if (!spamReason && mentionCount >= (cfg.antiSpam.mentionThreshold || 5))
      spamReason = `Mass mention: ${mentionCount} mentions`;

    // 3. Duplicaat berichten (zelfde tekst =4× in 10s)
    if (!spamReason && content.trim().length > 0) {
      const dup = dupTracker.get(userId);
      if (dup && dup.content === content.trim() && now - dup.lastSeen < 10_000) {
        dup.count++;
        dup.lastSeen = now;
        if (dup.count >= 4) spamReason = `Duplicaat spam: zelfde bericht ${dup.count}× gestuurd`;
      } else {
        dupTracker.set(userId, { content: content.trim(), count: 1, lastSeen: now });
      }
    }

    // 4. Caps flood (>70% hoofdletters, minstens 8 tekens)
    // Uitzondering: lach-expressies (alleen h/a/e, l/o, k/e, lmao, rofl + leestekens)
    const isLaughter = /^[\s!?1.~]*[hahelokemrfHAHELOKEMRF]+[\s!?1.~]*$/.test(content.trim())
      && /ha|ah|he|lo|ke|lm|ro/i.test(content);
    if (!spamReason && !isLaughter && content.length >= 8) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= 6 && (letters.replace(/[^A-Z]/g, '').length / letters.length) > 0.70)
        spamReason = `Caps flood: bericht is ${Math.round((letters.replace(/[^A-Z]/g, '').length / letters.length) * 100)}% hoofdletters`;
    }

    // 5. Emoji flood (=8 emoji's in één bericht)
    const emojiCount = (content.match(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu) || []).length
                     + (content.match(/<a?:[\w]+:\d+>/g) || []).length;
    if (!spamReason && emojiCount >= 8)
      spamReason = `Emoji flood: ${emojiCount} emoji's in één bericht`;

    // 6. Cross-channel spam (zelfde bericht in =3 kanalen binnen 15s)
    if (!spamReason && content.trim().length > 0) {
      const cc = crossChanTracker.get(userId);
      if (cc && cc.content === content.trim() && now - cc.lastSeen < 15_000) {
        cc.channels.add(message.channel.id);
        cc.lastSeen = now;
        if (cc.channels.size >= 3) spamReason = `Cross-channel spam: zelfde bericht in ${cc.channels.size} kanalen`;
      } else {
        crossChanTracker.set(userId, { content: content.trim(), channels: new Set([message.channel.id]), lastSeen: now });
      }
    }

    if (spamReason) {
      msgTracker.set(userId, []);
      dupTracker.delete(userId);
      crossChanTracker.delete(userId);
      await message.delete().catch(() => {});
      addSecurityEvent('spam_detected', { userId, username: message.author.tag, reason: spamReason });
      addModLog(userId, message.author.tag, 'automod-spam', spamReason, 'AutoMod', client.user?.id ?? '0');

      // Warn toevoegen
      if (!warnsDB[userId]) warnsDB[userId] = [];
      const warnId = Date.now();
      warnsDB[userId].push({ id: warnId, reason: `AutoMod Spam: ${spamReason}`, username: message.author.tag, by: 'AutoMod', byId: client.user?.id ?? '0', at: warnId });
      saveWarns(warnsDB);
      const warnCount = warnsDB[userId].length;

      // Melding in kanaal
      const notice = await message.channel.send({
        content: `<@${userId}> ⚠️ Spam gedetecteerd en verwijderd. Dit is waarschuwing **#${warnCount}**.\nReden: ${spamReason}`,
      }).catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), 10000);

      // Tijdelijke slowmode — alleen als er >10 gequarantaineerde leden zijn
      if (message.channel.type === ChannelType.GuildText) {
        const qRoleIdSlowmode = cfg.antiRaid?.quarantineRoleId;
        const quarantineCount = qRoleIdSlowmode
          ? (message.guild.roles.cache.get(qRoleIdSlowmode)?.members.size ?? 0)
          : 0;
        if (quarantineCount > 10) {
          const prev = message.channel.rateLimitPerUser || 0;
          if (prev < 10) {
            await message.channel.setRateLimitPerUser(10, 'Anti-spam: tijdelijke slowmode').catch(() => {});
            setTimeout(() => message.channel.setRateLimitPerUser(prev, 'Anti-spam slowmode opgeheven').catch(() => {}), 5 * 60_000);
          }
        }
      }

      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Spam Gedetecteerd')
        .setColor(0xFF6B6B)
        .addFields(
          { name: '👤 Gebruiker',    value: `<@${userId}> \`${message.author.tag}\``, inline: true },
          { name: '📢 Kanaal',      value: `<#${message.channel.id}>`,               inline: true },
          { name: '📝 Reden',       value: spamReason,                                inline: false },
          { name: '💬 Bericht',     value: `\`${(message.content || '[geen tekst]').slice(0, 500)}\``, inline: false },
          { name: '📊 Totaal warns', value: `${warnCount}`,                           inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Anti-Spam' }).setTimestamp()
      );

      // Warn drempels (timeout-tiers / strike-systeem)
      await applyWarnThresholds(member, userId, async (msg) => {
        const m = await message.channel.send({ content: msg }).catch(() => null);
        if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
      });
      return;
    }
  }

  // -- Anti-Scheldwoorden ----------------------------------------------------
  if (cfg.antiProfanity?.enabled !== false && message.content) {
    const found = checkProfanity(message.content);
    if (found.length > 0) {
      await message.delete().catch(() => {});

      // Warn toevoegen aan warnsDB
      if (!warnsDB[userId]) warnsDB[userId] = [];
      const warnId = Date.now();
      warnsDB[userId].push({ id: warnId, reason: `Ongepaste taal: ${found.join(', ')}`, username: message.author.tag, by: 'AutoMod', byId: client.user.id, at: warnId });
      saveWarns(warnsDB);
      const warnCount = warnsDB[userId].length;
      const color = warnCount >= 5 ? 0xFF0000 : warnCount >= 3 ? 0xFF6B00 : 0xFFA500;

      // Ephemeral-achtige melding in kanaal (verdwijnt na 8s)
      const notice = await message.channel.send({
        content: `<@${userId}> ⚠️ Jouw bericht is verwijderd wegens ongepaste taal. Dit is waarschuwing **#${warnCount}**.`,
      }).catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);

      // Warn embed in mod-log
      const warnEmbed = new EmbedBuilder()
        .setTitle(`⚠️ AutoMod Waarschuwing #${warnCount} — Ongepaste Taal`)
        .setColor(color)
        .addFields(
          { name: '👤 Gebruiker',    value: `<@${userId}> \`${message.author.tag}\``,      inline: true },
          { name: '📢 Kanaal',      value: `<#${message.channel.id}>`,                    inline: true },
          { name: '🔤 Woord(en)',   value: found.join(', '),                               inline: false },
          { name: '💬 Bericht',     value: message.content.slice(0, 500),                  inline: false },
          { name: '📊 Totaal warns', value: `**${warnCount}** waarschuwing${warnCount > 1 ? 'en' : ''}`, inline: true },
        )
        .setFooter({ text: `Warn ID: ${warnId} | Lage Landen RP — AutoMod` })
        .setTimestamp();

      await securityLog(warnEmbed);
      addSecurityEvent('profanity', { userId, username: message.author.tag, words: found.join(', '), warnCount });
      addModLog(userId, message.author.tag, 'automod-profanity', `Ongepaste taal: ${found.join(', ')}`, 'AutoMod', client.user?.id ?? '0');

      // Auto-acties op drempels
      await applyWarnThresholds(member, userId, async (msg) => {
        const m = await message.channel.send({ content: msg }).catch(() => null);
        if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
      });
    }
  }
});

const OWNER_ID = '295948417862205441';

client.on('messageDelete', async (message) => {
  // -- Bot Trap: als de waarschuwingsboodschap verwijderd wordt ? recreate --
  if (
    secCfg.botTrap?.enabled &&
    secCfg.botTrap?.channelId &&
    secCfg.botTrap?.warningMsgId &&
    message.id === secCfg.botTrap.warningMsgId &&
    message.channel?.id === secCfg.botTrap.channelId
  ) {
    // Controleer via audit log wie het verwijderd heeft
    await new Promise(r => setTimeout(r, 800)); // korte wacht voor audit log
    const auditLogs = await message.guild?.fetchAuditLogs({ type: 72 /* MESSAGE_DELETE */, limit: 3 }).catch(() => null);
    const entry = auditLogs?.entries.find(e =>
      e.target?.id === message.author?.id &&
      e.extra?.channel?.id === message.channel.id &&
      Date.now() - e.createdTimestamp < 5000
    );
    const deleterId = entry?.executor?.id ?? null;

    // Als de bot zelf of de eigenaar het verwijderde ? niet opnieuw aanmaken
    if (deleterId === client.user.id || deleterId === OWNER_ID) {
      // eigen verwijdering (bijv. repost routine), niets doen
    } else {
      // Iemand anders verwijderde de waarschuwing ? opnieuw aanmaken
      const trapCh = message.guild?.channels.cache.get(secCfg.botTrap.channelId);
      if (trapCh) {
        secCfg.botTrap.warningMsgId = null;
        await repostBotTrapWarning(trapCh);
        await securityLog(new EmbedBuilder()
          .setTitle('🚨 Bot Trap Waarschuwing Verwijderd — Hersteld')
          .setColor(0xFFA500)
          .addFields(
            { name: '🗑️ Verwijderd door', value: deleterId ? `<@${deleterId}>` : 'Onbekend', inline: true },
            { name: '📢 Kanaal',          value: `<#${trapCh.id}>`,                           inline: true },
          )
          .setFooter({ text: 'Lage Landen RP — Bot Trap' }).setTimestamp()
        );
      }
    }
    return;
  }

  if (!message.author || message.author.bot) return;
  if (NOLOG_CHANNELS.has(message.channel.id)) return;
  if (message.channel.name?.startsWith('\u276Aticket\u276B')) return;
  const logCh = await client.channels.fetch(CHAT_LOG_CHANNEL).catch(() => null);
  if (!logCh) return;
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setTitle('🏴‍☠️ Bericht Verwijderd')
    .addFields(
      { name: '👤 Gebruiker', value: `<@${message.author.id}> \`${message.author.tag}\``, inline: true },
      { name: '📢 Kanaal',    value: `<#${message.channel.id}>`,                           inline: true },
      { name: '⏰ Verwijderd', value: `<t:${Math.floor(Date.now() / 1000)}:F>`,             inline: false },
    )
    .setColor(0xFF6B6B)
    .setFooter({ text: `Bericht ID: ${message.id}` })
    .setTimestamp();
  if (message.content) embed.setDescription(message.content.slice(0, 4000));
  await logCh.send({ embeds: [embed] }).catch(() => {});
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.author || oldMsg.author.bot) return;
  if (NOLOG_CHANNELS.has(oldMsg.channel.id)) return;
  if (oldMsg.channel.name?.startsWith('\u276Aticket\u276B')) return;
  if (oldMsg.content === newMsg.content) return;
  const logCh = await client.channels.fetch(CHAT_LOG_CHANNEL).catch(() => null);
  if (!logCh) return;
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${oldMsg.author.tag} (${oldMsg.author.id})`, iconURL: oldMsg.author.displayAvatarURL({ dynamic: true }) })
    .setTitle('✏️ Bericht Bewerkt')
    .addFields(
      { name: '👤 Gebruiker', value: `<@${oldMsg.author.id}> \`${oldMsg.author.tag}\``,    inline: true },
      { name: '📢 Kanaal',    value: `<#${oldMsg.channel.id}>`,                             inline: true },
      { name: '🔤 Oud',       value: (oldMsg.content || '*(leeg)*').slice(0, 1024),         inline: false },
      { name: '🔤 Nieuw',     value: (newMsg.content || '*(leeg)*').slice(0, 1024),         inline: false },
      { name: '🔗 Sprong',    value: `[Ga naar bericht](${newMsg.url})`,                   inline: false },
    )
    .setColor(0xFFA500)
    .setFooter({ text: `Bericht ID: ${oldMsg.id}` })
    .setTimestamp();
  await logCh.send({ embeds: [embed] }).catch(() => {});
});

// ----------------------------------------------------------------------------
//  VOICE LOGS — join / leave / move
// ----------------------------------------------------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  const logCh = await client.channels.fetch(VOICE_LOG_CHANNEL).catch(() => null);
  if (!logCh) return;
  const member = newState.member || oldState.member;
  if (!member) return;

  let title, color, fields;

  if (!oldState.channelId && newState.channelId) {
    // Joined
    title = '🔊 Voice Joined';
    color = 0x57F287;
    fields = [
      { name: '👤 Gebruiker', value: `<@${member.id}> \`${member.user.tag}\``,  inline: true },
      { name: '📢 Kanaal',    value: `<#${newState.channelId}>`,                 inline: true },
      { name: '⏰ Tijdstip',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,  inline: false },
    ];
  } else if (oldState.channelId && !newState.channelId) {
    // Left
    title = '🔇 Voice Verlaten';
    color = 0xFF6B6B;
    fields = [
      { name: '👤 Gebruiker', value: `<@${member.id}> \`${member.user.tag}\``,  inline: true },
      { name: '📢 Kanaal',    value: `<#${oldState.channelId}>`,                 inline: true },
      { name: '⏰ Tijdstip',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,  inline: false },
    ];
  } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    // Moved
    title = '↕️ Voice Verplaatst';
    color = 0xFFA500;
    fields = [
      { name: '👤 Gebruiker', value: `<@${member.id}> \`${member.user.tag}\``,   inline: true },
      { name: '🔇 Van',        value: `<#${oldState.channelId}>`,                  inline: true },
      { name: '🔊 Naar',       value: `<#${newState.channelId}>`,                  inline: true },
      { name: '⏰ Tijdstip',   value: `<t:${Math.floor(Date.now() / 1000)}:F>`,   inline: false },
    ];
  } else {
    return; // mute/deafen etc. niet loggen
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setTitle(title)
    .addFields(...fields)
    .setColor(color)
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();
  await logCh.send({ embeds: [embed] }).catch(() => {});

  // -- Voice Security: detecteer mass disconnect door één persoon (voice nuke) -------
  if (secCfg.voiceSecurity?.enabled && oldState.channelId && !newState.channelId) {
    const audit = await oldState.guild.fetchAuditLogs({ type: 74 /* MEMBER_DISCONNECT */, limit: 1 }).catch(() => null);
    const entry = audit?.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000 && entry.executor?.id !== client.user.id) {
      const executorId = entry.executor.id;
      const times = voiceActionTracker.get(executorId) || [];
      times.push(Date.now());
      const windowMs = (secCfg.voiceSecurity.windowSec || 30) * 1000;
      const recent   = times.filter(t => Date.now() - t < windowMs);
      voiceActionTracker.set(executorId, recent);
      if (recent.length >= (secCfg.voiceSecurity.threshold || 5)) {
        voiceActionTracker.delete(executorId);
        const executor = oldState.guild.members.cache.get(executorId);
        if (executor && !executor.permissions.has(PermissionFlagsBits.Administrator)) {
          await executor.ban({ reason: `Voice nuke: ${recent.length} disconnects in ${secCfg.voiceSecurity.windowSec}s` }).catch(() => {});
          addSecurityEvent('voice_nuke', { executorId, username: entry.executor.tag, count: recent.length });
          await securityLog(new EmbedBuilder()
            .setTitle('🚨 Voice Nuke Gedetecteerd — Executor Gebanned!')
            .setColor(0xFF0000)
            .addFields(
              { name: '👤 Executor',    value: `${entry.executor.tag} (\`${executorId}\`)`,           inline: true },
              { name: '🔇 Disconnects', value: `${recent.length} in ${secCfg.voiceSecurity.windowSec}s`, inline: true },
              { name: '⚡ Actie',       value: 'Ban',                                                   inline: true },
            )
            .setFooter({ text: 'Lage Landen RP — Voice Security' }).setTimestamp()
          );
        }
      }
    }
  }
});
// ----------------------------------------------------------------------------

// --- Welkomstberichten (random) -------------------------------------------
const WELCOME_MESSAGES = [
  (m, cnt) => ({
    title: '🏙️ Een nieuwe burger arriveert in De LageLanden!',
    desc:
      `Welkom, <@${m.id}>! 🎉🎊\n\n` +
      `De straten van De LageLanden RP zijn weer wat drukker geworden. ` +
      `Jij bent officieel burger **#${cnt}** van onze server!\n\n` +
      `📜 Lees de regels goed door en maak je klaar voor de meest realistische Nederlandse roleplay.`,
    color: 0x5865F2,
    footer: 'Lage Landen RP — Welkom aan boord!',
  }),
  (m, cnt) => ({
    title: '🚒 Brandweer melding: Nieuwe speler gespot!',
    desc:
      `Alle eenheden, we hebben een nieuwe burger in zicht! Welkom, <@${m.id}>! 🔥\n\n` +
      `Je bent lid **#${cnt}** — maak je klaar voor epische roleplays bij de Politie, Brandweer of Ambulance.\n\n` +
      `📻 Zet je porto klaar en check de kanalen!`,
    color: 0xFF6B35,
    footer: 'Lage Landen RP — 112 Melding: Nieuwe speler!',
  }),
  (m, cnt) => ({
    title: '🚔 10-4, Nieuwe eenheid meldt zich!',
    desc:
      `Centrale, we hebben een nieuwe eenheid op de frequentie. Welkom, <@${m.id}>! 📡\n\n` +
      `Jij bent ons **${cnt}e lid**. Of je nu bij de politie, ambulance of brandweer wil — hier ben je op de juiste plek.\n\n` +
      `📋 Solliciteer via <#1457777956696850603> om aan de slag te gaan!`,
    color: 0x1F6FEB,
    footer: 'Lage Landen RP — Eenheid ingeschreven',
  }),
  (m, cnt) => ({
    title: '🚑 EMS heeft een nieuwe collega!',
    desc:
      `Code 3, rijden maar! Welkom bij De LageLanden RP, <@${m.id}>! 🚑\n\n` +
      `We zijn verheugd om jou als lid **#${cnt}** te verwelkomen. ` +
      `Bij ons draait alles om realistische samenwerking en fun roleplay.\n\n` +
      `> 🇳🇱 *De beste Nederlandse roleplay begint hier.*`,
    color: 0x57F287,
    footer: 'Lage Landen RP — EMS staat klaar!',
  }),
  (m, cnt) => ({
    title: '🏴‍☠️ Welkom in De LageLanden!',
    desc:
      `Hey <@${m.id}>, wat fijn dat je er bij bent! 👋\n\n` +
      `Jij bent lid **#${cnt}** van onze groeiende community. ` +
      `Bekijk de regels, kies je dienst en spring in het diepe.\n\n` +
      `👮 Politie · 🚒 Brandweer · 🚑 Ambulance · 🛡️ KMar — voor elk wat wils!`,
    color: 0xFFA500,
    footer: 'Lage Landen RP — Jij hoort er nu bij!',
  }),
];

const LEAVE_MESSAGES = [
  (m) => `**${m.user.tag}** heeft de server verlaten. Bedankt voor je tijd bij De LageLanden RP. 👋`,
  
  (m) => `**${m.user.tag}** is vertrokken. Tot ziens! 👋😢`,
  
  (m) => `📻 Centrale, **${m.user.tag}** heeft de frequentie verlaten. Veel succes!`,
  (m) => `😢 **${m.user.tag}** heeft ons verlaten. We wensen je het beste. 🙏`,
  
  (m) => `**${m.user.tag}** is afgemeld. Bedankt voor alles! 👋`,
];

client.on('guildMemberAdd', async (member) => {
  // -- Verificatie gate: geef 'onverifiëerd' rol ------------------------------
  if (secCfg.verification?.enabled && secCfg.verification?.unverifiedRoleId) {
    const unverRole = member.guild.roles.cache.get(secCfg.verification.unverifiedRoleId);
    if (unverRole) await member.roles.add(unverRole, 'Verificatie gate: nieuw lid').catch(() => {});
  }

  // -- Username filter / dehoisting bij join ------------------------------
  await applyUsernameFilter(member);

  // ====================================================================
  //  BEVEILIGING — Account Age Gate + Anti-Raid + Alt Detectie
  // ------------------------------------------------------------------------
  const secNow = Date.now();
  const cfg    = secCfg;

  // -- Account Age Gate ----------------------------------------------------
  if (cfg.accountAge.enabled) {
    const ageDays = (secNow - member.user.createdTimestamp) / 86400000;
    if (ageDays < cfg.accountAge.minDays) {
      // Stuur DM
      await member.user.send({ embeds: [
        new EmbedBuilder()
          .setTitle('❌ Toegang Geweigerd — Account Te Nieuw')
          .setDescription(`Je account is nog geen **${cfg.accountAge.minDays} dagen** oud (${ageDays.toFixed(1)} dagen).\nProbeer het later opnieuw.`)
          .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' })
      ]}).catch(() => {});

      if (cfg.accountAge.action === 'ban') {
        await member.ban({ reason: `Account te nieuw: ${ageDays.toFixed(1)} dagen` }).catch(() => {});
      } else {
        await purgeUserMessages(member.guild, member.id).catch(() => {});
        await member.kick(`Account te nieuw: ${ageDays.toFixed(1)} dagen`).catch(() => {});
      }
      addSecurityEvent('account_age_gate', { userId: member.id, username: member.user.tag, ageDays: ageDays.toFixed(1), action: cfg.accountAge.action });
      await securityLog(new EmbedBuilder()
        .setTitle(cfg.accountAge.action === 'ban' ? '🔨 Account Gebanned — Te Nieuw' : '👢 Account Gekickt — Te Nieuw')
        .setColor(0xFF6B6B)
        .addFields(
          { name: '👤 Gebruiker',      value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: '📅 Account leeftijd', value: `${ageDays.toFixed(1)} dagen`,           inline: true },
          { name: '📏 Drempel',         value: `${cfg.accountAge.minDays} dagen`,        inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Account Age Gate' }).setTimestamp()
      );
      return;
    }
  }

  // -- Ban Evasion detectie ----------------------------------------------------
  if (secCfg.banEvasion?.enabled) {
    const ageDays = (secNow - member.user.createdTimestamp) / 86400000;
    if (ageDays < 30) { // Alleen jonge accounts controleren
      const bans = await member.guild.bans.fetch().catch(() => null);
      if (bans) {
        const nameA = member.user.username.toLowerCase();
        for (const [, ban] of bans) {
          const nameB = ban.user.username.toLowerCase();
          if (nameA.length > 3 && levenshtein(nameA, nameB) <= 2) {
            const dist = levenshtein(nameA, nameB);
            await applyQuarantine(member, `Ban evasion suspect: gelijkenis met gebande gebruiker "${ban.user.tag}" (afstand: ${dist})`);
            await securityLog(new EmbedBuilder()
              .setTitle('⚠️ Mogelijke Ban Evasion Gedetecteerd!')
              .setColor(0xFF0000)
              .addFields(
                { name: '👤 Nieuw lid',        value: `${member.user.tag} (\`${member.id}\`)`,   inline: true },
                { name: '⚠️ Lijkt op gebande', value: `${ban.user.tag} (\`${ban.user.id}\`)`,    inline: true },
                { name: '📏 Naamafstand',       value: `${dist} tekens`,                          inline: true },
                { name: '📅 Account leeftijd',  value: `${ageDays.toFixed(1)} dagen`,             inline: true },
                { name: '⚡ Actie',            value: 'Quarantaine',                              inline: true },
              )
              .setFooter({ text: 'Lage Landen RP — Ban Evasion Detectie' }).setTimestamp()
            );
            addSecurityEvent('ban_evasion', { userId: member.id, username: member.user.tag, suspectedBan: ban.user.tag });
            return;
          }
        }
      }
    }
  }

  // -- Gecoördineerde join detectie --------------------------------------------
  if (secCfg.coordJoin?.enabled) {
    const windowMs  = (secCfg.coordJoin.windowMinutes || 30) * 60_000;
    const threshold = secCfg.coordJoin.threshold || 5;
    const createdAt = member.user.createdTimestamp;
    coordJoinTracker.push({ userId: member.id, createdAt, joinedAt: secNow });
    // Verwijder te oude ingangen
    const cutoff = secNow - windowMs;
    while (coordJoinTracker.length > 0 && coordJoinTracker[0].joinedAt < cutoff) coordJoinTracker.shift();
    // Accounts aangemaakt binnen hetzelfde 24u venster die ook recent joinden
    const sameWindow = coordJoinTracker.filter(e =>
      e.userId !== member.id && Math.abs(e.createdAt - createdAt) < 86400_000
    );
    if (sameWindow.length + 1 >= threshold) {
      await applyQuarantine(member, `Gecoördineerde join: ${sameWindow.length + 1} accounts aangemaakt binnen 24u van elkaar joinden tegelijk`);
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Gecoördineerde Join Gedetecteerd!')
        .setColor(0xFF4500)
        .setDescription(`${sameWindow.length + 1} accounts met aanmaakdatum binnen 24u van elkaar joinden recentelijk.`)
        .addFields(
          { name: '👤 Nieuwste lid',         value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: '⚠️ Verdachte accounts',   value: `${sameWindow.length + 1}`,              inline: true },
          { name: '⚡ Actie',               value: 'Quarantaine',                            inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Gecoördineerde Join Detectie' }).setTimestamp()
      );
      addSecurityEvent('coordinated_join', { userId: member.id, username: member.user.tag, count: sameWindow.length + 1 });
    }
  }

  // -- Impersonation detectie (gelijkenis met staffnamen) ---------------------
  if (secCfg.impersonation?.enabled) {
    const staffRole = member.guild.roles.cache.get(STAFF_ROLE_ID);
    if (staffRole) {
      const newName = member.user.username.toLowerCase();
      for (const [, staffMember] of staffRole.members) {
        if (staffMember.id === member.id) continue;
        const staffName = staffMember.user.username.toLowerCase();
        if (newName.length > 3 && levenshtein(newName, staffName) <= 2) {
          const dist = levenshtein(newName, staffName);
          await applyQuarantine(member, `Impersonation: gebruikersnaam lijkt op staff "${staffMember.user.tag}" (afstand: ${dist})`);
          await securityLog(new EmbedBuilder()
            .setTitle('⚠️ Mogelijke Impersonation Gedetecteerd!')
            .setColor(0xAA00FF)
            .addFields(
              { name: '👤 Verdacht lid',   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: '🏴‍☠️ Lijkt op staff', value: `${staffMember.user.tag}`,               inline: true },
              { name: '📏 Naamafstand',     value: `${dist} tekens`,                        inline: true },
              { name: '⚡ Actie',          value: 'Quarantaine',                            inline: true },
            )
            .setFooter({ text: 'Lage Landen RP — Impersonation Detectie' }).setTimestamp()
          );
          addSecurityEvent('impersonation', { userId: member.id, username: member.user.tag, impersonating: staffMember.user.tag });
          return;
        }
      }
    }
  }

  // -- Anti-Raid detectie --------------------------------------------------
  if (cfg.antiRaid.enabled) {
    joinTracker.push({ userId: member.id, timestamp: secNow });
    const windowMs = cfg.antiRaid.joinWindowSec * 1000;
    // Verwijder oude ingangen
    while (joinTracker.length > 0 && secNow - joinTracker[0].timestamp > windowMs) joinTracker.shift();

    if (joinTracker.length >= cfg.antiRaid.joinThreshold) {
      addSecurityEvent('raid_detected', { count: joinTracker.length, windowSec: cfg.antiRaid.joinWindowSec });
      await securityLog(new EmbedBuilder()
        .setTitle('🚨 RAID GEDETECTEERD!')
        .setDescription(`**${joinTracker.length} leden** zijn in **${cfg.antiRaid.joinWindowSec} seconden** gejoined!\nAutomatische actie wordt ondernomen.`)
        .setColor(0xFF0000)
        .addFields(
          { name: '⚡ Actie',          value: cfg.antiRaid.action === 'quarantine' ? '🔒 Quarantaine' : cfg.antiRaid.action === 'kick' ? '👢 Kick' : '🔨 Ban', inline: true },
          { name: '🔒 Auto-lockdown',  value: cfg.antiRaid.autoLockdown ? '✅ Ja' : '❌ Nee', inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Anti-Raid' }).setTimestamp()
      );

      if (cfg.antiRaid.autoLockdown && !secCfg.lockdownActive) {
        await lockdownServer(member.guild, 'Automatisch — Raid gedetecteerd').catch(() => {});
      }

      if (cfg.antiRaid.action === 'quarantine') {
        await applyQuarantine(member, 'Anti-raid systeem: verdacht lid').catch(() => {});
      } else if (cfg.antiRaid.action === 'kick') {
        await purgeUserMessages(member.guild, member.id).catch(() => {});
        await member.kick('Anti-raid systeem').catch(() => {});
      } else if (cfg.antiRaid.action === 'ban') {
        await member.ban({ reason: 'Anti-raid systeem' }).catch(() => {});
      }
      return; // Geen welkomstbericht voor raider
    }
  }

  // -- Alt/verdacht account detectie ---------------------------------------
  if (cfg.altDetection.enabled) {
    const ageDays = (secNow - member.user.createdTimestamp) / 86400000;
    const noAvatar = !member.user.avatar;
    if (ageDays < cfg.altDetection.maxDays && (noAvatar || cfg.altDetection.noAvatarFlag)) {
      suspiciousDB.set(member.id, {
        reason:    `Nieuw account (${ageDays.toFixed(1)} d)${noAvatar ? ', geen avatar' : ''}`,
        flaggedAt: secNow,
        username:  member.user.tag,
      });
      addSecurityEvent('alt_flagged', { userId: member.id, username: member.user.tag, ageDays: ageDays.toFixed(1), noAvatar });
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Verdacht Account Gedetecteerd')
        .setColor(0xFFA500)
        .addFields(
          { name: '👤 Gebruiker',       value: `<@${member.id}> \`${member.user.tag}\``, inline: true  },
          { name: '📅 Account leeftijd', value: `${ageDays.toFixed(1)} dagen`,             inline: true  },
          { name: '🏴‍☠️ Avatar',          value: noAvatar ? '❌ Geen avatar' : '✅ Heeft avatar', inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Alt Detectie' }).setTimestamp()
      );
    }
  }

  // -- Welcome bericht ------------------------------------------------------
  const welcomeCh = await client.channels.fetch(WELCOME_CHANNEL).catch(() => null);
  if (welcomeCh) {
    const pick = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
    const { title, desc, color, footer } = pick(member, member.guild.memberCount);
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(color)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '📅 Account aangemaakt', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '👥 Leden totaal',       value: `${member.guild.memberCount}`,                              inline: true },
      )
      .setFooter({ text: footer, iconURL: member.guild.iconURL({ dynamic: true }) })
      .setTimestamp();
    await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
  }

  // -- Ticket rejoin: zet lid terug in open tickets waar hij in zat ----------
  try {
    await member.guild.channels.fetch().catch(() => {});
    const ticketCatIds = [
      db.channels.ticketSupportCategoryId,
      db.channels.ticketReportCategoryId,
      db.channels.ticketSollicitatieCategoryId,
      db.channels.ticketPartnerCategoryId,
      db.channels.ticketCategoryId,
    ].filter(Boolean);
    const ticketChannels = member.guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText &&
      ticketCatIds.includes(c.parentId) &&
      c.name.startsWith('\u276Aticket\u276B-')
    );
    for (const [, tc] of ticketChannels) {
      const overwrite = tc.permissionOverwrites.cache.get(member.id);
      if (overwrite?.allow.has(PermissionFlagsBits.ViewChannel)) {
        // Permissie was er al (blijft staan na leave), ensure access
        await tc.permissionOverwrites.edit(member.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        }).catch(() => {});
        const rejoinEmbed = new EmbedBuilder()
          .setTitle('🔄 Lid Teruggekomen')
          .setDescription(
            `<@${member.id}> heeft de server verlaten maar is teruggekomen.\n` +
            `Ze zijn automatisch teruggeplaatst in dit ticket.`
          )
          .setColor(0xFFA500)
          .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
          .setTimestamp();
        await tc.send({ content: `<@${member.id}>`, embeds: [rejoinEmbed] }).catch(() => {});
      }
    }
  } catch {}

  // -- Join log --------------------------------------------------------------
  const logCh = await client.channels.fetch(JOIN_LEAVE_CHANNEL).catch(() => null);
  if (!logCh) return;
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setTitle('✅ Lid Joined')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
    .addFields(
      { name: '👤 Gebruiker',       value: `<@${member.id}> \`${member.user.tag}\``,                       inline: true },
      { name: '🪪 User ID',          value: member.id,                                                       inline: true },
      { name: '📅 Account aangemaakt', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` +
        (accountAge < 7 ? ' ⚠️ Nieuw account!' : ''),                                                       inline: false },
      { name: '👥 Leden nu',         value: `${member.guild.memberCount}`,                                   inline: true },
      { name: '⏰ Joined op',         value: `<t:${Math.floor(Date.now() / 1000)}:F>`,                       inline: false },
    )
    .setColor(0x57F287)
    .setFooter({ text: 'Lage Landen RP — Join Log' })
    .setTimestamp();
  await logCh.send({ embeds: [embed] }).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
  // 🛡️ Detecteer als de GUARDIAN BOT gekicked wordt
  if (GUARDIAN_BOT_ID && member.id === GUARDIAN_BOT_ID) {
    const guardianAudit = await member.guild.fetchAuditLogs({ type: 20 /* MemberKick */, limit: 5 }).catch(() => null);
    const guardianEntry = guardianAudit?.entries.find(e => e.target?.id === GUARDIAN_BOT_ID);
    if (guardianEntry) {
      const kicker = guardianEntry.executor;
      addSecurityEvent('guardian_bot_kicked', { executorId: kicker?.id, executorTag: kicker?.tag });
      await securityLog(new EmbedBuilder()
        .setTitle('🚨 NOODALARM — GUARDIAN BOT GEKICKED')
        .setColor(0xFF6B35)
        .setDescription('De Guardian backup bot is gekicked! Main bot treedt op.')
        .addFields(
          { name: '🏴‍☠️ Gekicked door', value: kicker ? `<@${kicker.id}> \`${kicker.tag}\`` : '`Onbekend`', inline: true },
          { name: '⚡ Actie',            value: 'Uitvoerder wordt in quarantaine geplaatst.',              inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Wederzijdse Bescherming' }).setTimestamp()
      );
      if (kicker && kicker.id !== member.guild.ownerId) {
        const kickerMember = member.guild.members.cache.get(kicker.id)
          ?? await member.guild.members.fetch(kicker.id).catch(() => null);
        if (kickerMember) await applyQuarantine(kickerMember, '🚨 Guardian bot gekicked — automatische actie').catch(() => {});
      }
    }
    return; // Guardian bots triggeren geen leave bericht
  }

  // -- Leave bericht ---------------------------------------------------------
  const welcomeCh = await client.channels.fetch(WELCOME_CHANNEL).catch(() => null);
  if (welcomeCh) {
    const pick = LEAVE_MESSAGES[Math.floor(Math.random() * LEAVE_MESSAGES.length)];
    const leaveEmbed = new EmbedBuilder()
      .setDescription(pick(member))
      .setColor(0x99AAB5)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: '👥 Leden nu', value: `${member.guild.memberCount}`, inline: true },
        { name: '⏱️ Gezeten',  value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Onbekend', inline: true },
      )
      .setFooter({ text: 'Lage Landen RP', iconURL: member.guild.iconURL({ dynamic: true }) })
      .setTimestamp();
    await welcomeCh.send({ embeds: [leaveEmbed] }).catch(() => {});
  }

  // -- Leave log -------------------------------------------------------------
  const logCh = await client.channels.fetch(JOIN_LEAVE_CHANNEL).catch(() => null);
  if (!logCh) return;
  const roles = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .map(r => `<@&${r.id}>`).join(', ') || '*Geen*';
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setTitle('👋 Lid Verlaten')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
    .addFields(
      { name: '👤 Gebruiker', value: `${member.user.tag} \`${member.id}\``,                         inline: true },
      { name: '👥 Leden nu',  value: `${member.guild.memberCount}`,                                 inline: true },
      { name: '⏱️ Gezeten',   value: member.joinedTimestamp
        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
        : 'Onbekend',                                                                                inline: false },
      { name: '🏴‍☠️ Rollen',   value: roles.slice(0, 1024),                                          inline: false },
    )
    .setColor(0xFF6B6B)
    .setFooter({ text: `User ID: ${member.id} | Lage Landen RP — Leave Log` })
    .setTimestamp();
  await logCh.send({ embeds: [embed] }).catch(() => {});
});

// ----------------------------------------------------------------------------
//  MOD LOGS — staff acties
// ----------------------------------------------------------------------------
async function modLog(embed) {
  const logCh = await client.channels.fetch(MOD_LOG_CHANNEL).catch(() => null);
  if (logCh) await logCh.send({ embeds: [embed] }).catch(() => {});
}

// Ban
client.on('guildBanAdd', async (ban) => {
  await ban.fetch().catch(() => {});
  const audit = await ban.guild.fetchAuditLogs({ type: 22 /* MemberBanAdd */, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  const executor = entry?.executor;
  const reason   = entry?.reason || ban.reason || '*Geen reden opgegeven*';

  // ⚠️ Detecteer poging om de BOT te bannen
  if (ban.user.id === client.user.id) {
    addSecurityEvent('bot_ban_attempt', { executorId: executor?.id, executorTag: executor?.tag });
    // Bot is gebanned — stuur noodmelding via webhook als die beschikbaar is
    const webhookUrl = process.env.EMERGENCY_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `🚨 **NOODALARM** — De bot is gebanned van de server!\n**Door:** ${executor ? `${executor.tag} (${executor.id})` : 'Onbekend'}\n**Reden:** ${reason}\nHerstel de bot zo snel mogelijk!` }),
      }).catch(() => {});
    }
    return;
  }

  // 🛡️ Detecteer als de GUARDIAN BOT gebanned wordt
  if (GUARDIAN_BOT_ID && ban.user.id === GUARDIAN_BOT_ID) {
    addSecurityEvent('guardian_bot_banned', { executorId: executor?.id, executorTag: executor?.tag, reason });
    await securityLog(new EmbedBuilder()
      .setTitle('🚨 NOODALARM — GUARDIAN BOT GEBANNED')
      .setColor(0xFF4757)
      .setDescription('De Guardian backup bot is van de server geband! Main bot treedt op.')
      .addFields(
        { name: '🏴‍☠️ Gebanned door', value: executor ? `<@${executor.id}> \`${executor.tag}\`` : '`Onbekend`', inline: true },
        { name: '📝 Reden',           value: reason,                                                                inline: false },
        { name: '⚡ Actie',           value: 'Uitvoerder wordt in quarantaine geplaatst + unban poging',           inline: false },
      )
      .setFooter({ text: 'Lage Landen RP — Wederzijdse Bescherming' }).setTimestamp()
    );
    // Uitvoerder in quarantaine (tenzij serverowner)
    if (executor && executor.id !== ban.guild.ownerId) {
      const execMember = ban.guild.members.cache.get(executor.id)
        ?? await ban.guild.members.fetch(executor.id).catch(() => null);
      if (execMember) await applyQuarantine(execMember, '🚨 Guardian bot gebanned — automatische actie').catch(() => {});
    }
    // Probeer guardian bot te unbannen
    const guardianUnbanned = await ban.guild.members.unban(GUARDIAN_BOT_ID, 'Main bot: automatische unban van guardian bot').catch(() => null);
    await securityLog(new EmbedBuilder()
      .setTitle(guardianUnbanned ? '✅ Guardian Bot Geunbanned' : '⚠️ Guardian Unban Mislukt')
      .setColor(guardianUnbanned ? 0x57F287 : 0xFF6B35)
      .setDescription(guardianUnbanned
        ? 'De Guardian bot is automatisch terug toegevoegd.'
        : 'Handmatige actie vereist — voeg de guardian bot opnieuw toe.')
      .setFooter({ text: 'Lage Landen RP — Main Bot' }).setTimestamp()
    );
    return;
  }

  await modLog(new EmbedBuilder()
    .setTitle('🔨 Lid Gebanned')
    .setColor(0xFF0000)
    .addFields(
      { name: '👤 Gebruiker',   value: `${ban.user.tag} (\`${ban.user.id}\`)`,                     inline: true },
      { name: '🏴‍☠️ Door',        value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
      { name: '📝 Reden',        value: reason.slice(0, 1024),                                      inline: false },
    ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
  );
});

// Unban
client.on('guildBanRemove', async (ban) => {
  const audit = await ban.guild.fetchAuditLogs({ type: 23 /* MemberBanRemove */, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  const executor = entry?.executor;
  await modLog(new EmbedBuilder()
    .setTitle('✅ Lid Gebanned Ongedaan')
    .setColor(0x57F287)
    .addFields(
      { name: '👤 Gebruiker', value: `${ban.user.tag} (\`${ban.user.id}\`)`,                     inline: true },
      { name: '🏴‍☠️ Door',      value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
    ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
  );
});

// Kick / Timeout / Rol wijziging
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;

  // Timeout gegeven
  if ((!oldTimeout || oldTimeout <= Date.now()) && newTimeout && newTimeout > Date.now()) {
    const audit = await newMember.guild.fetchAuditLogs({ type: 24 /* MemberUpdate */, limit: 1 }).catch(() => null);
    const entry = audit?.entries.first();
    const executor = entry?.executor;
    const reason   = entry?.reason || '*Geen reden opgegeven*';
    await modLog(new EmbedBuilder()
      .setTitle('⏱️ Lid Getimeouted')
      .setColor(0xFFA500)
      .addFields(
        { name: '👤 Gebruiker',  value: `<@${newMember.id}> \`${newMember.user.tag}\``,           inline: true },
        { name: '🏴‍☠️ Door',       value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
        { name: '⏰ Tot',         value: `<t:${Math.floor(newTimeout / 1000)}:F>`,                 inline: false },
        { name: '📝 Reden',       value: reason.slice(0, 1024),                                    inline: false },
      ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
    );
    return;
  }

  // Timeout verwijderd
  if (oldTimeout && oldTimeout > Date.now() && (!newTimeout || newTimeout <= Date.now())) {
    const audit = await newMember.guild.fetchAuditLogs({ type: 24 /* MemberUpdate */, limit: 1 }).catch(() => null);
    const entry = audit?.entries.first();
    const executor = entry?.executor;
    await modLog(new EmbedBuilder()
      .setTitle('✅ Timeout Verwijderd')
      .setColor(0x57F287)
      .addFields(
        { name: '👤 Gebruiker', value: `<@${newMember.id}> \`${newMember.user.tag}\``,              inline: true },
        { name: '🏴‍☠️ Door',      value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
      ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
    );
    return;
  }

  // Rol gegeven
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (!addedRoles.size && !removedRoles.size) return;

  const audit = await newMember.guild.fetchAuditLogs({ type: 25 /* MemberRoleUpdate */, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  const executor = entry?.executor;

  // ⚠️ Perm escalatie detectie — gevaarlijke rol toegevoegd
  const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
  ];
  for (const role of addedRoles.values()) {
    const hasDangerousPerm = DANGEROUS_PERMS.some(p => role.permissions.has(p));
    if (!hasDangerousPerm) continue;

    // Controleer of de executor geautoriseerd is (owner of heeft zelf admin)
    const executorMember = executor ? newMember.guild.members.cache.get(executor.id) : null;
    const executorIsOwner = executor?.id === newMember.guild.ownerId;
    const executorIsAdmin = executorMember?.permissions.has(PermissionFlagsBits.Administrator);
    // Als de executor géén admin/owner is — dat is verdacht
    if (!executorIsOwner && !executorIsAdmin) {
      addSecurityEvent('perm_escalation', { targetId: newMember.id, targetTag: newMember.user.tag, roleId: role.id, roleName: role.name, executorId: executor?.id, executorTag: executor?.tag });
      await securityLog(new EmbedBuilder()
        .setTitle('🚨 PERM ESCALATIE — Gevaarlijke Rol Toegewezen!')
        .setColor(0xFF0000)
        .setDescription('Een gebruiker zonder admin-rechten heeft een gevaarlijke rol toegewezen!')
        .addFields(
          { name: '👤 Ontvanger',   value: `<@${newMember.id}> \`${newMember.user.tag}\``,                inline: true },
          { name: '🏴‍☠️ Uitgevoerd door', value: executor ? `<@${executor.id}> \`${executor.tag}\`` : 'Onbekend', inline: true },
          { name: '⚠️ Gevaarlijke Rol',  value: `<@&${role.id}> \`${role.name}\``,                inline: false },
          { name: '⚡ Actie',          value: 'Rol automatisch verwijderd + uitvoerder in quarantaine gezet', inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Perm Escalatie Detectie' }).setTimestamp()
      );
      // Verwijder de gevaarlijke rol direct
      await newMember.roles.remove(role, 'Automatisch — ongeautoriseerde perm escalatie').catch(() => {});
      // Zet de uitvoerder in quarantaine
      if (executorMember) await applyQuarantine(executorMember, '🚨 Ongeautoriseerde perm escalatie gedetecteerd').catch(() => {});
    } else {
      // Geautoriseerd maar toch gevaarlijk — alleen loggen in security log
      await securityLog(new EmbedBuilder()
        .setTitle('⚠️ Hoge Rechten Rol Toegewezen')
        .setColor(0xFF6B35)
        .addFields(
          { name: '👤 Ontvanger',   value: `<@${newMember.id}> \`${newMember.user.tag}\``,                inline: true },
          { name: '🏴‍☠️ Door',          value: executor ? `<@${executor.id}> \`${executor.tag}\`` : 'Onbekend', inline: true },
          { name: '⚠️ Rol',           value: `<@&${role.id}> \`${role.name}\``,                          inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Perm Monitor' }).setTimestamp()
      );
    }
  }

  const fields = [
    { name: '👤 Gebruiker', value: `<@${newMember.id}> \`${newMember.user.tag}\``,              inline: true },
    { name: '🏴‍☠️ Door',      value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
  ];
  if (addedRoles.size)   fields.push({ name: '✅ Rol Gegeven',    value: addedRoles.map(r => `<@&${r.id}>`).join(', '),   inline: false });
  if (removedRoles.size) fields.push({ name: '❌ Rol Verwijderd', value: removedRoles.map(r => `<@&${r.id}>`).join(', '), inline: false });

  await modLog(new EmbedBuilder()
    .setTitle('🏴‍☠️ Rollen Gewijzigd')
    .setColor(0x5865F2)
    .addFields(...fields)
    .setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
  );
});

// Nickname wijziging
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.nickname === newMember.nickname) return;
  // Only log if a staff action (not self) — check audit log
  const audit = await newMember.guild.fetchAuditLogs({ type: 24 /* MemberUpdate */, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry || entry.target?.id !== newMember.id) return;
  const executor = entry?.executor;
  if (executor?.id === newMember.id) return; // zelf gewijzigd, niet loggen
  await modLog(new EmbedBuilder()
    .setTitle('✏️ Nickname Gewijzigd')
    .setColor(0x99AAB5)
    .addFields(
      { name: '👤 Gebruiker', value: `<@${newMember.id}> \`${newMember.user.tag}\``,              inline: true },
      { name: '🏴‍☠️ Door',      value: executor ? `${executor.tag} (\`${executor.id}\`)` : 'Onbekend', inline: true },
      { name: '🔤 Oud',        value: oldMember.nickname || '*Geen*',                               inline: true },
      { name: '🔤 Nieuw',      value: newMember.nickname || '*Geen*',                               inline: true },
    ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
  );
});

// ----------------------------------------------------------------------------
//  ROLE UPDATE — detecteer als Administrator/ManageGuild op een rol gezet wordt
// ----------------------------------------------------------------------------
client.on('roleUpdate', async (oldRole, newRole) => {
  if (!newRole.guild) return;
  const adminAdded  = !oldRole.permissions.has(PermissionFlagsBits.Administrator) && newRole.permissions.has(PermissionFlagsBits.Administrator);
  const manageAdded = !oldRole.permissions.has(PermissionFlagsBits.ManageGuild)   && newRole.permissions.has(PermissionFlagsBits.ManageGuild);
  if (!adminAdded && !manageAdded) return;

  const audit = await newRole.guild.fetchAuditLogs({ type: 31 /* RoleUpdate */, limit: 1 }).catch(() => null);
  const executor = audit?.entries.first()?.executor;
  const executorMember = executor ? newRole.guild.members.cache.get(executor.id) ?? await newRole.guild.members.fetch(executor.id).catch(() => null) : null;
  const executorIsOwner = executor?.id === newRole.guild.ownerId;
  const executorIsAdmin = executorMember?.permissions.has(PermissionFlagsBits.Administrator);

  addSecurityEvent('role_perm_escalation', { roleId: newRole.id, roleName: newRole.name, adminAdded, manageAdded, executorId: executor?.id, executorTag: executor?.tag });

  await securityLog(new EmbedBuilder()
    .setTitle('🚨 ROL BEWERKT — Gevaarlijke Perm Toegevoegd!')
    .setColor(0xFF0000)
    .setDescription(adminAdded ? '**Administrator** is aan een rol toegevoegd!' : '**ManageGuild** is aan een rol toegevoegd!')
    .addFields(
      { name: '📌 Rol',         value: `<@&${newRole.id}> \`${newRole.name}\``,                         inline: true },
      { name: '🏴‍☠️ Door',        value: executor ? `<@${executor.id}> \`${executor.tag}\`` : 'Onbekend', inline: true },
      { name: '⚡ Perm',         value: [adminAdded ? '✅ Administrator' : null, manageAdded ? '✅ ManageGuild' : null].filter(Boolean).join('\n'), inline: false },
      { name: '🔧 Actie',       value: (!executorIsOwner && !executorIsAdmin) ? 'Perm automatisch gestript + uitvoerder in quarantaine' : '⚠️ Alleen gelogd (geautoriseerde gebruiker)', inline: false },
    )
    .setFooter({ text: 'Lage Landen RP — Rol Beveiliging' }).setTimestamp()
  );

  if (!executorIsOwner && !executorIsAdmin) {
    const stripped = newRole.permissions.remove([PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild]);
    await newRole.setPermissions(stripped, 'Automatisch — ongeautoriseerde perm escalatie').catch(() => {});
    if (executorMember) await applyQuarantine(executorMember, '🚨 Ongeautoriseerde rol-perm escalatie').catch(() => {});
  }
});

// ----------------------------------------------------------------------------
//  NITRO BOOST — detectie & beloningen
// ----------------------------------------------------------------------------
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Alleen nieuwe boosts detecteren (was niet geboosted, is nu geboosted)
  if (oldMember.premiumSince || !newMember.premiumSince) return;

  // DM sturen
  try {
    await newMember.send({ embeds: [new EmbedBuilder()
      .setTitle('🚀 Bedankt voor het boosten!')
      .setDescription(
        `Wauw <@${newMember.id}>, wat geweldig! 💜\n\n` +
        `Bedankt voor het boosten van **${newMember.guild.name}**!\n\n` +
        `Als dank krijg je speciale booster voordelen. Check de server voor meer info!`
      )
      .setColor(0xFF73FA)
      .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Lage Landen RP — Nitro Boost' }).setTimestamp()
    ]});
  } catch { /* DMs uitgeschakeld */ }

  // Log in join-leave kanaal
  const logCh = await client.channels.fetch(JOIN_LEAVE_CHANNEL).catch(() => null);
  if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
    .setTitle('🚀 Server Boost!')
    .setDescription(`<@${newMember.id}> heeft de server geboost! 💜\n\nBedankt **${newMember.user.tag}**!`)
    .setColor(0xFF73FA)
    .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
  ]}).catch(() => {});

  // Optionele booster rol (stel BOOSTER_ROLE_ID in als omgevingsvariabele)
  const rewardRoleId = process.env.BOOSTER_ROLE_ID;
  if (rewardRoleId) {
    const role = newMember.guild.roles.cache.get(rewardRoleId);
    if (role) await newMember.roles.add(role, 'Nitro Booster beloning').catch(() => {});
  }
});

// ----------------------------------------------------------------------------
//  BLACKLIST — berichten verwerken
// ----------------------------------------------------------------------------
// --- Ticket activiteit bijhouden voor auto-close ----------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.channel.name?.startsWith('\u276Aticket\u276B-')) {
    ticketLastActivity.set(message.channel.id, Date.now());
    // Reset close-warning als er weer activiteit is
    if (ticketCloseWarned.has(message.channel.id)) {
      ticketCloseWarned.delete(message.channel.id);
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setDescription('✅ Auto-close geannuleerd — ticket is weer actief.')
          .setColor(0x57F287)]
      }).catch(() => {});
    }
  }
});

// --- Partner ticket begroeting (eenmalig bij eerste hallo/hoi/etc.) ----------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Alleen in partner ticket kanalen (naam: ❪ticket❫-partner-...)
  const chanName = message.channel.name || '';
  if (!chanName.startsWith('\u276Aticket\u276B-partner-')) return;

  // Alleen als er nog geen begroeting is gestuurd in dit kanaal
  if (partnerTicketGreeted.has(message.channel.id)) return;

  // Detecteer begroeting
  const begroetingen = /^\s*(hoi|hallo|hai|hey|hi|hee|dag|goedemorgen|goedemiddag|goedemidag|goedenavond|yo|sup|helo|hello)\s*[!.,]?\s*$/i;
  if (!begroetingen.test(message.content)) return;

  partnerTicketGreeted.add(message.channel.id);

  await message.channel.send(
    `👋 Welkom in het partner ticket, <@${message.author.id}>!\n\n` +
    `Hierboven zie je een embed met onze **partner eisen** — lees deze even goed door. ` +
    `Als je akkoord gaat, klik dan op het ✅ vinkje in de embed.\n\n` +
    `> 📋 Zodra je de eisen hebt doorgelezen en akkoord bent, druk je op de knop **📨 Stuur Partner Bericht** om je aanvraag in te vullen.\n` +
    `> ⚠️ Houd er rekening mee: door op die knop te drukken ga je automatisch akkoord met alle partner eisen.\n\n` +
    `Je bericht wordt daarna zo snel mogelijk beoordeeld door ons staff team. 🙏`
  ).catch(() => {});
});

// --- Blacklist kanaal — binnenkomende berichten verwerken -------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== BLACKLIST_CHANNEL_ID) return;

  try {
    let lines = message.content.split('\n').map(l => l.trim());
    if (lines.length === 1 && lines[0].includes(',')) lines = lines[0].split(',').map(s => s.trim());
    lines = lines.filter(l => l.length > 0);
    if (!lines.length) return;

    const existing  = await message.channel.messages.fetch({ limit: 100 });
    const existingSet = new Set(
      existing.filter(m => m.content && m.author.id === client.user.id)
              .map(m => m.content.trim().toLowerCase())
    );

    const added = [], dupes = [], errors = [];
    for (const name of lines) {
      const lower = name.toLowerCase();
      if (existingSet.has(lower)) { dupes.push(name); continue; }
      try { await message.channel.send(name); existingSet.add(lower); added.push(name); }
      catch { errors.push(name); }
    }

    await message.delete().catch(() => {});
    const total = (await message.channel.messages.fetch({ limit: 100 }))
      .filter(m => m.content && m.author.id === client.user.id).size;

    const embed = new EmbedBuilder().setTimestamp().setFooter({ text: `Totaal: ${total} servers op blacklist` });
    if (added.length) {
      embed.setTitle(`✅ ${added.length} Server${added.length > 1 ? 's' : ''} Toegevoegd`)
           .setColor(0x00FF00)
           .setDescription(added.map((s, i) => `${i + 1}. **${s}**`).join('\n'));
    } else if (dupes.length) {
      embed.setTitle('⚠️ Duplicaten Gedetecteerd').setColor(0xFFA500)
           .setDescription(dupes.length === 1
             ? `**${dupes[0]}** staat al op de blacklist!`
             : dupes.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    } else {
      embed.setTitle('❌ Fout bij Toevoegen').setColor(0xFF0000).setDescription(errors.join(', '));
    }
    if (added.length && dupes.length)
      embed.addFields({ name: '⚠️ Duplicaten (overgeslagen)', value: dupes.map((s, i) => `${i + 1}. ${s}`).join('\n'), inline: false });

    await message.channel.send({ embeds: [embed] });
  } catch (e) { console.error('❌ Blacklist fout:', e); }
});

// ----------------------------------------------------------------------------
//  INTERACTIONS
// ----------------------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {

  // --- /blacklist-check ----------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'blacklist-check') {
    const zoek = interaction.options.getString('naam').toLowerCase();
    await safeDefer(interaction, { flags: 64 });
    if (!interaction.deferred && !interaction.replied) return;
    const ch   = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
    if (!ch) return interaction.editReply('❌ Blacklistkanaal niet gevonden.');
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    const hits  = msgs
      ? msgs.filter(m => m.content && m.content.toLowerCase().includes(zoek)).map(m => m.content.trim()).slice(0, 20)
      : [];
    if (!hits.length) {
      return interaction.editReply({ embeds: [
        new EmbedBuilder().setTitle('✅ Niet op Blacklist')
          .setDescription(`Geen servers gevonden die **${zoek}** bevatten.`)
          .setColor(0x57F287).setFooter({ text: 'Lage Landen RP — Blacklist Manager' })
      ]});
    }
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(`🚫 Blacklist — ${hits.length} resultaat${hits.length > 1 ? 'en' : ''}`)
        .setDescription(hits.map((s, i) => `${i + 1}. **${s}**`).join('\n'))
        .setColor(0xFF6B6B).setFooter({ text: `Gezocht op: "${zoek}" | Lage Landen RP` })
    ]});
  }

  // --- /stats --------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'stats') {
    await safeDefer(interaction, {});
    if (!interaction.deferred && !interaction.replied) return;
    const ch   = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
    const msgs  = ch ? await ch.messages.fetch({ limit: 100 }).catch(() => null) : null;
    const blCnt = msgs ? msgs.filter(m => m.content && m.content.trim()).size : '?';
    const pCnt  = Object.keys(db.partners).length;
    const up    = Math.floor((Date.now() - BOT_START_TIME) / 1000);
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = up % 60;
    const guild = client.guilds.cache.first();
    const memberCount = guild ? guild.memberCount : '?';
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setTitle('📊 Statistieken — Lage Landen RP')
        .addFields(
          { name: '👥 Totaal Leden',         value: `${memberCount}`,                    inline: true },
          { name: '🚫 Blacklisted Servers', value: `${blCnt}`,                           inline: true },
          { name: '🤝 Actieve Partners',     value: `${pCnt}`,                           inline: true },
          { name: '📡 Latency',              value: `${client.ws.ping}ms`,               inline: true },
          { name: '⏱️ Uptime',              value: `${h}u ${m}m ${s}s`,                inline: true },
          { name: '🕐 Online sinds',         value: `<t:${Math.floor(BOT_START_TIME/1000)}:F>`, inline: true }
        )
        .setColor(0x5865F2).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    ]});
  }

  // --- /partnerlijst --------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'partnerlijst') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const partners = Object.values(db.partners);
    if (!partners.length)
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('🤝 Actieve Partners').setDescription('Geen actieve partners.').setColor(0xFFA500)
      ], flags: 64 });
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle(`🤝 Actieve Partners — ${partners.length} totaal`)
        .setDescription(partners.map((p, i) => {
          const who = p.staffPlaced
            ? `**${p.serverName}** *(staff geplaatst)*`
            : `<@${p.userId}> — **${p.serverName}**`;
          return `**${i + 1}.** ${who}\n` +
            `🔗 [Bericht](https://discord.com/channels/${interaction.guildId}/${PARTNER_CHANNEL_ID}/${p.messageId}) • <t:${Math.floor(p.approvedAt / 1000)}:D>`;
        }).join('\n\n'))
        .setColor(0x5865F2).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    ], flags: 64 });
  }

  // --- /partnerverwijder ----------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'partnerverwijder') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const target = interaction.options.getUser('gebruiker');
    await safeDefer(interaction, { flags: 64 });
    if (!interaction.deferred && !interaction.replied) return;
    const partner = db.partners[target.id];
    if (!partner) return interaction.editReply(`⚠️ Geen actief partnerschap voor <@${target.id}>.`);

    try {
      const ch  = await client.channels.fetch(PARTNER_CHANNEL_ID);
      const msg = await ch.messages.fetch(partner.messageId);
      await msg.delete();
    } catch { /* bericht al weg */ }

    delete db.partners[target.id];
    saveData(db);
    await updatePartnersEmbed(interaction.guild);

    try {
      const u  = await client.users.fetch(target.id);
      const dm = await u.createDM();
      await dm.send({ embeds: [
        new EmbedBuilder().setTitle('😔 Partnerschap Beëindigd')
          .setDescription('Jouw partnerschap met **Lage Landen RP** is beëindigd door een stafflid.\n\nHeb je vragen? Neem contact op met het staff team.')
          .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
      ]});
    } catch {
      const logCh = await client.channels.fetch(db.channels.reviewChannelId).catch(() => null);
      if (logCh) await logCh.send(`⚠️ DM mislukt — **${target.tag}** heeft DMs uitgeschakeld.`);
    }

    const logCh = await client.channels.fetch(db.channels.reviewChannelId).catch(() => null);
    if (logCh) await logCh.send({ embeds: [
      new EmbedBuilder().setTitle('🏴‍☠️ Partnerschap Beëindigd — Handmatig')
        .addFields(
          { name: '🤝 Partner', value: `${target.tag} (<@${target.id}>)`, inline: true },
          { name: '🏴‍☠️ Door',   value: interaction.user.tag,               inline: true },
          { name: '⏰ Tijdstip', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false }
        )
        .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    ]});

    return interaction.editReply(`✅ Partnerschap van <@${target.id}> beëindigd.`);
  }

  // -------------------------------------------------------------------------
  // BEVEILIGING COMMANDS
  // -------------------------------------------------------------------------

  // --- /lockdown ------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'lockdown') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    if (secCfg.lockdownActive)
      return interaction.reply({ content: '⚠️ Server is al in lockdown. Gebruik `/unlockdown` om op te heffen.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    const reden = interaction.options.getString('reden') || `Handmatig door ${interaction.user.tag}`;
    await lockdownServer(interaction.guild, reden);
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle('🔒 Server Lockdown Geactiveerd')
        .setDescription(`Alle kanalen zijn nu **read-only**.\nGebruik \`/unlockdown\` om op te heffen.\n\n📌 Reden: ${reden}`)
        .setColor(0xFF0000).setTimestamp()
    ]});
  }

  // --- /unlockdown ----------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'unlockdown') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    if (!secCfg.lockdownActive)
      return interaction.reply({ content: '⚠️ Er is geen actieve lockdown.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    const reden = interaction.options.getString('reden') || `Handmatig door ${interaction.user.tag}`;
    await unlockdownServer(interaction.guild, reden);
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle('✅ Server Lockdown Opgeheven')
        .setDescription(`Alle kanalen zijn hersteld.\n\n📌 Reden: ${reden}`)
        .setColor(0x57F287).setTimestamp()
    ]});
  }

  // --- /quarantaine ---------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'quarantaine') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const target = interaction.options.getMember('gebruiker');
    if (!target) return interaction.reply({ content: '❌ Gebruiker niet gevonden.', flags: 64 });
    if (hasRoleOrHigher(target, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je kunt geen staffleden in quarantaine plaatsen.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    const reden = interaction.options.getString('reden') || `Handmatig door ${interaction.user.tag}`;
    const ok = await applyQuarantine(target, reden);
    return interaction.editReply(ok
      ? `✅ <@${target.id}> is in quarantaine geplaatst. Reden: ${reden}`
      : '❌ Quarantaine mislukt. Controleer de bot-rechten.'
    );
  }

  // --- /quarantaine-ophef ---------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'quarantaine-ophef') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const target = interaction.options.getUser('gebruiker');
    await safeDefer(interaction, { flags: 64 });
    const ok = await removeQuarantineUser(interaction.guild, target.id);
    if (!ok) return interaction.editReply(`⚠️ <@${target.id}> staat niet in quarantaine.`);
    await securityLog(new EmbedBuilder()
      .setTitle('✅ Quarantaine Opgeheven')
      .setColor(0x57F287)
      .addFields(
        { name: '👤 Gebruiker',  value: `${target.tag} (\`${target.id}\`)`,           inline: true },
        { name: '🏴‍☠️ Door',      value: `${interaction.user.tag}`,                     inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Beveiliging' }).setTimestamp()
    );
    return interaction.editReply(`✅ Quarantaine opgeheven voor <@${target.id}>. Rollen hersteld.`);
  }

  // --- /quarantaine-alles-ophef ---------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'quarantaine-alles-ophef') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    const ids = Object.keys(quarantineDB);
    if (!ids.length) return interaction.editReply('✅ Er zijn geen gebruikers in quarantaine.');
    let count = 0;
    for (const uid of ids) {
      const ok = await removeQuarantineUser(interaction.guild, uid);
      if (ok) count++;
    }
    await securityLog(new EmbedBuilder()
      .setTitle('✅ Alle Quarantaines Opgeheven')
      .setColor(0x57F287)
      .addFields(
        { name: '👥 Aantal',  value: `${count} gebruikers`, inline: true },
        { name: '🏴‍☠️ Door',   value: interaction.user.tag,   inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Beveiliging' }).setTimestamp()
    );
    return interaction.editReply(`✅ **${count}** gebruiker(s) uit quarantaine gehaald. Rollen hersteld.`);
  }

  // --- /quarantaine-lijst ---------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'quarantaine-lijst') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const list = Object.values(quarantineDB);
    if (!list.length)
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('🔒 Quarantaine Lijst').setDescription('✅ Geen gebruikers in quarantaine.').setColor(0x57F287)
      ], flags: 64 });
    const desc = list.map((q, i) =>
      `**${i + 1}.** <@${q.userId}> \`${q.username}\`\n? Reden: ${q.reason} • <t:${Math.floor(q.quarantinedAt / 1000)}:R>`
    ).join('\n\n');
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle(`🔒 Quarantaine Lijst — ${list.length} gebruiker(s)`)
        .setDescription(desc.slice(0, 4000))
        .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP — Beveiliging' }).setTimestamp()
    ], flags: 64 });
  }

  // --- /verdacht ------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'verdacht') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const list = [...suspiciousDB.values()].sort((a, b) => b.flaggedAt - a.flaggedAt).slice(0, 20);
    if (!list.length)
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('🏴‍☠️ Verdachte Accounts')  .setDescription('✅ Geen verdachte accounts gedetecteerd.').setColor(0x57F287)
      ], flags: 64 });
    const desc = list.map((s, i) =>
      `**${i + 1}.** <@${s.userId || '?'}> \`${s.username}\`\n? ${s.reason} • <t:${Math.floor(s.flaggedAt / 1000)}:R>`
    ).join('\n\n');
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle(`⚠️ Verdachte Accounts — ${list.length}`)
        .setDescription(desc.slice(0, 4000))
        .setColor(0xFFA500).setFooter({ text: 'Lage Landen RP — Beveiliging' }).setTimestamp()
    ], flags: 64 });
  }

  // --- /security-status -----------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'security-status') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const cfg = secCfg;
    const bool = v => v ? '✅ Aan' : '❌ Uit';
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🏴‍☠️ Beveiligingsstatus — Lage Landen RP')
        .addFields(
          { name: '🔒 Lockdown',            value: cfg.lockdownActive ? '🔒 ACTIEF' : '✅ Inactief',                              inline: true  },
          { name: '🏴‍☠️ Anti-Raid',           value: `${bool(cfg.antiRaid.enabled)}\nDrempel: ${cfg.antiRaid.joinThreshold} joins/${cfg.antiRaid.joinWindowSec}s\nActie: ${cfg.antiRaid.action}`, inline: true },
          { name: '📅 Account Age Gate',    value: `${bool(cfg.accountAge.enabled)}\nMin: ${cfg.accountAge.minDays} dagen\nActie: ${cfg.accountAge.action}`,           inline: true },
          { name: '💬 Anti-Spam',           value: `${bool(cfg.antiSpam.enabled)}\nDrempel: ${cfg.antiSpam.msgThreshold} berichten/${cfg.antiSpam.windowSec}s\nActie: ${cfg.antiSpam.action}`, inline: true },
          { name: '🔗 Anti-Invite',         value: bool(cfg.antiInvite.enabled),                                                   inline: true  },
          { name: '⚠️ Alt Detectie',        value: `${bool(cfg.altDetection.enabled)}\nVlag bij < ${cfg.altDetection.maxDays} dagen`,                                 inline: true  },
          { name: '🪝 Webhook Bescherming', value: bool(cfg.webhookProtection.enabled),                                            inline: true  },
          { name: '🔒 Quarantaine',         value: `${Object.keys(quarantineDB).length} gebruikers`,                               inline: true  },
          { name: '🏴‍☠️ Verdachten',          value: `${suspiciousDB.size} accounts`,                                                inline: true  },
          { name: '🔒 Auto-Lockdown',       value: bool(cfg.antiRaid.autoLockdown),                                                inline: true  },
        )
        .setColor(0x5865F2).setFooter({ text: 'Lage Landen RP — Beveiliging' }).setTimestamp()
    ], flags: 64 });
  }

  // --- /audit ---------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'audit') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Alleen administrators.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    const DANGER_PERMS = [
      { flag: PermissionFlagsBits.Administrator,        label: '👑 Administrator',              level: '🔴 KRITIEK' },
      { flag: PermissionFlagsBits.ManageGuild,          label: '⚙️ Server Beheren',              level: '🟠 HOOG'   },
      { flag: PermissionFlagsBits.ManageRoles,          label: '🎭 Rollen Beheren',            level: '🟠 HOOG'   },
      { flag: PermissionFlagsBits.BanMembers,           label: '🔨 Leden Bannen',               level: '🟡 MIDDEL'  },
      { flag: PermissionFlagsBits.KickMembers,          label: '👢 Leden Kicken',               level: '🟡 MIDDEL'  },
      { flag: PermissionFlagsBits.ManageChannels,       label: '📢 Kanalen Beheren',            level: '🟡 MIDDEL'  },
      { flag: PermissionFlagsBits.ManageWebhooks,       label: '🪝 Webhooks Beheren',           level: '🟡 MIDDEL'  },
      { flag: PermissionFlagsBits.ManageMessages,       label: '🏴‍☠️ Berichten Beheren',        level: '🔵 LAAG'    },
      { flag: PermissionFlagsBits.MentionEveryone,      label: '📣 @everyone Pingen',           level: '🔵 LAAG'    },
      { flag: PermissionFlagsBits.ManageNicknames,      label: '✏️ Nicknames Beheren',          level: '🔵 LAAG'    },
      { flag: PermissionFlagsBits.ViewAuditLog,         label: '🔍 Auditlog Bekijken',           level: '⚪ INFO'    },
      { flag: PermissionFlagsBits.ModerateMembers,      label: '⏱️ Leden Timeoutten',           level: '🔵 LAAG'    },
    ];
    const roles = [...interaction.guild.roles.cache.values()]
      .filter(r => !r.managed && r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position);
    const lines = [];
    for (const role of roles) {
      const found = DANGER_PERMS.filter(p => role.permissions.has(p.flag));
      if (found.length === 0) continue;
      const tags = found.map(p => `${p.level} ${p.label}`).join(', ');
      lines.push(`**${role.name}** (${role.members.size} leden)\n ${tags}`);
    }
    if (lines.length === 0)
      return interaction.editReply({ embeds: [
        new EmbedBuilder().setTitle('🔍 Permissie Audit').setDescription('✅ Geen gevaarlijke permissies gevonden.').setColor(0x57F287)
      ]});
    const chunks = [];
    let buf = '';
    for (const line of lines) {
      if (buf.length + line.length > 3800) { chunks.push(buf); buf = ''; }
      buf += line + '\n\n';
    }
    if (buf) chunks.push(buf);
    const embeds = chunks.map((chunk, i) => new EmbedBuilder()
      .setTitle(i === 0 ? `🔍 Permissie Audit — ${interaction.guild.name}` : 'Permissie Audit (vervolg)')
      .setDescription(chunk.trim())
      .setColor(0xFFA502)
      .setFooter({ text: 'Controleer de rollen met KRITIEK status als eerste' })
    );
    return interaction.editReply({ embeds: embeds.slice(0, 10) });
  }

  // --- /verificatie-setup --------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'verificatie-setup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Alleen administrators.', flags: 64 });
    const sub = interaction.options.getSubcommand();

    if (sub === 'uit') {
      secCfg.verification = { ...secCfg.verification, enabled: false };
      saveSecurityConfig(secCfg);
      return interaction.reply({ content: '✅ Verificatie gate uitgeschakeld. Nieuwe leden krijgen geen verificatie-rol meer.', flags: 64 });
    }
    if (sub === 'status') {
      const v = secCfg.verification || {};
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🔐 Verificatie Gate Status')
          .addFields(
            { name: '✅ Aan/Uit',         value: v.enabled ? '✅ Aan' : '❌ Uit',                                  inline: true },
            { name: '📢 Kanaal',         value: v.channelId ? `<#${v.channelId}>` : 'Niet ingesteld',         inline: true },
            { name: '🔒 Onverifiëerd Rol',  value: v.unverifiedRoleId ? `<@&${v.unverifiedRoleId}>` : 'Niet ingesteld', inline: true },
            { name: '🎭 Lid Rol',         value: v.memberRoleId ? `<@&${v.memberRoleId}>` : 'Niet ingesteld',  inline: true },
          )
          .setColor(v.enabled ? 0x57F287 : 0xFF4757)
          .setFooter({ text: 'Lage Landen RP — Verificatie Gate' }).setTimestamp()
      ], flags: 64 });
    }
    if (sub === 'aanmaken') {
      await safeDefer(interaction, { flags: 64 });
      const memberRole = interaction.options.getRole('lid-rol');
      let vCh = interaction.options.getChannel('kanaal');

      // Maak 'Onverifiëerd' rol aan als die nog niet bestaat
      let unverRole = interaction.guild.roles.cache.find(r => r.name === '🔒 Onverifiëerd');
      if (!unverRole) {
        unverRole = await interaction.guild.roles.create({
          name: '🔒 Onverifiëerd',
          color: 0x808080,
          permissions: [],
          reason: 'Verificatie gate systeem',
        }).catch(() => null);
      }
      if (!unverRole) return interaction.editReply('❌ Kon de Onverifiëerd rol niet aanmaken.');

      // Blokkeer de Onverifiëerd rol in alle kanalen behalve het verificatie kanaal
      // Kanalen met "regel" in de naam blijven leesbaar (maar geen schrijfrecht)
      for (const [, ch] of interaction.guild.channels.cache) {
        if (THREAD_TYPES.has(ch.type) || ch.type === ChannelType.GuildCategory) continue;
        // Alleen channels die beginnen met "regel" (na emoji/symbolen) — dus NIET "dev-regels"
        const isRules = /^[^\w]*regel/i.test(ch.name);
        if (isRules) {
          await ch.permissionOverwrites.edit(unverRole, { ViewChannel: true, SendMessages: false }, { reason: 'Verificatie gate — regels leesbaar' }).catch(() => {});
        } else {
          await ch.permissionOverwrites.edit(unverRole, { ViewChannel: false }, { reason: 'Verificatie gate' }).catch(() => {});
        }
      }

      // Maak verificatiekanaal aan als niet opgegeven
      if (!vCh) {
        vCh = await interaction.guild.channels.create({
          name: '🔐•verificatie',
          type: ChannelType.GuildText,
          topic: 'Klik de knop hieronder om toegang te krijgen tot de server.',
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: unverRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
          ],
          reason: 'Verificatie gate systeem',
        }).catch(() => null);
        if (!vCh) return interaction.editReply('❌ Kon het verificatiekanaal niet aanmaken.');
      }

      // Sla config op
      secCfg.verification = { enabled: true, channelId: vCh.id, unverifiedRoleId: unverRole.id, memberRoleId: memberRole.id };
      saveSecurityConfig(secCfg);

      // Stuur verificatiebericht — stap 1: regels accepteren
      const rulesRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_gate_rules').setLabel('✅ Ik heb de regels gelezen').setStyle(ButtonStyle.Primary),
      );
      await vCh.send({ embeds: [
        new EmbedBuilder()
          .setTitle('🔐 Verificatie Vereist — Lage Landen RP')
          .setDescription(
            '## Welkom bij Lage Landen RP!\n\n' +
            'Voordat je toegang krijgt tot de server moet je de regels lezen én accepteren.\n\n' +
            '**📖 Stap 1 van 2 — Regels lezen**\n' +
            '📜 Lees alle serverregels in het regelkanaal.\n\n' +
            '**✅ Stap 2 van 2 — Accepteren & Verifiëren**\n' +
            'Klik op de knop hieronder zodra je de regels hebt gelezen.\n' +
            'Je krijgt dan een bevestigingsvraag.\n\n' +
            '> ⚠️ Door te verifiëren ga je akkoord met **alle** regels van de server.\n' +
            '> Overtredingen kunnen leiden tot een ban zonder waarschuwing.'
          )
          .setColor(0x5865F2)
          .setFooter({ text: 'Lage Landen RP — Verificatie Systeem • Stap 1 van 2' })
      ], components: [rulesRow] }).catch(() => {});

      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle('✅ Verificatie Gate Ingesteld')
          .addFields(
            { name: '📢 Kanaal',        value: `<#${vCh.id}>`,        inline: true },
            { name: '🔒 Onverifiëerd Rol', value: `<@&${unverRole.id}>`, inline: true },
            { name: '🎭 Lid Rol',       value: `<@&${memberRole.id}>`, inline: true },
          )
          .setDescription('Nieuwe leden krijgen automatisch de Onverifiëerd rol en zien alleen het verificatiekanaal.')
          .setColor(0x57F287).setFooter({ text: 'Lage Landen RP — Verificatie Gate' }).setTimestamp()
      ]});
    }
  }

  // --- verificatie stap 1: regels gelezen knop ---------------------------------------
  if (interaction.isButton() && interaction.customId === 'verify_gate_rules') {
    const v = secCfg.verification;
    if (!v?.enabled) return interaction.reply({ content: '⚠️ Verificatie is momenteel uitgeschakeld.', flags: 64 });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_gate_confirm').setLabel('✅ Ja, ik heb de regels gelezen en ga akkoord').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('verify_gate_cancel').setLabel('❌ Nee, ik ga ze eerst nog lezen').setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Bevestig — Stap 2 van 2')
          .setDescription(
            '**Heb je de regels van Lage Landen RP gelezen?**\n\n' +
            'Door op **"Ja, ik heb de regels gelezen en ga akkoord"** te klikken bevestig je dat je:\n\n' +
            '✅ Alle serverregels hebt gelezen\n' +
            '✅ Akkoord gaat met alle regels\n' +
            '✅ Weet dat overtredingen kunnen leiden tot een (permanente) ban\n\n' +
            '> Als je de regels nog **niet** hebt gelezen, klik dan op ? en lees ze eerst.'
          )
          .setColor(0xFFA502)
          .setFooter({ text: 'Lage Landen RP — Verificatie Systeem • Stap 2 van 2' })
      ],
      components: [confirmRow],
      flags: 64,
    });
  }

  // --- verificatie stap 2: annuleren -----------------------------------------------
  if (interaction.isButton() && interaction.customId === 'verify_gate_cancel') {
    return interaction.reply({
      content: '✅ Geen probleem! Lees de regels in het regelkanaal en kom daarna terug om te verifiëren.',
      flags: 64,
    });
  }

  // --- verificatie stap 2: bevestigen & verifiëren --------------------------------
  if (interaction.isButton() && interaction.customId === 'verify_gate_confirm') {
    const v = secCfg.verification;
    if (!v?.enabled) return interaction.reply({ content: '⚠️ Verificatie is momenteel uitgeschakeld.', flags: 64 });

    // Als captcha aan staat: toon math modal ipv direct verifiëren
    if (secCfg.captchaVerif?.enabled) {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      captchaStore.set(interaction.member.id, { answer: a + b, expiry: Date.now() + 5 * 60_000 });
      const modal = new ModalBuilder()
        .setCustomId('verify_captcha_modal')
        .setTitle('🔐 Verificatie — Anti-Bot Check');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('captcha_answer')
            .setLabel(`Wat is ${a} + ${b}? (Vul alleen het getal in)`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Bijv: 14')
            .setMinLength(1).setMaxLength(6).setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }

    const member = interaction.member;
    // Verwijder onverifiëerd rol
    if (v.unverifiedRoleId) await member.roles.remove(v.unverifiedRoleId, 'Verificatie voltooid').catch(() => {});
    // Geef lid rol
    if (v.memberRoleId) {
      const lidRole = interaction.guild.roles.cache.get(v.memberRoleId);
      if (lidRole) await member.roles.add(lidRole, 'Verificatie voltooid').catch(() => {});
    }
    addSecurityEvent('verified', { userId: member.id, username: member.user.tag });
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Verificatie Geslaagd!')
          .setDescription(`Welkom, <@${member.id}>! Je hebt nu toegang tot de server. Veel plezier!`)
          .setColor(0x57F287).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
      ],
      flags: 64
    });
  }

  // --- captcha modal submit -------------------------------------------------------------
  if (interaction.isModalSubmit() && interaction.customId === 'verify_captcha_modal') {
    const v = secCfg.verification;
    if (!v?.enabled) return interaction.reply({ content: '⚠️ Verificatie is momenteel uitgeschakeld.', flags: 64 });

    const stored = captchaStore.get(interaction.member.id);
    if (!stored || Date.now() > stored.expiry) {
      captchaStore.delete(interaction.member.id);
      return interaction.reply({ content: '❌ Je captcha is verlopen (5 minuten). Klik opnieuw op de knop om het opnieuw te proberen.', flags: 64 });
    }

    const given = parseInt(interaction.fields.getTextInputValue('captcha_answer'), 10);
    if (isNaN(given) || given !== stored.answer) {
      return interaction.reply({ content: `❌ Fout antwoord! Probeer opnieuw door opnieuw op de knop te klikken.`, flags: 64 });
    }

    captchaStore.delete(interaction.member.id);
    const member = interaction.member;
    if (v.unverifiedRoleId) await member.roles.remove(v.unverifiedRoleId, 'Verificatie voltooid').catch(() => {});
    if (v.memberRoleId) {
      const lidRole = interaction.guild.roles.cache.get(v.memberRoleId);
      if (lidRole) await member.roles.add(lidRole, 'Verificatie voltooid').catch(() => {});
    }
    addSecurityEvent('verified', { userId: member.id, username: member.user.tag });
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Verificatie Geslaagd!')
          .setDescription(`Welkom, <@${member.id}>! Je hebt nu toegang tot de server. Veel plezier! 🎉`)
          .setColor(0x57F287).setFooter({ text: 'Lage Landen RP — Captcha doorstaan' }).setTimestamp()
      ],
      flags: 64
    });
  }

  // --- /bottrap -------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'bottrap') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Alleen administrators.', flags: 64 });

    const sub = interaction.options.getSubcommand();

    if (sub === 'aan') {
      if (!secCfg.botTrap?.channelId)
        return interaction.reply({ content: '❌ Stel eerst een kanaal in met `/bottrap setup`.', flags: 64 });
      secCfg.botTrap.enabled = true;
      saveSecurityConfig(secCfg);
      return interaction.reply({ content: '✅ Bot trap is nu **aan**. Valse activiteit wordt automatisch gestuurd.', flags: 64 });
    }

    if (sub === 'uit') {
      secCfg.botTrap = { ...secCfg.botTrap, enabled: false };
      saveSecurityConfig(secCfg);
      return interaction.reply({ content: '✅ Bot trap is **uitgeschakeld**.', flags: 64 });
    }

    if (sub === 'status') {
      const bt = secCfg.botTrap || {};
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🪤 Bot Trap Status')
          .addFields(
            { name: '✅ Aan/Uit',    value: bt.enabled ? '✅ Aan' : '❌ Uit',                                                        inline: true },
            { name: '📢 Kanaal',    value: bt.channelId ? `<#${bt.channelId}>` : 'Niet ingesteld',                               inline: true },
            { name: '⚡ Actie',      value: bt.action || 'quarantine',                                                              inline: true },
            { name: '⏰ Laatste nep-bericht', value: bt.lastActivity ? `<t:${Math.floor(bt.lastActivity/1000)}:R>` : 'Nog niet gestuurd', inline: true },
          )
          .setColor(bt.enabled ? 0x57F287 : 0xFF4757)
          .setFooter({ text: 'Lage Landen RP — Bot Trap' }).setTimestamp()
      ], flags: 64 });
    }

    if (sub === 'setup') {
      await safeDefer(interaction, { flags: 64 });
      const actie  = interaction.options.getString('actie') || 'quarantine';
      let targetCh = interaction.options.getChannel('kanaal');

      if (!targetCh) {
        // Maak een nieuw kanaal aan dat eruitziet als een gewoon kanaal
        targetCh = await interaction.guild.channels.create({
          name: '💬•algemeen-2',
          type: ChannelType.GuildText,
          topic: 'Algemeen chat',
          // Iedereen mag lezen+schrijven — zo zien bots het als een echt kanaal
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ],
          reason: 'Bot Trap honeypot kanaal',
        }).catch(e => { interaction.editReply(`❌ Kanaal aanmaken mislukt: ${e.message}`); return null; });
        if (!targetCh) return;

        // Verberg kanaal voor normale rollen (maar houd @everyone aan — bots checken dat)
        // Staff-rollen weggooien uit zichtbaarheid zodat ALLEEN raid-bots het zien
        // @everyone mag wel lezen — dat is het lokkertje
      }

      secCfg.botTrap = {
        enabled:      true,
        channelId:    targetCh.id,
        action:       actie,
        lastActivity: 0,
      };
      saveSecurityConfig(secCfg);

      // Stuur en pin een duidelijke waarschuwing voor gewone spelers
      const warnMsg = await targetCh.send({ embeds: [
        new EmbedBuilder()
          .setTitle('⛔ NIET TYPEN IN DIT KANAAL')
          .setDescription(
            '## 🔒 BEVEILIGINGSKANAAL — VERBODEN TOEGANG\n\n' +
            '**Dit kanaal is een beveiligingsval.**\n\n' +
            '> ? **Stuur NOOIT een bericht in dit kanaal.**\n' +
            '> ? **Reageer NOOIT op berichten in dit kanaal.**\n' +
            '> ❌ **Klik NOOIT op links die hier worden geplaatst.**\n\n' +
            'Iedereen die hier typt wordt **automatisch en direct** gesanctioneerd — zonder uitzondering.\n\n' +
            '*Dit kanaal is alleen zichtbaar om kwaadwillende bots en raiders te detecteren. ' +
            'Als normale speler hoef je hier niets te doen. Scroll gewoon verder.*'
          )
          .setColor(0xFF0000)
          .setFooter({ text: '🛡️ Lage Landen RP Beveiligingssysteem — Automatisch systeem actief' })
          .setTimestamp()
      ]}).catch(() => null);
      if (warnMsg) await warnMsg.pin().catch(() => {});

      // Stuur daarna een nep-activiteitsbericht zodat het kanaal actief lijkt
      await new Promise(r => setTimeout(r, 1500));
      await targetCh.send({ content: 'hoi 👋', flags: 4096 }).catch(() => {});
      secCfg.botTrap.lastActivity = Date.now();
      saveSecurityConfig(secCfg);

      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle('✅ Bot Trap Ingesteld')
          .setDescription(
            `Honeypot kanaal: <#${targetCh.id}>\n` +
            `Actie bij detectie: **${actie}**\n\n` +
            `De bot stuurt automatisch nep-berichten in dit kanaal (elke 2–4 uur) zodat raid-bots het herkennen als actief.\n` +
            `Iedereen die een bericht stuurt in dit kanaal (behalve staff) wordt direct **${actie}d**.`
          )
          .setColor(0x57F287).setFooter({ text: 'Lage Landen RP — Bot Trap' }).setTimestamp()
      ]});
    }
  }

  // --- /backup --------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Alleen administrators kunnen dit gebruiken.', flags: 64 });

    const sub = interaction.options.getSubcommand();

    // -- maken --
    if (sub === 'maken') {
      await safeDefer(interaction, { flags: 64 });
      try {
        const backup = await createServerBackup(interaction.guild, interaction.user.tag);
        const { stats } = backup;
        return interaction.editReply({ embeds: [
          new EmbedBuilder()
            .setTitle('💾 Backup Aangemaakt')
            .setDescription(`**ID:** \`${backup.id}\``)
            .addFields(
              { name: '🏴‍☠️ Server',      value: backup.guildName,             inline: true  },
              { name: '👤 Door',        value: backup.createdBy,              inline: true  },
              { name: '📅 Datum',       value: `<t:${Math.floor(backup.createdAt/1000)}:F>`, inline: false },
              { name: '🎭 Rollen',      value: `${stats.roles}`,              inline: true  },
              { name: '📁 Categorieën',value: `${stats.categories}`,          inline: true  },
              { name: '📢 Kanalen',    value: `${stats.channels}`,            inline: true  },
              { name: '😀 Emoji\'s',   value: `${stats.emojis}`,             inline: true  },
              { name: '🔨 Bans',       value: `${stats.bans}`,               inline: true  },
            )
            .setColor(0x57F287).setFooter({ text: 'Lage Landen RP — Backup Systeem' }).setTimestamp()
        ]});
      } catch (e) {
        return interaction.editReply(`❌ Backup mislukt: ${e.message}`);
      }
    }

    // -- lijst --
    if (sub === 'lijst') {
      const backups = listBackups();
      if (backups.length === 0)
        return interaction.reply({ content: '📭 Geen backups gevonden. Gebruik `/backup maken` om een backup te maken.', flags: 64 });
      const lines = backups.slice(0, 15).map((b, i) =>
        `**${i+1}.** \`${b.id}\`\n` +
        ` 📅 <t:${Math.floor(b.createdAt/1000)}:R> · 👤 ${b.createdBy} · 📁 ${b.stats?.channels ?? '?'} kanalen · 🛡️ ${b.stats?.roles ?? '?'} rollen`
      ).join('\n\n');
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle(`💾 Server Backups (${backups.length})`)
          .setDescription(lines)
          .setColor(0x5865F2).setFooter({ text: 'Gebruik /backup bekijken <id> voor details' }).setTimestamp()
      ], flags: 64 });
    }

    // -- bekijken --
    if (sub === 'bekijken') {
      const id = interaction.options.getString('id');
      const backup = loadBackup(id);
      if (!backup) return interaction.reply({ content: `❌ Backup \`${id}\` niet gevonden.`, flags: 64 });
      const { stats, server } = backup;
      const embed = new EmbedBuilder()
        .setTitle(`💾 Backup: ${backup.id}`)
        .addFields(
          { name: '🏴‍☠️ Server',       value: `${backup.guildName} (${backup.guildId})`, inline: false },
          { name: '📅 Aangemaakt',   value: `<t:${Math.floor(backup.createdAt/1000)}:F>`,             inline: true  },
          { name: '👤 Door',         value: backup.createdBy,                                         inline: true  },
          { name: '👥 Leden (toen)', value: `${backup.memberCount}`,                                  inline: true  },
          { name: '🎭 Rollen',       value: `${stats.roles}`,                                         inline: true  },
          { name: '📁 Categorieën',  value: `${stats.categories}`,                                    inline: true  },
          { name: '📢 Kanalen',      value: `${stats.channels}`,                                      inline: true  },
          { name: '😀 Emoji\'s',    value: `${stats.emojis}`,                                        inline: true  },
          { name: '🔨 Bans',         value: `${stats.bans}`,                                          inline: true  },
          { name: '🔐 Verificatie',  value: `Level ${server.verificationLevel}`,                      inline: true  },
        )
        .setColor(0x5865F2).setFooter({ text: 'Gebruik /backup restore <id> om te herstellen' }).setTimestamp();
      if (server.iconURL) embed.setThumbnail(server.iconURL);
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // -- restore --
    if (sub === 'restore') {
      const id = interaction.options.getString('id');
      const backup = loadBackup(id);
      if (!backup) return interaction.reply({ content: `❌ Backup \`${id}\` niet gevonden.`, flags: 64 });

      // Sla restore op als pending — gebruiker moet bevestigen met knop
      pendingRestores.set(interaction.user.id, id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`backup_restore_confirm:${interaction.user.id}`)
          .setLabel('⚠️ JA, HERSTEL').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`backup_restore_cancel:${interaction.user.id}`)
          .setLabel('❌ Annuleren').setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Backup Restore — Bevestiging Vereist')
          .setDescription(
            `Je staat op het punt **${backup.id}** te herstellen van <t:${Math.floor(backup.createdAt/1000)}:F>\n\n` +
            `Dit maakt **ontbrekende** rollen, categorieën en kanalen opnieuw aan.\n` +
            `**Bestaande kanalen en rollen worden NIET verwijderd.**\n\n` +
            `📋 Te herstellen:\n` +
            `• 🎭 ${backup.stats.roles} rollen\n• 📁 ${backup.stats.categories} categorieën\n` +
            `• 📢 ${backup.stats.channels} kanalen\n\n` +
            `Weet je het zeker?`
          )
          .setColor(0xFFA502).setFooter({ text: 'Deze actie kan niet ongedaan gemaakt worden' })
      ], components: [row], flags: 64 });
    }

    // -- verwijder --
    if (sub === 'verwijder') {
      const id = interaction.options.getString('id');
      const ok = deleteBackup(id);
      return interaction.reply({
        content: ok ? `✅ Backup \`${id}\` verwijderd.` : `❌ Backup \`${id}\` niet gevonden.`,
        flags: 64
      });
    }
  }

  // --- backup restore bevestiging -------------------------------------------
  if (interaction.isButton() && (interaction.customId.startsWith('backup_restore_confirm:') || interaction.customId.startsWith('backup_restore_cancel:'))) {
    const [action, userId] = interaction.customId.split(':');
    if (interaction.user.id !== userId)
      return interaction.reply({ content: '❌ Dit is niet jouw bevestiging.', flags: 64 });

    if (action === 'backup_restore_cancel') {
      pendingRestores.delete(userId);
      return interaction.update({ content: '✅ Restore geannuleerd.', embeds: [], components: [] });
    }

    const backupId = pendingRestores.get(userId);
    if (!backupId) return interaction.reply({ content: '❌ Geen restore gevonden. Gebruik `/backup restore` opnieuw.', flags: 64 });
    pendingRestores.delete(userId);

    const backup = loadBackup(backupId);
    if (!backup) return interaction.update({ content: `❌ Backup niet meer gevonden.`, embeds: [], components: [] });

    await interaction.update({ content: '⏳ Bezig met herstellen... Dit kan even duren.', embeds: [], components: [] });

    const logLines = await restoreFromBackup(interaction.guild, backup);
    const logText = logLines.join('\n') || 'Niets te herstellen — alles was al aanwezig.';
    const chunks = [];
    let buf = '';
    for (const line of logLines) {
      if (buf.length + line.length > 3800) { chunks.push(buf); buf = ''; }
      buf += line + '\n';
    }
    if (buf) chunks.push(buf);
    if (!chunks.length) chunks.push('Niets te herstellen — alles was al aanwezig.');

    const embeds = chunks.map((chunk, i) => new EmbedBuilder()
      .setTitle(i === 0 ? `✅ Restore Voltooid — ${backupId}` : 'Restore Log (vervolg)')
      .setDescription('```\n' + chunk + '```')
      .setColor(0x57F287).setFooter({ text: `Hersteld door ${interaction.user.tag}` }).setTimestamp()
    );
    return interaction.editReply({ content: '', embeds: embeds.slice(0, 10) });
  }

  // --- /security-config -----------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'security-config') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Alleen administrators kunnen dit gebruiken.', flags: 64 });

    const instelling = interaction.options.getString('instelling');
    const waarde     = interaction.options.getString('waarde');
    const cfg        = secCfg;

    const toggleMap = {
      antiraid_toggle:   () => { cfg.antiRaid.enabled          = !cfg.antiRaid.enabled;          return `Anti-Raid: ${cfg.antiRaid.enabled ? '✅' : '❌'}`; },
      accountage_toggle: () => { cfg.accountAge.enabled        = !cfg.accountAge.enabled;         return `Account Age Gate: ${cfg.accountAge.enabled ? '✅' : '❌'}`; },
      antispam_toggle:   () => { cfg.antiSpam.enabled          = !cfg.antiSpam.enabled;           return `Anti-Spam: ${cfg.antiSpam.enabled ? '✅' : '❌'}`; },
      antiinvite_toggle: () => { cfg.antiInvite.enabled        = !cfg.antiInvite.enabled;         return `Anti-Invite: ${cfg.antiInvite.enabled ? '✅' : '❌'}`; },
      webhook_toggle:    () => { cfg.webhookProtection.enabled = !cfg.webhookProtection.enabled;  return `Webhook Bescherming: ${cfg.webhookProtection.enabled ? '✅' : '❌'}`; },
      auto_lockdown:     () => { cfg.antiRaid.autoLockdown     = !cfg.antiRaid.autoLockdown;      return `Auto-Lockdown: ${cfg.antiRaid.autoLockdown ? '✅' : '❌'}`; },
      captcha_toggle:       () => { cfg.captchaVerif.enabled    = !cfg.captchaVerif.enabled;    return `Captcha Rekensom: ${cfg.captchaVerif.enabled ? '✅ Aan' : '❌ Uit'}`; },
      profanity_toggle:    () => { cfg.antiProfanity.enabled  = !cfg.antiProfanity.enabled;  return `Anti-Profanity: ${cfg.antiProfanity.enabled ? '✅ Aan' : '❌ Uit'}`; },
      banevasion_toggle:   () => { cfg.banEvasion.enabled     = !cfg.banEvasion.enabled;     return `Ban Evasion: ${cfg.banEvasion.enabled ? '✅ Aan' : '❌ Uit'}`; },
      coordjoin_toggle:    () => { cfg.coordJoin.enabled      = !cfg.coordJoin.enabled;      return `Gecoördineerd Joinen: ${cfg.coordJoin.enabled ? '✅ Aan' : '❌ Uit'}`; },
      impersonation_toggle:() => { cfg.impersonation.enabled  = !cfg.impersonation.enabled;  return `Impersonation: ${cfg.impersonation.enabled ? '✅ Aan' : '❌ Uit'}`; },
      voice_toggle:        () => { cfg.voiceSecurity.enabled  = !cfg.voiceSecurity.enabled;  return `Voice Security: ${cfg.voiceSecurity.enabled ? '✅ Aan' : '❌ Uit'}`; },
      autobackup_toggle:   () => { cfg.autoBackup.enabled     = !cfg.autoBackup.enabled;     return `Auto Backup: ${cfg.autoBackup.enabled ? '✅ Aan' : '❌ Uit'}`; },
    };

    let resultMsg = '';
    if (toggleMap[instelling]) {
      resultMsg = toggleMap[instelling]();
    } else if (instelling === 'raid_threshold') {
      const v = parseInt(waarde);
      if (isNaN(v) || v < 2 || v > 50) return interaction.reply({ content: '❌ Ongeldige waarde. Gebruik een getal tussen 2 en 50.', flags: 64 });
      cfg.antiRaid.joinThreshold = v; resultMsg = `Raid drempel: **${v}** joins`;
    } else if (instelling === 'raid_window') {
      const v = parseInt(waarde);
      if (isNaN(v) || v < 2 || v > 120) return interaction.reply({ content: '❌ Ongeldige waarde. Gebruik 2–120 seconden.', flags: 64 });
      cfg.antiRaid.joinWindowSec = v; resultMsg = `Raid tijdvenster: **${v}** seconden`;
    } else if (instelling === 'min_age') {
      const v = parseInt(waarde);
      if (isNaN(v) || v < 0 || v > 365) return interaction.reply({ content: '❌ Gebruik een getal tussen 0 en 365.', flags: 64 });
      cfg.accountAge.minDays = v; resultMsg = `Minimale account leeftijd: **${v}** dagen`;
    } else if (instelling === 'spam_timeout') {
      const v = parseInt(waarde);
      if (isNaN(v) || v < 10 || v > 2419200) return interaction.reply({ content: '❌ Gebruik een getal tussen 10 en 2419200 seconden.', flags: 64 });
      cfg.antiSpam.timeoutSec = v; resultMsg = `Spam timeout: **${v}** seconden`;
    } else if (instelling === 'log_channel') {
      const chanId = (waarde || '').replace(/[<#>]/g, '');
      const ch = interaction.guild.channels.cache.get(chanId);
      if (!ch) return interaction.reply({ content: '❌ Kanaal niet gevonden. Geef een geldig kanaal-ID.', flags: 64 });
      cfg.securityLogChannelId = chanId; resultMsg = `Security log kanaal: <#${chanId}>`;
    } else if (instelling === 'raid_action') {
      if (!['quarantine','kick','ban'].includes(waarde)) return interaction.reply({ content: '❌ Geldige waarden: `quarantine`, `kick`, `ban`', flags: 64 });
      cfg.antiRaid.action = waarde; resultMsg = `Raid actie: **${waarde}**`;
    } else if (instelling === 'spam_action') {
      if (!['timeout','kick','ban'].includes(waarde)) return interaction.reply({ content: '❌ Geldige waarden: `timeout`, `kick`, `ban`', flags: 64 });
      cfg.antiSpam.action = waarde; resultMsg = `Spam actie: **${waarde}**`;
    } else if (instelling === 'age_action') {
      if (!['kick','ban'].includes(waarde)) return interaction.reply({ content: '❌ Geldige waarden: `kick`, `ban`', flags: 64 });
      cfg.accountAge.action = waarde; resultMsg = `Age gate actie: **${waarde}**`;
    }

    saveSecurityConfig(cfg);
    addSecurityEvent('config_changed', { instelling, waarde, by: interaction.user.tag });
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('✅ Security Config Bijgewerkt')
        .setDescription(`✅ **${resultMsg}**`)
        .setColor(0x57F287).setFooter({ text: `Aangepast door ${interaction.user.tag}` }).setTimestamp()
    ], flags: 64 });
  }

  // --- /setup ---------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    await safeDefer(interaction, { flags: 64 });
    if (!interaction.deferred && !interaction.replied) return;
    await setupPartnerCategory(interaction.guild);
    await setupTicketCategory(interaction.guild);
    return interaction.editReply('✅ Alle categorieën en kanalen zijn aangemaakt/bijgewerkt!');
  }

  // --- /site ----------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'site') {
    const embed = new EmbedBuilder()
      .setTitle('🌐 Lage Landen Roleplay — Officiële Website')
      .setURL('https://lagelandenrp.netlify.app/')
      .setDescription(
        '### 🌐 Welkom op onze website!\n' +
        'Op [lagelandenrp.netlify.app](https://lagelandenrp.netlify.app/) vind je alles over onze server, procedures en meer.\n\n' +
        '### ❓ Hoe werkt het?\n' +
        '**Stap 1 —** Maak een account aan op de website\n' +
        '**Stap 2 —** Neem daarna contact op:' +
        '\n\u2022 Open een **ticket** via ons ticketsysteem voor vragen of sollicitaties' +
        '\n\u2022 Of neem contact op bij je **desbetreffende team** als je al weet waar je bij wilt\n\n' +
        '> ⚠️ Zonder account kunnen wij je sollicitatie of aanvraag **niet verwerken!**'
      )
      .setColor(0x5865F2)
      .setThumbnail('https://cdn.discordapp.com/attachments/1458575373846446233/1460303486318153973/RobloxScreenShot20260109_17464004423232.png?ex=69666d1a&is=69651b9a&hm=175c8d50be23aff72bab0d5940a6e4a693013fa3283d4b551eb09b05c0c23378&')
      .addFields(
        { name: '🌐 Website', value: '[Klik hier om naar de site te gaan](https://lagelandenrp.netlify.app/)', inline: true },
        { name: '🏴‍☠️ Ticket', value: 'Open een ticket in dit Discord', inline: true }
      )
      .setFooter({ text: 'Lage Landen RP — Account aanmaken is verplicht!' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // --- /regels --------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'regels') {
    const REGELS_ROLE_ID = '1458223437158809892';
    if (!interaction.member.roles.cache.has(REGELS_ROLE_ID) && !hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je hebt geen toegang tot dit commando.', flags: 64 });

    const discordRegels = new EmbedBuilder()
      .setTitle('📋 Discord Regels — Lage Landen RP')
      .setColor(0x2B2D31)
      .setDescription(
        '> Lees de regels goed door. Door aanwezig te zijn in deze server ga je akkoord met alle onderstaande regels.\n' +
        '> Overtredingen kunnen leiden tot waarschuwingen, mutes, kicks of een (permanente) ban.'
      )
      .addFields(
        {
          name: '🔞 Geen 18+ Content',
          value: 'Het sturen van 18+ of NSFW content — in welke vorm dan ook — is ten strengste verboden.',
          inline: false
        },
        {
          name: '🏴‍☠️ Microfoon & Calls',
          value: '• Niet in de mic blazen\n• Niet earrapen in voice channels',
          inline: false
        },
        {
          name: '🏴‍☠️ Taalgebruik & Respect',
          value: '• Niet schelden\n• Heb respect voor iedereen\n• Ga geen drama opstarten',
          inline: false
        },
        {
          name: '📣 Promo & Pingen',
          value: '• Geen zelf-promotie zonder toestemming van staff\n• Niet zomaar staff pingen zonder geldige reden',
          inline: false
        },
        {
          name: '⚖️ Wetgeving & Staff',
          value: '• Geen illegaliteit (opruiing, doxxing, etc.)\n• Luister altijd naar staffleden',
          inline: false
        }
      )
      .setFooter({ text: 'Lage Landen RP — Discord Regels', iconURL: 'https://cdn.discordapp.com/attachments/1458575373846446233/1460303486318153973/RobloxScreenShot20260109_17464004423232.png?ex=69666d1a&is=69651b9a&hm=175c8d50be23aff72bab0d5940a6e4a693013fa3283d4b551eb09b05c0c23378&' })
      .setTimestamp();

    const ingameRegels = new EmbedBuilder()
      .setTitle('🎮 In-Game Regels — Lage Landen RP')
      .setColor(0x5865F2)
      .setDescription(
        '> De onderstaande regels gelden **in-game** op de Lage Landen RP server.\n' +
        '> Het volledig wetboek is te vinden via: [📖 Wetboek RP](https://lagelandenrp.netlify.app/handboek/wetboek-rp)'
      )
      .addFields(
        {
          name: '🏴‍☠️ Gedrag',
          value: '• Niet schelden\n• Respecteer alle spelers\n• Luister te **allen tijde** naar staffleden',
          inline: false
        },
        {
          name: '🎭 Roleplay',
          value: '• Blijf altijd **In Character (IC)**, tenzij bezig met staff\n• Werk mee aan lopende roleplays\n• Geen **FRP** (FailRP) — handel realistisch',
          inline: false
        },
        {
          name: '🚗 Rijgedrag',
          value: '• Geen **GTA Driving** — rijd realistisch en voorzichtig',
          inline: false
        },
        {
          name: '⚠️ RDM / Agressie',
          value: '• **RDM** (Random Deathmatch) ⚠️ directe waarschuwing\n• **Massa RDM** 🔫 wapenban\n• Altijd een realistische aanleiding voor geweld',
          inline: false
        },
        {
          name: '💻 Hacken / Cheaten',
          value: '• Gebruik van hacks, exploits of cheats resulteert in een **permanente ban** zonder beroep.',
          inline: false
        },
        {
          name: '🏴‍☠️ Diensten',
          value: '• Politie, Ambulance (EMS) en Brandweer vallen onder aanvullende **dienstreglementen**\n• Lees het volledig [📜 Wetboek RP](https://lagelandenrp.netlify.app/handboek/wetboek-rp) voor richtlijnen per dienst',
          inline: false
        }
      )
      .setFooter({ text: 'Lage Landen RP — In-Game Regels · Wetboek: lagelandenrp.netlify.app', iconURL: 'https://cdn.discordapp.com/attachments/1458575373846446233/1460303486318153973/RobloxScreenShot20260109_17464004423232.png?ex=69666d1a&is=69651b9a&hm=175c8d50be23aff72bab0d5940a6e4a693013fa3283d4b551eb09b05c0c23378&' })
      .setTimestamp();

    const strafEmbed = new EmbedBuilder()
      .setTitle('⚖️ Strafmaatregelen')
      .setColor(0xFF6B6B)
      .setDescription(
        'Overtredingen van de regels worden per geval beoordeeld door het staff team.\n\n' +
        '**Mogelijke sancties:**\n' +
        '> ⚠️ **Waarschuwing (warn)** — lichte overtreding\n' +
        '> 🔇 **Mute / Kick** — herhaling of matige overtreding\n' +
        '> 🔨 **Tijdelijke ban** — zware overtreding\n' +
        '> ☠️ **Permanente ban** — zeer zware overtreding of hacken\n\n' +
        '*De ernst van de maatregel hangt af van de situatie en het oordeel van het staff team.*'
      )
      .addFields(
        {
          name: '✅ Gelezen & Akkoord',
          value: 'Reageer met ✅ op dit bericht om te bevestigen dat je de regels hebt gelezen en akkoord gaat.',
          inline: false
        }
      )
      .setFooter({ text: 'Lage Landen RP — Strafbeleid' })
      .setTimestamp();

    try {
      const sent = await interaction.channel.send({ embeds: [discordRegels, ingameRegels, strafEmbed] });
      await sent.react('✅');
      return interaction.reply({ content: '✅ Regels geplaatst!', flags: 64 });
    } catch (e) {
      return interaction.reply({ content: `❌ Kon regels niet plaatsen: ${e.message}`, flags: 64 });
    }
  }

  // --- /partnerboard --------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'partnerboard') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const partners = Object.values(db.partners);

    if (!partners.length)
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🤝 Partner Leaderboard')
          .setDescription('*Nog geen partners goedgekeurd.*')
          .setColor(0xFFA500)
      ], flags: 64 });

    // -- Leaderboard (all-time) ----------------------------------------------
    const tally = {};
    for (const p of partners) {
      if (!p.approvedBy) continue;
      tally[p.approvedBy] = (tally[p.approvedBy] || 0) + 1;
    }
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const medals = ['🥇', '🥈', '🥉'];
    const rows = sorted.length
      ? sorted.map(([userId, count], i) =>
          `${medals[i] || `**${i + 1}.**`} <@${userId}> — **${count}** partner${count !== 1 ? 's' : ''}`
        ).join('\n')
      : '*Geen data beschikbaar.*';
    const topUser = sorted[0];

    // -- Wekelijkse stats (laatste 8 weken) ----------------------------------
    const now      = Date.now();
    const msWeek   = 7 * 24 * 60 * 60 * 1000;

    // Huidige week: maandag 00:00 lokaal
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // naar maandag

    // Bouw weken-bucket: index 0 = huidige week, 1 = vorige week, …
    const WEEKS = 8;
    const weekBuckets = Array.from({ length: WEEKS }, (_, i) => ({
      start: monday.getTime() - i * msWeek,
      end:   monday.getTime() - i * msWeek + msWeek,
      count: 0,
      byStaff: {}, // userId -> count
    }));

    for (const p of partners) {
      if (!p.approvedAt) continue;
      for (const bucket of weekBuckets) {
        if (p.approvedAt >= bucket.start && p.approvedAt < bucket.end) {
          bucket.count++;
          if (p.approvedBy) {
            bucket.byStaff[p.approvedBy] = (bucket.byStaff[p.approvedBy] || 0) + 1;
          }
          break;
        }
      }
    }

    const QUOTA = 2; // doel: 2 partners per week per stafflid

    // Maak weekrijen
    const weekRows = weekBuckets
      .map((b, i) => {
        if (b.count === 0 && i > 0) return null;
        const label = i === 0 ? '**Deze week**' : i === 1 ? 'Vorige week' : `${i} weken geleden`;
        const bar   = '¦'.repeat(Math.min(b.count, 10)) + '¦'.repeat(Math.max(0, 10 - Math.min(b.count, 10)));
        const staffLines = Object.entries(b.byStaff)
          .sort((a, b) => b[1] - a[1])
          .map(([uid, cnt]) => {
            const check = cnt >= QUOTA ? '✅' : '⚠️';
            return `> ${check} <@${uid}> — **${cnt}**/${QUOTA}`;
          })
          .join('\n');
        return `\`${bar}\` ${label} — **${b.count}** totaal\n${staffLines || '> *Geen toevoegaars*'}`;
      })
      .filter(Boolean)
      .join('\n\n');

    // Gemiddeld per week (over weken met minstens 1 partner)
    const activeWeeks = weekBuckets.filter(b => b.count > 0).length || 1;
    const totalInWindow = weekBuckets.reduce((s, b) => s + b.count, 0);
    const avg = (totalInWindow / activeWeeks).toFixed(1);

    const leaderEmbed = new EmbedBuilder()
      .setTitle('🤝 Partner Leaderboard — Lage Landen RP')
      .setDescription(`Overzicht van alle goedgekeurde en toegevoegde partners.\n\n${rows}`)
      .addFields(
        { name: '👥 Totaal partners',     value: `${partners.length}`,                                              inline: true },
        { name: '👤 Unieke toevoegaars',  value: `${sorted.length}`,                                                inline: true },
        { name: '🏆 Meeste partners',     value: topUser ? `<@${topUser[0]}> (${topUser[1]}x)` : '—',              inline: true },
      )
      .setColor(0xFFD700)
      .setFooter({ text: 'Lage Landen RP — Partner Leaderboard' })
      .setTimestamp();

    const weekEmbed = new EmbedBuilder()
      .setTitle('📊 Partners per Week — Laatste 8 Weken')
      .setDescription(weekRows || '*Geen data beschikbaar.*')
      .addFields(
        { name: '📈 Gem. per week',       value: `${avg} partners`,               inline: true },
        { name: '🏴‍☠️ Beste week ooit',    value: (() => {
            const best = weekBuckets.reduce((a, b) => b.count > a.count ? b : a, weekBuckets[0]);
            if (!best || best.count === 0) return '—';
            const d = new Date(best.start);
            return `Week van ${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} (${best.count}x)`;
          })(),                                                                     inline: true },
        { name: '📅 Dit jaar',            value: `${partners.filter(p => p.approvedAt && p.approvedAt >= new Date(new Date().getFullYear(), 0, 1).getTime()).length} partners`, inline: true },
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Lage Landen RP — Weekoverzicht Partners' })
      .setTimestamp();

    return interaction.reply({ embeds: [leaderEmbed, weekEmbed], flags: 64 });
  }

  // --- /embed ---------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const kanaal     = interaction.options.getChannel('kanaal') || interaction.channel;
    const kleur      = interaction.options.getString('kleur') || '5865F2';
    const doTag      = interaction.options.getBoolean('tag') ?? false;
    const rol        = interaction.options.getString('rol') || 'lid';
    const doTijdstip = interaction.options.getBoolean('tijdstip') ?? true;
    const doLogo     = interaction.options.getBoolean('serverlogo') ?? false;
    const doAuteur   = interaction.options.getBoolean('auteur') ?? false;
    const grootte    = interaction.options.getString('grootte') || 'medium';
    const fotoAttach = interaction.options.getAttachment('foto') || null;
    const fotoUrl    = fotoAttach?.url || null;

    pendingEmbed.set(interaction.user.id, { kanaalId: kanaal.id, kleur, doTag, rol, doTijdstip, doLogo, doAuteur, grootte, fotoUrl });

    const titelRij = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('embed_titel')
        .setLabel('Titel')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setPlaceholder('Bijv. 📢 Aankondiging | Lage Landen RP')
    );
    const beschrijvingRij = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('embed_beschrijving')
        .setLabel('Beschrijving (tekst in de embed)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setPlaceholder('Schrijf hier de inhoud van de embed...')
    );
    const footerRij = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('embed_footer')
        .setLabel('Footer tekst (optioneel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(2048)
        .setPlaceholder('Lage Landen RP — Staff')
    );
    const afbeeldingRij = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('embed_afbeelding')
        .setLabel('Afbeelding URL (grote foto onderaan, opt.)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder('https://i.imgur.com/...')
    );
    const thumbnailRij = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('embed_thumbnail')
        .setLabel('Thumbnail URL (kleine foto rechts, opt.)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder('https://i.imgur.com/...')
    );

    const grootteTitel = grootte === 'klein' ? '📦 Embed Opstellen — Klein'
                       : grootte === 'groot' ? '🏆 Embed Opstellen — Groot'
                       : '📋 Embed Opstellen — Medium';

    const modal = new ModalBuilder()
      .setCustomId('embed_modal')
      .setTitle(grootteTitel);

    if (grootte === 'klein') {
      modal.addComponents(titelRij, beschrijvingRij);
    } else if (grootte === 'groot') {
      // Als foto al geüpload: geen URL-velden nodig (max 5 rijen in modal)
      if (fotoUrl) {
        modal.addComponents(titelRij, beschrijvingRij, footerRij, thumbnailRij);
      } else {
        modal.addComponents(titelRij, beschrijvingRij, footerRij, afbeeldingRij, thumbnailRij);
      }
    } else {
      // Medium: als foto al geüpload, geen afbeelding URL-veld
      if (fotoUrl) {
        modal.addComponents(titelRij, beschrijvingRij, footerRij);
      } else {
        modal.addComponents(titelRij, beschrijvingRij, footerRij, afbeeldingRij);
      }
    }

    await interaction.showModal(modal);
    return;
  }

  // --- /sneakpeak -----------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'sneakpeak') {
    const SNEAK_MIN_ROLE = '1458223437158809892';
    const hasSneak = interaction.member.roles.cache.some(r => {
      const ref = interaction.guild.roles.cache.get(SNEAK_MIN_ROLE);
      return ref && r.comparePositionTo(ref) >= 0;
    });
    if (!hasSneak)
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const tekst = interaction.options.getString('tekst');
    const ondertekst = interaction.options.getString('ondertekst') || '🏴‍☠️ Lage Landen RP — meer updates volgen!';
    const doTag  = interaction.options.getBoolean('tag') ?? true;
    const afbeeldingen = ['afbeelding1','afbeelding2','afbeelding3','afbeelding4','afbeelding5']
      .map(k => interaction.options.getAttachment(k))
      .filter(Boolean);

    const firstImg = afbeeldingen[0];
    const extraImgs = afbeeldingen.slice(1);

    // Eén strakke embed — tekst boven de foto, ondertekst + branding onder de foto in footer
    const mainEmbed = new EmbedBuilder()
      .setTitle('👀 Sneak Peek — Lage Landen RP')
      .setDescription(tekst)
      .setImage(firstImg.url)
      .setColor(0x5865F2)
      .setFooter({ text: `${ondertekst}\nSneak Peek • Lage Landen RP`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    // Extra foto embeds — zelfde kleur zodat ze visueel aansluiten
    const extraEmbeds = extraImgs.map(att =>
      new EmbedBuilder().setImage(att.url).setColor(0x5865F2)
    );

    await interaction.deferReply({ flags: 64 });

    const sent = await interaction.channel.send({
      content: doTag ? `<@&1458227903731863603> 👀 **Nieuwe Sneak Peek!**` : `👀 **Nieuwe Sneak Peek!**`,
      embeds: [mainEmbed, ...extraEmbeds],
    });

    await sent.react('👀').catch(() => {});

    return interaction.editReply({ content: `✅ Sneak peek geplaatst in <#${interaction.channel.id}>!${doTag ? '' : ' *(zonder tag)*'}` });
  }

  // --- /staffpartner --------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'staffpartner') {
    const STAFFPARTNER_ROLE = '1476525781571342397';
    const hasAccess = interaction.member.roles.cache.has(STAFFPARTNER_ROLE) ||
      hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) ||
      interaction.member.roles.cache.some(r => {
        const ref = interaction.guild.roles.cache.get(STAFFPARTNER_ROLE);
        return ref && r.comparePositionTo(ref) >= 0;
      });
    if (!hasAccess)
      return interaction.reply({ content: '❌ Je hebt geen toegang tot dit commando.', flags: 64 });

    const modal = new ModalBuilder()
      .setCustomId('staffpartner_modal')
      .setTitle('🤝 Staff — Partner Plaatsen');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sp_naam')
          .setLabel('Naam van server / persoon')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Bijv. "Rood Licht RP" of "Jan de Vries"')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sp_bericht')
          .setLabel('Partnerbericht')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Schrijf hier het volledige partnerbericht...')
          .setRequired(true)
          .setMinLength(20)
          .setMaxLength(4000)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // Modal submit — staffpartner
  if (interaction.isModalSubmit() && interaction.customId === 'staffpartner_modal') {
    const STAFFPARTNER_ROLE = '1476525781571342397';
    const hasAccess = interaction.member.roles.cache.has(STAFFPARTNER_ROLE) ||
      hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) ||
      interaction.member.roles.cache.some(r => {
        const ref = interaction.guild.roles.cache.get(STAFFPARTNER_ROLE);
        return ref && r.comparePositionTo(ref) >= 0;
      });
    if (!hasAccess)
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const naam    = interaction.fields.getTextInputValue('sp_naam').trim();
    const bericht = interaction.fields.getTextInputValue('sp_bericht').trim();

    // Anti-scheld check
    const slurs = checkProfanity(naam + ' ' + bericht);
    if (slurs.length > 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Bericht Geweigerd — Ongepaste Inhoud')
          .setDescription(
            `Het bericht bevat **${slurs.length}** ongepast woord(en):\n${slurs.map(w => `> \`${w}\``).join('\n')}\n\n` +
            'Pas het bericht aan en probeer opnieuw.'
          )
          .setColor(0xFF0000).setFooter({ text: 'Lage Landen RP' })],
        flags: 64
      });
    }

    // Blacklist check
    let blWarning = null;
    try {
      const blCh = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
      if (blCh) {
        const blMsgs = await blCh.messages.fetch({ limit: 100 });
        const blNames = blMsgs.filter(m => m.content && m.content.trim()).map(m => m.content.trim().toLowerCase());
        const hits = blNames.filter(n => (naam + ' ' + bericht).toLowerCase().includes(n));
        if (hits.length) blWarning = hits;
      }
    } catch { /* negeer */ }

    if (blWarning) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🚫 Geweigerd — Blacklisted Server/Speler')
          .setDescription(
            `De naam of het bericht bevat een **geblackliste server**:\n${blWarning.map(s => `> \`${s}\``).join('\n')}\n\n` +
            'Dit partnerschap kan niet worden geplaatst.'
          )
          .setColor(0xFF0000).setFooter({ text: 'Lage Landen RP — Blacklist Bescherming' })],
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Plaatsen in #partners — plain text zodat foto-URLs automatisch previeuwen
    const partnerCh = await client.channels.fetch(PARTNER_CHANNEL_ID).catch(() => null);
    if (!partnerCh) return interaction.editReply('❌ Partnerkanaal niet gevonden.');

    const partnerTekstStaff = [
      `🤝 **Partnerschap — ${naam}**`,
      '─────────────────────────────',
      '',
      bericht,
      '',
      '─────────────────────────────',
      `👤 Geplaatst door ${interaction.user.tag}`,
    ].join('\n');

    const partnerMsg = await partnerCh.send({ content: partnerTekstStaff });

    // Opslaan
    const key = `staff_${interaction.user.id}_${Date.now()}`;
    db.partners[key] = {
      userId:      key,
      serverName:  naam,
      messageId:   partnerMsg.id,
      approvedAt:  Date.now(),
      approvedBy:  interaction.user.id,
      staffPlaced: true,
    };
    saveData(db);
    await updatePartnersEmbed(interaction.guild).catch(() => {});

    // Mod log
    await modLog(new EmbedBuilder()
      .setTitle('🤝 Staff Partnerschap Geplaatst')
      .setColor(0x57F287)
      .addFields(
        { name: '🏴‍☠️ Partner',    value: naam,                                                   inline: true },
        { name: '🏴‍☠️ Door',       value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
        { name: '💬 Bericht',    value: `[Ga naar bericht](${partnerMsg.url})`,                 inline: false },
      ).setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
    ).catch(() => {});

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Partnerschap Geplaatst')
        .setDescription(`Het partnerschap voor **${naam}** is direct geplaatst in <#${PARTNER_CHANNEL_ID}>.\n\n[🔗 Ga naar bericht](${partnerMsg.url})`)
        .setColor(0x57F287)
        .setFooter({ text: 'Lage Landen RP — Staff Partnerschap' })
        .setTimestamp()]
    });
  }

  // --- /faq -----------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'faq') {
    const REGELS_ROLE_ID = '1458223437158809892';
    if (!interaction.member.roles.cache.has(REGELS_ROLE_ID) && !hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je hebt geen toegang tot dit commando.', flags: 64 });

    const faqEmbed = new EmbedBuilder()
      .setTitle('❓ Veelgestelde Vragen — Sollicitaties bij Lage Landen RP')
      .setColor(0x5865F2)
      .setDescription(
        '> Lees dit goed door **voordat** je een sollicitatie indient!\n' +
        '> Hieronder vind je de meest gestelde vragen over het sollicitatieproces. 📋'
      )
      .addFields(
        {
          name: '❓ 1. Waar vind ik de sollicitatieformulieren?',
          value:
            'De links staan in <#1457777956696850603> **dienst-sollicitaties**.\n' +
            '> 💡 Neem de tijd voor je antwoorden — korte antwoorden worden **direct afgewezen**.',
          inline: false
        },
        {
          name: '❓ 2. Hoeveel diensten mag ik doen?',
          value:
            'Er is **geen maximum**. Je mag bij alle diensten solliciteren (Politie, Brandweer, KMar, Ambulance, etc.).\n' +
            '> ⚠️ Je moet wel bij **elke dienst actief blijven**. Verwaarlozing kan leiden tot ingrijpen door de leiding.',
          inline: false
        },
        {
          name: '🏴‍☠️ 3. Is een microfoon verplicht?',
          value:
            'Ja, een microfoon is **verplicht** als je er toegang toe hebt. Wij streven naar de meest realistische Nederlandse roleplay.',
          inline: false
        },
        {
          name: '⏱️ 4. Hoe lang duurt de beoordeling?',
          value:
            'Het **High Command (HC)** bekijkt je sollicitatie doorgaans binnen **24 tot 48 uur**.\n' +
            '> ⚠️ Vragen naar de status (via DM of ping) wordt gezien als ongeduldig gedrag en kan leiden tot een **afwijzing**.',
          inline: false
        },
        {
          name: '❓ 5. Wat gebeurt er als ik aangenomen ben?',
          value:
            '• Je ontvangt een melding + uitnodiging voor de besloten Dienst-Discord\n' +
            '• Je krijgt de rol **Aspirant** of **Student**\n' +
            '• Je volgt een korte **toelatingstraining** over regels en portofoongebruik',
          inline: false
        },
        {
          name: '❓ 6. Wat als ik word afgewezen?',
          value:
            'Je ontvangt vaak **feedback** over wat er miste. Na **7 dagen** mag je opnieuw solliciteren.\n' +
            '> ✅ Gebruik die tijd om je regelkennis te verbeteren en je antwoorden uitgebreider te maken.',
          inline: false
        },
        {
          name: '❓ 7. Kan ik direct een hoge functie krijgen?',
          value:
            'Nee — iedereen begint **onderaan**. Promoties verdien je door goed gedrag en het volgen van trainingen.\n' +
            '> Specialistische rollen (DSI, Verkeerspolitie, etc.) zijn pas beschikbaar **na verloop van tijd**.\n' +
            '> ⚠️ Bij misbruik kan dit worden teruggedraaid.',
          inline: false
        },
        {
          name: '❓ 8. Is de Discord-portofoon verplicht?',
          value:
            'Nee, de Discord-portofoonkanalen zijn **niet verplicht** — maar wel welkom!\n' +
            'Wij beschikken ook over een **in-game portofoonsysteem** voor communicatie tijdens je dienst.',
          inline: false
        }
      )
      .setFooter({ text: 'Lage Landen RP — Vragen? Open een ticket of ga naar #dienst-sollicitaties', iconURL: 'https://cdn.discordapp.com/attachments/1458575373846446233/1460303486318153973/RobloxScreenShot20260109_17464004423232.png?ex=69666d1a&is=69651b9a&hm=175c8d50be23aff72bab0d5940a6e4a693013fa3283d4b551eb09b05c0c23378&' })
      .setTimestamp();

    try {
      await interaction.channel.send({ embeds: [faqEmbed] });
      return interaction.reply({ content: '✅ FAQ geplaatst!', flags: 64 });
    } catch (e) {
      return interaction.reply({ content: `❌ Kon FAQ niet plaatsen: ${e.message}`, flags: 64 });
    }
  }

  // --- /partnerbericht ------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'partnerbericht') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const doelKanaal = interaction.options.getChannel('kanaal') || interaction.channel;

    const berichtTekst = [
      '## 🏴‍☠️ De LageLanden Roleplay! 🏴‍☠️',
      '',
      '**Welkom bij De LageLanden Roleplay 🎉🎊**',
      '',
      'Wij zijn een opkomende roleplay game met ervaren developers die zich willen focussen op de game zelf en de beste Roleplay natuurlijk!',
      '',
      '**Wat zoeken wij?**',
      '',
      '• 💻 Developers (Betaald)',
      '• 📜 Scripters (Betaald)',
      '• ⭐ Leuke staff',
      '• 🌟 En jou natuurlijk!',
      '',
      '**Wat bieden wij?**',
      '',
      '• ⭐ Leuke staff leden!',
      '• 🎮 Goede kwaliteits game!',
      '• 💬 Gezellige chats!',
      '• 🎁 Veel giveaways!',
      '• ✨ En nog veel meer!',
      '',
      'Discord link: [De LageLanden Discord](https://discord.gg/myvdKbzTfn)',
    ].join('\n');

    const berichtURL = 'https://cdn.discordapp.com/attachments/1458575373846446233/1460303486318153973/RobloxScreenShot20260109_17464004423232.png?ex=69666d1a&is=69651b9a&hm=175c8d50be23aff72bab0d5940a6e4a693013fa3283d4b551eb09b05c0c23378&';

    try {
      await doelKanaal.send({ content: berichtTekst + '\n[Foto](' + berichtURL + ')', flags: [4] }); // 4 = SuppressEmbeds
      return interaction.reply({ content: `✅ Partnerbericht verzonden in <#${doelKanaal.id}>!`, flags: 64 });
    } catch (e) {
      return interaction.reply({ content: `❌ Kon bericht niet versturen: ${e.message}`, flags: 64 });
    }
  }

  // --------------------------------------------------------------------------
  //  PARTNER FLOW — ticket gebaseerd
  // --------------------------------------------------------------------------

  // Knop ?? Partner Ticket Aanmaken ? aanmaken privé kanaal
  if (interaction.isButton() && interaction.customId === 'partner_ticket') {
    return createPartnerTicket(interaction);
  }

  // Knop 🤝 Stuur Partner Bericht (inside ticket) → open modal
  if (interaction.isButton() && interaction.customId === 'partner_bericht_versturen') {
    const modal = new ModalBuilder().setCustomId('partner_modal').setTitle('🤝 Partnerschap Bericht');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('partner_invite')
          .setLabel('Discord invite link van jullie server')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://discord.gg/xxxxxxx')
          .setRequired(true)
          .setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('partner_bericht')
          .setLabel('Typ hier uw partnerbericht')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Introductie van uw server, wat jullie bieden als partner...')
          .setRequired(true)
          .setMinLength(20)
          .setMaxLength(4000)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // --- embed_modal submit → embed bouwen en sturen ---------------------------
  if (interaction.isModalSubmit() && interaction.customId === 'embed_modal') {
    const session = pendingEmbed.get(interaction.user.id);
    if (!session)
      return interaction.reply({ content: '❌ Sessie verlopen. Gebruik `/embed` opnieuw.', flags: 64 });
    pendingEmbed.delete(interaction.user.id);

    const { kanaalId, kleur, doTag, rol, doTijdstip, doLogo, doAuteur, grootte, fotoUrl } = session;
    const embedGrootte = grootte || 'medium';
    const titel        = interaction.fields.getTextInputValue('embed_titel').trim();
    const beschrijving = interaction.fields.getTextInputValue('embed_beschrijving').trim();
    const footerTekst  = embedGrootte !== 'klein'
      ? (interaction.fields.getTextInputValue('embed_footer').trim() || null)
      : null;
    // Foto: uploaded attachment heeft voorrang boven handmatige URL
    const afbeeldingUrl = embedGrootte !== 'klein' && !fotoUrl
      ? (interaction.fields.getTextInputValue('embed_afbeelding').trim() || null)
      : null;
    const afbeelding   = fotoUrl || afbeeldingUrl;
    const thumbnail    = embedGrootte === 'groot'
      ? (interaction.fields.getTextInputValue('embed_thumbnail').trim() || null)
      : null;

    const doelKanaal = await client.channels.fetch(kanaalId).catch(() => interaction.channel);

    const LID_ROLE_ID = '1458227903731863603';
    const tagContent = doTag
      ? (rol === 'everyone' ? '@everyone' : rol === 'staff' ? `<@&${STAFF_ROLE_ID}>` : `<@&${LID_ROLE_ID}>`)
      : null;

    const serverLogo = interaction.guild.iconURL({ dynamic: true, size: 256 });

    const embed = new EmbedBuilder()
      .setTitle(titel)
      .setDescription(beschrijving)
      .setColor(parseInt(kleur, 16));

    if (embedGrootte === 'klein') {
      // Klein: alleen titel + beschrijving, geen extras
    } else if (embedGrootte === 'groot') {
      // Groot: visueel groot en ruimtelijk — separator, padding, spacer-velden
      const scheider = '─────────────────────────────';
      embed.setDescription(`${scheider}\n\n${beschrijving}\n\n${scheider}`);
      embed.setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
      embed.setTimestamp();
      // Thumbnail: alleen als handmatig een URL is opgegeven
      if (thumbnail) embed.setThumbnail(thumbnail);
      // Logo in footer (klein icoontje links, zoals sneak peek stijl)
      const footerStr = footerTekst || interaction.guild.name;
      embed.setFooter({ text: footerStr, iconURL: serverLogo ?? undefined });
      // Spacer-veld voor extra hoogte
      embed.addFields({ name: '\u200b', value: '\u200b', inline: false });
      if (afbeelding) embed.setImage(afbeelding);
    } else {
      // Medium: huidig gedrag, volgt slash command opties
      if (footerTekst) embed.setFooter({ text: footerTekst, iconURL: serverLogo ?? undefined });
      if (doTijdstip)  embed.setTimestamp();
      if (doLogo)      embed.setThumbnail(serverLogo ?? null);
      if (doAuteur)    embed.setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
      if (afbeelding)  embed.setImage(afbeelding);
    }

    await doelKanaal.send({ content: tagContent ?? undefined, embeds: [embed] });

    return interaction.reply({
      content: `✅ Embed geplaatst in <#${doelKanaal.id}>!${doTag ? ` *(${tagContent} getagd)*` : ''}`,
      flags: 64,
    });
  }

  // Modal submit → profanity check + invite check → "Weet je het zeker?"
  if (interaction.isModalSubmit() && interaction.customId === 'partner_modal') {
    const bericht       = interaction.fields.getTextInputValue('partner_bericht');
    const inviteRaw     = interaction.fields.getTextInputValue('partner_invite').trim();
    const slurs         = checkProfanity(bericht);

    if (slurs.length > 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Bericht Geweigerd — Ongepaste Inhoud')
          .setDescription(
            `Jouw bericht bevat **${slurs.length}** ongepast woord(en):\n${slurs.map(w => `> \`${w}\``).join('\n')}\n\n` +
            'Pas je bericht aan en probeer opnieuw.'
          )
          .setColor(0xFF0000).setFooter({ text: 'Lage Landen RP' })],
        flags: 64
      });
    }

    // Invite ophalen + ledencheck
    await interaction.deferReply({ flags: 64 });
    const inviteCode = inviteRaw
      .replace(/.*discord\.gg\//i, '')
      .replace(/.*discord\.com\/invite\//i, '')
      .split('/')[0].split('?')[0].trim();
    let inviteMemberCount = null;
    try {
      const inv = await client.fetchInvite(inviteCode);
      inviteMemberCount = inv.approximateMemberCount ?? inv.memberCount ?? null;
    } catch { /* ongeldige invite */ }

    if (inviteMemberCount !== null && inviteMemberCount < 25) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Partnerschap Geweigerd — Te Weinig Leden')
          .setDescription(
            `Helaas voldoet jullie server **niet** aan de minimale eis van **25 leden**.\n\n` +
            `📊 Jullie server heeft momenteel: **${inviteMemberCount}** leden\n` +
            `📋 Minimaal vereist: **25 leden**\n\n` +
            `Je kunt een nieuwe aanvraag indienen zodra jullie server aan de eisen voldoet.`
          )
          .setColor(0xFF0000).setFooter({ text: 'Lage Landen RP — Partner Systeem' })]
      });
    }

    // ticketChannelId opslaan voor later gebruik bij goedkeuren/afwijzen
    const ticketChannelId = interaction.channelId;
    pendingPartner.set(interaction.user.id, { bericht, inviteRaw, inviteMemberCount, ticketChannelId });

    const preview = bericht.length > 300 ? bericht.slice(0, 300) + '...' : bericht;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('partner_bevestigen').setLabel('✅ Ja, verstuur').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('partner_annuleren').setLabel('❌ Nee, annuleer').setStyle(ButtonStyle.Danger),
    );
    const memberCountLine = inviteMemberCount !== null
      ? `\n📊 **Gevonden ledencount:** ${inviteMemberCount} leden (invite: \`${inviteCode}\`)`
      : `\n⚠️ Ledencount kon niet opgehaald worden (invite: \`${inviteRaw}\`)`;
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('🤔 Weet je het zeker?')
        .setDescription(
          `Je bericht wordt ter beoordeling verstuurd naar ons staff team.${memberCountLine}\n\n` +
          `**Preview:**\n${preview}`
        )
        .setColor(0xFFA500)
        .setFooter({ text: 'Na goedkeuring verschijnt het in het partnerkanaal.' })],
      components: [row]
    });
  }

  // Knop ? Bevestigen ? doorsturen naar review kanaal
  if (interaction.isButton() && interaction.customId === 'partner_bevestigen') {
    const session = pendingPartner.get(interaction.user.id);
    if (!session) return interaction.reply({ content: '❌ Sessie verlopen. Probeer opnieuw.', flags: 64 });
    pendingPartner.delete(interaction.user.id);

    await interaction.deferUpdate();

    // Knoppen disablen in "weet je het zeker?" embed
    const disabled = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('partner_bevestigen').setLabel('✅ Verstuurd!').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('partner_annuleren').setLabel('❌ Annuleer').setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await interaction.editReply({ components: [disabled] });

    const user             = interaction.user;
    const bericht          = session.bericht;
    const inviteRaw        = session.inviteRaw || null;
    const inviteMemberCount = session.inviteMemberCount ?? null;
    const ticketChannelId  = session.ticketChannelId;

    // Blacklist detectie
    let blWarning = null;
    try {
      const blCh = await client.channels.fetch(BLACKLIST_CHANNEL_ID).catch(() => null);
      if (blCh) {
        const blMsgs = await blCh.messages.fetch({ limit: 100 });
        const blNames = blMsgs.filter(m => m.content && m.content.trim()).map(m => m.content.trim().toLowerCase());
        const hits = blNames.filter(n => bericht.toLowerCase().includes(n));
        if (hits.length) blWarning = hits;
      }
    } catch { /* negeer */ }

    // Sla bericht + ticketkanaal op voor goedkeuring
    pendingPartner.set(`review_${user.id}`, { bericht, inviteRaw, inviteMemberCount, ticketChannelId });

    // Stuur automatisch ONS partnerbericht in de ticket
    if (ticketChannelId) {
      const tCh = await client.channels.fetch(ticketChannelId).catch(() => null);
      if (tCh) {
        const OUR_PARTNER_BERICHT = [
          '## 🌟 De LageLanden Roleplay! 🌟',
          '',
          '**Welkom bij De LageLanden Roleplay🎉🎊**',
          '',
          'Wij zijn een opkomende roleplay game met ervaren developers die zich willen focussen op de game zelf en de beste Roleplay natuurlijk!',
          '',
          '**Wat zoeken wij?**',
          '',
          '• 👨‍💻 Developers (Betaald)',
          '• 💻 Scripters (Betaald)',
          '• ⭐ Leuke staff',
          '• 🎮 En jou natuurlijk!',
          '',
          '**Wat bieden wij?**',
          '',
          '• ⭐ Leuke staff leden!',
          '• 🎮 Goede kwaliteits game!',
          '• 💬 Gezellige chats!',
          '• 🎁 Veel giveaways!',
          '• ✨ En nog veel meer!',
          '',
          'Discord link: [De LageLanden Discord](https://discord.gg/myvdKbzTfn)',
        ].join('\n');
        await tCh.send({
          content: `📨 **Ons partnerbericht — plaats dit in jullie partner kanaal:**\n\n${OUR_PARTNER_BERICHT}`,
          flags: [4],
        }).catch(() => {});
      }
    }

    // Post in review kanaal
    const reviewCh = await client.channels.fetch(db.channels.reviewChannelId).catch(() => null);
    if (!reviewCh) return;

    const memberCountField = inviteMemberCount !== null
      ? `✅ ${inviteMemberCount} leden`
      : '⚠️ Niet opgehaald';

    const reviewEmbed = new EmbedBuilder()
      .setTitle(blWarning ? '🚨 Partner Aanvraag — BLACKLIST DETECTIE!' : '📋 Partner Aanvraag — Wacht op Beoordeling')
      .setDescription(bericht.length > 1020 ? bericht.slice(0, 1020) + '...' : bericht)
      .addFields(
        { name: '👤 Aanvrager',     value: `${user.tag} (<@${user.id}>)`,                 inline: true },
        { name: '📊 Serverleden',   value: memberCountField,                               inline: true },
        { name: '🔗 Invite',        value: inviteRaw ? `\`${inviteRaw}\`` : 'Niet opgegeven', inline: true },
        { name: '📅 Ingediend',     value: `<t:${Math.floor(Date.now()/1000)}:F>`,        inline: true }
      )
      .setColor(blWarning ? 0xFF0000 : 0xFFA500)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setFooter({ text: `Aanvrager ID: ${user.id} | Lage Landen RP` })
      .setTimestamp();

    const reviewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pgoedkeuren_${user.id}`).setLabel('✅ Goedkeuren').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pafwijzen_${user.id}`).setLabel('❌ Afwijzen').setStyle(ButtonStyle.Danger),
    );

    const warnContent = blWarning
      ? `🚨 <@&${WARN_ROLE_1}> <@&${WARN_ROLE_2}> **BLACKLIST DETECTIE!** Aanvraag van **${user.tag}** bevat: ${blWarning.map(h => `\`${h}\``).join(', ')}`
      : `<@&${STAFF_ROLE_ID}> Nieuwe partner aanvraag van **${user.tag}**!`;

    await reviewCh.send({ content: warnContent, embeds: [reviewEmbed], components: [reviewRow] });
    return;
  }

  // Knop ? Annuleren
  if (interaction.isButton() && interaction.customId === 'partner_annuleren') {
    pendingPartner.delete(interaction.user.id);
    await interaction.update({ content: '✅ Verzending geannuleerd.', embeds: [], components: [] });
    return;
  }

  // -- Staff ? Goedkeuren ----------------------------------------------------
  if (interaction.isButton() && interaction.customId.startsWith('pgoedkeuren_')) {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const targetId   = interaction.customId.replace('pgoedkeuren_', '');
    const reviewData  = pendingPartner.get(`review_${targetId}`);
    const bericht     = (typeof reviewData === 'object' ? reviewData?.bericht : reviewData)
      || interaction.message.embeds[0]?.data?.description
      || '';
    const ticketChId  = typeof reviewData === 'object' ? reviewData?.ticketChannelId : null;
    pendingPartner.delete(`review_${targetId}`);

    await interaction.deferUpdate();

    const partnerUser = await client.users.fetch(targetId).catch(() => null);

    const partnerCh = await client.channels.fetch(PARTNER_CHANNEL_ID).catch(() => null);
    if (!partnerCh) return;

    // Plain text — auto-preview voor afbeelding URLs in het bericht
    const partnerTekst = [
      '🤝 **Nieuw Partnerschap**',
      '─────────────────────────────',
      '',
      bericht,
    ].join('\n');

    const partnerMsg = await partnerCh.send({ content: partnerTekst });

    // Opslaan in JSON
    db.partners[targetId] = {
      userId:      targetId,
      serverName:  partnerUser?.tag || 'Onbekend',
      messageId:   partnerMsg.id,
      approvedAt:  Date.now(),
      approvedBy:  interaction.user.id,
    };
    saveData(db);
    await updatePartnersEmbed(interaction.guild);

    // Knoppen disablen
    const disabled = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('_a').setLabel(`✅ Goedgekeurd door ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('_b').setLabel('❌ Afwijzen').setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await interaction.editReply({ components: [disabled] });

    // DM aanvrager
    if (partnerUser) {
      try {
        const dm = await partnerUser.createDM();
        await dm.send({ embeds: [
          new EmbedBuilder().setTitle('🎉 Partnerschap Goedgekeurd!')
            .setDescription(
              `Gefeliciteerd! Jouw partnerschap aanvraag bij **Lage Landen RP** is **goedgekeurd**!\n\n` +
              `Je bericht is nu zichtbaar in <#${PARTNER_CHANNEL_ID}>. Bedankt voor het partnerschap! 🎉`
            )
            .setColor(0x57F287).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
        ]});
      } catch { /* DMs uitgeschakeld — geen fallback needed */ }
    }

    // Log in review kanaal
    await interaction.message.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('✅ Goedgekeurd')
        .setDescription(`Goedgekeurd door **${interaction.user.tag}**.\nBericht geplaatst in <#${PARTNER_CHANNEL_ID}>.`)
        .setColor(0x57F287).setTimestamp()
    ]});

    // Melding in het partner ticket kanaal
    if (ticketChId) {
      const tCh = await client.channels.fetch(ticketChId).catch(() => null);
      if (tCh) {
        const doneRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_sluit').setLabel('🔒 Sluit Ticket').setStyle(ButtonStyle.Secondary),
        );
        await tCh.send({ embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Partnerschap Goedgekeurd!')
            .setDescription(
              `Je partnerbericht is **goedgekeurd** door een stafflid en is nu zichtbaar in <#${PARTNER_CHANNEL_ID}>!\n\n` +
              `Bedankt voor het partnerschap! 🎉\n\nJe kunt dit ticket nu sluiten.`
            )
            .setColor(0x57F287).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
        ], components: [doneRow] });
      }
    }
    return;
  }

  // -- Staff ? Afwijzen ? modal voor reden ----------------------------------
  if (interaction.isButton() && interaction.customId.startsWith('pafwijzen_')) {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const targetId = interaction.customId.replace('pafwijzen_', '');
    const modal = new ModalBuilder()
      .setCustomId(`pafwijzen_modal_${targetId}`)
      .setTitle('❌ Partnerschap Afwijzen');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reden')
        .setLabel('Reden voor afwijzing')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Geef een duidelijke reden...')
        .setRequired(true)
        .setMaxLength(500)
    ));
    await interaction.showModal(modal);
    return;
  }

  // Modal afwijzen ? verwerken
  if (interaction.isModalSubmit() && interaction.customId.startsWith('pafwijzen_modal_')) {
    const targetId   = interaction.customId.replace('pafwijzen_modal_', '');
    const reden      = interaction.fields.getTextInputValue('reden');
    const reviewData = pendingPartner.get(`review_${targetId}`);
    const ticketChId = typeof reviewData === 'object' ? reviewData?.ticketChannelId : null;
    pendingPartner.delete(`review_${targetId}`);

    await interaction.deferUpdate();

    const disabled = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('_a').setLabel('✅ Goedkeuren').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('_b').setLabel(`❌ Afgewezen door ${interaction.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await interaction.editReply({ components: [disabled] });

    // DM aanvrager
    try {
      const u  = await client.users.fetch(targetId);
      const dm = await u.createDM();
      await dm.send({ embeds: [
        new EmbedBuilder().setTitle('❌ Partnerschap Afgewezen')
          .setDescription(
            `Je partnerschap aanvraag bij **Lage Landen RP** is helaas **afgewezen**.\n\n` +
            `**Reden:**\n> ${reden}\n\nHeb je vragen? Neem contact op met het staff team.`
          )
          .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
      ]});
    } catch { /* DMs uitgeschakeld */ }

    await interaction.message.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('❌ Afgewezen')
        .setDescription(`Afgewezen door **${interaction.user.tag}**.\n**Reden:** ${reden}`)
        .setColor(0xFF6B6B).setTimestamp()
    ]});

    // Melding in het partner ticket kanaal
    if (ticketChId) {
      const tCh = await client.channels.fetch(ticketChId).catch(() => null);
      if (tCh) {
        const doneRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_sluit').setLabel('🔒 Sluit Ticket').setStyle(ButtonStyle.Secondary),
        );
        await tCh.send({ embeds: [
          new EmbedBuilder()
            .setTitle('❌ Partnerschap Afgewezen')
            .setDescription(
              `Je partnerbericht is helaas **afgewezen** door een stafflid.\n\n` +
              `**Reden:**\n> ${reden}\n\nHeb je vragen? Stel ze gerust in dit ticket.\nJe kunt het ticket daarna sluiten.`
            )
            .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
        ], components: [doneRow] });
      }
    }
    return;
  }

  // --------------------------------------------------------------------------
  //  TICKET FLOW
  // --------------------------------------------------------------------------

  // /ticket-stats — overzicht van alle ticket statistieken
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket-stats') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen staff kan ticket statistieken bekijken.', flags: 64 });
    const ts = db.ticketStats || {
      totalOpened: 0, totalClosed: 0,
      byType: { support: { opened:0,closed:0 }, report: { opened:0,closed:0 }, sollicitatie: { opened:0,closed:0 }, partner: { opened:0,closed:0 } },
    };
    const openNow = interaction.guild.channels.cache.filter(
      c => c.type === ChannelType.GuildText && c.name.startsWith('\u276Aticket\u276B-')
    ).size;
    const tsEmbed = new EmbedBuilder()
      .setTitle('📊 Ticket Statistieken — Lage Landen RP')
      .setColor(0x5865F2)
      .addFields(
        { name: '📂 Totaal geopend',  value: `**${ts.totalOpened}**`,  inline: true },
        { name: '✅ Totaal gesloten', value: `**${ts.totalClosed}**`,   inline: true },
        { name: '🟢 Nu open',         value: `**${openNow}**`,          inline: true },
        { name: '🔵 Support',         value: `${ts.byType?.support?.opened ?? 0} geopend / ${ts.byType?.support?.closed ?? 0} gesloten`,           inline: true },
        { name: '🔴 Report',          value: `${ts.byType?.report?.opened ?? 0} geopend / ${ts.byType?.report?.closed ?? 0} gesloten`,             inline: true },
        { name: '🟢 Sollicitatie',    value: `${ts.byType?.sollicitatie?.opened ?? 0} geopend / ${ts.byType?.sollicitatie?.closed ?? 0} gesloten`, inline: true },
        { name: '🤝 Partner',         value: `${ts.byType?.partner?.opened ?? 0} geopend / ${ts.byType?.partner?.closed ?? 0} gesloten`,           inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
      .setTimestamp();
    return interaction.reply({ embeds: [tsEmbed] });
  }

  // /claim — stafflid claamt het ticket
  if (interaction.isChatInputCommand() && interaction.commandName === 'claim') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen staff kan een ticket claimen.', flags: 64 });
    const ch = interaction.channel;
    if (!ch.name?.startsWith('\u276Aticket\u276B-'))
      return interaction.reply({ content: '❌ Dit commando werkt alleen in een ticket kanaal.', flags: 64 });
    ticketClaimedBy.set(ch.id, { userId: interaction.user.id, tag: interaction.user.tag });
    const claimEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Geclaimed')
      .setDescription(`<@${interaction.user.id}> heeft dit ticket geclaimed en staat je te helpen!\n\nHeb je geduld — zij zijn nu verantwoordelijk voor dit ticket.`)
      .setColor(0x57F287)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Geclaimed door ${interaction.user.tag} | Lage Landen RP` })
      .setTimestamp();
    await ch.send({ embeds: [claimEmbed] });
    return interaction.reply({ content: '✅ Ticket geclaimed!', flags: 64 });
  }

  // /voegtoe — voeg iemand toe aan het ticket
  if (interaction.isChatInputCommand() && interaction.commandName === 'voegtoe') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen staff kan iemand toevoegen.', flags: 64 });
    const ch = interaction.channel;
    if (!ch.name?.startsWith('\u276Aticket\u276B-'))
      return interaction.reply({ content: '❌ Dit commando werkt alleen in een ticket kanaal.', flags: 64 });
    const target = interaction.options.getUser('gebruiker');
    await ch.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    const addEmbed = new EmbedBuilder()
      .setTitle('➕ Gebruiker Toegevoegd')
      .setDescription(`<@${target.id}> is toegevoegd aan dit ticket door <@${interaction.user.id}>.`)
      .setColor(0x5865F2)
      .setFooter({ text: `Lage Landen RP — Ticket Systeem` })
      .setTimestamp();
    await ch.send({ embeds: [addEmbed] });
    return interaction.reply({ content: `✅ <@${target.id}> toegevoegd aan het ticket.`, flags: 64 });
  }

  // /prioriteit — stel ticketprioriteit in
  if (interaction.isChatInputCommand() && interaction.commandName === 'prioriteit') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen staff kan de prioriteit instellen.', flags: 64 });
    const ch = interaction.channel;
    if (!ch.name?.startsWith('\u276Aticket\u276B-'))
      return interaction.reply({ content: '❌ Dit commando werkt alleen in een ticket kanaal.', flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const niveau = interaction.options.getString('niveau');
    const niveauInfo = {
      normaal: { emoji: '🟡', label: 'Normaal',  color: 0xFFC300, topic: '🟡 Prioriteit: NORMAAL — Lage Landen RP Ticket' },
      hoog:    { emoji: '🔴', label: 'Hoog',     color: 0xFF6B6B, topic: '🔴 Prioriteit: HOOG — Lage Landen RP Ticket' },
      urgent:  { emoji: '🚨', label: 'Urgent',   color: 0xFF0000, topic: '🚨 Prioriteit: URGENT — Direct aandacht vereist! — Lage Landen RP Ticket' },
    };
    const info = niveauInfo[niveau];

    // Kanaalnaam: strip bestaand prioriteit-label en voeg nieuwe toe
    // Formaat: ❪ticket❫-[emoji]-type-user → ❪ticket❫-🔴-type-user
    const PRIO_STRIP = /^(\u276Aticket\u276B-)(🟡-|🔴-|🚨-)?/;
    const cleanName  = ch.name.replace(PRIO_STRIP, '$1');
    const newName    = niveau === 'normaal'
      ? cleanName
      : ch.name.replace(PRIO_STRIP, `\u276Aticket\u276B-${info.emoji}-`);

    const priEmbed = new EmbedBuilder()
      .setTitle(`${info.emoji} Ticket Prioriteit Gewijzigd`)
      .setDescription(`De prioriteit van dit ticket is ingesteld op **${info.label}** door <@${interaction.user.id}>.`)
      .addFields({ name: 'ℹ️ Wat betekent dit?', value:
        niveau === 'normaal' ? 'Standaard prioriteit. Wordt behandeld op volgorde van binnenkomst.' :
        niveau === 'hoog'    ? 'Dit ticket verdient verhoogde aandacht en wordt eerder opgepakt.' :
                               '⚠️ Dit ticket vereist **directe actie**. Staff wordt verzocht dit z.s.m. op te pakken.'
      })
      .setColor(info.color)
      .setFooter({ text: `Prioriteit ingesteld door ${interaction.user.tag} | Lage Landen RP` })
      .setTimestamp();

    // Reply + embed direct sturen — setName wacht op rate-limit dus altijd op achtergrond
    await ch.send({ embeds: [priEmbed] });
    await interaction.editReply({ content: `✅ Prioriteit ingesteld op **${info.label}**. Kanaalnaam wordt zo bijgewerkt.` });
    // Rename op de achtergrond — Discord rate-limit: max 2 renames per 10 min
    ch.setName(newName.slice(0, 100))
      .then(() => ch.setTopic(info.topic))
      .catch(e => console.warn(`⚠️ Ticket rename mislukt (${newName}):`, e.message));
    return;
  }

  // /overdragen — draag ticket over aan ander stafflid
  if (interaction.isChatInputCommand() && interaction.commandName === 'overdragen') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen staff kan een ticket overdragen.', flags: 64 });
    const ch = interaction.channel;
    if (!ch.name?.startsWith('\u276Aticket\u276B-'))
      return interaction.reply({ content: '❌ Dit commando werkt alleen in een ticket kanaal.', flags: 64 });
    const target = interaction.options.getUser('stafflid');
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!targetMember || !hasRoleOrHigher(targetMember, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Die gebruiker is geen stafflid.', flags: 64 });
    // Geef het nieuwe stafflid toegang als dat er nog niet was
    await ch.permissionOverwrites.edit(target.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    }).catch(() => {});
    const prevClaim = ticketClaimedBy.get(ch.id);
    ticketClaimedBy.set(ch.id, { userId: target.id, tag: target.tag });
    const overdraagEmbed = new EmbedBuilder()
      .setTitle('🔄 Ticket Overgedragen')
      .setDescription(
        `<@${interaction.user.id}> heeft dit ticket overgedragen aan <@${target.id}>.

` +
        `<@${target.id}> is nu verantwoordelijk voor dit ticket.`
      )
      .addFields(
        { name: '👤 Overgedragen door', value: `<@${interaction.user.id}>`, inline: true },
        { name: '👤 Nieuw verantwoordelijk', value: `<@${target.id}>`, inline: true },
        prevClaim ? { name: '👤 Vorig stafflid', value: `<@${prevClaim.userId}>`, inline: true } : { name: '\u200B', value: '\u200B', inline: true },
      )
      .setColor(0x5865F2)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Lage Landen RP — Ticket Systeem' })
      .setTimestamp();
    await ch.send({ content: `<@${target.id}>`, embeds: [overdraagEmbed] });
    return interaction.reply({ content: `✅ Ticket overgedragen aan <@${target.id}>.`, flags: 64 });
  }

  // /serverinfo — server statistieken
  if (interaction.isChatInputCommand() && interaction.commandName === 'serverinfo') {
    const guild = interaction.guild;
    await guild.fetch();
    await guild.members.fetch().catch(() => {});
    const totalMembers  = guild.memberCount;
    const botCount      = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount    = totalMembers - botCount;
    const onlineCount   = guild.members.cache.filter(m => !m.user.bot && m.presence?.status && m.presence.status !== 'offline').size;
    const channelCount  = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceCount    = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const roleCount     = guild.roles.cache.size - 1; // -1 voor @everyone
    const boostCount    = guild.premiumSubscriptionCount || 0;
    const boostTier     = guild.premiumTier;
    const created       = Math.floor(guild.createdTimestamp / 1000);
    const openTickets   = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText && c.name.startsWith('\u276Aticket\u276B-')
    ).size;
    const tierLabel     = ['Geen', 'Tier 1', 'Tier 2', 'Tier 3'][boostTier] ?? 'Onbekend';
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name} — Server Info`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👥 Leden',          value: `**${humanCount}** mensen\n${botCount} bots`, inline: true },
        { name: '🟢 Online',         value: `**${onlineCount}**`, inline: true },
        { name: '🎫 Open Tickets',   value: `**${openTickets}**`, inline: true },
        { name: '💬 Tekst kanalen',  value: `**${channelCount}**`, inline: true },
        { name: '🔊 Voice kanalen',  value: `**${voiceCount}**`, inline: true },
        { name: '🏷️ Rollen',         value: `**${roleCount}**`, inline: true },
        { name: '🚀 Boosts',         value: `**${boostCount}** (${tierLabel})`, inline: true },
        { name: '🤝 Partners',       value: `**${Object.keys(db.partners).length}**`, inline: true },
        { name: '📅 Server aangemaakt', value: `<t:${created}:D> (<t:${created}:R>)`, inline: false },
      )
      .setColor(0x5865F2)
      .setFooter({ text: `ID: ${guild.id} | Lage Landen RP`, iconURL: guild.iconURL({ dynamic: true }) })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_support')
    return createTicket(interaction, 'Support');
  if (interaction.isButton() && interaction.customId === 'ticket_report')
    return createTicket(interaction, 'Report');
  if (interaction.isButton() && interaction.customId === 'ticket_sollicitatie')
    return createTicket(interaction, 'Sollicitatie');

  // Ticket sluiten
  if (interaction.isButton() && interaction.customId === 'ticket_sluit') {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setDescription(`⏳ Ticket wordt gesloten door <@${interaction.user.id}>...\n💾 Transcript wordt opgeslagen...`)
        .setColor(0xFF6B6B)],
      flags: 64
    });
    const g   = interaction.guild;
    const ch  = interaction.channel;
    const who = interaction.user;
    setTimeout(async () => {
      await logTicketTranscript(ch, who).catch(() => {});

      // Ticket stats bijhouden bij sluiten
      if (!db.ticketStats) db.ticketStats = { totalOpened: 0, totalClosed: 0, byType: { support: { opened:0,closed:0 }, report: { opened:0,closed:0 }, sollicitatie: { opened:0,closed:0 }, partner: { opened:0,closed:0 } } };
      db.ticketStats.totalClosed++;
      const rawName = ch.name.replace(/^\u276Aticket\u276B-(?:\uD83D\uDFE1-|\uD83D\uDD34-|\uD83D\uDEA8-)?/, '');
      const tType = rawName.split('-')[0];
      if (db.ticketStats.byType[tType]) db.ticketStats.byType[tType].closed++;
      saveData(db);

      await ch.delete().catch(() => {});
      updateReactietijdEmbed(g).catch(() => {});
    }, 3_000);
    return;
  }

  // ----------------------------------------------------------------------------
  //  WARN SYSTEEM
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  //  MODERATIE COMMANDO'S (/ban /timeout /kick /mute)
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'ban') {
    if (!hasRoleOrHigher(interaction.member, ADMIN_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen Admins en hoger kunnen bannen.', flags: 64 });

    const target   = interaction.options.getUser('gebruiker');
    const reden    = interaction.options.getString('reden');
    const delDays  = interaction.options.getInteger('verwijder-dagen') ?? 0;
    const member   = interaction.guild.members.cache.get(target.id);

    if (hasRoleOrHigher(member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je kunt geen stafflid bannen.', flags: 64 });

    // DM naar de gebruiker vóór de ban
    await target.send({ embeds: [
      new EmbedBuilder()
        .setTitle('🔨 Je bent gebanned van Lage Landen RP')
        .setDescription(
          `**Reden:** ${reden}\n\n` +
          `Als je dit wil betwisten, neem dan contact op via een andere weg.`
        )
        .setColor(0xFF0000)
        .setFooter({ text: 'Lage Landen RP' })
        .setTimestamp()
    ]}).catch(() => {});

    await interaction.guild.members.ban(target.id, { reason: `${reden} — door ${interaction.user.tag}`, deleteMessageDays: delDays }).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('🔨 Gebruiker Gebanned')
      .setColor(0xFF0000)
      .addFields(
        { name: '👤 Gebruiker', value: `${target.tag} (\`${target.id}\`)`, inline: true },
        { name: '🏴‍☠️ Door',     value: `${interaction.user.tag}`,           inline: true },
        { name: '📝 Reden',    value: reden,                                inline: false },
      )
      .setFooter({ text: 'Lage Landen RP' }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await modLog(embed);
    addModLog(target.id, target.tag, 'ban', reden, interaction.user.tag, interaction.user.id);
    return;
  }

  // --- /tempban
  if (interaction.isChatInputCommand() && interaction.commandName === 'tempban') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target   = interaction.options.getMember('gebruiker');
    const duurStr  = interaction.options.getString('duur');
    const reden    = interaction.options.getString('reden');

    if (!target) return interaction.reply({ content: '❌ Gebruiker niet gevonden.', flags: 64 });
    if (hasRoleOrHigher(target, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je kunt geen stafflid tempbannen.', flags: 64 });

    // Parse duur: 1u=uur, 1d=dag, 1w=week
    const duurMatch = duurStr.match(/^(\d+)(u|d|w)$/i);
    if (!duurMatch)
      return interaction.reply({ content: '❌ Ongeldige duur. Gebruik bijv: `1u`, `12u`, `7d`, `30d`', flags: 64 });

    const mult = { u: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const ms = parseInt(duurMatch[1]) * mult[duurMatch[2].toLowerCase()];
    const expiresAt = Date.now() + ms;

    await interaction.deferReply({ flags: 64 });

    // DM naar de gebruiker vóór de tempban
    await target.user.send({ embeds: [
      new EmbedBuilder()
        .setTitle('⏳ Je bent tijdelijk gebanned van Lage Landen RP')
        .setDescription(
          `**Duur:** ${duurStr}\n` +
          `**Verloopt:** <t:${Math.floor((Date.now() + parseInt(duurMatch[1]) * mult[duurMatch[2].toLowerCase()]) / 1000)}:F>\n\n` +
          `**Reden:** ${reden}\n\n` +
          `Na afloop word je automatisch terug toegevoegd aan de server.`
        )
        .setColor(0xFF6B35)
        .setFooter({ text: 'Lage Landen RP' })
        .setTimestamp()
    ]}).catch(() => {});

    await target.ban({ reason: `Tempban (${duurStr}): ${reden} — door ${interaction.user.tag}` }).catch(() => {});

    tempbansDB[target.id] = {
      reason:     reden,
      bannedAt:   Date.now(),
      expiresAt,
      bannedBy:   interaction.user.tag,
      bannedById: interaction.user.id,
      guildId:    interaction.guildId,
    };
    saveTempbans(tempbansDB);
    scheduleUnban(target.id, interaction.guildId, ms);
    addModLog(target.id, target.user.tag, 'tempban', `${duurStr}: ${reden}`, interaction.user.tag, interaction.user.id);

    const tbEmbed = new EmbedBuilder()
      .setTitle('⏳ Tijdelijke Ban')
      .setColor(0xFF6B35)
      .addFields(
        { name: '👤 Gebruiker',  value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
        { name: '🏴‍☠️ Door',      value: interaction.user.tag,                    inline: true },
        { name: '⏰ Duur',       value: duurStr,                                 inline: true },
        { name: '📅 Verloopt op', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: false },
        { name: '📝 Reden',      value: reden,                                  inline: false },
      )
      .setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp();

    await modLog(tbEmbed);
    return interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('⏳ Tempban Uitgevoerd')
      .setDescription(`**${target.user.tag}** is tijdelijk gebanned voor **${duurStr}**.\n📅 Verloopt: <t:${Math.floor(expiresAt / 1000)}:R>`)
      .setColor(0xFF6B35).setTimestamp()
    ]});
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'timeout') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target  = interaction.options.getUser('gebruiker');
    const minuten = interaction.options.getInteger('minuten');
    const reden   = interaction.options.getString('reden');
    const member  = interaction.guild.members.cache.get(target.id);

    if (!member) return interaction.reply({ content: '❌ Gebruiker niet gevonden.', flags: 64 });
    if (hasRoleOrHigher(member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Je kunt geen stafflid timeouten.', flags: 64 });

    // DM naar de gebruiker vóór de timeout
    await target.send({ embeds: [
      new EmbedBuilder()
        .setTitle('⏰ Je hebt een Timeout op Lage Landen RP')
        .setDescription(
          `**Duur:** ${minuten >= 60 ? `${Math.floor(minuten/60)}u ${minuten%60}m` : `${minuten}m`}\n` +
          `**Reden:** ${reden}\n\n` +
          `Na afloop van de timeout kun je weer normaal deelnemen aan de server.`
        )
        .setColor(0xFFA500)
        .setFooter({ text: 'Lage Landen RP' })
        .setTimestamp()
    ]}).catch(() => {});

    await member.timeout(minuten * 60_000, `${reden} — door ${interaction.user.tag}`).catch(() => {});

    const uren = Math.floor(minuten / 60);
    const min  = minuten % 60;
    const duur = uren > 0 ? `${uren}u ${min}m` : `${minuten}m`;

    const embed = new EmbedBuilder()
      .setTitle('⏰ Gebruiker Getimeouted')
      .setColor(0xFFA500)
      .addFields(
        { name: '👤 Gebruiker', value: `${target.tag} (\`${target.id}\`)`, inline: true },
        { name: '🏴‍☠️ Door',     value: `${interaction.user.tag}`,           inline: true },
        { name: '⏱️ Duur',     value: duur,                                 inline: true },
        { name: '📝 Reden',    value: reden,                                inline: false },
      )
      .setFooter({ text: 'Lage Landen RP' }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await modLog(embed);
    addModLog(target.id, target.tag, 'timeout', `${duur} — ${reden}`, interaction.user.tag, interaction.user.id);
    return;
  }

  if (interaction.isChatInputCommand() && (interaction.commandName === 'kick' || interaction.commandName === 'mute')) {
    const isKick   = interaction.commandName === 'kick';
    // Kick = admin+, Mute = gewone staff is genoeg
    if (isKick && !hasRoleOrHigher(interaction.member, ADMIN_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen Admins en hoger kunnen kicken.', flags: 64 });
    if (!isKick && !hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });
    const target  = interaction.options.getUser('gebruiker');
    const reden   = interaction.options.getString('reden');
    const member  = interaction.guild.members.cache.get(target.id);

    if (!member) return interaction.reply({ content: '❌ Gebruiker niet gevonden op de server.', flags: 64 });
    if (hasRoleOrHigher(member, STAFF_ROLE_ID))
      return interaction.reply({ content: `❌ Je kunt geen stafflid ${isKick ? 'kicken' : 'muten'}.`, flags: 64 });

    // Sla verzoek op en stuur naar security log voor goedkeuring
    const requestId = `MOD-${Date.now()}`;
    pendingModActions.set(requestId, {
      type: isKick ? 'kick' : 'mute',
      targetId: target.id,
      targetTag: target.tag,
      reason: reden,
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      guildId: interaction.guild.id,
    });
    // Automatisch verwijderen na 10 minuten
    setTimeout(() => pendingModActions.delete(requestId), 10 * 60_000);

    const actionLabel  = isKick ? '👢 Kick' : '🔇 Mute (28 dagen)';
    const actionColor  = isKick ? 0xFF6B00 : 0x9B59B6;

    const approvalEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Goedkeuring Vereist — ${actionLabel}`)
      .setColor(actionColor)
      .addFields(
        { name: '👤 Gebruiker',    value: `${target.tag} (\`${target.id}\`)`,           inline: true },
        { name: '🏴‍☠️ Aangevraagd', value: `${interaction.user.tag}`,                    inline: true },
        { name: '📝 Reden',        value: reden,                                          inline: false },
        { name: '🔑 Verzoek ID',   value: `\`${requestId}\``,                           inline: true },
        { name: '⏱️ Verloopt in',  value: '10 minuten',                                  inline: true },
      )
      .setFooter({ text: 'Klik Goedkeuren of Weigeren hieronder' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`modapprove:${requestId}`).setLabel('✅ Goedkeuren').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`moddeny:${requestId}`).setLabel('❌ Weigeren').setStyle(ButtonStyle.Danger),
    );

    const logCh = secCfg.securityLogChannelId
      ? await client.channels.fetch(secCfg.securityLogChannelId).catch(() => null)
      : null;

    if (logCh) {
      await logCh.send({
        content: `<@&${OWNER_ROLE_ID}> <@&${CO_OWNER_ROLE_ID}> — Goedkeuring vereist voor **${actionLabel}**`,
        embeds: [approvalEmbed],
        components: [row],
      }).catch(() => {});
      await interaction.reply({ content: `✅ Verzoek verstuurd naar de security log. Wacht op goedkeuring (ID: \`${requestId}\`).`, flags: 64 });
    } else {
      await interaction.reply({ content: '❌ Geen security log kanaal ingesteld. Gebruik eerst `/security-status` om er één in te stellen.', flags: 64 });
      pendingModActions.delete(requestId);
    }
    return;
  }

  // -- Moderatie goedkeuring knoppen (modapprove / moddeny) -----------------
  if (interaction.isButton() && (interaction.customId.startsWith('modapprove:') || interaction.customId.startsWith('moddeny:'))) {
    if (!interaction.member.roles.cache.has(OWNER_ROLE_ID) && !interaction.member.roles.cache.has(CO_OWNER_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen de Eigenaar of Mede-Eigenaar kan dit goedkeuren.', flags: 64 });

    const isApprove = interaction.customId.startsWith('modapprove:');
    const requestId = interaction.customId.split(':')[1];
    const action    = pendingModActions.get(requestId);

    if (!action) {
      return interaction.reply({ content: '❌ Dit verzoek is verlopen of bestaat niet meer.', flags: 64 });
    }

    pendingModActions.delete(requestId);

    // Verwijder de knoppen van het originele bericht
    await interaction.message.edit({ components: [] }).catch(() => {});

    if (!isApprove) {
      const denyEmbed = new EmbedBuilder()
        .setTitle(`❌ ${action.type === 'kick' ? 'Kick' : 'Mute'} Geweigerd`)
        .setColor(0x808080)
        .addFields(
          { name: '👤 Gebruiker',   value: `${action.targetTag} (\`${action.targetId}\`)`, inline: true },
          { name: '🏴‍☠️ Geweigerd',  value: `${interaction.user.tag}`,                       inline: true },
        )
        .setFooter({ text: 'Lage Landen RP' }).setTimestamp();
      await interaction.reply({ embeds: [denyEmbed] });
      return;
    }

    // Goedgekeurd — uitvoeren
    const guild  = await client.guilds.fetch(action.guildId).catch(() => null);
    const member = guild ? await guild.members.fetch(action.targetId).catch(() => null) : null;

    if (action.type === 'kick') {
      // DM naar de gebruiker vóór de kick
      await member?.user.send({ embeds: [
        new EmbedBuilder()
          .setTitle('👢 Je bent gekickt van Lage Landen RP')
          .setDescription(
            `**Reden:** ${action.reason}\n\n` +
            `Je kunt opnieuw joinen via een invite link. Als je dit wil betwisten, neem dan contact op met een stafflid.`
          )
          .setColor(0xFF6B00)
          .setFooter({ text: 'Lage Landen RP' })
          .setTimestamp()
      ]}).catch(() => {});
      await member?.kick(`${action.reason} — door ${action.requesterTag}, goedgekeurd door ${interaction.user.tag}`).catch(() => {});
    } else {
      await member?.timeout(28 * 24 * 60 * 60_000, `${action.reason} — door ${action.requesterTag}, goedgekeurd door ${interaction.user.tag}`).catch(() => {});
    }

    const doneEmbed = new EmbedBuilder()
      .setTitle(`✅ ${action.type === 'kick' ? '👢 Kick' : '🔇 Mute'} Uitgevoerd`)
      .setColor(action.type === 'kick' ? 0xFF6B00 : 0x9B59B6)
      .addFields(
        { name: '👤 Gebruiker',     value: `${action.targetTag} (\`${action.targetId}\`)`, inline: true },
        { name: '🏴‍☠️ Aangevraagd',  value: action.requesterTag,                              inline: true },
        { name: '✅ Goedgekeurd',   value: `${interaction.user.tag}`,                        inline: true },
        { name: '📝 Reden',         value: action.reason,                                    inline: false },
      )
      .setFooter({ text: 'Lage Landen RP' }).setTimestamp();

    await interaction.reply({ embeds: [doneEmbed] });
    await modLog(doneEmbed);
    addModLog(action.targetId, action.targetTag, action.type, action.reason, action.requesterTag, action.requesterId);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'warn') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target = interaction.options.getUser('gebruiker');
    const reden  = interaction.options.getString('reden');
    if (!warnsDB[target.id]) warnsDB[target.id] = [];

    const warnId = Date.now();
    warnsDB[target.id].push({ id: warnId, reason: reden, username: target.tag, by: interaction.user.tag, byId: interaction.user.id, at: Date.now() });
    saveWarns(warnsDB);

    const count = warnsDB[target.id].length;
    const color = count >= 5 ? 0xFF0000 : count >= 3 ? 0xFF6B00 : 0xFFA500;

    const warnEmbed = new EmbedBuilder()
      .setTitle(`⚠️ Waarschuwing #${count}`)
      .setColor(color)
      .addFields(
        { name: '👤 Gebruiker',  value: `${target.tag} (\`${target.id}\`)`,           inline: true },
        { name: '🏴‍☠️ Door',       value: `${interaction.user.tag}`,                    inline: true },
        { name: '📝 Reden',       value: reden,                                        inline: false },
        { name: '📊 Totaal warns', value: `**${count}** waarschuwing${count > 1 ? 'en' : ''}`, inline: true },
      )
      .setFooter({ text: `Warn ID: ${warnId} | Lage Landen RP` })
      .setTimestamp();

    await interaction.reply({ embeds: [warnEmbed] });
    await modLog(warnEmbed);
    addModLog(target.id, target.tag, 'warn', reden, interaction.user.tag, interaction.user.id);

    // DM naar de gewaarschuwde gebruiker
    target.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`⚠️ Je hebt een Waarschuwing ontvangen — Waarschuwing #${count}`)
        .setDescription(
          `**Reden:** ${reden}\n\n` +
          `Je hebt nu **${count}** waarschuwing${count > 1 ? 'en' : ''}. ` +
          `Bij meerdere waarschuwingen kunnen verdere maatregelen worden genomen.`
        )
        .setColor(color)
        .setFooter({ text: `Warn ID: ${warnId} | Lage Landen RP` })
        .setTimestamp()
    ]}).catch(() => {});

    // Auto-acties bij drempel
    const guildMember = interaction.guild.members.cache.get(target.id);
    if (guildMember) {
      await applyWarnThresholds(guildMember, target.id, (msg) => interaction.followUp({ content: msg }));
    }
    return;
  }

  // --- /history
  if (interaction.isChatInputCommand() && interaction.commandName === 'history') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target  = interaction.options.getUser('gebruiker');
    const entries = modlogDB[target.id] || [];
    if (!entries.length)
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`📋 Straf History — ${target.tag}`)
        .setDescription('*Geen strafhistory gevonden.*')
        .setColor(0x99AAB5)
      ], flags: 64 });

    const typeEmoji = { ban:'🔨', tempban:'⏳', kick:'👢', mute:'🔇', timeout:'⏱️', warn:'⚠️', 'automod-spam':'🤖', 'automod-profanity':'🤖' };
    const lines = entries.slice(-20).reverse().map(e => {
      const emoji = typeEmoji[e.type] || '📋';
      const ts    = `<t:${Math.floor(e.at / 1000)}:d>`;
      return `${emoji} **${e.type}** — ${ts}\n> ${(e.reason || '').slice(0, 80)}\n> Door: ${e.by}`;
    });

    return interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle(`📋 Straf History — ${target.tag}`)
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: '📊 Totaal', value: `${entries.length} acties`, inline: true },
        { name: '🔗 Gebruiker', value: `<@${target.id}>`, inline: true },
      )
      .setColor(0x5865F2)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Lage Landen RP — Mod Log' }).setTimestamp()
    ], flags: 64 });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'warnings') {
    const target = interaction.options.getUser('gebruiker');
    const list   = warnsDB[target.id] || [];
    if (!list.length) return interaction.reply({ content: `✅ **${target.username}** heeft geen waarschuwingen.`, flags: 64 });

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Waarschuwingen van ${target.username}`)
      .setColor(list.length >= 3 ? 0xFF6B00 : 0xFFA500)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setDescription(list.map((w, i) =>
        `**${i + 1}.** ${w.reason}\n` +
        `📝 Door \`${w.by}\` — <t:${Math.floor(w.at / 1000)}:R> • ID: \`${w.id}\``
      ).join('\n\n'))
      .setFooter({ text: `Totaal: ${list.length} warn(s) | Lage Landen RP` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'unwarn') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target = interaction.options.getUser('gebruiker');
    const num    = interaction.options.getInteger('nummer');
    const list   = warnsDB[target.id] || [];
    if (!list.length) return interaction.reply({ content: `✅ **${target.username}** heeft geen waarschuwingen.`, flags: 64 });

    const idx = num ? num - 1 : list.length - 1;
    if (idx < 0 || idx >= list.length)
      return interaction.reply({ content: `❌ Waarschuwing #${num} bestaat niet.`, flags: 64 });

    const removed = list.splice(idx, 1)[0];
    warnsDB[target.id] = list;
    saveWarns(warnsDB);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Waarschuwing Verwijderd')
        .setColor(0x57F287)
        .addFields(
          { name: '👤 Gebruiker', value: `${target.tag}`,          inline: true },
          { name: '📝 Reden was', value: removed.reason,           inline: true },
          { name: '📊 Resterend', value: `${list.length} warn(s)`, inline: true },
        )
        .setFooter({ text: 'Lage Landen RP — Warn Systeem' }).setTimestamp()],
      flags: 64
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'clearwarns') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target = interaction.options.getUser('gebruiker');
    const count  = (warnsDB[target.id] || []).length;
    warnsDB[target.id] = [];
    saveWarns(warnsDB);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏴‍☠️ Alle Waarschuwingen Verwijderd')
        .setColor(0x57F287)
        .setDescription(`Alle **${count}** waarschuwing${count !== 1 ? 'en' : ''} van **${target.tag}** zijn verwijderd.`)
        .setFooter({ text: 'Lage Landen RP' }).setTimestamp()],
      flags: 64
    });
  }

  // ----------------------------------------------------------------------------
  //  VERLOF SYSTEEM (alleen staff)
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'verlof') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen beschikbaar voor staffleden.', flags: 64 });

    const van   = interaction.options.getString('van');
    const tot   = interaction.options.getString('tot');
    const reden = interaction.options.getString('reden');

    const id = `V${Date.now()}`;
    const entry = {
      id, userId: interaction.user.id, username: interaction.user.tag,
      van, tot, reden, ingediend: Date.now(), status: 'pending', goedgekeurdDoor: null,
    };
    verlofDB.push(entry);
    saveVerlof(verlofDB);

    const embed = new EmbedBuilder()
      .setTitle('📅 Verlofaanvraag Ingediend')
      .setColor(0x5865F2)
      .addFields(
        { name: '👤 Stafflid',   value: interaction.user.tag,   inline: true },
        { name: '🔇 Van',         value: van,                    inline: true },
        { name: '📅 Tot',         value: tot,                    inline: true },
        { name: '📝 Reden',       value: reden,                  inline: false },
        { name: '🪪 Verlof ID',   value: `\`${id}\``,           inline: true },
        { name: '📊 Status',      value: '⏳ In behandeling',    inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Verlof Systeem' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await modLog(new EmbedBuilder()
      .setTitle('🏴‍☠️ Nieuwe Verlofaanvraag')
      .setColor(0x5865F2)
      .addFields(
        { name: '👤 Stafflid', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: '📅 Periode',   value: `${van} t/m ${tot}`,                                  inline: true },
        { name: '📝 Reden',     value: reden,                                                 inline: false },
        { name: '🪪 ID',        value: `\`${id}\` — gebruik /verlof-beslissing`,             inline: false },
      )
      .setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    );
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'verlof-overzicht') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const pending  = verlofDB.filter(v => v.status === 'pending');
    const approved = verlofDB.filter(v => v.status === 'goedgekeurd').slice(-5);
    const rejected = verlofDB.filter(v => v.status === 'afgewezen').slice(-3);

    const fmt = (list) => list.length
      ? list.map(v => `**${v.username}** — ${v.van} t/m ${v.tot}\n? \`${v.id}\` • _${v.reden.slice(0, 60)}_`).join('\n\n')
      : '*Geen*';

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏴‍☠️ Verlof Overzicht')
        .setColor(0x5865F2)
        .addFields(
          { name: `⏳ In behandeling (${pending.length})`,   value: fmt(pending).slice(0, 1000),  inline: false },
          { name: `✅ Goedgekeurd (laatste 5)`,              value: fmt(approved).slice(0, 500),  inline: false },
          { name: `❌ Afgewezen (laatste 3)`,                value: fmt(rejected).slice(0, 500),  inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — Verlof Systeem' }).setTimestamp()],
      flags: 64
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'verlof-beslissing') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const id         = interaction.options.getString('id');
    const beslissing = interaction.options.getString('beslissing');
    const entry      = verlofDB.find(v => v.id === id);
    if (!entry) return interaction.reply({ content: `❌ Verlof ID \`${id}\` niet gevonden.`, flags: 64 });

    entry.status         = beslissing;
    entry.goedgekeurdDoor = interaction.user.tag;
    saveVerlof(verlofDB);

    const ok = beslissing === 'goedgekeurd';
    const embed = new EmbedBuilder()
      .setTitle(ok ? '✅ Verlof Goedgekeurd' : '❌ Verlof Afgewezen')
      .setColor(ok ? 0x57F287 : 0xFF6B6B)
      .addFields(
        { name: '👤 Stafflid',      value: entry.username,          inline: true },
        { name: '📅 Periode',        value: `${entry.van} t/m ${entry.tot}`, inline: true },
        { name: '📝 Reden',          value: entry.reden,            inline: false },
        { name: '🏴‍☠️ Beslissing door', value: interaction.user.tag, inline: true },
      )
      .setFooter({ text: 'Lage Landen RP — Verlof Systeem' }).setTimestamp();
    await interaction.reply({ embeds: [embed] });

    // DM sturen naar stafflid
    try {
      const u = await client.users.fetch(entry.userId);
      await u.send({ embeds: [new EmbedBuilder()
        .setTitle(ok ? '✅ Jouw Verlofaanvraag is Goedgekeurd' : '❌ Jouw Verlofaanvraag is Afgewezen')
        .setColor(ok ? 0x57F287 : 0xFF6B6B)
        .setDescription(ok
          ? `Jouw verlof van **${entry.van}** t/m **${entry.tot}** is goedgekeurd! Geniet ervan ???`
          : `Jouw verlof van **${entry.van}** t/m **${entry.tot}** is helaas afgewezen. Neem contact op met management voor meer info.`)
        .setFooter({ text: 'Lage Landen RP' }).setTimestamp()
      ]});
    } catch { /* DMs gesloten */ }
    return;
  }

  // ----------------------------------------------------------------------------
  //  INACTIEF SYSTEEM (alleen staff)
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'inactief-check') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const drempel = (interaction.options.getInteger('dagen') || 7) * 86400_000;
    const now     = Date.now();
    await interaction.guild.members.fetch().catch(() => {});
    const staffleden = interaction.guild.members.cache.filter(m => m.roles.cache.has(STAFF_ROLE_ID) && !m.user.bot);

    const rows = [];
    for (const [uid, member] of staffleden) {
      const data    = inactiefDB[uid];
      const lastMsg = data?.lastMessage || null;
      const diff    = lastMsg ? now - lastMsg : null;
      const inactief = diff === null || diff > drempel;
      const label   = lastMsg ? `<t:${Math.floor(lastMsg / 1000)}:R>` : '*nooit gezien*';
      const icon    = inactief ? '🔴' : '🟢';
      rows.push({ inactief, text: `${icon} **${member.user.username}** — Laatste bericht: ${label}` });
    }

    rows.sort((a, b) => (b.inactief ? 1 : 0) - (a.inactief ? 1 : 0));
    const inactiefCount = rows.filter(r => r.inactief).length;

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`📊 Inactief Check — Staff (drempel: ${drempel / 86400_000}d)`)
        .setColor(inactiefCount > 0 ? 0xFF6B6B : 0x57F287)
        .setDescription(rows.map(r => r.text).join('\n') || '*Geen staffleden gevonden.*')
        .addFields({ name: '📊 Inactief', value: `${inactiefCount}/${rows.length} staffleden`, inline: true })
        .setFooter({ text: 'Lage Landen RP — Inactief Systeem' }).setTimestamp()],
      flags: 64
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'inactief-meld') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Alleen beschikbaar voor staffleden.', flags: 64 });

    const van   = interaction.options.getString('van');
    const tot   = interaction.options.getString('tot');
    const reden = interaction.options.getString('reden');

    if (!inactiefDB[interaction.user.id]) inactiefDB[interaction.user.id] = { lastMessage: Date.now(), username: interaction.user.tag, gemeld: [] };
    inactiefDB[interaction.user.id].gemeld = inactiefDB[interaction.user.id].gemeld || [];
    inactiefDB[interaction.user.id].gemeld.push({ van, tot, reden, ingediend: Date.now() });
    saveInactief(inactiefDB);

    const embed = new EmbedBuilder()
      .setTitle('📅 Inactiviteit Gemeld')
      .setColor(0xFFA500)
      .addFields(
        { name: '👤 Stafflid', value: interaction.user.tag, inline: true },
        { name: '🔇 Van',       value: van,                  inline: true },
        { name: '📅 Tot',       value: tot,                  inline: true },
        { name: '📝 Reden',     value: reden,                inline: false },
      )
      .setFooter({ text: 'Lage Landen RP — Inactief Systeem' }).setTimestamp();

    await interaction.reply({ embeds: [embed] });
    await modLog(new EmbedBuilder()
      .setTitle('⚠️ Stafflid Gemeld Inactief')
      .setColor(0xFFA500)
      .addFields(
        { name: '👤 Stafflid', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: '📅 Periode',   value: `${van} t/m ${tot}`,                                  inline: true },
        { name: '📝 Reden',     value: reden,                                                 inline: false },
      )
      .setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    );
    return;
  }

  // ----------------------------------------------------------------------------
  //  XP / NIVEAU SYSTEEM
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'rank') {
    const target = interaction.options.getUser('gebruiker') || interaction.user;
    const data   = xpDB[target.id] || { xp: 0, level: 0 };
    const lvl    = data.level;
    const curXP  = data.xp;
    const needed = xpForLevel(lvl + 1);
    const prev   = xpForLevel(lvl);
    const pct    = Math.min(100, Math.round(((curXP - prev) / (needed - prev)) * 100));

    // Globale rank berekenen
    const sorted = Object.entries(xpDB).sort((a, b) => b[1].xp - a[1].xp);
    const rank   = sorted.findIndex(([id]) => id === target.id) + 1 || '?';

    const bar = '¦'.repeat(Math.floor(pct / 10)) + '¦'.repeat(10 - Math.floor(pct / 10));

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`🏆 Rank — ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setColor(0x5865F2)
        .addFields(
          { name: '🏴‍☠️ Level',    value: `**${lvl}**`,                         inline: true },
          { name: '🏅 Rank',     value: `**#${rank}**`,                       inline: true },
          { name: '⭐ XP',       value: `**${curXP}** / ${needed} XP`,        inline: true },
          { name: `📊 Voortgang (${pct}%)`, value: `\`${bar}\``,              inline: false },
        )
        .setFooter({ text: 'Lage Landen RP — XP Systeem' }).setTimestamp()],
      flags: 64
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard-xp') {
    const top = Object.entries(xpDB)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const rows = top.map(([uid, d], i) =>
      `${medals[i] || `**${i + 1}.**`} **${d.username || uid}** — Level **${d.level}** • \`${d.xp} XP\``
    ).join('\n');

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏆 XP Leaderboard — Lage Landen RP')
        .setDescription(rows || '*Nog geen XP data.*')
        .setColor(0xFFD700)
        .setFooter({ text: `${Object.keys(xpDB).length} leden bijgehouden | Lage Landen RP` }).setTimestamp()],
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'xp-reset') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target = interaction.options.getUser('gebruiker');
    delete xpDB[target.id];
    saveXP(xpDB);
    return interaction.reply({ content: `✅ XP van **${target.username}** is gereset.`, flags: 64 });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'xp-geef') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const target = interaction.options.getUser('gebruiker');
    const amount = interaction.options.getInteger('xp');
    if (!xpDB[target.id]) xpDB[target.id] = { xp: 0, level: 0, username: target.tag };
    xpDB[target.id].xp += amount;
    xpDB[target.id].level = getLevel(xpDB[target.id].xp);
    saveXP(xpDB);
    return interaction.reply({
      content: `✅ **${amount} XP** gegeven aan **${target.username}**. Nu op level **${xpDB[target.id].level}** (${xpDB[target.id].xp} XP).`,
      flags: 64
    });
  }

  // ----------------------------------------------------------------------------
  //  GIVEAWAY SYSTEEM
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID))
      return interaction.reply({ content: '❌ Geen toegang.', flags: 64 });

    const sub = interaction.options.getSubcommand();

    // -- Start ----------------------------------------------------------------
    if (sub === 'start') {
      const prijs       = interaction.options.getString('prijs');
      const duurStr     = interaction.options.getString('duur');
      const kanaal      = interaction.options.getChannel('kanaal') || interaction.channel;
      const winnersCount = interaction.options.getInteger('winnaars') || 1;
      const duurMs      = parseDuration(duurStr);

      if (!duurMs || duurMs < 60_000)
        return interaction.reply({ content: '❌ Ongeldige duur. Gebruik bijv. `10m`, `2h`, `1d`.', flags: 64 });

      const endsAt  = Date.now() + duurMs;
      const gwId    = `G${Date.now()}`;
      const endTime = Math.floor(endsAt / 1000);

      const embed = new EmbedBuilder()
        .setTitle(`🎊 GIVEAWAY — ${prijs}`)
        .setDescription(
          `Klik op de knop hieronder om mee te doen!\n\n` +
          `**Einddatum:** <t:${endTime}:R> (<t:${endTime}:F>)\n` +
          `**Winnaars:** ${winnersCount}\n` +
          `**Gehost door:** ${interaction.user.username}`
        )
        .addFields({ name: '👥 Deelnemers', value: '0', inline: true })
        .setColor(0xFFD700)
        .setFooter({ text: `Giveaway ID: ${gwId} | Lage Landen RP` })
        .setTimestamp(new Date(endsAt));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter_${gwId}`)
          .setLabel('🎉 Doe mee!')
          .setStyle(ButtonStyle.Primary),
      );

      await safeDefer(interaction, { flags: 64 });
      if (!interaction.deferred && !interaction.replied) return;
      const msg = await kanaal.send({ embeds: [embed], components: [row] });

      const gw = { id: gwId, channelId: kanaal.id, messageId: msg.id, guildId: interaction.guild.id,
                   prize: prijs, endsAt, hostId: interaction.user.id, winnersCount,
                   participants: [], ended: false };
      giveawayDB.push(gw);
      saveGiveaways(giveawayDB);

      const timer = setTimeout(() => endGiveaway(gw), duurMs);
      giveawayTimers.set(gwId, timer);

      return interaction.editReply({ content: `✅ Giveaway gestart in <#${kanaal.id}>! ID: \`${gwId}\`` });
    }

    // -- Stop -----------------------------------------------------------------
    if (sub === 'stop') {
      const gwId = interaction.options.getString('id');
      const gw   = giveawayDB.find(g => g.id === gwId && !g.ended);
      if (!gw) return interaction.reply({ content: `❌ Giveaway \`${gwId}\` niet gevonden of al afgelopen.`, flags: 64 });

      const timer = giveawayTimers.get(gwId);
      if (timer) clearTimeout(timer);
      await endGiveaway(gw);
      return interaction.reply({ content: `✅ Giveaway \`${gwId}\` vroegtijdig beëindigd.`, flags: 64 });
    }

    // -- Lijst -----------------------------------------------------------------
    if (sub === 'lijst') {
      const active = giveawayDB.filter(g => !g.ended);
      if (!active.length) return interaction.reply({ content: '📭 Geen actieve giveaways.', flags: 64 });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`🎊 Actieve Giveaways (${active.length})`)
          .setColor(0xFFD700)
          .setDescription(active.map(g =>
            `**${g.prize}** — Eindigt <t:${Math.floor(g.endsAt / 1000)}:R>\n` +
            `👥 ${g.participants.length} deelnemer(s) • ${g.winnersCount} winnaar(s) • ID: \`${g.id}\``
          ).join('\n\n'))
          .setFooter({ text: 'Lage Landen RP — Giveaway Systeem' }).setTimestamp()],
        flags: 64
      });
    }
  }

  // -- Giveaway deelname button ----------------------------------------------
  if (interaction.isButton() && interaction.customId.startsWith('giveaway_enter_')) {
    const gwId = interaction.customId.slice('giveaway_enter_'.length);
    const gw   = giveawayDB.find(g => g.id === gwId);
    if (!gw || gw.ended)
      return interaction.reply({ content: '❌ Deze giveaway is al afgelopen.', flags: 64 });

    if (gw.participants.includes(interaction.user.id))
      return interaction.reply({ content: '⚠️ Je doet al mee met deze giveaway!', flags: 64 });

    gw.participants.push(interaction.user.id);
    saveGiveaways(giveawayDB);

    // Update embed met nieuwe deelnemer count
    try {
      const msg = await interaction.message.fetch();
      const embed = EmbedBuilder.from(msg.embeds[0]);
      const fields = embed.data.fields || [];
      const fi = fields.findIndex(f => f.name === '👥 Deelnemers');
      if (fi >= 0) fields[fi].value = `${gw.participants.length}`;
      else embed.addFields({ name: '👥 Deelnemers', value: `${gw.participants.length}`, inline: true });
      await msg.edit({ embeds: [embed] }).catch(() => {});
    } catch {}

    return interaction.reply({ content: `🎉 Je doet nu mee met de giveaway voor **${gw.prize}**! Succes!`, flags: 64 });
  }

  // ----------------------------------------------------------------------------
  //  RADIO SYSTEEM (volledig geïsoleerd van discord-player)
  // ----------------------------------------------------------------------------
  if (interaction.isChatInputCommand() && interaction.commandName === 'radio') {
    const radioVc = interaction.member?.voice?.channel;
    if (!radioVc)
      return interaction.reply({ content: '❌ Ga eerst in een voice kanaal zitten!', flags: 64 });
    const rcdLast = radioCooldown.get(interaction.user.id) || 0;
    const rcdLeft = RADIO_COOLDOWN - (Date.now() - rcdLast);
    if (rcdLeft > 0)
      return interaction.reply({ content: `⏳ Wacht nog **${Math.ceil(rcdLeft / 1000)}s** voordat je weer een station kiest.`, flags: 64 });
    radioCooldown.set(interaction.user.id, Date.now());
    const stationId = interaction.options.getString('station');
    await interaction.deferReply();
    try {
      const label = await startRadio(radioVc, stationId);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('📻 Radio Gestart')
          .setDescription(`Nu live: **${label}**`)
          .setColor(0xE8472F)
          .addFields({ name: '⏹️ Stoppen', value: 'Gebruik `/radiostoppen` of `/stop`', inline: false })
          .setFooter({ text: 'Lage Landen RP — Radio Systeem' })
          .setTimestamp()]
      });
    } catch (e) {
      console.error('❌ Radio start fout:', e.message);
      return interaction.editReply({ content: `❌ Radio starten mislukt: ${e.message}` });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'radiostoppen') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Alleen staff kan radio stoppen.', flags: 64 });
    }
    const stopped = stopRadio(interaction.guildId);
    if (!stopped)
      return interaction.reply({ content: '❌ Er speelt geen radio of piratenzender. (Gebruik `/stop` voor muziek)', flags: 64 });
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('⏹️ Gestopt')
        .setDescription('Het radiostation / de piratenzender is gestopt en het voice kanaal verlaten.')
        .setColor(0xE8472F).setTimestamp()]
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'piraten') {
    const radioVc = interaction.member?.voice?.channel;
    if (!radioVc)
      return interaction.reply({ content: '❌ Ga eerst in een voice kanaal zitten!', flags: 64 });
    const pcdLast = radioCooldown.get(interaction.user.id) || 0;
    const pcdLeft = RADIO_COOLDOWN - (Date.now() - pcdLast);
    if (pcdLeft > 0)
      return interaction.reply({ content: `⏳ Wacht nog **${Math.ceil(pcdLeft / 1000)}s** voordat je weer een zender kiest.`, flags: 64 });
    radioCooldown.set(interaction.user.id, Date.now());
    const zenderId = interaction.options.getString('zender');
    const station  = PIRATE_STATIONS[zenderId];
    if (!station)
      return interaction.reply({ content: '❌ Onbekende zender.', flags: 64 });
    await interaction.deferReply();
    try {
      // startRadio werkt met elke stream URL — geef URL en label rechtstreeks mee
      const label = await startRadio(radioVc, null, station.url, station.label);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('🏴‍☠️ Piratenzender Gestart')
          .setDescription(`Nu live: **${station.label}**`)
          .setColor(0xFF6600)
          .addFields({ name: '⏹️ Stoppen', value: 'Gebruik `/radiostoppen` of `/stop`', inline: false })
          .setFooter({ text: 'Lage Landen RP — Geheime Zenders 🏴‍☠️' })
          .setTimestamp()]
      });
    } catch (e) {
      console.error('❌ Piraten start fout:', e.message);
      return interaction.editReply({ content: `❌ Piratenzender starten mislukt: ${e.message}

De stream is mogelijk tijdelijk offline — probeer een andere zender.` });
    }
  }

  // ----------------------------------------------------------------------------
  //  MUZIEK SYSTEEM
  // ----------------------------------------------------------------------------
  if (!interaction.isChatInputCommand()) return;
  const MUSIC_CMDS = new Set(['play','skip','skipall','stop','queue','pause','np','volume','shuffle','loop','autoplay','lyrics','skippen','filters','kwaliteit']);
  if (!MUSIC_CMDS.has(interaction.commandName)) return;

  const vc = interaction.member?.voice?.channel;

  // -- /play ----------------------------------------------------------------
  if (interaction.commandName === 'play') {
    if (!vc)
      return interaction.reply({ content: '❌ Ga eerst in een voice kanaal zitten!', flags: 64 });

    // — Cooldown check —
    const lastPlay = playCooldown.get(interaction.user.id) || 0;
    const remaining = PLAY_COOLDOWN - (Date.now() - lastPlay);
    if (remaining > 0)
      return interaction.reply({ content: `⏳ Wacht nog **${Math.ceil(remaining / 1000)}s** voordat je weer een nummer kunt toevoegen.`, flags: 64 });
    playCooldown.set(interaction.user.id, Date.now());

    // — Content filter (incl. leet-speak normalisatie) —
    const rawQuery = interaction.options.getString('query');
    const queryLower = normalizeLeet(rawQuery);
    const blockedTerm = MUSIC_BLOCKLIST.find(term => queryLower.includes(term));
    if (blockedTerm) {
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🚫 Wat denk je nou zelf...')
          .setDescription(`**${rawQuery}**\n\nDit soort dingen spelen we hier niet. Doe normaal.`)
          .setColor(0xFF0000)
          .setFooter({ text: 'Lage Landen RP — gepaste muziek graag 🎵' })
      ], flags: 64 });
    }

    // Stop radio als die actief is (radio en muziek zijn aparte systemen)
    stopRadio(interaction.guildId);

    await interaction.deferReply();

    let track;
    try {
      const mkTimeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('Zoeken duurde te lang. Probeer het opnieuw.')), ms));
      track = await Promise.race([searchMusic(rawQuery), mkTimeout(30_000)]);
    } catch (e) {
      return interaction.editReply({ content: `❌ Zoeken mislukt: \`${e.message}\`` });
    }
    if (!track) return interaction.editReply({ content: `❌ Geen resultaten gevonden voor **${rawQuery}**.` });

    // Filter op track-titel (URL-bypass omzeilen)
    const titleLower = normalizeLeet(track.title || '');
    const blockedTitle = MUSIC_BLOCKLIST.find(term => titleLower.includes(term));
    if (blockedTitle) {
      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle('🚫 Wat denk je nou zelf...')
          .setDescription(`**${track.title}**\n\nDit soort dingen spelen we hier niet. Doe normaal.`)
          .setColor(0xFF0000).setFooter({ text: 'Lage Landen RP — gepaste muziek graag 🎵' })
      ]});
    }

    // Max duur check — staff en hoger zijn vrijgesteld
    const durParts = (track.duration || '0:00').split(':').map(Number);
    const durSec   = durParts.length === 3 ? durParts[0]*3600+durParts[1]*60+durParts[2] : durParts[0]*60+(durParts[1]||0);
    const isStaff  = hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isStaff && durSec > MAX_DURATION_S)
      return interaction.editReply({ content: `❌ **${track.title}** is te lang (${track.duration}). Maximaal 10 minuten per nummer.` });

    track.requestedBy = interaction.user;
    const existingState = getMusicState(interaction.guildId);

    if (existingState && isMusicPlaying(interaction.guildId)) {
      // Wachtrij check
      if (existingState.tracks.length >= MAX_QUEUE_SIZE)
        return interaction.editReply({ content: `❌ De wachtrij zit vol (max **${MAX_QUEUE_SIZE}** nummers).` });
      const userCount = existingState.tracks.filter(t => t.requestedBy?.id === interaction.user.id).length;
      if (userCount >= MAX_PER_USER)
        return interaction.editReply({ content: `❌ Je hebt al **${MAX_PER_USER}** nummers in de wachtrij.` });

      existingState.tracks.push(track);
      const pos   = existingState.tracks.length;
      const thumb = track.thumbnail?.startsWith?.('http') ? track.thumbnail : null;
      const embed = new EmbedBuilder()
        .setTitle('🎵 Toegevoegd aan Wachtrij')
        .setDescription(track.url ? `**[${track.title}](${track.url})**` : `**${track.title}**`)
        .addFields(
          { name: '🎤 Artiest',  value: track.author   || 'Onbekend', inline: true },
          { name: '⏱️ Duur',     value: track.duration || '?',        inline: true },
          { name: '📍 Positie',  value: `#${pos}`,                    inline: true },
        )
        .setColor(0x1DB954)
        .setFooter({ text: `Aangevraagd door ${interaction.user.username} | Lage Landen RP` })
        .setTimestamp();
      if (thumb) embed.setThumbnail(thumb);
      return interaction.editReply({ embeds: [embed] });
    }

    // Eerste nummer — start de engine
    try {
      await startMusicEngine(vc, track, interaction.channel);
      return interaction.editReply({ content: `🎵 Speelt nu: **${track.title}**` });
    } catch (e) {
      console.error('❌ startMusicEngine fout:', e.message);
      return interaction.editReply({ content: `❌ Kon niet starten: \`${e.message}\`` });
    }
  }

  // -- /skip ----------------------------------------------------------------
  if (interaction.commandName === 'skip') {
    if (!isMusicPlaying(interaction.guildId)) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan direct skippen. Gebruik **/skippen** om te stemmen voor een skip.', flags: 64 });
    }
    const current = getMusicState(interaction.guildId)?.currentTrack;
    skipCurrentTrack(interaction.guildId);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('⏭️ Overgeslagen')
        .setDescription(`**${current?.title || 'Onbekend'}** is overgeslagen.`)
        .setColor(0x1DB954).setTimestamp()]
    });
  }

  // -- /skipall -------------------------------------------------------------
  if (interaction.commandName === 'skipall') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan de wachtrij wissen.', flags: 64 });
    }
    const ms = getMusicState(interaction.guildId);
    if (!ms) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    const count = ms.tracks.length;
    ms.tracks = [];
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏴‍☠️ Wachtrij Gewist')
        .setDescription(count > 0
          ? `**${count}** nummer${count !== 1 ? 's' : ''} verwijderd.\nHuidig nummer speelt gewoon door.`
          : 'De wachtrij was al leeg.\nHuidig nummer speelt gewoon door.')
        .setColor(0xFF6B6B).setTimestamp()]
    });
  }

  // -- /stop ----------------------------------------------------------------
  if (interaction.commandName === 'stop') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan stoppen.', flags: 64 });
    }
    const hasMusicState = musicMap.has(interaction.guildId);
    const radioStopped  = stopRadio(interaction.guildId);
    if (!hasMusicState && !radioStopped)
      return interaction.reply({ content: '❌ Er speelt niets (geen muziek en geen radio).', flags: 64 });
    if (hasMusicState) stopMusicEngine(interaction.guildId);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('⏹️ Gestopt')
        .setDescription(radioStopped ? 'Radio gestopt en voice kanaal verlaten.' : 'Muziek gestopt en voice kanaal verlaten.')
        .setColor(0xFF6B6B).setTimestamp()]
    });
  }

  // -- /queue ---------------------------------------------------------------
  if (interaction.commandName === 'queue') {
    const ms = getMusicState(interaction.guildId);
    if (!ms?.currentTrack) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    const current = ms.currentTrack;
    const tracks  = ms.tracks.slice(0, 10);
    const desc = [
      `**Nu speelt:** [${current.title}](${current.url || ''}) — \`${current.duration}\``,
      '',
      ...tracks.map((t, i) => `**${i + 1}.** [${t.title}](${t.url || ''}) — \`${t.duration}\``),
      ms.tracks.length > 10 ? `\n_...en nog ${ms.tracks.length - 10} nummer(s)_` : ''
    ].join('\n');
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('📋 Wachtrij')
        .setDescription(desc.slice(0, 4000))
        .setColor(0x1DB954)
        .setFooter({ text: `${ms.tracks.length} nummer(s) in de wachtrij` })
        .setTimestamp()],
      flags: 64
    });
  }

  // -- /pause ---------------------------------------------------------------
  if (interaction.commandName === 'pause') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan muziek pauzeren.', flags: 64 });
    }
    const ms = getMusicState(interaction.guildId);
    if (!ms?.currentTrack) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    const paused = isMusicPaused(interaction.guildId);
    paused ? ms.audioPlayer.unpause() : ms.audioPlayer.pause();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(paused ? '▶️ Hervat' : '⏸️ Gepauzeerd')
        .setDescription(paused ? 'Muziek hervat.' : 'Muziek gepauzeerd. Gebruik `/pause` opnieuw om te hervatten.')
        .setColor(0x1DB954).setTimestamp()]
    });
  }

  // -- /np ------------------------------------------------------------------
  if (interaction.commandName === 'np') {
    const ms = getMusicState(interaction.guildId);
    if (!ms?.currentTrack) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    return interaction.reply({ embeds: [buildNpEmbed_m(ms, ms.currentTrack, interaction.guildId)], flags: 64 });
  }

  // -- /volume --------------------------------------------------------------
  if (interaction.commandName === 'volume') {
    return interaction.reply({ content: '⚠️ Volume aanpassen is tijdelijk niet beschikbaar na de muziek-update.', flags: 64 });
  }

  // -- /shuffle -------------------------------------------------------------
  if (interaction.commandName === 'shuffle') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan de wachtrij schudden.', flags: 64 });
    }
    const ms = getMusicState(interaction.guildId);
    if (!ms?.tracks.length) return interaction.reply({ content: '❌ Geen nummers in de wachtrij.', flags: 64 });
    for (let i = ms.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ms.tracks[i], ms.tracks[j]] = [ms.tracks[j], ms.tracks[i]];
    }
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🔀 Wachtrij Geschud')
        .setDescription(`${ms.tracks.length} nummer(s) in willekeurige volgorde gezet.`)
        .setColor(0x1DB954).setTimestamp()]
    });
  }

  // -- /loop -----------------------------------------------------------------
  if (interaction.commandName === 'loop') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan de loop instellen.', flags: 64 });
    }
    const ms = getMusicState(interaction.guildId);
    if (!ms?.currentTrack) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    const modus = interaction.options.getString('modus');
    ms.loop = modus === 'track' ? 'track' : modus === 'queue' ? 'queue' : 'off';
    const label = modus === 'track' ? '🔂 Huidig nummer wordt herhaald'
                : modus === 'queue' ? '🔁 Hele wachtrij wordt herhaald'
                : '▶️ Loop uitgeschakeld';
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle('🔁 Loop').setDescription(label).setColor(0x1DB954).setTimestamp()]
    });
  }

  // -- /autoplay -------------------------------------------------------------
  if (interaction.commandName === 'autoplay') {
    return interaction.reply({ content: '⚠️ Autoplay is tijdelijk niet beschikbaar na de muziek-update.', flags: 64 });
  }

  // -- /skippen (vote skip) --------------------------------------------------
  if (interaction.commandName === 'skippen') {
    if (!isMusicPlaying(interaction.guildId)) return interaction.reply({ content: '❌ Er speelt niets.', flags: 64 });
    const vc2 = interaction.member?.voice?.channel;
    if (!vc2) return interaction.reply({ content: '❌ Ga in een voice kanaal zitten!', flags: 64 });

    const members = vc2.members.filter(m => !m.user.bot);
    const needed  = members.size;

    if (!voteSkipMap.has(interaction.guildId)) voteSkipMap.set(interaction.guildId, new Set());
    const votes = voteSkipMap.get(interaction.guildId);

    if (votes.has(interaction.user.id))
      return interaction.reply({ content: `⚠️ Je hebt al gestemd. **${votes.size}/${needed}** stemmen.`, flags: 64 });

    votes.add(interaction.user.id);

    if (votes.size >= needed) {
      voteSkipMap.delete(interaction.guildId);
      skipCurrentTrack(interaction.guildId);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('⏭️ Skip — Gestemd!')
          .setDescription(`**${votes.size}/${needed}** stemmen bereikt — nummer overgeslagen!`)
          .setColor(0x1DB954).setTimestamp()]
      });
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏴‍☠️ Stem om te Skippen')
        .setDescription(`**${votes.size}/${needed}** stemmen. Nog **${needed - votes.size}** nodig.`)
        .setColor(0xFFA500).setTimestamp()]
    });
  }

  // -- /lyrics ---------------------------------------------------------------
  if (interaction.commandName === 'lyrics') {
    await interaction.deferReply({ flags: 64 });
    const zoek   = interaction.options.getString('zoek') || getMusicState(interaction.guildId)?.currentTrack?.title;
    if (!zoek) return interaction.editReply('❌ Geef een zoekterm op of speel eerst een nummer af.');
    try {
      const searches = await geniusClient.songs.search(zoek);
      const song     = searches[0];
      if (!song) return interaction.editReply(`❌ Geen lyrics gevonden voor **${zoek}**.`);
      const lyrics   = await song.lyrics();
      const trimmed  = lyrics?.slice(0, 3900) || 'Geen tekst gevonden.';
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle(`🎵 ${song.title}`)
          .setDescription(trimmed + (lyrics?.length > 3900 ? '\n\n_...tekst ingekort_' : ''))
          .setColor(0xFFFF00)
          .setURL(song.url)
          .setFooter({ text: 'Via Genius | Lage Landen RP' }).setTimestamp()]
      });
    } catch (e) {
      return interaction.editReply(`❌ Kon lyrics niet ophalen: \`${e.message}\``);
    }
  }

  // -- /filters --------------------------------------------------------------
  if (interaction.commandName === 'filters') {
    return interaction.reply({ content: '⚠️ Audio filters zijn tijdelijk niet beschikbaar na de muziek-update.', flags: 64 });
  }

  // -- /kwaliteit ------------------------------------------------------------
  if (interaction.commandName === 'kwaliteit') {
    if (!hasRoleOrHigher(interaction.member, STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Alleen staff kan de audio kwaliteit aanpassen.', flags: 64 });
    }
    const modus = interaction.options.getString('modus');
    musicQuality.set(interaction.guildId, modus);
    const labels = {
      laag:   '🔵 **Laag** — minste CPU, lichte buffering. Goed als de bot stottert.',
      medium: '🟡 **Medium** — aanbevolen balans tussen kwaliteit en CPU.',
      hoog:   '🔴 **Hoog** — beste kwaliteit, meeste CPU. Alleen als de PC het aankan.',
    };
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🎵 Audio Kwaliteit')
        .setDescription(`${labels[modus]}\n\nGeldt voor het **volgende** nummer dat je afspeelt.`)
        .setColor(0x5865F2).setTimestamp()],
      flags: 64
    });
  }

  // --- /suggestie
  if (interaction.isChatInputCommand() && interaction.commandName === 'suggestie') {
    const tekst = interaction.options.getString('tekst');
    const chId  = db.channels.suggestieChannelId;
    const sugCh = chId ? await client.channels.fetch(chId).catch(() => null) : interaction.channel;
    if (!sugCh)
      return interaction.reply({ content: '❌ Geen suggestie kanaal ingesteld. Gebruik `/suggestie-kanaal` om er een in te stellen.', flags: 64 });

    const sugEmbed = new EmbedBuilder()
      .setTitle('💡 Nieuwe Suggestie')
      .setDescription(tekst)
      .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '👍 Voor',     value: '0',               inline: true },
        { name: '👎 Tegen',    value: '0',               inline: true },
        { name: '📊 Status',   value: '⏳ In behandeling', inline: true },
      )
      .setColor(0x5865F2).setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sug_voor').setLabel('👍 Mee eens').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sug_tegen').setLabel('👎 Niet mee eens').setStyle(ButtonStyle.Danger),
    );

    const msg = await sugCh.send({ embeds: [sugEmbed], components: [row] });
    // Sla stemmen op in memory + persistent
    const voteData = { voor: [], tegen: [], authorId: interaction.user.id, tekst };
    suggestionsDB[msg.id] = voteData;
    saveSuggestions(suggestionsDB);
    suggestionVotesCache.set(msg.id, { voor: new Set(), tegen: new Set(), authorId: interaction.user.id, tekst });
    return interaction.reply({ content: `✅ Suggestie geplaatst in <#${sugCh.id}>!`, flags: 64 });
  }

  // --- /suggestie-kanaal
  if (interaction.isChatInputCommand() && interaction.commandName === 'suggestie-kanaal') {
    const ch = interaction.options.getChannel('kanaal');
    db.channels.suggestieChannelId = ch.id;
    saveData(db);
    return interaction.reply({ content: `✅ Suggestie kanaal ingesteld op <#${ch.id}>!`, flags: 64 });
  }

  // --- Suggestie stemknoppen
  if (interaction.isButton() && (interaction.customId === 'sug_voor' || interaction.customId === 'sug_tegen')) {
    const msgId  = interaction.message.id;
    if (!suggestionVotesCache.has(msgId)) {
      // Herstel uit persistent storage als in-memory leeg is
      const saved = suggestionsDB[msgId];
      suggestionVotesCache.set(msgId, {
        voor: new Set(saved?.voor ?? []),
        tegen: new Set(saved?.tegen ?? []),
        authorId: saved?.authorId ?? null,
        tekst: saved?.tekst ?? '',
      });
    }
    const votes  = suggestionVotesCache.get(msgId);
    const userId = interaction.user.id;

    if (interaction.customId === 'sug_voor') {
      votes.tegen.delete(userId);
      if (votes.voor.has(userId)) votes.voor.delete(userId);
      else votes.voor.add(userId);
    } else {
      votes.voor.delete(userId);
      if (votes.tegen.has(userId)) votes.tegen.delete(userId);
      else votes.tegen.add(userId);
    }

    // Persistent opslaan
    if (suggestionsDB[msgId]) {
      suggestionsDB[msgId].voor  = [...votes.voor];
      suggestionsDB[msgId].tegen = [...votes.tegen];
      saveSuggestions(suggestionsDB);
    }

    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFields(
      { name: '👍 Voor',   value: `${votes.voor.size}`,  inline: true },
      { name: '👎 Tegen',  value: `${votes.tegen.size}`, inline: true },
      { name: '📊 Status', value: '⏳ In behandeling',    inline: true },
    );
    return interaction.update({ embeds: [newEmbed] });
  }
});

// ----------------------------------------------------------------------------
//  GUILD MEMBER REMOVE — partner bericht opruimen
// ----------------------------------------------------------------------------
client.on('guildMemberRemove', async (member) => {
  const partner = db.partners[member.user.id];
  if (!partner) return;

  try {
    const ch  = await client.channels.fetch(PARTNER_CHANNEL_ID).catch(() => null);
    const msg = ch ? await ch.messages.fetch(partner.messageId).catch(() => null) : null;
    if (msg) await msg.delete();
    console.log(`🗑️ Partnerbericht van ${member.user.tag} verwijderd (verliet server).`);
  } catch { /* negeer */ }

  delete db.partners[member.user.id];
  saveData(db);

  const guild = member.guild || client.guilds.cache.first();
  await updatePartnersEmbed(guild);

  const logCh = await client.channels.fetch(db.channels.reviewChannelId).catch(() => null);

  try {
    const u  = await client.users.fetch(member.user.id);
    const dm = await u.createDM();
    await dm.send({ embeds: [
      new EmbedBuilder().setTitle('😔 Partnerschap Beëindigd')
        .setDescription(
          'Jouw partnerschap met **Lage Landen RP** is automatisch beëindigd omdat je de server hebt verlaten.\n\n' +
          'Wil je opnieuw aanvragen? Rejoin de server!'
        )
        .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
    ]});
  } catch {
    if (logCh) await logCh.send(
      `⚠️ DM mislukt — **${member.user.tag}** verliet de server. Partnerschap beëindigd. DMs staan uit.`
    );
  }

  if (logCh) await logCh.send({ embeds: [
    new EmbedBuilder().setTitle('👋 Partnerschap Beëindigd — Verliet Server')
      .addFields(
        { name: '👤 Gebruiker', value: member.user.tag,   inline: true },
        { name: '🪪 ID',        value: member.user.id,    inline: true },
        { name: '⏰ Tijdstip',   value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false }
      )
      .setColor(0xFF6B6B).setFooter({ text: 'Lage Landen RP' }).setTimestamp()
  ]});
});

// --- Error handling ----------------------------------------------------------
// ----------------------------------------------------------------------------
//  PRESENCE UPDATE — reactietijd bijwerken als staff online/offline gaat
// ----------------------------------------------------------------------------
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  const member = newPresence?.member || oldPresence?.member;
  if (!member) return;
  if (!hasRoleOrHigher(member, STAFF_ROLE_ID)) return;

  const oldStatus = oldPresence?.status ?? 'offline';
  const newStatus = newPresence?.status ?? 'offline';
  if (oldStatus === newStatus) return;

  // Status is veranderd voor een stafflid — bijwerken
  const guild = member.guild;
  updateReactietijdEmbed(guild).catch(() => {});
});

// ----------------------------------------------------------------------------
//  WEBHOOK BEVEILIGING
// ----------------------------------------------------------------------------
client.on('webhooksUpdate', async (channel) => {
  if (!secCfg.webhookProtection?.enabled) return;
  const audit = await channel.guild.fetchAuditLogs({ type: 101 /* WebhookCreate */, limit: 1 }).catch(() => null);
  const entry = audit?.entries.first();
  if (!entry || Date.now() - entry.createdTimestamp > 8000) return;
  addSecurityEvent('webhook_created', {
    channelId: channel.id, channelName: channel.name,
    by: entry.executor?.tag, byId: entry.executor?.id,
  });
  await securityLog(new EmbedBuilder()
    .setTitle('🪝 Webhook Aangemaakt — Let Op!')
    .setColor(0xFFA500)
    .addFields(
      { name: '📢 Kanaal',  value: `<#${channel.id}> \`#${channel.name}\``,                                        inline: true },
      { name: '👤 Door',    value: entry.executor ? `${entry.executor.tag} (\`${entry.executor.id}\`)` : 'Onbekend', inline: true },
      { name: '⏰ Tijdstip', value: `<t:${Math.floor(Date.now() / 1000)}:F>`,                                        inline: false },
    )
    .setFooter({ text: 'Lage Landen RP — Webhook Beveiliging' }).setTimestamp()
  );
});

client.on('error', e => {
  if (isIgnorableError(e)) return;
  console.error('❌ Discord error:', e);
});
process.on('unhandledRejection', e => {
  if (isIgnorableError(e)) return;
  console.error('❌ Unhandled rejection:', e);
});

// Schrijf offline status bij afsluiten
['exit', 'SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  try { fs.writeFileSync(STATS_PATH, JSON.stringify({ online: false, updatedAt: Date.now() })); } catch {}
}));

client.login(BOT_TOKEN).catch(e => { console.error('❌ Login mislukt:', e); process.exit(1); });
