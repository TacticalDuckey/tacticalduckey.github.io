// ════════════════════════════════════════════════════════════════════════════
//  Lage Landen RP — Control Panel Server
//  Start met: node discord-bot/panel.js   of   start-panel.bat
//  Open in browser: http://localhost:3000
// ════════════════════════════════════════════════════════════════════════════

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const cp      = require('child_process');
const crypto  = require('crypto');
const qs      = require('querystring');
const { WebSocketServer } = require('ws');

// ─── Live log buffer ──────────────────────────────────────────────────────────
const LOG_BUFFER_MAX = 2000;
const logBuffer = []; // { ts, src, level, message }

// ─── WebSocket clients ───────────────────────────────────────────────────────
const wsClients = new Set();

function wsBroadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of wsClients) {
    try { if (ws.readyState === 1 /* OPEN */) ws.send(payload); }
    catch { wsClients.delete(ws); }
  }
}

function classifyLevel(txt) {
  const t = String(txt);
  if (/✅|gestart|online|klaar|geslaagd|actief|aangemaakt|geregistreerd/i.test(t)) return 'ok';
  if (/❌|error|fout|mislukt|failed|crash/i.test(t))  return 'error';
  if (/⚠️|warn|waarschuw|gestopt|offline/i.test(t))   return 'warn';
  return 'info';
}

function addLog(src, message) {
  const level   = classifyLevel(message);
  const entry   = { ts: Date.now(), src, level, message: String(message).trim() };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  // Broadcast naar live WebSocket clients
  wsBroadcast({ type: 'log', entry });
}

// Patch console methods so everything is captured
['log','info','warn','error','debug'].forEach(method => {
  const orig = console[method].bind(console);
  console[method] = (...args) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    addLog('panel', msg);
    orig(...args);
  };
});

// ─── .env laden ──────────────────────────────────────────────────────────────
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
  }
} catch {}

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT              = process.env.PANEL_PORT     || 3000;
const PANEL_PASSWORD    = process.env.PANEL_PASSWORD  || 'admin123';
const BOT_TOKEN         = process.env.BOT_TOKEN       || '';
const GUILD_ID          = '1457746990678016002';
const BLACKLIST_CHAN_ID  = process.env.DISCORD_CHANNEL_ID || '1471529070712848588';
const STAFF_ROLE_ID     = '1458531506208374879';
const PARTNER_CHANNEL_ID= '1457835992743547033';
const DATA_PATH         = path.join(__dirname, 'partner-data.json');
const STATS_PATH        = path.join(__dirname, 'bot-stats.json');
const WARNS_PATH        = path.join(__dirname, 'warns.json');
const STRIKES_PATH      = path.join(__dirname, 'strikes.json');
const MODLOG_PATH       = path.join(__dirname, 'modlog.json');
const BOT_SCRIPT        = path.join(__dirname, 'bot.js');
const GUARDIAN_SCRIPT   = path.join(__dirname, 'guardian', 'bot.js');

// ─── Sessies (simpele in-memory store) ───────────────────────────────────────
const sessions = new Map();
function genToken() { return crypto.randomBytes(32).toString('hex'); }
function getSession(req) {
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  if (!cookie) return null;
  const token = cookie.slice(4);
  return sessions.get(token) || null;
}

// ─── Bot process ──────────────────────────────────────────────────────────────
let botProc       = null;
let manualStop    = false;   // true = bewust gestopt, geen auto-restart
let restartCount  = 0;
let restartTimer  = null;

// ─── Guardian process ────────────────────────────────────────────────────────
let guardianProc         = null;
let guardianManualStop   = false;
let guardianRestartCount = 0;
let guardianRestartTimer = null;

function botStatus() {
  if (!botProc || botProc.exitCode !== null || botProc.killed) return 'stopped';
  return 'running';
}

function startBot() {
  if (botStatus() === 'running') return 'already_running';
  manualStop = false;
  botProc = cp.spawn(process.execPath, [BOT_SCRIPT], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  botProc.stdout.on('data', d => {
    const lines = String(d).split('\n').map(l=>l.trim()).filter(Boolean);
    lines.forEach(line => {
      addLog('bot', line);
      process.stdout.write('[BOT] ' + line + '\n');
    });
  });
  botProc.stderr.on('data', d => {
    const lines = String(d).split('\n').map(l=>l.trim()).filter(Boolean);
    lines.forEach(line => {
      addLog('bot', line);
      process.stderr.write('[BOT] ' + line + '\n');
    });
  });
  // Reset restart-teller als de bot 30s stabiel draait
  const stableTimer = setTimeout(() => { restartCount = 0; }, 30000);
  botProc.on('exit', (code) => {
    clearTimeout(stableTimer);
    console.log(`[BOT] Gestopt (exit ${code})`);
    if (manualStop) {
      console.log('[BOT] Handmatig gestopt — auto-restart uitgeschakeld.');
      return;
    }
    restartCount++;
    const delay = Math.min(5000 * restartCount, 30000); // 5s, 10s, 15s… max 30s
    console.log(`[BOT] ⚠️  Onverwacht gestopt. Auto-restart over ${delay/1000}s... (poging ${restartCount})`);
    restartTimer = setTimeout(() => {
      console.log('[BOT] 🔄 Auto-restart bezig...');
      startBot();
    }, delay);
  });
  addLog('panel', '✅ Bot proces gestart (PID: ' + (botProc.pid || '?') + ')');
  return 'started';
}

function stopBot() {
  if (!botProc || botStatus() !== 'running') return 'not_running';
  addLog('panel', '⚠️ Bot proces handmatig gestopt');
  manualStop = true;
  restartCount = 0;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  botProc.kill('SIGTERM');
  return 'stopped';
}

// ─── Guardian start/stop ─────────────────────────────────────────────────────
function guardianStatus() {
  if (!guardianProc || guardianProc.exitCode !== null || guardianProc.killed) return 'stopped';
  return 'running';
}

function startGuardian() {
  if (guardianStatus() === 'running') return 'already_running';
  if (!fs.existsSync(GUARDIAN_SCRIPT)) {
    addLog('panel', '❌ Guardian script niet gevonden: ' + GUARDIAN_SCRIPT);
    return 'not_found';
  }
  guardianManualStop = false;
  guardianProc = cp.spawn(process.execPath, [GUARDIAN_SCRIPT], {
    cwd: path.join(__dirname),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  guardianProc.stdout.on('data', d => {
    String(d).split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      addLog('guardian', line);
      process.stdout.write('[GUARDIAN] ' + line + '\n');
    });
  });
  guardianProc.stderr.on('data', d => {
    String(d).split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      addLog('guardian', line);
      process.stderr.write('[GUARDIAN] ' + line + '\n');
    });
  });
  const stableTimer = setTimeout(() => { guardianRestartCount = 0; }, 30000);
  guardianProc.on('exit', (code) => {
    clearTimeout(stableTimer);
    console.log('[GUARDIAN] Gestopt (exit ' + code + ')');
    if (guardianManualStop) return;
    guardianRestartCount++;
    const delay = Math.min(5000 * guardianRestartCount, 30000);
    console.log('[GUARDIAN] ⚠️ Auto-restart over ' + (delay / 1000) + 's... (poging ' + guardianRestartCount + ')');
    guardianRestartTimer = setTimeout(() => { startGuardian(); }, delay);
  });
  addLog('panel', '✅ Guardian proces gestart (PID: ' + (guardianProc.pid || '?') + ')');
  return 'started';
}

function stopGuardian() {
  if (!guardianProc || guardianStatus() !== 'running') return 'not_running';
  addLog('panel', '⚠️ Guardian proces handmatig gestopt');
  guardianManualStop = true;
  guardianRestartCount = 0;
  if (guardianRestartTimer) { clearTimeout(guardianRestartTimer); guardianRestartTimer = null; }
  guardianProc.kill('SIGTERM');
  return 'stopped';
}

// ─── Discord REST helper ──────────────────────────────────────────────────────
function discordRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'discord.com',
      path:     '/api/v10' + endpoint,
      method,
      headers: {
        'Authorization': 'Bot ' + BOT_TOKEN,
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Haal berichten op uit blacklist kanaal (paginatie, max 500)
async function fetchBlacklist() {
  const all = [];
  let before = null;
  for (let i = 0; i < 5; i++) {
    const ep = `/channels/${BLACKLIST_CHAN_ID}/messages?limit=100` + (before ? `&before=${before}` : '');
    const res = await discordRequest('GET', ep);
    if (!res.body || !Array.isArray(res.body) || res.body.length === 0) break;
    all.push(...res.body);
    before = res.body[res.body.length - 1].id;
    if (res.body.length < 100) break;
  }
  return all;
}

// ─── Helperfuncties ───────────────────────────────────────────────────────────
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')); }
  catch { return { partners: {}, channels: {} }; }
}
function saveData(d) { fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2)); }
function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8')); }
  catch { return { online: false }; }
}

// ─── Request body parser ──────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json')) resolve(JSON.parse(body));
        else resolve(qs.parse(body));
      } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── HTML dashboard (embedded) ────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Lage Landen RP — Control Panel</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
a{color:inherit;text-decoration:none}

/* ── Sidebar ─────────────────────────────────────────────────────── */
#sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:#161b22;border-right:1px solid #30363d;display:flex;flex-direction:column;z-index:200;overflow-y:auto}
#sidebar .logo{padding:20px 18px 14px;border-bottom:1px solid #30363d}
#sidebar .logo h1{font-size:15px;font-weight:700;color:#58a6ff;line-height:1.3}
#sidebar .logo p{font-size:11px;color:#8b949e;margin-top:3px}
#sidebar nav{flex:1;padding:10px 0}
#sidebar nav a{display:flex;align-items:center;gap:10px;padding:12px 18px;font-size:13px;color:#8b949e;cursor:pointer;border-left:3px solid transparent;transition:all .15s;-webkit-tap-highlight-color:transparent}
#sidebar nav a:hover,#sidebar nav a:active{color:#e6edf3;background:#1c2128}
#sidebar nav a.active{color:#58a6ff;background:#1c2128;border-left-color:#58a6ff}
#sidebar nav a .icon{font-size:17px;width:22px;text-align:center}
#sidebar .bot-status{padding:14px 18px;border-top:1px solid #30363d;font-size:12px;display:flex;align-items:center;gap:7px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#3fb950;flex-shrink:0}
.dot.offline{background:#f85149}

/* ── Overlay (mobile) ────────────────────────────────────────────── */
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:199}

/* ── Bottom nav (mobiel) ─────────────────────────────────────────── */
#bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#161b22;border-top:1px solid #30363d;z-index:198;padding:0}
#bottom-nav a{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:10px 4px 8px;font-size:9px;color:#8b949e;cursor:pointer;gap:3px;-webkit-tap-highlight-color:transparent;border-top:2px solid transparent}
#bottom-nav a.active{color:#58a6ff;border-top-color:#58a6ff;background:#1c2128}
#bottom-nav a .bn-icon{font-size:20px;line-height:1}
#bottom-nav{display:none;flex-direction:row}

/* ── Main ────────────────────────────────────────────────────────── */
#main{margin-left:220px;min-width:0;overflow-y:auto;display:flex;flex-direction:column;min-height:100vh}
#topbar{padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:12px;position:sticky;top:0;background:#0d1117;z-index:50}
#hamburger{display:none;background:none;border:none;color:#e6edf3;font-size:22px;cursor:pointer;padding:2px 6px;line-height:1;flex-shrink:0}
#topbar h2{font-size:15px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
.logout-btn{background:#21262d;border:1px solid #30363d;color:#8b949e;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}
.logout-btn:hover{color:#e6edf3;border-color:#8b949e}
#top-status{display:flex;align-items:center;gap:5px;font-size:12px;color:#8b949e;white-space:nowrap}

/* ── Content ─────────────────────────────────────────────────────── */
#content{padding:20px;flex:1}

/* ── Tabs ────────────────────────────────────────────────────────── */
.tab{display:none}.tab.active{display:block}

/* ── Cards ───────────────────────────────────────────────────────── */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:5px}
.card .label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}
.card .value{font-size:24px;font-weight:700;color:#e6edf3;word-break:break-all}
.card .sub{font-size:10px;color:#8b949e}
.card.green .value{color:#3fb950}
.card.red .value{color:#f85149}
.card.yellow .value{color:#d29922}
.card.blue .value{color:#58a6ff}

/* ── Section ─────────────────────────────────────────────────────── */
.section{background:#161b22;border:1px solid #30363d;border-radius:10px;margin-bottom:20px;overflow:hidden}
.section-header{padding:14px 18px;border-bottom:1px solid #30363d;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.section-header h3{font-size:13px;font-weight:600}
.section-body{padding:18px}

/* ── List rows (vervangt tabellen) ───────────────────────────────── */
.list-head{display:flex;padding:8px 16px;border-bottom:1px solid #30363d}
.list-head span{font-size:10px;color:#8b949e;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.list-row{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #21262d;transition:background .1s}
.list-row:last-child{border-bottom:none}
.list-row:hover{background:#1c2128}
.col-num{width:32px;flex-shrink:0;color:#8b949e;font-size:12px}
.col-main{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.col-meta{flex-shrink:0;font-size:12px;color:#8b949e;white-space:nowrap}
.col-type{width:100px;flex-shrink:0}
.col-act{flex-shrink:0;display:flex;gap:6px;justify-content:flex-end}
.col-id{width:110px;flex-shrink:0;font-size:11px;color:#8b949e;overflow:hidden;text-overflow:ellipsis}
.item-label{display:none;font-size:10px;color:#8b949e;text-transform:uppercase;font-weight:600;margin-bottom:2px}

/* ── Buttons ─────────────────────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:9px 16px;border-radius:7px;border:1px solid transparent;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.btn-primary{background:#238636;border-color:#2ea043;color:#fff}
.btn-primary:hover{background:#2ea043}
.btn-danger{background:#21262d;border-color:#f85149;color:#f85149}
.btn-danger:hover{background:#f85149;color:#fff}
.btn-secondary{background:#21262d;border-color:#30363d;color:#e6edf3}
.btn-secondary:hover{background:#30363d}
.btn-warning{background:#21262d;border-color:#d29922;color:#d29922}
.btn-warning:hover{background:#d29922;color:#000}
.btn-sm{padding:5px 10px;font-size:12px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.bot-controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.bot-controls .btn{flex:1;min-width:120px}

/* ── Input ───────────────────────────────────────────────────────── */
input[type=text],input[type=password],textarea{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:9px 12px;font-size:14px;width:100%;outline:none;font-family:inherit}
input[type=text]:focus,input[type=password]:focus,textarea:focus{border-color:#58a6ff}
.input-row{display:flex;gap:8px;margin-bottom:14px}
.input-row input{flex:1;min-width:0}

/* ── Badge ───────────────────────────────────────────────────────── */
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.badge-green{background:#1a4834;color:#3fb950}
.badge-red{background:#4a1b1b;color:#f85149}
.badge-yellow{background:#3d2e00;color:#d29922}
.badge-blue{background:#1a2f4a;color:#58a6ff}

/* ── Toast ───────────────────────────────────────────────────────── */
#toast{position:fixed;bottom:20px;right:16px;left:16px;max-width:360px;margin:0 auto;background:#238636;color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;display:none;z-index:999;border:1px solid #2ea043;text-align:center}
#toast.error{background:#4a1b1b;border-color:#f85149;color:#f85149}
@media(min-width:480px){#toast{left:auto;right:20px;text-align:left}}

/* ── Logs ────────────────────────────────────────────────────────── */
#log-box{background:#0d1117;border:1px solid #30363d;border-radius:7px;padding:12px;height:340px;overflow-y:auto;overflow-x:hidden;font-family:'Consolas','Courier New',monospace;font-size:12px;line-height:1.7}
.log-entry{display:block;padding:1px 0;white-space:pre-wrap;word-break:break-all}
.log-ok{color:#3fb950}.log-error{color:#f85149}.log-warn{color:#d29922}.log-info{color:#8b949e}
.log-time{color:#484f58;margin-right:8px;flex-shrink:0}
.log-src{margin-right:8px;font-weight:700;font-size:10px;background:#21262d;border-radius:4px;padding:1px 5px}
.log-src-bot{color:#58a6ff}.log-src-panel{color:#d29922}
#log-auto-wrap{display:flex;align-items:center;gap:7px;font-size:12px;color:#8b949e;margin-top:10px}

/* ── Empty / Loader ──────────────────────────────────────────────── */
.empty{text-align:center;padding:36px;color:#8b949e;font-size:13px}
.loading{text-align:center;padding:28px;color:#8b949e;font-size:13px}

/* ── Modal ───────────────────────────────────────────────────────── */
#modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;z-index:300;align-items:center;justify-content:center;padding:16px}
#modal-overlay.show{display:flex}
#modal{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:26px;width:100%;max-width:380px}
#modal h3{font-size:15px;font-weight:600;margin-bottom:8px}
#modal p{font-size:13px;color:#8b949e;margin-bottom:20px}
#modal .modal-btns{display:flex;gap:10px;justify-content:flex-end}

/* ── Mobile ──────────────────────────────────────────────────────── */
@media(max-width:900px){
  #sidebar{display:none !important}
  #hamburger{display:none}
  #bottom-nav{display:flex !important}
  #main{margin-left:0 !important;width:100%;display:flex;flex-direction:column;min-height:100vh;padding-bottom:62px}
  #top-status{display:none}
  .cards{grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}
  .card{padding:14px}
  .card .value{font-size:20px}
  #content{padding:12px}
  .section-body{padding:12px}
  .section-header{padding:12px 14px}
  .bot-controls .btn{font-size:14px;padding:12px 10px}
  /* List rows → kaartjes op mobiel */
  .list-head{display:none}
  .list-row{flex-direction:column;align-items:flex-start;gap:6px;margin:8px;border-radius:10px;border:1px solid #30363d;background:#1c2128;padding:14px;border-bottom:1px solid #30363d !important}
  .list-row:hover{background:#21262d}
  .col-num{display:none}
  .col-main{font-size:14px;font-weight:600;width:100%}
  .col-meta{font-size:12px}
  .col-type{width:auto}
  .col-id{width:100%;font-size:10px}
  .col-act{width:100%;justify-content:flex-start;margin-top:4px}
  .col-act .btn{flex:1;font-size:13px;padding:10px}
  .item-label{display:block}
  .input-row{flex-direction:column}
  .input-row input,.input-row .btn{width:100%}
  #log-box{height:260px;font-size:11px}
  #bl-search{width:100% !important;margin-top:6px}
  .section-header{flex-wrap:wrap}
  #modal{padding:20px}
}
@media(max-width:380px){
  .cards{grid-template-columns:repeat(2,1fr)}
  .card .value{font-size:18px}
  #topbar h2{font-size:13px}
}
</style>
</head>
<body>

<!-- Sidebar overlay (mobile tap-to-close) -->
<div id="overlay" onclick="closeSidebar()"></div>

<div id="sidebar">
  <div class="logo">
    <h1>🏙️ Lage Landen RP</h1>
    <p>Control Panel</p>
  </div>
  <nav>
    <a class="active" onclick="showTab('dashboard')"><span class="icon">📊</span> Dashboard</a>
    <a onclick="showTab('blacklist')"><span class="icon">🚫</span> Blacklist</a>
    <a onclick="showTab('partners')"><span class="icon">🤝</span> Partners</a>
    <a onclick="showTab('tickets')"><span class="icon">🎫</span> Tickets</a>
    <a onclick="showTab('bot')"><span class="icon">🤖</span> Bot Beheer</a>
    <a onclick="showTab('logs')"><span class="icon">📋</span> Live Logs</a>
    <a onclick="showTab('security')"><span class="icon">🛡️</span> Beveiliging</a>
    <a onclick="showTab('modlog')"><span class="icon">📜</span> Mod Log</a>
  </nav>
  <div class="bot-status" id="sidebar-status">
    <span class="dot" id="status-dot"></span>
    <span id="status-text">Laden...</span>
  </div>
</div>

<div id="main">
  <div id="topbar">
    <button id="hamburger" onclick="toggleSidebar()" aria-label="Menu">☰</button>
    <h2 id="tab-title">Dashboard</h2>
    <div class="topbar-right">
      <div id="top-status"><span class="dot" id="top-dot"></span><span id="top-text">—</span></div>
      <button class="logout-btn" onclick="logout()">Uitloggen</button>
    </div>
  </div>
  <div id="content">

    <!-- DASHBOARD -->
    <div class="tab active" id="tab-dashboard">
      <div class="cards" id="stat-cards">
        <div class="card"><div class="label">Status</div><div class="value" id="s-status">—</div></div>
        <div class="card blue"><div class="label">Latency</div><div class="value" id="s-ping">—</div><div class="sub">ms</div></div>
        <div class="card"><div class="label">RAM</div><div class="value" id="s-ram">—</div><div class="sub">MB</div></div>
        <div class="card green"><div class="label">Partners</div><div class="value" id="s-partners">—</div></div>
        <div class="card"><div class="label">Uptime</div><div class="value" style="font-size:16px;margin-top:4px" id="s-uptime">—</div></div>
        <div class="card blue"><div class="label">Server</div><div class="value" style="font-size:13px;margin-top:4px" id="s-guild">—</div></div>
        <div class="card"><div class="label">Leden</div><div class="value" id="s-members">—</div></div>
        <div class="card blue"><div class="label">Bot Tag</div><div class="value" style="font-size:11px;margin-top:4px" id="s-tag">—</div></div>
        <div class="card green"><div class="label">Tickets Ooit Open</div><div class="value" id="s-tickets-opened">—</div></div>
        <div class="card"><div class="label">Tickets Gesloten</div><div class="value" id="s-tickets-closed">—</div></div>
      </div>
      <div class="section">
        <div class="section-header"><h3>⚡ Snelle Acties</h3></div>
        <div class="section-body">
          <div class="bot-controls">
            <button class="btn btn-primary" onclick="botAction('start')">▶️ Start Bot</button>
            <button class="btn btn-danger" onclick="botAction('stop')">⏹️ Stop Bot</button>
            <button class="btn btn-warning" onclick="botAction('restart')">🔄 Herstart</button>
          </div>
          <p style="font-size:12px;color:#8b949e">Stats worden elke 15 seconden bijgewerkt.</p>
        </div>
      </div>
    </div>

    <!-- BLACKLIST -->
    <div class="tab" id="tab-blacklist">
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>➕ Server Toevoegen</h3></div>
        <div class="section-body">
          <div class="input-row">
            <input type="text" id="bl-input" placeholder="Servernaam (komma of nieuwe regel)">
            <button class="btn btn-primary" onclick="addBlacklist()">Toevoegen</button>
          </div>
          <p style="font-size:12px;color:#8b949e">Meerdere servers: kommagescheiden of één per regel.</p>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <h3>🚫 Blacklisted Servers <span id="bl-count" class="badge badge-red" style="margin-left:6px">0</span></h3>
          <input type="text" id="bl-search" placeholder="Zoeken..." style="width:160px" oninput="filterBlacklist()">
        </div>
        <div class="section-body" style="padding:0">
          <div id="bl-list" class="loading">Laden...</div>
        </div>
      </div>
    </div>

    <!-- PARTNERS -->
    <div class="tab" id="tab-partners">
      <div class="section">
        <div class="section-header">
          <h3>🤝 Actieve Partners <span id="p-count" class="badge badge-green" style="margin-left:6px">0</span></h3>
          <button class="btn btn-secondary btn-sm" onclick="loadPartners()">🔄 Verversen</button>
        </div>
        <div class="section-body" style="padding:0">
          <div id="p-list" class="loading">Laden...</div>
        </div>
      </div>
    </div>

    <!-- TICKETS -->
    <div class="tab" id="tab-tickets">
      <!-- Ticket statistieken -->
      <div class="cards" style="margin-bottom:16px">
        <div class="card blue"><div class="label">Nu Open</div><div class="value" id="ts-open">—</div></div>
        <div class="card green"><div class="label">Totaal Geopend</div><div class="value" id="ts-total-opened">—</div></div>
        <div class="card"><div class="label">Totaal Gesloten</div><div class="value" id="ts-total-closed">—</div></div>
      </div>
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>📊 Per Type</h3></div>
        <div class="section-body" style="padding:0">
          <div class="list-head"><span style="flex:1">Type</span><span class="col-meta" style="width:120px">Geopend</span><span class="col-meta" style="width:120px">Gesloten</span></div>
          <div class="list-row"><span class="col-main"><span class="badge badge-blue">support</span></span><span class="col-meta" style="width:120px" id="ts-support-o">—</span><span class="col-meta" style="width:120px" id="ts-support-c">—</span></div>
          <div class="list-row"><span class="col-main"><span class="badge badge-red">report</span></span><span class="col-meta" style="width:120px" id="ts-report-o">—</span><span class="col-meta" style="width:120px" id="ts-report-c">—</span></div>
          <div class="list-row"><span class="col-main"><span class="badge badge-green">sollicitatie</span></span><span class="col-meta" style="width:120px" id="ts-sollicitatie-o">—</span><span class="col-meta" style="width:120px" id="ts-sollicitatie-c">—</span></div>
          <div class="list-row"><span class="col-main"><span class="badge badge-yellow">partner</span></span><span class="col-meta" style="width:120px" id="ts-partner-o">—</span><span class="col-meta" style="width:120px" id="ts-partner-c">—</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-header">
          <h3>🎫 Open Tickets <span id="t-count" class="badge badge-blue" style="margin-left:6px">0</span></h3>
          <button class="btn btn-secondary btn-sm" onclick="loadTickets()">🔄 Verversen</button>
        </div>
        <div class="section-body" style="padding:0">
          <div id="t-list" class="loading">Laden...</div>
        </div>
      </div>
    </div>

    <!-- BOT BEHEER -->
    <div class="tab" id="tab-bot">
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>🤖 Bot Beheer</h3></div>
        <div class="section-body">
          <div class="bot-controls">
            <button class="btn btn-primary" onclick="botAction('start')">▶️ Start Bot</button>
            <button class="btn btn-danger" onclick="botAction('stop')">⏹️ Stop Bot</button>
            <button class="btn btn-warning" onclick="botAction('restart')">🔄 Herstart</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
              <span style="color:#8b949e">Control Panel</span><span class="badge badge-green">Online</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
              <span style="color:#8b949e">Bot Proces</span><span id="bot-proc-status" class="badge">—</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
              <span style="color:#8b949e">Auto-restart</span><span id="bot-autorestart" class="badge">—</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
              <span style="color:#8b949e">Herstart pogingen</span><span id="bot-restarts" style="color:#d29922;font-weight:600">—</span>
            </div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h3>⚙️ Wachtwoord</h3></div>
        <div class="section-body">
          <p style="font-size:12px;color:#8b949e">Voeg <code style="background:#21262d;padding:2px 5px;border-radius:4px">PANEL_PASSWORD=jouwwachtwoord</code> toe aan <code style="background:#21262d;padding:2px 5px;border-radius:4px">.env</code> en herstart het panel.</p>
        </div>
      </div>
    </div>

    <!-- BEVEILIGING -->
    <div class="tab" id="tab-security">
      <!-- Snelle Acties -->
      <div class="cards" id="sec-cards">
        <div class="card" id="sec-card-lockdown">
          <div class="label">Server Status</div>
          <div class="value" id="sec-lockdown-val">—</div>
          <div class="sub">Lockdown</div>
        </div>
        <div class="card">
          <div class="label">In Quarantaine</div>
          <div class="value" id="sec-qcount">—</div>
          <div class="sub">gebruikers</div>
        </div>
        <div class="card">
          <div class="label">Beveiliging Events</div>
          <div class="value" id="sec-evtcount">—</div>
          <div class="sub">opgeslagen</div>
        </div>
      </div>

      <!-- Snelle Acties Knoppen -->
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>⚡ Snelle Acties</h3></div>
        <div class="section-body" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-danger" onclick="secAction('lockdown')">🔐 Lockdown Activeren</button>
          <button class="btn btn-primary" onclick="secAction('unlockdown')">🔓 Lockdown Opheffen</button>
          <button class="btn btn-secondary" onclick="secUnquarantineAll()">🔓 Alle Quarantaines Opheffen</button>
          <button class="btn btn-secondary" onclick="loadSecSections()">🔄 Vernieuwen</button>
        </div>
      </div>

      <!-- Instellingen -->
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>⚙️ Beveiligingsinstellingen</h3><button class="btn btn-primary btn-sm" onclick="saveSecConfig()">💾 Opslaan</button></div>
        <div class="section-body" id="sec-config-body"><div class="loading">Laden...</div></div>
      </div>

      <!-- Quarantaine Lijst -->
      <div class="section" style="margin-bottom:16px">
        <div class="section-header"><h3>🔒 Quarantaine Lijst</h3></div>
        <div id="sec-qlist"><div class="loading">Laden...</div></div>
      </div>

      <!-- Security Events -->
      <div class="section">
        <div class="section-header"><h3>📋 Security Events</h3></div>
        <div id="sec-evtlist"><div class="loading">Laden...</div></div>
      </div>
    </div>

    <!-- LIVE LOGS -->
    <div class="tab" id="tab-logs">
      <div class="section">
        <div class="section-header">
          <h3>📋 Live Logs</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="clearLogs()">🗑️ Wissen</button>
            <button class="btn btn-secondary btn-sm" onclick="loadLogsNow()">🔄 Nu ophalen</button>
          </div>
        </div>
        <div class="section-body">
          <div id="log-box"></div>
          <div id="log-auto-wrap">
            <input type="checkbox" id="log-auto" checked onchange="toggleLogAuto()">
            <label for="log-auto">Auto-refresh (3s)</label>
            <span id="log-total" style="margin-left:auto;color:#484f58;font-size:11px"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- MOD LOG -->
    <div class="tab" id="tab-modlog">
      <div class="section">
        <div class="section-header">
          <h3>&#x1F4DC; Mod Log &amp; Leaderboard</h3>
          <button class="btn btn-secondary btn-sm" onclick="loadModLog()">&#x1F504; Vernieuwen</button>
        </div>
        <div class="section-body">
          <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
            <input id="modlog-search" placeholder="&#x1F50D; Zoek op naam of ID..." oninput="filterModLog()"
              style="flex:1;min-width:180px;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:7px 10px;color:#e6edf3;font-size:13px">
          </div>

          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr style="color:#8b949e;border-bottom:1px solid #30363d">
                <th style="padding:8px 10px;text-align:left">#</th>
                <th style="padding:8px 10px;text-align:left">Gebruiker</th>
                <th style="padding:8px 10px;text-align:center">Warns</th>
                <th style="padding:8px 10px;text-align:center">Strikes</th>
                <th style="padding:8px 10px;text-align:center">Totaal</th>
                <th style="padding:8px 10px;text-align:center">Ban</th>
                <th style="padding:8px 10px;text-align:center">Kick</th>
                <th style="padding:8px 10px;text-align:center">Timeout</th>
                <th style="padding:8px 10px;text-align:center">AutoMod</th>
                <th style="padding:8px 10px;text-align:left">Laatste actie</th>
                <th style="padding:8px 10px"></th>
              </tr></thead>
              <tbody id="modlog-lb-body"><tr><td colspan="11" style="padding:20px;text-align:center;color:#8b949e">Laden...</td></tr></tbody>
            </table>
          </div>

          <!-- Per-player detail -->
          <div id="modlog-detail" style="margin-top:24px;display:none">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
              <h4 id="modlog-detail-title" style="color:#58a6ff;font-size:14px;margin:0"></h4>
              <div style="display:flex;gap:8px;margin-left:auto">
                <select id="modlog-type-filter" onchange="mlRenderDetail()"
                  style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:6px 10px;color:#e6edf3;font-size:12px">
                  <option value="">Alle types</option>
                  <option value="warn">Warns</option>
                  <option value="ban">Bans</option>
                  <option value="kick">Kicks</option>
                  <option value="mute">Mutes</option>
                  <option value="timeout">Timeouts</option>
                  <option value="automod-spam">AutoMod Spam</option>
                  <option value="automod-profanity">AutoMod Scheldwoord</option>
                  <option value="strike">Strikes</option>
                </select>
                <button class="btn btn-secondary btn-sm" onclick="closeModLogDetail()">&#x2715; Sluiten</button>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
              <div id="ml-stat-warns"  style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 18px;font-size:12px;color:#8b949e"></div>
              <div id="ml-stat-strikes" style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 18px;font-size:12px;color:#8b949e"></div>
            </div>
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="color:#8b949e;border-bottom:1px solid #30363d">
                  <th style="padding:7px 10px;text-align:left">Type</th>
                  <th style="padding:7px 10px;text-align:left">Reden</th>
                  <th style="padding:7px 10px;text-align:left">Door</th>
                  <th style="padding:7px 10px;text-align:left">Datum &amp; Tijd</th>
                </tr></thead>
                <tbody id="modlog-detail-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- Toast -->
<div id="toast"></div>

<!-- Bottom nav (mobiel) -->
<nav id="bottom-nav">
  <a class="active" onclick="showTab('dashboard')"><span class="bn-icon">📊</span>Dashboard</a>
  <a onclick="showTab('blacklist')"><span class="bn-icon">🚫</span>Blacklist</a>
  <a onclick="showTab('partners')"><span class="bn-icon">🤝</span>Partners</a>
  <a onclick="showTab('tickets')"><span class="bn-icon">🎫</span>Tickets</a>
  <a onclick="showTab('bot')"><span class="bn-icon">🤖</span>Bot</a>
  <a onclick="showTab('logs')"><span class="bn-icon">📋</span>Logs</a>
  <a onclick="showTab('security')"><span class="bn-icon">🛡️</span>Beveiliging</a>
  <a onclick="showTab('modlog')"><span class="bn-icon">📜</span>Mod Log</a>
</nav>

<!-- Confirm modal -->
<div id="modal-overlay">
  <div id="modal">
    <h3 id="modal-title">Weet je het zeker?</h3>
    <p id="modal-msg"></p>
    <div class="modal-btns">
      <button class="btn btn-secondary" onclick="closeModal()">Annuleer</button>
      <button class="btn btn-danger" id="modal-confirm-btn">Bevestig</button>
    </div>
  </div>
</div>

<script>
let blData = [];
let currentModalAction = null;
const TABS = ['dashboard','blacklist','partners','tickets','bot','logs','security','modlog'];
const tabTitles = { dashboard:'Dashboard', blacklist:'Blacklist', partners:'Partners', tickets:'Tickets', bot:'Bot Beheer', logs:'Live Logs', security:'🛡️ Beveiliging', modlog:'📜 Mod Log' };

// ─── Sidebar (mobile) ────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('show', open);
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  const idx = TABS.indexOf(name);
  if (idx >= 0) document.querySelectorAll('#sidebar nav a')[idx].classList.add('active');
  // Sync bottom nav
  document.querySelectorAll('#bottom-nav a').forEach(a => a.classList.remove('active'));
  if (idx >= 0) document.querySelectorAll('#bottom-nav a')[idx].classList.add('active');
  document.getElementById('tab-title').textContent = tabTitles[name] || name;
  if (name === 'blacklist') loadBlacklist();
  if (name === 'partners')  loadPartners();
  if (name === 'tickets')   loadTickets();
  if (name === 'logs')      loadLogsNow();
  if (name === 'security')  loadSecSections();
  if (name === 'modlog')     loadModLog();
  if (name === 'dashboard' || name === 'bot') loadStats();
}

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = err ? 'error' : '';
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.style.display='none', 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function confirm(title, msg, action) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('modal-confirm-btn').onclick = () => { closeModal(); action(); };
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }

// ─── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
  const d = await api('GET', '/api/stats');
  const online = d.online;
  document.getElementById('s-status').textContent  = online ? '🟢 Online' : '🔴 Offline';
  document.getElementById('s-ping').textContent     = online ? d.ping : '—';
  document.getElementById('s-ram').textContent      = online ? d.rss : '—';
  document.getElementById('s-partners').textContent = online ? d.partners : '—';
  document.getElementById('s-guild').textContent    = online ? (d.guildName || '—') : '—';
  document.getElementById('s-members').textContent  = online ? (d.members ?? '—') : '—';
  document.getElementById('s-tag').textContent      = online ? d.tag : '—';
  // Ticket stats op dashboard cards
  const ts = d.ticketStats;
  const setOrDash = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (online && val != null) ? val : '—'; };
  setOrDash('s-tickets-opened', ts?.totalOpened);
  setOrDash('s-tickets-closed', ts?.totalClosed);
  // Ticket stats op tickets tab
  setOrDash('ts-total-opened',    ts?.totalOpened);
  setOrDash('ts-total-closed',    ts?.totalClosed);
  setOrDash('ts-support-o',       ts?.byType?.support?.opened);
  setOrDash('ts-support-c',       ts?.byType?.support?.closed);
  setOrDash('ts-report-o',        ts?.byType?.report?.opened);
  setOrDash('ts-report-c',        ts?.byType?.report?.closed);
  setOrDash('ts-sollicitatie-o',  ts?.byType?.sollicitatie?.opened);
  setOrDash('ts-sollicitatie-c',  ts?.byType?.sollicitatie?.closed);
  setOrDash('ts-partner-o',       ts?.byType?.partner?.opened);
  setOrDash('ts-partner-c',       ts?.byType?.partner?.closed);
  if (online && d.uptime) {
    const u = Math.floor(d.uptime/1000), h = Math.floor(u/3600), m = Math.floor((u%3600)/60), s = u%60;
    document.getElementById('s-uptime').textContent = h+'u '+m+'m '+s+'s';
  } else { document.getElementById('s-uptime').textContent = '—'; }
  ['status-dot','top-dot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'dot' + (online ? '' : ' offline');
  });
  const st = document.getElementById('status-text'); if (st) st.textContent = online ? 'Bot Online' : 'Bot Offline';
  const tt = document.getElementById('top-text');    if (tt) tt.textContent = online ? 'Online' : 'Offline';
  const bps = document.getElementById('bot-proc-status');
  if (bps) { bps.className = 'badge'+(d.procRunning?' badge-green':' badge-red'); bps.textContent = d.procRunning?'Actief':'Gestopt'; }
  const bar = document.getElementById('bot-autorestart');
  if (bar) { bar.className = 'badge'+(d.autoRestart?' badge-green':' badge-red'); bar.textContent = d.autoRestart?'Aan':'Uit'; }
  const brc = document.getElementById('bot-restarts'); if (brc) brc.textContent = d.restartCount ?? 0;
}

// ─── Blacklist ────────────────────────────────────────────────────────────────
async function loadBlacklist() {
  document.getElementById('bl-list').innerHTML = '<div class="loading">Berichten ophalen van Discord...</div>';
  const d = await api('GET', '/api/blacklist');
  if (d.error) { document.getElementById('bl-list').innerHTML = '<div class="empty">❌ '+d.error+'</div>'; return; }
  blData = d;
  document.getElementById('bl-count').textContent = blData.length;
  renderBlacklist();
}
function renderBlacklist() {
  const q = document.getElementById('bl-search').value.toLowerCase();
  const filtered = q ? blData.filter(x => x.content.toLowerCase().includes(q)) : blData;
  if (!filtered.length) { document.getElementById('bl-list').innerHTML = '<div class="empty">Geen servers gevonden.</div>'; return; }
  let html = '<div class="list-head"><span class="col-num">#</span><span style="flex:1">Servernaam</span><span class="col-meta" style="width:90px">Datum</span><span class="col-act" style="width:130px"></span></div>';
  filtered.forEach((msg, i) => {
    const date = new Date(msg.timestamp).toLocaleDateString('nl-NL');
    html += \`<div class="list-row">
      <span class="col-num">\${i+1}</span>
      <span class="col-main"><div class="item-label">Servernaam</div><strong>\${escHtml(msg.content)}</strong></span>
      <span class="col-meta"><div class="item-label">Datum</div>\${date}</span>
      <span class="col-act"><button class="btn btn-danger btn-sm" onclick="removeBlacklist('\${msg.id}','\${escHtml(msg.content)}')">✕ Verwijder</button></span>
    </div>\`;
  });
  document.getElementById('bl-list').innerHTML = html;
}
function filterBlacklist() { renderBlacklist(); }
async function addBlacklist() {
  const input = document.getElementById('bl-input').value.trim(); if (!input) return;
  const d = await api('POST', '/api/blacklist', { names: input });
  if (d.error) { toast('Fout: '+d.error, true); return; }
  toast('✅ '+d.added.length+' server(s) toegevoegd!');
  document.getElementById('bl-input').value = ''; loadBlacklist();
}
function removeBlacklist(msgId, name) {
  confirm('Server Verwijderen', \`Weet je zeker dat je "\${name}" wilt verwijderen?\`, async () => {
    const d = await api('DELETE', '/api/blacklist/'+msgId);
    if (d.error) { toast('Fout: '+d.error, true); return; }
    toast('✅ Verwijderd!'); loadBlacklist();
  });
}

// ─── Partners ─────────────────────────────────────────────────────────────────
async function loadPartners() {
  document.getElementById('p-list').innerHTML = '<div class="loading">Laden...</div>';
  const d = await api('GET', '/api/partners');
  const partners = Object.values(d.partners || {});
  document.getElementById('p-count').textContent = partners.length;
  if (!partners.length) { document.getElementById('p-list').innerHTML = '<div class="empty">Geen actieve partners.</div>'; return; }
  let html = '<div class="list-head"><span style="flex:1">Server / ID</span><span class="col-meta" style="width:110px">Actief sinds</span><span class="col-act" style="width:140px"></span></div>';
  partners.forEach(p => {
    const date = new Date(p.approvedAt).toLocaleString('nl-NL');
    html += \`<div class="list-row">
      <span class="col-main"><div class="item-label">Server</div><strong>\${escHtml(p.serverName)}</strong><br><code style="font-size:10px;color:#8b949e">\${p.userId}</code></span>
      <span class="col-meta"><div class="item-label">Actief sinds</div>\${date}</span>
      <span class="col-act">
        <a href="https://discord.com/channels/1457746990678016002/1457835992743547033/\${p.messageId}" target="_blank" class="badge badge-blue" style="padding:5px 10px">Bekijk</a>
        <button class="btn btn-danger btn-sm" onclick="removePartner('\${p.userId}','\${escHtml(p.serverName)}')">✕</button>
      </span>
    </div>\`;
  });
  document.getElementById('p-list').innerHTML = html;
}
function removePartner(userId, name) {
  confirm('Partner Verwijderen', \`Weet je zeker dat je het partnerschap van "\${name}" wilt beëindigen?\`, async () => {
    const d = await api('DELETE', '/api/partners/'+userId);
    if (d.error) { toast('Fout: '+d.error, true); return; }
    toast('✅ Partnerschap beëindigd!'); loadPartners();
  });
}

// ─── Tickets ──────────────────────────────────────────────────────────────────
async function loadTickets() {
  document.getElementById('t-list').innerHTML = '<div class="loading">Laden...</div>';
  const d = await api('GET', '/api/tickets');
  if (d.error) { document.getElementById('t-list').innerHTML = '<div class="empty">❌ '+d.error+'</div>'; return; }
  document.getElementById('t-count').textContent = d.tickets.length;
  const tsOpenEl = document.getElementById('ts-open'); if (tsOpenEl) tsOpenEl.textContent = d.tickets.length;
  if (!d.tickets.length) { document.getElementById('t-list').innerHTML = '<div class="empty">Geen open tickets.</div>'; return; }
  const typeColor = { support:'badge-blue', report:'badge-red', sollicitatie:'badge-green', partner:'badge-yellow' };
  let html = '<div class="list-head"><span style="flex:1">Kanaal</span><span class="col-type">Type</span><span class="col-meta" style="width:110px">Aangemaakt</span><span class="col-act" style="width:70px"></span></div>';
  d.tickets.forEach(t => {
    const color = typeColor[t.type] || 'badge-blue';
    const date  = new Date(t.createdAt).toLocaleString('nl-NL');
    html += \`<div class="list-row">
      <span class="col-main"><div class="item-label">Kanaal</div><strong>#\${escHtml(t.name)}</strong></span>
      <span class="col-type"><div class="item-label">Type</div><span class="badge \${color}">\${t.type}</span></span>
      <span class="col-meta"><div class="item-label">Aangemaakt</div>\${date}</span>
      <span class="col-act"><a href="https://discord.com/channels/1457746990678016002/\${t.id}" target="_blank" class="btn btn-secondary btn-sm">Open</a></span>
    </div>\`;
  });
  document.getElementById('t-list').innerHTML = html;
}

// ─── Bot ──────────────────────────────────────────────────────────────────────
async function botAction(action) {
  const labels = { start:'starten', stop:'stoppen', restart:'herstarten' };
  const d = await api('POST', '/api/bot/'+action);
  toast(d.ok ? '✅ Bot wordt '+labels[action]+'...' : ('❌ '+(d.error||'Fout')), !d.ok);
  setTimeout(loadStats, 2000);
}

// ─── Live Logs ────────────────────────────────────────────────────────────────
let logSince = 0;
let logAutoTimer = null;
let logAutoEnabled = true;

const levelClass = { ok:'log-ok', error:'log-error', warn:'log-warn', info:'log-info' };

function renderLogEntry(e) {
  const t = new Date(e.ts).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const srcCls = e.src === 'bot' ? 'log-src-bot' : 'log-src-panel';
  const cls = levelClass[e.level] || 'log-info';
  return \`<div class="log-entry \${cls}"><span class="log-time">\${t}</span><span class="log-src \${srcCls}">\${e.src}</span> \${escHtml(e.message)}</div>\`;
}

async function loadLogsNow() {
  const d = await api('GET', '/api/logs?since=0');
  if (!d.logs) return;
  const box = document.getElementById('log-box');
  box.innerHTML = d.logs.map(renderLogEntry).join('');
  logSince = d.logs.length ? d.logs[d.logs.length - 1].ts + 1 : 0;
  box.scrollTop = box.scrollHeight;
  const tot = document.getElementById('log-total');
  if (tot) tot.textContent = d.total + ' regels totaal';
}

async function pollLogs() {
  if (!logAutoEnabled) return;
  const tab = document.getElementById('tab-logs');
  if (!tab || !tab.classList.contains('active')) return;
  const d = await api('GET', '/api/logs?since='+logSince).catch(()=>null);
  if (!d || !d.logs || !d.logs.length) return;
  const box = document.getElementById('log-box');
  const atBottom = box.scrollHeight - box.clientHeight - box.scrollTop < 60;
  d.logs.forEach(e => { box.insertAdjacentHTML('beforeend', renderLogEntry(e)); });
  if (atBottom) box.scrollTop = box.scrollHeight;
  logSince = d.logs[d.logs.length - 1].ts + 1;
  const tot = document.getElementById('log-total');
  if (tot) tot.textContent = d.total + ' regels totaal';
}

function clearLogs() {
  document.getElementById('log-box').innerHTML = '';
  logSince = Date.now();
}

function toggleLogAuto() {
  logAutoEnabled = document.getElementById('log-auto').checked;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function logout() { window.location.href = '/logout'; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── Beveiliging ─────────────────────────────────────────────────────────────
let secConfigCache = {};

async function loadSecSections() {
  await Promise.all([loadSecConfig(), loadQuarantine(), loadSecEvents()]);
  // kaartjes updaten
  const cfg   = secConfigCache;
  const ldEl  = document.getElementById('sec-lockdown-val');
  const ldCard = document.getElementById('sec-card-lockdown');
  if (ldEl) { ldEl.textContent = cfg.lockdownActive ? '🔴 ACTIEF' : '🟢 Inactief'; ldCard.className = 'card ' + (cfg.lockdownActive ? 'red' : 'green'); }
}

async function loadSecConfig() {
  const d = await api('GET', '/api/security/config');
  secConfigCache = d;
  const body = document.getElementById('sec-config-body');
  if (!body) return;

  body.innerHTML = \`
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
    \${renderSecToggle('🛡️ Anti-Raid',            'antiRaid',          d.antiRaid)}
    \${renderSecToggle('⏳ Account Age Gate',      'accountAge',        d.accountAge)}
    \${renderSecToggle('🚫 Anti-Spam',             'antiSpam',          d.antiSpam)}
    \${renderSecToggle('🔗 Anti-Invite',           'antiInvite',        d.antiInvite)}
    \${renderSecToggle('👥 Alt Detectie',          'altDetection',      d.altDetection)}
    \${renderSecToggle('🪝 Webhook Bescherming',   'webhookProtection', d.webhookProtection)}
    \${renderSecToggle('🪤 Bot Trap Honeypot',     'botTrap',           d.botTrap)}
    \${renderSecToggle('🔗 Anti-Phishing',         'phishing',          d.phishing)}
    \${renderSecToggle('🔑 Token Scanner',         'tokenScan',         d.tokenScan)}
    \${renderSecToggle('💣 Nuke Bescherming',      'nukeProt',          d.nukeProt)}
    \${renderSecToggle('🔠 Username Filter',       'usernameFilter',    d.usernameFilter)}
    \${renderSecToggle('✅ Verificatie Gate',      'verification',      d.verification)}
    \${renderSecToggle('🔢 Captcha Rekensom',       'captchaVerif',      d.captchaVerif)}
    \${renderSecToggle('🤬 Anti-Profanity',          'antiProfanity',     d.antiProfanity)}
    \${renderSecToggle('🔄 Ban Evasion Detectie',   'banEvasion',        d.banEvasion)}
    \${renderSecToggle('👥 Gecoördineerd Joinen',   'coordJoin',         d.coordJoin)}
    \${renderSecToggle('🎭 Impersonation Detectie', 'impersonation',     d.impersonation)}
    \${renderSecToggle('🔊 Voice Security',          'voiceSecurity',     d.voiceSecurity)}
    \${renderSecToggle('💾 Auto Backup',             'autoBackup',        d.autoBackup)}
  </div>
  <div style="margin-top:20px;border-top:1px solid #30363d;padding-top:16px">
    <h4 style="font-size:13px;margin-bottom:12px;color:#8b949e">Anti-Raid Instellingen</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Drempel (joins)', 'antiRaid.joinThreshold', d.antiRaid?.joinThreshold, 'number', 2, 50)}
      \${renderSecInput('Tijdvenster (sec)', 'antiRaid.joinWindowSec', d.antiRaid?.joinWindowSec, 'number', 2, 120)}
      \${renderSecSelect('Raid Actie', 'antiRaid.action', d.antiRaid?.action, ['quarantine','kick','ban'])}
      \${renderSecToggleInline('Auto-Lockdown bij Raid', 'antiRaid.autoLockdown', d.antiRaid?.autoLockdown)}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">Account Age Gate</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Min. leeftijd (dagen)', 'accountAge.minDays', d.accountAge?.minDays, 'number', 0, 365)}
      \${renderSecSelect('Age Gate Actie', 'accountAge.action', d.accountAge?.action, ['kick','ban'])}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">Anti-Spam Instellingen</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Berichten drempel', 'antiSpam.msgThreshold', d.antiSpam?.msgThreshold, 'number', 2, 50)}
      \${renderSecInput('Tijdvenster (sec)', 'antiSpam.windowSec', d.antiSpam?.windowSec, 'number', 2, 60)}
      \${renderSecInput('Mention drempel', 'antiSpam.mentionThreshold', d.antiSpam?.mentionThreshold, 'number', 2, 25)}
      \${renderSecInput('Timeout duur (sec)', 'antiSpam.timeoutSec', d.antiSpam?.timeoutSec, 'number', 10, 2419200)}
      \${renderSecSelect('Spam Actie', 'antiSpam.action', d.antiSpam?.action, ['timeout','kick','ban'])}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">Alt Detectie</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Vlag bij < dagen', 'altDetection.maxDays', d.altDetection?.maxDays, 'number', 1, 365)}
      \${renderSecToggleInline('Geen avatar = suspect', 'altDetection.noAvatarFlag', d.altDetection?.noAvatarFlag)}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">🪤 Bot Trap Honeypot</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Kanaal ID', 'botTrap.channelId', d.botTrap?.channelId || '', 'text')}
      \${renderSecSelect('Bot Trap Actie', 'botTrap.action', d.botTrap?.action, ['quarantine','kick','ban'])}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">🔗 Anti-Phishing</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecSelect('Phishing Actie', 'phishing.action', d.phishing?.action, ['ban','kick','quarantine'])}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">💣 Nuke Bescherming</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Drempel (deletes)', 'nukeProt.threshold', d.nukeProt?.threshold, 'number', 2, 20)}
      \${renderSecInput('Tijdvenster (sec)', 'nukeProt.windowSec', d.nukeProt?.windowSec, 'number', 2, 60)}
      \${renderSecSelect('Nuke Actie', 'nukeProt.action', d.nukeProt?.action, ['ban','kick'])}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">🔠 Username Filter</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecToggleInline('Anti-Dehoisting', 'usernameFilter.dehoisting', d.usernameFilter?.dehoisting)}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">✅ Verificatie Gate</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Verificatie Kanaal ID', 'verification.channelId', d.verification?.channelId || '', 'text')}
      \${renderSecInput('Onverifiëerd Rol ID', 'verification.unverifiedRoleId', d.verification?.unverifiedRoleId || '', 'text')}
      \${renderSecInput('Member Rol ID', 'verification.memberRoleId', d.verification?.memberRoleId || '', 'text')}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">👥 Gecoördineerde Join</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Tijdvenster (min)', 'coordJoin.windowMinutes', d.coordJoin?.windowMinutes, 'number', 5, 120)}
      \${renderSecInput('Drempel (accounts)', 'coordJoin.threshold', d.coordJoin?.threshold, 'number', 2, 20)}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">🔊 Voice Security (Nuke)</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Drempel (disconnects)', 'voiceSecurity.threshold', d.voiceSecurity?.threshold, 'number', 2, 20)}
      \${renderSecInput('Tijdvenster (sec)', 'voiceSecurity.windowSec', d.voiceSecurity?.windowSec, 'number', 5, 120)}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">💾 Auto Backup</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      \${renderSecInput('Backup Kanaal ID', 'autoBackup.channelId', d.autoBackup?.channelId || '', 'text')}
    </div>
    <h4 style="font-size:13px;margin:16px 0 12px;color:#8b949e">Security Log Kanaal</h4>
    \${renderSecInput('Kanaal ID (leeg = mod-log)', 'securityLogChannelId', d.securityLogChannelId || '', 'text')}
  </div>\`;
}

function renderSecToggle(label, key, cfg) {
  const on = cfg?.enabled ?? false;
  return \`<div style="background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:14px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:13px;font-weight:600">\${label}</span>
    <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
      <input type="checkbox" id="sec-\${key}-enabled" \${on ? 'checked' : ''} onchange="toggleSecEnabled('\${key}')" style="opacity:0;width:0;height:0">
      <span style="position:absolute;inset:0;background:\${on ? '#238636' : '#30363d'};border-radius:22px;transition:.2s;cursor:pointer" id="sec-toggle-\${key}"></span>
      <span style="position:absolute;left:\${on ? '20px' : '2px'};top:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s" id="sec-thumb-\${key}"></span>
    </label>
  </div>\`;
}

function renderSecToggleInline(label, keyPath, val) {
  const id = 'sec-field-' + keyPath.replace(/\\\./g,'-');
  return \`<div style="display:flex;align-items:center;gap:8px">
    <input type="checkbox" id="\${id}" data-seckey="\${keyPath}" \${val ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
    <label for="\${id}" style="font-size:12px;color:#8b949e;cursor:pointer">\${label}</label>
  </div>\`;
}

function renderSecInput(label, keyPath, val, type = 'text', min, max) {
  const id  = 'sec-field-' + keyPath.replace(/\\\./g,'-');
  const extras = min !== undefined ? \`min="\${min}" max="\${max}"\` : '';
  return \`<div>
    <label style="font-size:11px;color:#8b949e;display:block;margin-bottom:4px">\${label}</label>
    <input type="\${type}" id="\${id}" data-seckey="\${keyPath}" value="\${escHtml(String(val ?? ''))}" \${extras}
      style="background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:8px 12px;font-size:13px;width:100%;outline:none">
  </div>\`;
}

function renderSecSelect(label, keyPath, val, options) {
  const id   = 'sec-field-' + keyPath.replace(/\\\./g,'-');
  const opts = options.map(o => \`<option value="\${o}" \${o === val ? 'selected' : ''}>\${o}</option>\`).join('');
  return \`<div>
    <label style="font-size:11px;color:#8b949e;display:block;margin-bottom:4px">\${label}</label>
    <select id="\${id}" data-seckey="\${keyPath}" style="background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:8px 12px;font-size:13px;width:100%;outline:none">\${opts}</select>
  </div>\`;
}

function toggleSecEnabled(key) {
  const cb  = document.getElementById(\`sec-\${key}-enabled\`);
  const bg  = document.getElementById(\`sec-toggle-\${key}\`);
  const th  = document.getElementById(\`sec-thumb-\${key}\`);
  if (!cb) return;
  const on  = cb.checked;
  if (bg) bg.style.background = on ? '#238636' : '#30363d';
  if (th) th.style.left       = on ? '20px' : '2px';
}

async function saveSecConfig() {
  // Verzamel alle sec-field-* inputs
  const fields = document.querySelectorAll('[data-seckey]');
  const patch  = {};
  fields.forEach(el => {
    const keyPath = el.getAttribute('data-seckey');
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') val = Number(val);
    // nested key bijv. antiRaid.joinThreshold
    const parts = keyPath.split('.');
    let obj = patch;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = val;
  });
  // toggle enables
  ['antiRaid','accountAge','antiSpam','antiInvite','altDetection','webhookProtection',
   'botTrap','phishing','tokenScan','nukeProt','usernameFilter','verification',
   'banEvasion','coordJoin','impersonation','voiceSecurity','autoBackup','captchaVerif','antiProfanity'].forEach(key => {
    const cb = document.getElementById(\`sec-\${key}-enabled\`);
    if (!cb) return;
    if (!patch[key]) patch[key] = {};
    patch[key].enabled = cb.checked;
  });
  const d = await api('POST', '/api/security/config', patch);
  if (d.ok) { toast('✅ Instellingen opgeslagen!'); loadSecConfig(); }
  else toast('❌ Fout: ' + (d.error || 'Onbekend'), true);
}

async function secAction(action) {
  const LBL = { lockdown: 'lockdown activeren', unlockdown: 'lockdown opheffen' };
  confirm('Bevestig actie', \`Weet je zeker dat je de server \${LBL[action]} wilt?\`, async () => {
    const d = await api('POST', '/api/security/' + action, { reason: 'Handmatig via dashboard' });
    if (d.ok) {
      toast(action === 'lockdown' ? '🔐 Lockdown actief! Alle kanalen read-only.' : '✅ Lockdown opgeheven!');
      loadSecSections();
    } else toast('❌ ' + (d.error || 'Fout'), true);
  });
}

async function loadQuarantine() {
  const list = await api('GET', '/api/security/quarantine');
  const el   = document.getElementById('sec-qlist');
  const cnt  = document.getElementById('sec-qcount');
  if (cnt) cnt.textContent = Array.isArray(list) ? list.length : 0;
  if (!el) return;
  if (!Array.isArray(list) || !list.length) {
    el.innerHTML = '<div class="empty" style="padding:16px">✅ Geen gebruikers in quarantaine.</div>';
    return;
  }
  let html = '<div class="list-head"><span style="flex:1">Gebruiker</span><span class="col-meta" style="width:140px">Reden</span><span class="col-meta" style="width:90px">Geplaatst</span><span class="col-act" style="width:70px"></span></div>';
  list.forEach(q => {
    const dt = new Date(q.quarantinedAt).toLocaleString('nl-NL');
    html += \`<div class="list-row">
      <span class="col-main"><strong>\${escHtml(q.username)}</strong><br><code style="font-size:10px;color:#8b949e">\${q.userId}</code></span>
      <span class="col-meta" style="width:140px">\${escHtml((q.reason || '').slice(0, 40))}</span>
      <span class="col-meta" style="width:90px;font-size:11px">\${dt}</span>
      <span class="col-act" style="width:70px"><button class="btn btn-primary btn-sm" onclick="secUnquarantine('\${q.userId}','\${escHtml(q.username)}')">🔓</button></span>
    </div>\`;
  });
  el.innerHTML = html;
}

async function secUnquarantine(userId, name) {
  confirm('Quarantaine opheffen', \`Weet je zeker dat je de quarantaine van "\${name}" wil opheffen?\`, async () => {
    const d = await api('DELETE', '/api/security/quarantine/' + userId);
    if (d.ok) { toast('✅ Quarantaine opgeheven voor ' + name); loadQuarantine(); }
    else toast('❌ ' + (d.error || 'Mislukt'), true);
  });
}

async function secUnquarantineAll() {
  confirm('Alle Quarantaines Opheffen', 'Weet je zeker dat je ALLE gebruikers uit quarantaine wil halen?', async () => {
    const d = await api('DELETE', '/api/security/quarantine-all');
    if (d.ok) { toast(\`✅ \${d.count} gebruiker(s) uit quarantaine gehaald!\`); loadQuarantine(); }
    else toast('❌ ' + (d.error || 'Mislukt'), true);
  });
}

const secEventLabels = {
  lockdown:       '🔐 Lockdown geactiveerd',
  unlockdown:     '✅ Lockdown opgeheven',
  quarantine:     '🔒 Gebruiker gequarantaineerd',
  unquarantine:   '🔓 Quarantaine opgeheven',
  raid_detected:  '🚨 Raid gedetecteerd',
  spam_detected:  '🚫 Spam gedetecteerd',
  invite_blocked: '🔗 Invite geblokkeerd',
  alt_flagged:    '⚠️ Verdacht account',
  account_age_gate: '👶 Account te nieuw (kick/ban)',
  webhook_created:  '🪝 Webhook aangemaakt',
  config_changed:   '⚙️ Config gewijzigd',
};

async function loadSecEvents() {
  const events = await api('GET', '/api/security/events');
  const el     = document.getElementById('sec-evtlist');
  const cnt    = document.getElementById('sec-evtcount');
  if (cnt) cnt.textContent = Array.isArray(events) ? events.length : 0;
  if (!el) return;
  if (!Array.isArray(events) || !events.length) {
    el.innerHTML = '<div class="empty" style="padding:16px">Geen security events opgeslagen.</div>';
    return;
  }
  let html = '';
  events.slice(0, 50).forEach(e => {
    const dt  = new Date(e.at).toLocaleString('nl-NL');
    const lbl = secEventLabels[e.type] || e.type;
    const detail = e.data ? Object.entries(e.data).map(([k,v]) => \`\${k}: \${v}\`).join(' | ') : '';
    const color = ['lockdown','raid_detected'].includes(e.type) ? '#f85149'
                : ['unlockdown','unquarantine'].includes(e.type) ? '#3fb950'
                : '#d29922';
    html += \`<div class="list-row" style="border-left:3px solid \${color}">
      <span class="col-main"><strong>\${lbl}</strong><br><span style="font-size:11px;color:#8b949e">\${escHtml(detail)}</span></span>
      <span class="col-meta" style="white-space:nowrap">\${dt}</span>
    </div>\`;
  });
  el.innerHTML = html;
}

// ─── Mod Log ─────────────────────────────────────────────────────────────────
let mlAllData = [];
let mlDetailEntries = [];
let mlDetailWarns   = [];
let mlDetailStrikes = 0;

const ML_TYPE_LABELS = {
  ban: '\uD83D\uDD28 Ban', kick: '\uD83D\uDC62 Kick', mute: '\uD83D\uDD07 Mute',
  timeout: '\u23F1\uFE0F Timeout', warn: '\u26A0\uFE0F Warn',
  'automod-spam': '\uD83D\uDEA8 AutoMod Spam',
  'automod-profanity': '\uD83E\uDD2C AutoMod Scheldwoord',
  strike: '\uD83D\uDD34 Strike'
};

async function loadModLog() {
  document.getElementById('modlog-lb-body').innerHTML =
    '<tr><td colspan="11" style="padding:20px;text-align:center;color:#8b949e">Laden...</td></tr>';
  try {
    const r = await fetch('/api/modlog');
    const j = await r.json();
    mlAllData = j.leaderboard || [];
    filterModLog();
  } catch(e) {
    document.getElementById('modlog-lb-body').innerHTML =
      '<tr><td colspan="11" style="padding:20px;text-align:center;color:#f85149">Fout bij laden van modlog.</td></tr>';
  }
}

function filterModLog() {
  const q = (document.getElementById('modlog-search')?.value || '').toLowerCase();
  const filtered = q
    ? mlAllData.filter(p => p.username.toLowerCase().includes(q) || p.userId.includes(q))
    : mlAllData;
  mlRenderLeaderboard(filtered);
}

function mlRenderLeaderboard(data) {
  const tbody = document.getElementById('modlog-lb-body');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:20px;text-align:center;color:#8b949e">Geen data gevonden.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((p, i) => {
    const last = p.lastAction ? new Date(p.lastAction).toLocaleString('nl-NL') : '\u2014';
    const automod = (p.counts?.['automod-spam'] || 0) + (p.counts?.['automod-profanity'] || 0);
    const reasonTxt = p.lastReason ? p.lastReason.slice(0, 60) + (p.lastReason.length > 60 ? '…' : '') : '\u2014';
    return \`<tr style="border-bottom:1px solid #21262d">
      <td style="padding:8px 10px;color:#8b949e">\${i+1}</td>
      <td style="padding:8px 10px"><strong style="color:#e6edf3">\${p.username}</strong><br><small style="color:#484f58">\${p.userId}</small></td>
      <td style="padding:8px 10px;text-align:center;color:#f0883e">\${p.warnCount}</td>
      <td style="padding:8px 10px;text-align:center;color:#f85149">\${p.strikeCount}</td>
      <td style="padding:8px 10px;text-align:center"><strong>\${p.total}</strong></td>
      <td style="padding:8px 10px;text-align:center">\${p.counts?.ban || 0}</td>
      <td style="padding:8px 10px;text-align:center">\${p.counts?.kick || 0}</td>
      <td style="padding:8px 10px;text-align:center">\${p.counts?.timeout || 0}</td>
      <td style="padding:8px 10px;text-align:center;color:#8b949e">\${automod}</td>
      <td style="padding:8px 10px;font-size:11px;color:#8b949e">\${last}<br><span style="color:#6e7681">\${reasonTxt}</span></td>
      <td style="padding:8px 10px">
        <button class="btn btn-secondary btn-sm"
          onclick="mlOpenDetail('\${p.userId}')">
          \uD83D\uDCCB Detail
        </button>
      </td>
    </tr>\`;
  }).join('');
}

async function mlOpenDetail(userId) {
  const found = mlAllData.find(p => p.userId === userId);
  const username = found?.username || userId;
  try {
    const r = await fetch('/api/modlog/' + encodeURIComponent(userId));
    const j = await r.json();
    mlDetailEntries = j.entries  || [];
    mlDetailWarns   = j.warns    || [];
    mlDetailStrikes = j.strikes  || 0;
    document.getElementById('modlog-detail-title').textContent = '\uD83D\uDCCB Historie van ' + username;
    document.getElementById('modlog-detail').style.display = '';
    document.getElementById('modlog-type-filter').value = '';
    mlRenderDetail();
  } catch(e) { toast('Fout bij laden van details.', true); }
}

function mlRenderDetail() {
  const filter = document.getElementById('modlog-type-filter')?.value || '';
  const entries = filter ? mlDetailEntries.filter(e => e.type === filter) : mlDetailEntries;

  const tbody = document.getElementById('modlog-detail-body');
  tbody.innerHTML = entries.map(e => \`<tr style="border-bottom:1px solid #21262d">
    <td style="padding:7px 10px;white-space:nowrap">\${ML_TYPE_LABELS[e.type] || e.type}</td>
    <td style="padding:7px 10px">\${e.reason || '\u2014'}</td>
    <td style="padding:7px 10px">\${e.by || '\u2014'}</td>
    <td style="padding:7px 10px;font-size:11px;color:#8b949e">\${new Date(e.at).toLocaleString('nl-NL')}</td>
  </tr>\`).join('') ||
  '<tr><td colspan="4" style="padding:12px;text-align:center;color:#8b949e">Geen acties gevonden.</td></tr>';

  // Actieve warns — alleen count tonen (entries staan al in de tabel hierboven)
  document.getElementById('ml-stat-warns').innerHTML =
    '<span style="font-size:18px;font-weight:700;color:#f0883e">' + mlDetailWarns.length + '</span><br>Actieve warns';
  document.getElementById('ml-stat-strikes').innerHTML =
    '<span style="font-size:18px;font-weight:700;color:#f85149">' + mlDetailStrikes + '</span><br>Strikes';
}

function closeModLogDetail() {
  document.getElementById('modlog-detail').style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadStats();
setInterval(loadStats, 15000);
setInterval(pollLogs, 3000);
document.getElementById('modal-overlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
</script>
</body>
</html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — Lage Landen RP Control Panel</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:36px;width:360px;max-width:90vw}
.card h1{font-size:20px;font-weight:700;margin-bottom:4px;color:#58a6ff}
.card p{font-size:13px;color:#8b949e;margin-bottom:24px}
label{font-size:12px;color:#8b949e;display:block;margin-bottom:6px}
input{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:10px 14px;font-size:14px;width:100%;outline:none;font-family:inherit;margin-bottom:16px}
input:focus{border-color:#58a6ff}
button{width:100%;background:#238636;border:1px solid #2ea043;color:#fff;padding:10px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
button:hover{background:#2ea043}
.error{background:#4a1b1b;border:1px solid #f85149;color:#f85149;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px}
</style>
</head>
<body>
<div class="card">
  <h1>🏙️ Lage Landen RP</h1>
  <p>Control Panel — Inloggen</p>
  {{ERROR}}
  <form method="POST" action="/login">
    <label>Wachtwoord</label>
    <input type="password" name="password" placeholder="••••••••" autofocus required>
    <button type="submit">Inloggen</button>
  </form>
</div>
</body>
</html>`;

// ─── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // ─── IP-whitelist: alleen localhost en Tailscale (100.x.x.x) ─────────────
  const remoteIp = req.socket.remoteAddress || '';
  const isTailscale = /^100\./.test(remoteIp);
  const isLocalhost = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
  if (!isLocalhost && !isTailscale) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────
  const url    = req.url.split('?')[0];
  const method = req.method;
  const sess   = getSession(req);

  const send = (status, body, type='application/json') => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const headers = { 'Content-Type': type, 'Content-Length': Buffer.byteLength(data) };
    if (type === 'text/html') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }
    res.writeHead(status, headers);
    res.end(data);
  };

  const redirect = (loc) => { res.writeHead(302, { Location: loc }); res.end(); };

  // Login page
  if (url === '/login') {
    if (method === 'GET') {
      return send(200, LOGIN_HTML.replace('{{ERROR}}', ''), 'text/html');
    }
    if (method === 'POST') {
      const body = await readBody(req);
      if (body.password === PANEL_PASSWORD) {
        const token = genToken();
        sessions.set(token, { auth: true, createdAt: Date.now() });
        addLog('panel', '✅ Succesvolle inlog vanuit IP: ' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?'));
        res.writeHead(302, { 'Set-Cookie': `sid=${token}; HttpOnly; Path=/`, Location: '/' });
        return res.end();
      }
      addLog('panel', '❌ Mislukte inlogpoging vanuit IP: ' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?'));
      return send(401, LOGIN_HTML.replace('{{ERROR}}', '<div class="error">❌ Onjuist wachtwoord</div>'), 'text/html');
    }
  }

  // Logout
  if (url === '/logout') {
    if (sess) {
      const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
      if (cookie) sessions.delete(cookie.slice(4));
    }
    res.writeHead(302, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0', Location: '/login' });
    return res.end();
  }

  // Auth check
  if (!sess) return redirect('/login');

  // Dashboard — serve external HTML file
  if (url === '/') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'panel-ui.html'), 'utf-8');
      return send(200, html, 'text/html');
    } catch {
      return send(200, DASHBOARD_HTML, 'text/html'); // fallback
    }
  }

  // ── API ────────────────────────────────────────────────────────────────────

  // GET /api/stats
  if (url === '/api/stats' && method === 'GET') {
    const stats = loadStats();
    stats.procRunning        = botStatus() === 'running';
    stats.restartCount       = restartCount;
    stats.autoRestart        = !manualStop;
    stats.guardianRunning    = guardianStatus() === 'running';
    stats.guardianRestart    = guardianRestartCount;
    return send(200, stats);
  }

  // GET /api/blacklist
  if (url === '/api/blacklist' && method === 'GET') {
    try {
      const msgs = await fetchBlacklist();
      const list = msgs
        .filter(m => m.content && m.content.trim() && !m.embeds?.length)
        .map(m => ({ id: m.id, content: m.content.trim(), timestamp: m.timestamp }));
      return send(200, list);
    } catch (e) { return send(500, { error: String(e) }); }
  }

  // POST /api/blacklist  — add servers
  if (url === '/api/blacklist' && method === 'POST') {
    try {
      const body = await readBody(req);
      let names = String(body.names || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (!names.length) return send(400, { error: 'Geen namen opgegeven' });

      // Bestaande ophalen om dupes te voorkomen
      const existing = await fetchBlacklist();
      const existSet = new Set(existing.filter(m=>m.content).map(m=>m.content.trim().toLowerCase()));

      const added = [], dupes = [];
      for (const name of names) {
        if (existSet.has(name.toLowerCase())) { dupes.push(name); continue; }
        const r = await discordRequest('POST', `/channels/${BLACKLIST_CHAN_ID}/messages`, { content: name });
        if (r.status === 200 || r.status === 201) { added.push(name); existSet.add(name.toLowerCase()); }
      }
      return send(200, { added, dupes });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // DELETE /api/blacklist/:messageId
  if (url.startsWith('/api/blacklist/') && method === 'DELETE') {
    const msgId = url.slice(15);
    try {
      const r = await discordRequest('DELETE', `/channels/${BLACKLIST_CHAN_ID}/messages/${msgId}`);
      if (r.status === 204) return send(200, { ok: true });
      return send(500, { error: 'Discord API fout: ' + r.status });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // GET /api/partners
  if (url === '/api/partners' && method === 'GET') {
    return send(200, loadData());
  }

  // DELETE /api/partners/:userId
  if (url.startsWith('/api/partners/') && method === 'DELETE') {
    const userId = url.slice(14);
    try {
      const data = loadData();
      const partner = data.partners[userId];
      if (!partner) return send(404, { error: 'Partner niet gevonden' });

      // Verwijder Discord bericht
      if (partner.messageId) {
        await discordRequest('DELETE', `/channels/${PARTNER_CHANNEL_ID}/messages/${partner.messageId}`).catch(()=>{});
      }
      delete data.partners[userId];
      saveData(data);
      return send(200, { ok: true });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // GET /api/tickets
  if (url === '/api/tickets' && method === 'GET') {
    try {
      const data = loadData();
      const ch = data.channels || {};
      // Verzamel alle ticket-categorie IDs (oud + de 4 type-specifieke)
      const catIds = new Set([
        ch.ticketCategoryId,
        ch.ticketSupportCategoryId,
        ch.ticketReportCategoryId,
        ch.ticketSollicitatieCategoryId,
        ch.ticketPartnerCategoryId,
      ].filter(Boolean));
      if (!catIds.size) return send(200, { tickets: [] });

      const r = await discordRequest('GET', `/guilds/${GUILD_ID}/channels`);
      if (!Array.isArray(r.body)) return send(500, { error: 'Discord API fout' });

      const tickets = r.body
        .filter(c => catIds.has(c.parent_id) && c.name.startsWith('\u276Aticket\u276B-'))
        .map(c => {
          let type = 'onbekend';
          if (c.name.includes('-support-'))      type = 'support';
          else if (c.name.includes('-report-'))  type = 'report';
          else if (c.name.includes('-sollicitatie-')) type = 'sollicitatie';
          else if (c.name.includes('-partner-')) type = 'partner';
          return { id: c.id, name: c.name, type, createdAt: c.id ? snowflakeToDate(c.id) : null };
        })
        .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

      return send(200, { tickets });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // POST /api/bot/start|stop|restart
  if (url.startsWith('/api/bot/') && method === 'POST') {
    const action = url.slice(9);
    if (action === 'start')   { startBot(); return send(200, { ok: true }); }
    if (action === 'stop')    { stopBot();  return send(200, { ok: true }); }
    if (action === 'restart') {
      stopBot();
      setTimeout(startBot, 1500);
      return send(200, { ok: true });
    }
    return send(404, { error: 'Onbekende actie' });
  }

  // POST /api/guardian/start|stop|restart
  if (url.startsWith('/api/guardian/') && method === 'POST') {
    const action = url.slice(14);
    if (action === 'start')   { startGuardian(); return send(200, { ok: true }); }
    if (action === 'stop')    { stopGuardian();  return send(200, { ok: true }); }
    if (action === 'restart') {
      stopGuardian();
      setTimeout(startGuardian, 1500);
      return send(200, { ok: true });
    }
    return send(404, { error: 'Onbekende actie' });
  }

  // GET /api/logs  — live log stream (since=timestamp)
  if (url.startsWith('/api/logs') && method === 'GET') {
    const since   = parseInt(new URL('http://x' + req.url).searchParams.get('since') || '0', 10);
    const entries = since > 0 ? logBuffer.filter(e => e.ts >= since) : logBuffer.slice(-200);
    return send(200, { logs: entries, total: logBuffer.length });
  }

  // GET /api/leaderboard
  if (url === '/api/leaderboard' && method === 'GET') {
    try {
      const data     = loadData();
      const partners = Object.values(data.partners || {});

      // All-time tally per approvedBy userId
      const tally = {};
      for (const p of partners) {
        if (!p.approvedBy) continue;
        tally[p.approvedBy] = (tally[p.approvedBy] || 0) + 1;
      }
      const sorted = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .map(([userId, count]) => ({ userId, count, username: userId }));

      // Try to resolve usernames from Discord
      const usernames = {};
      for (const { userId } of sorted.slice(0, 10)) {
        try {
          const r = await discordRequest('GET', `/users/${userId}`);
          if (r.status === 200 && r.body) {
            usernames[userId] = r.body.username || userId;
          }
        } catch {}
      }
      sorted.forEach(e => { if (usernames[e.userId]) e.username = usernames[e.userId]; });

      // Weekly buckets (last 8 weeks)
      const monday = new Date();
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const msWeek  = 7 * 24 * 60 * 60 * 1000;
      const WEEKS   = 8;
      const buckets = Array.from({ length: WEEKS }, (_, i) => ({
        start: monday.getTime() - i * msWeek,
        end:   monday.getTime() - i * msWeek + msWeek,
        count: 0,
        byStaff: {},
      }));
      for (const p of partners) {
        if (!p.approvedAt) continue;
        for (const b of buckets) {
          if (p.approvedAt >= b.start && p.approvedAt < b.end) {
            b.count++;
            if (p.approvedBy) b.byStaff[p.approvedBy] = (b.byStaff[p.approvedBy] || 0) + 1;
            break;
          }
        }
      }
      const weeks = buckets.map(b => ({
        count:   b.count,
        byStaff: Object.entries(b.byStaff).sort((a,b)=>b[1]-a[1]).map(([userId,count]) => ({
          userId, count, username: usernames[userId] || userId,
        })),
      }));

      const activeWeeks  = buckets.filter(b => b.count > 0).length || 1;
      const totalInWindow = buckets.reduce((s,b) => s+b.count, 0);
      const avgPerWeek   = (totalInWindow / activeWeeks).toFixed(1);
      const bestBucket   = buckets.reduce((a,b) => b.count > a.count ? b : a, buckets[0]);
      const bestWeekDate = bestBucket && bestBucket.count > 0
        ? new Date(bestBucket.start).toLocaleDateString('nl-NL', { day:'numeric', month:'short' }) + ` (${bestBucket.count}x)` : '—';
      const thisYear = partners.filter(p => p.approvedAt && p.approvedAt >= new Date(new Date().getFullYear(), 0, 1).getTime()).length;

      return send(200, {
        allTime: sorted,
        weeks,
        avgPerWeek,
        partners,
        meta: {
          total:      partners.length,
          uniqueStaff: sorted.length,
          thisYear,
          bestWeek: bestWeekDate,
        },
      });
    } catch (e) { return send(500, { error: String(e) }); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BEVEILIGING API
  // ══════════════════════════════════════════════════════════════════════════
  const SEC_CFG_PATH  = path.join(__dirname, 'security-config.json');
  const QUARANT_PATH  = path.join(__dirname, 'quarantine-data.json');
  const SEC_EVT_PATH  = path.join(__dirname, 'security-events.json');
  const loadSecCfg    = () => { try { return JSON.parse(fs.readFileSync(SEC_CFG_PATH, 'utf-8')); } catch { return {}; } };
  const saveSecCfg    = d  => fs.writeFileSync(SEC_CFG_PATH, JSON.stringify(d, null, 2));
  const loadQuarant   = () => { try { return JSON.parse(fs.readFileSync(QUARANT_PATH, 'utf-8')); } catch { return {}; } };
  const saveQuarant   = d  => fs.writeFileSync(QUARANT_PATH, JSON.stringify(d, null, 2));
  const loadSecEvents = () => { try { return JSON.parse(fs.readFileSync(SEC_EVT_PATH, 'utf-8')); } catch { return []; } };

  // GET /api/security/config
  if (url === '/api/security/config' && method === 'GET') {
    return send(200, loadSecCfg());
  }

  // POST /api/security/config — sla gewijzigde instellingen op
  if (url === '/api/security/config' && method === 'POST') {
    try {
      const body = await readBody(req);
      const existing = loadSecCfg();
      // Deep merge
      const merged = Object.assign({}, existing);
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
          merged[k] = Object.assign({}, merged[k] || {}, v);
        } else {
          merged[k] = v;
        }
      }
      saveSecCfg(merged);
      return send(200, { ok: true });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // GET /api/security/quarantine
  if (url === '/api/security/quarantine' && method === 'GET') {
    return send(200, Object.values(loadQuarant()));
  }

  // GET /api/security/events
  if (url === '/api/security/events' && method === 'GET') {
    return send(200, loadSecEvents().slice(0, 100));
  }

  // POST /api/security/lockdown
  if (url === '/api/security/lockdown' && method === 'POST') {
    try {
      const body   = await readBody(req);
      const reason = body.reason || 'Handmatig via dashboard';
      const chRes  = await discordRequest('GET', `/guilds/${GUILD_ID}/channels`);
      if (!Array.isArray(chRes.body)) return send(500, { error: 'Discord API fout bij ophalen kanalen' });

      const cfg    = loadSecCfg();
      const states = {};
      const SEND_MESSAGES_BIT = BigInt('2048');

      for (const ch of chRes.body) {
        if (ch.type !== 0 && ch.type !== 5) continue;
        const overwrite = (ch.permission_overwrites || []).find(p => p.id === GUILD_ID);
        const denyBig   = overwrite ? BigInt(overwrite.deny) : 0n;
        const allowBig  = overwrite ? BigInt(overwrite.allow) : 0n;
        if ((denyBig & SEND_MESSAGES_BIT) !== 0n) continue; // al geblokkeerd

        states[ch.id] = (allowBig & SEND_MESSAGES_BIT) !== 0n ? 'allow' : 'neutral';
        await discordRequest('PUT', `/channels/${ch.id}/permissions/${GUILD_ID}`, {
          type: 0, allow: '0', deny: String(SEND_MESSAGES_BIT), reason,
        }).catch(() => {});
      }

      cfg.lockdownActive        = true;
      cfg.lockdownChannelStates = states;
      saveSecCfg(cfg);

      // Voeg security event toe
      const evts = loadSecEvents();
      evts.unshift({ id: Date.now(), type: 'lockdown', data: { reason }, at: Date.now() });
      if (evts.length > 500) evts.splice(500);
      try { fs.writeFileSync(SEC_EVT_PATH, JSON.stringify(evts, null, 2)); } catch {}

      return send(200, { ok: true, channels: Object.keys(states).length });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // POST /api/security/unlockdown
  if (url === '/api/security/unlockdown' && method === 'POST') {
    try {
      const cfg    = loadSecCfg();
      const states = cfg.lockdownChannelStates || {};
      const SEND_MESSAGES_BIT = BigInt('2048');

      for (const [chanId, state] of Object.entries(states)) {
        if (state === 'allow') {
          await discordRequest('PUT', `/channels/${chanId}/permissions/${GUILD_ID}`, {
            type: 0, allow: String(SEND_MESSAGES_BIT), deny: '0',
          }).catch(() => {});
        } else {
          await discordRequest('DELETE', `/channels/${chanId}/permissions/${GUILD_ID}`).catch(() => {});
        }
      }

      cfg.lockdownActive        = false;
      cfg.lockdownChannelStates = {};
      saveSecCfg(cfg);

      const evts = loadSecEvents();
      evts.unshift({ id: Date.now(), type: 'unlockdown', data: {}, at: Date.now() });
      if (evts.length > 500) evts.splice(500);
      try { fs.writeFileSync(SEC_EVT_PATH, JSON.stringify(evts, null, 2)); } catch {}

      return send(200, { ok: true });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // DELETE /api/security/quarantine-all
  if (url === '/api/security/quarantine-all' && method === 'DELETE') {
    try {
      const q      = loadQuarant();
      const cfg    = loadSecCfg();
      const qRoleId = cfg.antiRaid?.quarantineRoleId;
      let count    = 0;

      for (const [userId, data] of Object.entries(q)) {
        for (const roleId of (data.savedRoles || [])) {
          await discordRequest('PUT', `/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`).catch(() => {});
        }
        if (qRoleId) await discordRequest('DELETE', `/guilds/${GUILD_ID}/members/${userId}/roles/${qRoleId}`).catch(() => {});
        count++;
      }

      saveQuarant({});
      return send(200, { ok: true, count });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // DELETE /api/security/quarantine/:userId
  if (url.startsWith('/api/security/quarantine/') && method === 'DELETE') {
    const userId = url.slice('/api/security/quarantine/'.length);
    try {
      const q     = loadQuarant();
      const data  = q[userId];
      if (!data) return send(404, { error: 'Gebruiker niet in quarantaine' });

      const cfg     = loadSecCfg();
      const qRoleId = cfg.antiRaid?.quarantineRoleId;

      for (const roleId of (data.savedRoles || [])) {
        await discordRequest('PUT', `/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`).catch(() => {});
      }
      if (qRoleId) await discordRequest('DELETE', `/guilds/${GUILD_ID}/members/${userId}/roles/${qRoleId}`).catch(() => {});

      delete q[userId];
      saveQuarant(q);
      return send(200, { ok: true });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  // ── MOD LOG API ───────────────────────────────────────────────────────────────
  if (url === '/api/modlog' && method === 'GET') {
    try {
      const db      = fs.existsSync(MODLOG_PATH)  ? JSON.parse(fs.readFileSync(MODLOG_PATH,  'utf-8')) : {};
      const warns   = fs.existsSync(WARNS_PATH)   ? JSON.parse(fs.readFileSync(WARNS_PATH,   'utf-8')) : {};
      const strikes = fs.existsSync(STRIKES_PATH) ? JSON.parse(fs.readFileSync(STRIKES_PATH, 'utf-8')) : {};

      // Verzamel alle unieke userIds uit modlog, warns én strikes
      const allUserIds = new Set([
        ...Object.keys(db),
        ...Object.keys(warns),
        ...Object.keys(strikes),
      ]);

      const leaderboard = [...allUserIds].map(userId => {
        const entries = db[userId] || [];
        const counts = {};
        for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
        const latest = entries.length ? entries.reduce((a, b) => a.at > b.at ? a : b, entries[0]) : null;
        const warnEntries = warns[userId] || [];
        const latestWarn = warnEntries.length ? warnEntries.reduce((a, b) => a.at > b.at ? a : b) : null;
        const username = latest?.username || warnEntries.find(w => w.username)?.username || userId;
        // Total = modlog entries + warn entries not already in modlog (filter by 100ms window)
        const modTimes = new Set(entries.map(e => e.at));
        const extraWarns = warnEntries.filter(w => ![...modTimes].some(t => Math.abs(t - w.at) < 100));
        const total = entries.length + extraWarns.length;
        const lastAt = Math.max(latest?.at || 0, latestWarn?.at || 0);
        const lastReason = latest?.reason || latestWarn?.reason || '';
        return {
          userId,
          username,
          total: total || warnEntries.length,
          warnCount: warnEntries.length,
          strikeCount: strikes[userId] || 0,
          counts,
          lastAction: lastAt,
          lastReason,
        };
      }).filter(p => p.total > 0 || p.strikeCount > 0)
        .sort((a, b) => b.total - a.total);

      return send(200, { leaderboard });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  if (url.startsWith('/api/modlog/') && method === 'GET') {
    try {
      const userId  = decodeURIComponent(url.slice('/api/modlog/'.length));
      const db      = fs.existsSync(MODLOG_PATH)  ? JSON.parse(fs.readFileSync(MODLOG_PATH,  'utf-8')) : {};
      const warns   = fs.existsSync(WARNS_PATH)   ? JSON.parse(fs.readFileSync(WARNS_PATH,   'utf-8')) : {};
      const strikes = fs.existsSync(STRIKES_PATH) ? JSON.parse(fs.readFileSync(STRIKES_PATH, 'utf-8')) : {};
      const modEntries = db[userId] || [];
      const warnEntries = warns[userId] || [];
      // Convert warns.json entries to history format so they always appear in the timeline
      const warnAsHistory = warnEntries.map(w => ({
        id: w.id, type: 'warn', username: userId, reason: w.reason, by: w.by, byId: w.byId, at: w.at, _fromWarns: true
      }));
      // Merge: prefer modlog entries; use warns to fill in events not tracked in modlog yet
      // Deduplicate by matching timestamps within 100ms window
      const modTimes = new Set(modEntries.map(e => e.at));
      const extra = warnAsHistory.filter(w => ![...modTimes].some(t => Math.abs(t - w.at) < 100));
      const allEntries = [...modEntries, ...extra].sort((a, b) => b.at - a.at);
      return send(200, {
        entries: allEntries,
        warns:   warnEntries,
        strikes: strikes[userId] || 0,
      });
    } catch(e) { return send(500, { error: String(e) }); }
  }

  send(404, { error: 'Niet gevonden' });
});

// Discord Snowflake → timestamp
function snowflakeToDate(id) {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  addLog('panel', '✅ Control Panel gestart op http://localhost:' + PORT);
  addLog('panel', '✅ Tailscale remote access actief (alleen 100.x.x.x + localhost)');
  addLog('panel', '✅ Log buffer actief (max ' + LOG_BUFFER_MAX + ' regels)');
  addLog('panel', '✅ Live console geladen — verbinding gereed');
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Lage Landen RP — Control Panel         ║');
  console.log(`║   http://localhost:${PORT}                    ║`);
  console.log(`║   Tailscale: http://<tailscale-ip>:${PORT}    ║`);
  console.log(`║   Wachtwoord: ${PANEL_PASSWORD.padEnd(26)} ║`);
  console.log('╚══════════════════════════════════════════╝\n');
});

// Auto-start bot als hij nog niet draait
startBot();

// Auto-start guardian bot
startGuardian();

// ─── WebSocket server (live logs) ────────────────────────────────────────────
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  // Controleer auth cookie (zelfde sessie-mechanisme als het panel)
  const cookie = req.headers.cookie || '';
  const token  = cookie.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
  if (!sessions.has(token)) {
    ws.close(4401, 'Unauthorized');
    return;
  }

  wsClients.add(ws);
  // Stuur de laatste 100 regels direct bij verbinding
  ws.send(JSON.stringify({ type: 'history', entries: logBuffer.slice(-100) }));

  ws.on('close',   () => wsClients.delete(ws));
  ws.on('error',   () => wsClients.delete(ws));
  ws.on('message', () => {}); // we sturen alleen, geen input verwerking
  addLog('panel', `🔌 WebSocket verbonden (${wsClients.size} actief)`);
});
console.log('✅ WebSocket server actief op ws://localhost:' + PORT);
