# 🚒 Brandweer Sollicitaties

## Overzicht

Deze folder bevat het complete sollicitatiesysteem voor de Brandweer van Lage Landen RP.

## Bestanden

### Voor Spelers
- **1. Brandweer Sollicitatie - Invulbaar.html** - Hoofdsollicitatie formulier

### Voor Staff (VERTROUWELIJK)
- **STAFF - Brandweer Sollicitatie Nakijkmodel.html** - Beoordelingscriteria en antwoordmodel

## Webhook Configuratie

De brandweer sollicitaties worden verstuurd via een Netlify Function om de Discord webhook URL te beschermen.

### Setup Stappen:

1. **Netlify Environment Variables**
   - Ga naar Netlify Dashboard → Site Settings → Environment Variables
   - Voeg toe: `BRANDWEER_WEBHOOK_URL`
   - Waarde: Jouw Discord webhook URL voor brandweer sollicitaties

2. **Discord Webhook**
   - Maak een nieuwe webhook aan in je brandweer sollicitaties kanaal
   - Kopieer de webhook URL
   - Plak deze in de Netlify environment variable

3. **Netlify Function**
   - Bestand: `/netlify/functions/submit-brandweer-sollicitatie.js`
   - Automatisch deployed met site updates
   - Endpoint: `/.netlify/functions/submit-brandweer-sollicitatie`

## Beveiliging

✅ **Veilig:**
- Webhook URL staat NIET in de code
- Webhook URL staat in Netlify environment variables (niet toegankelijk via GitHub)
- Alleen Netlify Function kan webhook aanroepen
- Authenticatie vereist voor toegang tot formulieren

❌ **Niet doen:**
- Webhook URL direct in HTML zetten
- Webhook URL in GitHub repository plaatsen
- Environment variables delen met spelers

## Testing

Test de sollicitatie flow:
1. Log in met account
2. Ga naar Brandweer Sollicitaties
3. Vul formulier in
4. Controleer of Discord webhook correct wordt getriggerd
5. Verifieer dat data correct in Discord verschijnt

## Troubleshooting

**Sollicitatie wordt niet verzonden:**
- Check Netlify Functions log
- Verifieer `BRANDWEER_WEBHOOK_URL` environment variable is ingesteld
- Test webhook URL handmatig in Discord

**403 Forbidden:**
- Controleer authenticatie
- Verifieer gebruiker is ingelogd

**Discord webhook error:**
- Verifieer webhook URL is geldig
- Check of webhook niet is verwijderd in Discord
- Test met korte sollicitatie (embed size limit: 6000 chars)

---

*Laatst bijgewerkt: 2024*
*Systeembeheerder: Staff Team*
