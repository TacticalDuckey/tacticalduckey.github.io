# 🚀 Quick Start - Blacklist Webhook Systeem

## In 5 minuten werkend!

### ✅ Stap 1: Deploy naar Netlify

```bash
# Optioneel: installeer dependencies lokaal
npm install

# Deploy naar Netlify
netlify deploy --prod
```

Of gebruik Netlify UI:
1. Login op netlify.com
2. "Add new site" → "Import an existing project"
3. Connect je Git repository
4. Deploy!

---

### ✅ Stap 2: Environment Variables instellen

**Ga naar:** Netlify Dashboard → Site Settings → Environment Variables

**Voeg toe:**

| Variable Name | Value | Required |
|---------------|-------|----------|
| `DISCORD_BLACKLIST` | Je Discord webhook URL | Optioneel |
| `BLACKLIST_AUTH_KEY` | Een sterk wachtwoord | Verplicht |

**DISCORD_BLACKLIST voorbeeld:**
```
https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOpQrStUvWxYz
```

**BLACKLIST_AUTH_KEY voorbeeld:**
```
MijnSuperGeheimeKey123!
```

---

### ✅ Stap 3: Test het systeem

#### Optie A: Via Admin Panel (Makkelijkst)

1. Open: `https://jouw-site.netlify.app/blacklist-admin.html`
2. Type een server naam
3. Klik "Toevoegen"
4. ✅ Server verschijnt in lijst!

#### Optie B: Via Discord Webhook

1. In Discord: Server Settings → Integrations → Webhooks
2. Create webhook of edit bestaande
3. **Webhook URL wijzigen naar:**
   ```
   https://jouw-site.netlify.app/.netlify/functions/update-blacklist
   ```
4. Type een server naam in het Discord kanaal
5. ✅ Automatisch toegevoegd aan blacklist!

---

### ✅ Stap 4: Verifieer dat het werkt

1. **Open de partnership pagina:**
   ```
   https://jouw-site.netlify.app/partnerschap-eisen.html
   ```

2. **Scroll naar beneden** naar de blacklist sectie

3. **Zie je de servers?** 
   - ✅ Ja → Het werkt perfect!
   - ❌ Nee → Check de troubleshooting hieronder

---

## 🎯 Belangrijkste URLs

| Pagina | URL | Functie |
|--------|-----|---------|
| **Partnerschap Eisen** | `/partnerschap-eisen.html` | Publiek zichtbare blacklist |
| **Admin Panel** | `/blacklist-admin.html` | Beheer blacklist (toevoegen/verwijderen) |
| **API - Get Blacklist** | `/.netlify/functions/get-blacklist` | JSON API endpoint |
| **API - Add Server** | `/.netlify/functions/update-blacklist` | Webhook endpoint |

---

## 🔧 Troubleshooting

### "Failed to load blacklist"

```bash
# Check of blacklist.json bestaat
ls blacklist.json

# Als niet, maak het aan met:
echo '{"servers":[],"lastUpdated":null}' > blacklist.json

# Redeploy
netlify deploy --prod
```

### Discord webhook reageert niet

1. Verifieer webhook URL is:  
   `https://jouw-site.netlify.app/.netlify/functions/update-blacklist`

2. Test handmatig:
   ```bash
   curl -X POST https://jouw-site.netlify.app/.netlify/functions/update-blacklist \
     -H "Content-Type: application/json" \
     -d '{"content":"Test Server"}'
   ```

3. Check Netlify function logs:  
   Netlify Dashboard → Functions → `update-blacklist` → Logs

### Admin panel werkt niet

1. Open browser console (F12 → Console)
2. Check voor error messages
3. Verifieer dat je de correcte Netlify URL gebruikt
4. Clear browser cache en reload

---

## 📚 Meer Informatie

- **Volledige Setup Guide:** [WEBHOOK-BLACKLIST-SETUP.md](WEBHOOK-BLACKLIST-SETUP.md)
- **Environment Variables:** [ENVIRONMENT-VARIABLES-SETUP.md](ENVIRONMENT-VARIABLES-SETUP.md)
- **Discord Bot Optie:** [DISCORD-BOT-OPTIONEEL.md](DISCORD-BOT-OPTIONEEL.md)

---

## ✨ That's it!

Je blacklist systeem is nu live en automatisch! 🎉

**Check:** `https://jouw-site.netlify.app/partnerschap-eisen.html`

Servers die je toevoegt via Discord of het admin panel verschijnen automatisch op de website!

---

**Need help?** Check de logs:
- Browser Console (F12)
- Netlify Function Logs (Dashboard → Functions)
- Network tab (F12 → Network)
