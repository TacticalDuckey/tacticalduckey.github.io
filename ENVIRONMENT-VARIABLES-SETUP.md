# Environment Variables Setup Guide

## 📋 Netlify Environment Variables

Ga naar je Netlify Dashboard en configureer de volgende environment variables:

**Pad:** Netlify Dashboard → Site Settings → Environment Variables → Add a variable

---

## 1️⃣ DISCORD_BLACKLIST

**Naam:** `DISCORD_BLACKLIST`

**Waarde:** Je Discord webhook URL

**Voorbeeld:** 
```
https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOpQrStUvWxYz
```

**Functie:**
- Stuurt confirmation berichten terug naar Discord wanneer een server wordt toegevoegd
- **Optioneel** - als niet ingesteld, worden geen notificaties verstuurd

**Hoe verkrijg je deze:**
1. Ga naar je Discord server
2. Server Settings → Integrations → Webhooks
3. Create New Webhook (of gebruik bestaande)
4. Kopieer de Webhook URL
5. Plak in Netlify als `DISCORD_BLACKLIST`

---

## 2️⃣ BLACKLIST_AUTH_KEY

**Naam:** `BLACKLIST_AUTH_KEY`

**Waarde:** Een sterk wachtwoord/sleutel naar keuze

**Voorbeeld:** 
```
SuperGeh3im!2026-BlacklistKey
```

**Functie:**
- Beveiligt de "remove from blacklist" functie
- Voorkomt dat ongeauthoriseerde gebruikers servers kunnen verwijderen
- **Verplicht** voor het verwijderen van servers

**Belangrijk:**
- ⚠️ Deel dit wachtwoord NOOIT met niet-staff leden
- ⚠️ Gebruik een sterk, uniek wachtwoord
- ⚠️ Bewaar deze key veilig (bijv. in een password manager)

---

## 🔐 Beveiliging Best Practices

1. **Gebruik sterke keys**
   - Minimaal 16 karakters
   - Mix van letters, cijfers en speciale tekens
   - Geen voor de hand liggende woorden

2. **Deel nooit je keys**
   - Geen screenshots met keys erin
   - Niet in GitHub commits
   - Alleen delen met trusted staff via veilige kanalen

3. **Regelmatig roteren**
   - Verander keys elke 3-6 maanden
   - Verander onmiddellijk als er een leak is

---

## ✅ Verificatie

### Test DISCORD_BLACKLIST webhook:

1. Ga naar [blacklist-admin.html](blacklist-admin.html)
2. Voeg een test server toe
3. Check je Discord kanaal voor een confirmation bericht

### Test BLACKLIST_AUTH_KEY:

1. Ga naar [blacklist-admin.html](blacklist-admin.html)
2. Probeer een server te verwijderen zonder key → Moet falen
3. Gebruik correcte auth key → Moet succesvol zijn

---

## 📊 Complete Setup Checklist

- [ ] Netlify account aangemaakt
- [ ] Site gedeployed naar Netlify
- [ ] `DISCORD_BLACKLIST` environment variable ingesteld
- [ ] `BLACKLIST_AUTH_KEY` environment variable ingesteld  
- [ ] Discord webhook getest (optional)
- [ ] Admin panel getest (blacklist-admin.html)
- [ ] Remove functie getest met auth key
- [ ] Website blacklist laadt correct (partnerschap-eisen.html)

---

## 🆘 Troubleshooting

### "Unauthorized" error bij het verwijderen

**Oplossing:**
- Check of `BLACKLIST_AUTH_KEY` correct is ingesteld in Netlify
- Verifieer dat je de exacte key gebruikt (let op hoofdletters)
- Controleer of er geen extra spaties zijn

### Discord notifications werken niet

**Oplossing:**
- Verifieer dat `DISCORD_BLACKLIST` correct is ingesteld
- Check of de webhook URL geldig is
- Test de webhook handmatig via Postman/curl
- Check Netlify function logs voor errors

### "Failed to load blacklist"

**Oplossing:**
- Verifieer dat `blacklist.json` in de root staat
- Check of Netlify functions correct zijn gedeployed
- Bekijk Netlify function logs voor errors
- Check browser console (F12) voor details

---

## 📞 Support

Voor meer hulp, check:
- [WEBHOOK-BLACKLIST-SETUP.md](WEBHOOK-BLACKLIST-SETUP.md) - Volledige setup guide
- Netlify Function Logs (Netlify Dashboard → Functions → Logs)
- Browser Console (F12 → Console tab)

---

**Laatste Update:** 12 februari 2026  
**Versie:** 1.0
