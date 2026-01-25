# Sollicitatiecode Validatie Systeem

## 🔐 Wat is er geïmplementeerd?

Het sollicitatiecode systeem voorkomt dat mensen zomaar willekeurige codes kunnen invullen. Codes worden nu centraal gevalideerd via een Netlify Function.

## ✅ Wat is aangepast:

### 1. **Nieuwe Netlify Function: `verify-code.js`**
   - **Locatie:** `netlify/functions/verify-code.js`
   - **Functionaliteit:**
     - `generate`: Genereer nieuwe codes
     - `verify`: Valideer codes (wordt gebruikt bij sollicitatie indienen)
     - `list`: Toon actieve codes (voor staff)
     - `revoke`: Trek code in

### 2. **Staff Code Generator aangepast**
   - **Bestand:** `staff-code-generator.html`
   - **Wijzigingen:**
     - Gebruikt nu Netlify Function in plaats van LocalStorage
     - Codes worden server-side opgeslagen (in-memory)
     - Voor productie: kan geüpgrade worden naar database of Netlify Blobs

### 3. **Politie Sollicitatie Formulier**
   - **Bestand:** `Politie/Sollicitaties/1. Politie Sollicitatie - Invulbaar.html`
   - **Wijzigingen:**
     - Valideert code via `/.netlify/functions/verify-code` voordat verzending
     - Toont duidelijke foutmeldingen bij ongeldige codes
     - Code wordt automatisch als "gebruikt" gemarkeerd na validatie

### 4. **Brandweer Sollicitatie Formulier**
   - **Bestand:** `Brandweer/Sollicitaties/1. Brandweer Sollicitatie - Invulbaar.html`
   - **Wijzigingen:**
     - Zelfde code validatie als Politie formulier
     - Type: `brandweer`

### 5. **Discord Webhook Helper**
   - **Bestand:** `discord-webhook-v2.js`
   - **Wijzigingen:**
     - Nieuwe functie: `submitToDiscordWithoutCodeCheck()`
     - Code validatie gebeurt nu in formulier, niet meer in webhook helper
     - Code wordt getoond in Discord embed

## 🚀 Hoe werkt het?

### Voor Staff (Code Genereren):
1. Ga naar `staff-code-generator.html`
2. Kies het type sollicitatie (politie, brandweer, etc.)
3. Kies geldigheid (standaard 7 dagen)
4. Klik "Genereer Code"
5. Geef de code aan de sollicitant

### Voor Sollicitanten:
1. Open sollicitatie formulier
2. Voer toegangscode in (bijv. `ABC-123-XYZ`)
3. Vul formulier in
4. Klik "Indienen"
5. **Code wordt gevalideerd:**
   - ✅ Code bestaat? → Ga door
   - ❌ Code bestaat niet? → Foutmelding
   - ❌ Code verlopen? → Foutmelding
   - ❌ Code al gebruikt? → Foutmelding
   - ❌ Code voor verkeerd formulier? → Foutmelding

## ⚠️ Belangrijk voor Productie

**Huidige implementatie:** In-memory storage (tijdelijk!)
- Codes worden gewist bij server restart
- Geschikt voor development/testing

**Voor productie gebruik:**
Upgrade naar één van deze opties:
1. **Netlify Blobs** (aanbevolen, gemakkelijk)
2. **Database** (PostgreSQL, MongoDB, etc.)
3. **External KV Store** (Redis, etc.)

### Voorbeeld upgrade naar Netlify Blobs:
```javascript
// In verify-code.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
    const store = getStore('sollicitatie-codes');
    
    // Haal codes op
    const codes = await store.get('codes') || [];
    
    // Sla codes op
    await store.set('codes', JSON.stringify(codes));
};
```

## 🧪 Testen

### Test Scenario's:
1. ✅ **Geldige code:** Code genereren en direct gebruiken
2. ❌ **Ongeldige code:** Random code invullen (bijv. `XXX-XXX-XXX`)
3. ❌ **Verlopen code:** Code met verloopdatum in verleden
4. ❌ **Al gebruikte code:** Dezelfde code 2x gebruiken
5. ❌ **Verkeerd type:** Politie code op Brandweer formulier

## 📝 Code Types

Beschikbare types:
- `politie` - Politie Sollicitatie
- `brandweer` - Brandweer Sollicitatie
- `wtgm` - WTGM Toets
- `grootwapen` - Groot Wapen Toets
- `taser` - Taser Toets
- `rijbewijs-auto` - Rijbewijs Auto
- `rijbewijs-motor` - Rijbewijs Motor
- `rijbewijs-boot` - Rijbewijs Boot
- `rijbewijs-lucht` - Rijbewijs Lucht

## 🔧 Troubleshooting

### "Netlify Function niet gevonden"
- Zorg dat `netlify/functions/verify-code.js` bestaat
- Check `netlify.toml` configuratie
- Herstart Netlify Dev (`netlify dev`)

### "Code niet gevalideerd"
- Check browser console (F12) voor errors
- Controleer of Netlify Function draait
- Test direct via: `POST /.netlify/functions/verify-code`

### "Codes verdwijnen na restart"
- Normaal gedrag (in-memory storage)
- Upgrade naar Netlify Blobs voor permanente opslag

## 📚 API Referentie

### POST /.netlify/functions/verify-code

**Generate Code:**
```json
{
  "action": "generate",
  "type": "politie",
  "validDays": 7
}
```

**Verify Code:**
```json
{
  "action": "verify",
  "code": "ABC-123-XYZ",
  "type": "politie"
}
```

**List Active Codes:**
```json
{
  "action": "list"
}
```

**Revoke Code:**
```json
{
  "action": "revoke",
  "code": "ABC-123-XYZ"
}
```

## ✨ Voordelen

✅ **Beveiliging:** Alleen geldige codes worden geaccepteerd
✅ **Controle:** Staff bepaalt wie kan solliciteren
✅ **Tracking:** Zie welke codes zijn gebruikt
✅ **Expiry:** Codes verlopen automatisch
✅ **Type matching:** Politie codes werken niet op brandweer formulieren
✅ **Eenmalig gebruik:** Codes kunnen maar 1x worden gebruikt

---

**Gemaakt op:** 25 januari 2026
**Status:** ✅ Development Ready (upgrade naar Blobs voor productie)
