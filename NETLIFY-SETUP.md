# Netlify Environment Variables Setup

Voor de SPOED sollicitatie moet je de volgende environment variable instellen in Netlify:

## Stappen:

1. Ga naar je Netlify dashboard
2. Selecteer je site (lagelandenrp.netlify.app)
3. Ga naar **Site configuration** → **Environment variables**
4. Klik op **Add a variable**
5. Voeg de volgende toe:

### SOLLICITATIE_WEBHOOK_URL

**Key:** `SOLLICITATIE_WEBHOOK_URL`  
**Value:** Je Discord webhook URL voor SPOED sollicitaties

Voorbeeld:
```
https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz
```

## Andere bestaande environment variables:

- `DISCORD_WEBHOOK_URL` - Voor normale politie sollicitaties
- `BRANDWEER_WEBHOOK_URL` - Voor brandweer sollicitaties

## Na het toevoegen:

1. Klik op **Save**
2. **Trigger deploy** (optioneel, maar aanbevolen)
3. Wacht 1-2 minuten tot de deploy klaar is
4. Test het SPOED sollicitatie formulier

## Troubleshooting:

Als het formulier niet werkt:
1. Open de browser console (F12)
2. Vul het formulier in en verstuur
3. Check de console voor foutmeldingen
4. Als je `SOLLICITATIE_WEBHOOK_URL not configured` ziet, is de environment variable niet correct ingesteld
