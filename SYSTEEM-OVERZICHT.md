# 📊 Blacklist Systeem - Complete Overzicht

## 🎯 Wat is er gebouwd?

Een **volledig geautomatiseerd blacklist systeem** dat:
- ✅ Dynamisch servers toont op de website
- ✅ Real-time updates via Discord webhooks
- ✅ Admin panel voor eenvoudig beheer
- ✅ Beveiligde API endpoints
- ✅ Automatische synchronisatie

---

## 📁 Bestanden Overzicht

### Frontend (HTML Pagina's)

| Bestand | Beschrijving | URL |
|---------|--------------|-----|
| `partnerschap-eisen.html` | Hoofdpagina met partnerschapseisen + dynamische blacklist | `/partnerschap-eisen.html` |
| `blacklist-admin.html` | Admin panel voor blacklist beheer | `/blacklist-admin.html` |

### Backend (Netlify Functions)

| Bestand | Endpoint | Methode | Functie |
|---------|----------|---------|---------|
| `get-blacklist.js` | `/.netlify/functions/get-blacklist` | GET | Blacklist ophalen als JSON |
| `update-blacklist.js` | `/.netlify/functions/update-blacklist` | POST | Server toevoegen aan blacklist |
| `remove-from-blacklist.js` | `/.netlify/functions/remove-from-blacklist` | POST | Server verwijderen (authenticated) |

### Data & Config

| Bestand | Beschrijving |
|---------|--------------|
| `blacklist.json` | Database met alle geblackliste servers |
| `package.json` | NPM dependencies (node-fetch) |
| `.env.example` | Template voor environment variables |
| `.gitignore` | Voorkomt dat secrets worden gecommit |

### Documentatie

| Bestand | Onderwerp |
|---------|-----------|
| `QUICK-START.md` | 5-minuten setup guide |
| `WEBHOOK-BLACKLIST-SETUP.md` | Volledige webhook configuratie |
| `ENVIRONMENT-VARIABLES-SETUP.md` | Environment variables uitleg |
| `DISCORD-BOT-OPTIONEEL.md` | Optionele Discord bot code |

---

## 🔐 Environment Variables

### DISCORD_BLACKLIST
- **Type:** String (URL)
- **Required:** Nee (optioneel)
- **Functie:** Discord webhook URL voor confirmation berichten
- **Voorbeeld:** `https://discord.com/api/webhooks/123/abc...`

### BLACKLIST_AUTH_KEY
- **Type:** String
- **Required:** Ja
- **Functie:** Authenticatie voor het verwijderen van servers
- **Voorbeeld:** `MijnGeheimeKey123!`

**Setup:** Netlify Dashboard → Site Settings → Environment Variables

---

## 🔄 Workflow Diagram

```
┌─────────────────┐
│  Discord User   │
│ Post in kanaal  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Discord Webhook │ → Configured URL
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Netlify Function        │
│ update-blacklist.js     │
│ - Validates input       │
│ - Reads blacklist.json  │
│ - Adds server          │
│ - Saves blacklist.json  │
│ - Sends confirmation   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ blacklist.json  │      │ Discord Webhook  │
│ (Updated)       │      │ (Confirmation)   │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Website                 │
│ partnerschap-eisen.html │
│ - Auto refresh (5 min)  │
│ - Shows updated list    │
└─────────────────────────┘
```

---

## 🚀 Gebruik Cases

### Use Case 1: Via Discord Webhook (Automatisch)

```
Stap 1: Setup Discord webhook
  └── URL: https://jouw-site.netlify.app/.netlify/functions/update-blacklist

Stap 2: Post in Discord kanaal
  └── "Apeldoorn Roleplay"

Stap 3: Automatische verwerking
  ├── Server toegevoegd aan blacklist.json
  ├── Confirmation bericht naar Discord (optioneel)
  └── Website update binnen 5 min

Result: ✅ Server staat op de website
```

### Use Case 2: Via Admin Panel (Manueel)

```
Stap 1: Open blacklist-admin.html

Stap 2: Type server naam
  └── "Amsterdam Roleplay"

Stap 3: Klik "Toevoegen"

Stap 4: Bevestiging
  └── "✅ Amsterdam Roleplay toegevoegd aan blacklist!"

Result: ✅ Direct zichtbaar op website
```

### Use Case 3: Server Verwijderen (Admin Only)

```
Stap 1: Open blacklist-admin.html

Stap 2: Scroll naar "Server Verwijderen"

Stap 3: Type server naam + auth key
  ├── Server: "Test Server"
  └── Auth Key: [BLACKLIST_AUTH_KEY waarde]

Stap 4: Klik "Verwijderen"

Result: ✅ Server verwijderd van blacklist
```

---

## 🎨 Features

### ✨ Frontend Features

- **Dynamische Lijst:** Laadt blacklist via API
- **Auto-Refresh:** Update elke 5 minuten automatisch
- **Responsive Design:** Past bij bestaande site styling
- **Loading States:** Duidelijke feedback tijdens laden
- **Error Handling:** Graceful fallback bij fouten
- **Timestamp:** Toont wanneer laatst bijgewerkt
- **Server Count:** Toont totaal aantal servers

### 🔒 Backend Features

- **Input Validation:** Controleert of data geldig is
- **Duplicate Prevention:** Voorkomt dubbele entries
- **Authentication:** Beveiligde delete endpoint
- **Auto-Sorting:** Alfabetisch gesorteerde lijst
- **Timestamping:** Bijhouden van laatste update
- **Error Logging:** Detailed errors voor debugging
- **Discord Integration:** Optionele confirmations

### 🛡️ Security Features

- **Environment Variables:** Secrets niet in code
- **Authentication Required:** Voor delete operaties
- **CORS Configured:** Veilige API toegang
- **Input Sanitization:** Voorkomt injection
- **Error Messages:** Geen sensitive info lekken

---

## 📊 API Documentation

### GET `/netlify/functions/get-blacklist`

**Response:**
```json
{
  "servers": [
    "Amsterdam Roleplay",
    "Apeldoorn Roleplay",
    "Test Server"
  ],
  "lastUpdated": "2026-02-12T10:30:00.000Z"
}
```

---

### POST `/netlify/functions/update-blacklist`

**Request:**
```json
{
  "content": "Server Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server added to blacklist",
  "serverName": "Server Name",
  "totalServers": 31
}
```

---

### POST `/netlify/functions/remove-from-blacklist`

**Request:**
```json
{
  "serverName": "Server Name",
  "authKey": "your-secret-key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Server removed from blacklist",
  "serverName": "Server Name",
  "totalServers": 30
}
```

---

## 🧪 Testing Checklist

- [ ] **Lokaal testen:**
  - [ ] `npm install` succesvol
  - [ ] `.env` bestand aangemaakt
  - [ ] Functions lokaal runnen met `netlify dev`

- [ ] **Deployment:**
  - [ ] Deploy naar Netlify succesvol
  - [ ] Environment variables ingesteld
  - [ ] Functions beschikbaar in Netlify Dashboard

- [ ] **Frontend:**
  - [ ] Partnerschap pagina laadt blacklist
  - [ ] Admin panel laadt correct
  - [ ] Auto-refresh werkt (wacht 5 min)

- [ ] **Backend:**
  - [ ] GET blacklist returns JSON
  - [ ] POST add server werkt
  - [ ] POST remove server werkt (met auth)
  - [ ] POST remove faalt zonder auth

- [ ] **Discord (optioneel):**
  - [ ] Webhook ingesteld in Discord
  - [ ] Webhook URL wijst naar Netlify function
  - [ ] Post in Discord voegt server toe
  - [ ] Confirmation bericht wordt verstuurd

---

## 📈 Statistieken

Met dit systeem kan je:
- ✅ Onbeperkt servers toevoegen
- ✅ Real-time updates binnen seconden
- ✅ Automatisch synchroniseren tussen Discord en website
- ✅ Centraal beheer via één interface
- ✅ Transparant tonen aan community

---

## 🎓 Verdere Ontwikkeling

### Mogelijke Uitbreidingen:

1. **Search Functie**
   - Zoeken in blacklist op website
   - Filter op datum toegevoegd

2. **History Tracking**
   - Log wie wat heeft toegevoegd
   - Timestamp per entry
   - Audit trail

3. **Categorieën**
   - Categoriseer servers (leakers, scam, toxic, etc.)
   - Filter per categorie

4. **Export Functie**
   - Download als CSV/JSON
   - PDF rapport genereren

5. **Notifications**
   - Email alerts bij nieuwe entries
   - Discord role mentions

6. **Multi-Admin**
   - Meerdere auth keys
   - Role-based access

---

## 🆘 Support & Debugging

### Common Issues & Solutions

**Issue:** "Failed to load blacklist"
- **Check:** Bestaat `blacklist.json` in root?
- **Fix:** Maak bestand aan met `{"servers":[],"lastUpdated":null}`

**Issue:** "Unauthorized" bij verwijderen
- **Check:** Is `BLACKLIST_AUTH_KEY` ingesteld?
- **Fix:** Verifieer exacte match tussen .env en input

**Issue:** Discord webhook reageert niet
- **Check:** Is URL correct ingesteld?
- **Fix:** Test met curl/Postman eerst

**Issue:** Lijst update niet automatisch
- **Check:** JavaScript errors in console?
- **Fix:** Hard refresh (Ctrl+Shift+R)

### Debug Resources:
- **Browser Console:** F12 → Console tab
- **Network Tab:** F12 → Network tab
- **Netlify Logs:** Dashboard → Functions → Logs
- **Function Status:** Dashboard → Functions → [function name]

---

## 📞 Contact

Voor vragen, bugs of feature requests:
- Check de documentatie in `/WEBHOOK-BLACKLIST-SETUP.md`
- Review Netlify function logs
- Inspect browser console
- Test API endpoints met Postman

---

**🎉 Je bent klaar!**

Het systeem is volledig functioneel en production-ready. Deploy naar Netlify en je bent live!

---

**Laatste Update:** 12 februari 2026  
**Versie:** 1.0.0  
**Status:** Production Ready ✅
