# Discord Blacklist Webhook System

## 📋 Overzicht

Dit systeem synchroniseert automatisch de blacklist op de website met berichten uit een Discord kanaal. Wanneer een bericht wordt gestuurd in een specifiek Discord kanaal, wordt die servernaam automatisch toegevoegd aan de blacklist op de website.

## 🚀 Setup Instructies

### Stap 1: Discord Webhook Aanmaken

1. Ga naar je Discord server
2. Ga naar Server Settings → Integrations → Webhooks
3. Klik op "New Webhook"
4. Geef de webhook een naam (bijv. "Blacklist Updater")
5. Kies het kanaal waar je blacklist updates wilt posten
6. Kopieer de Webhook URL

### Stap 2: Webhook URL Configureren

De webhook URL moet wijzen naar jouw Netlify functie:

```
https://jouw-site.netlify.app/.netlify/functions/update-blacklist
```

**Let op:** Vervang `jouw-site.netlify.app` met jouw daadwerkelijke Netlify URL.

### Stap 3: Discord Webhook Instellen

In Discord, wijzig de webhook URL naar:
```
https://jouw-site.netlify.app/.netlify/functions/update-blacklist
```

**Belangrijk:** Sla ook je Discord webhook URL op in Netlify:
- Ga naar Netlify Dashboard → Site Settings → Environment Variables
- Key: `DISCORD_BLACKLIST`
- Value: Je Discord webhook URL (bijv. `https://discord.com/api/webhooks/...`)

## 📝 Gebruik

### Server Toevoegen aan Blacklist

Stuur simpelweg een bericht in het Discord kanaal met de webhook:

```
Apeldoorn Roleplay
```

Het bericht (de servernaam) wordt automatisch toegevoegd aan de blacklist op de website.

### Meerdere Servers Toevoegen

Stuur meerdere berichten (één per server):

```
Server Name 1
```
```
Server Name 2
```
```
Server Name 3
```

### Server Verwijderen van Blacklist (Admin Only)

Gebruik een POST request met authenticatie naar:

```bash
POST /.netlify/functions/remove-from-blacklist
Content-Type: application/json

{
  "serverName": "Server Name",
  "authKey": "JOUW_GEHEIME_SLEUTEL"
}
```

## 🔐 Beveiliging

### Environment Variables

Stel de volgende environment variables in bij Netlify:

1. Ga naar Netlify Dashboard → Site Settings → Environment Variables
2. Voeg toe:
   - **Key:** `DISCORD_BLACKLIST`
   - **Value:** Je Discord webhook URL (optioneel, voor reverse webhook)
   
   - **Key:** `BLACKLIST_AUTH_KEY`
   - **Value:** Een sterk wachtwoord/key naar keuze (voor verwijderen van servers)

## 📊 API Endpoints

### GET - Blacklist Ophalen
```
GET /.netlify/functions/get-blacklist
```

Retourneert JSON:
```json
{
  "servers": ["Server 1", "Server 2", "Server 3"],
  "lastUpdated": "2026-02-12T10:30:00Z"
}
```

### POST - Server Toevoegen
```
POST /.netlify/functions/update-blacklist
Content-Type: application/json

{
  "content": "Server Name"
}
```

### POST - Server Verwijderen (Authenticated)
```
POST /.netlify/functions/remove-from-blacklist
Content-Type: application/json

{
  "serverName": "Server Name",
  "authKey": "JOUW_GEHEIME_SLEUTEL"
}
```

## 🎯 Features

✅ **Real-time Updates** - Website wordt elke 5 minuten automatisch bijgewerkt
✅ **Automatische Synchronisatie** - Discord → Website gebeurt instant
✅ **Duplicate Prevention** - Servers worden niet dubbel toegevoegd
✅ **Alfabetische Sortering** - Lijst wordt automatisch gesorteerd
✅ **Timestamp Tracking** - Laatste update tijd wordt bijgehouden
✅ **Error Handling** - Graceful degradation bij fouten

## 🛠️ Troubleshooting

### Website toont "Blacklist wordt geladen..." oneindig

**Oplossing:** 
- Check of `blacklist.json` bestaat in de root van je project
- Verifieer dat Netlify Functions correct zijn gedeployed
- Check de browser console voor foutmeldingen

### Discord webhook werkt niet

**Oplossing:**
- Verifieer dat de webhook URL correct is ingesteld
- Check of de Netlify function `update-blacklist.js` is gedeployed
- Test met een POST request via Postman/curl

### Servers worden niet toegevoegd

**Oplossing:**
- Check Netlify function logs in je Netlify Dashboard
- Verifieer dat het bericht niet leeg is
- Check of de server misschien al op de lijst staat

## 📁 Bestandsstructuur

```
├── blacklist.json                          # Hoofddata bestand
├── partnerschap-eisen.html                 # Pagina met dynamische blacklist
└── netlify/
    └── functions/
        ├── get-blacklist.js               # Blacklist ophalen
        ├── update-blacklist.js            # Server toevoegen
        └── remove-from-blacklist.js       # Server verwijderen
```

## 🔄 Workflow

1. **Discord:** Bericht wordt gepost in webhook kanaal
2. **Webhook:** Discord stuurt POST naar Netlify function
3. **Function:** Voegt server toe aan `blacklist.json`
4. **Website:** Laadt blacklist elke 5 min of bij page refresh
5. **Gebruiker:** Ziet bijgewerkte lijst automatisch

## 💡 Tips

- Gebruik een dedicated Discord kanaal alleen voor blacklist updates
- Laat alleen staff toegang hebben tot dit kanaal
- Test eerst in een development omgeving
- Monitor de Netlify function logs voor errors
- Maak regelmatig backups van `blacklist.json`

## 📞 Support

Voor vragen of problemen, check:
- Netlify Function Logs (Netlify Dashboard → Functions)
- Browser Console (F12 → Console tab)
- Network Tab (F12 → Network tab)

---

**Laatste Update:** 12 februari 2026
**Versie:** 1.0
