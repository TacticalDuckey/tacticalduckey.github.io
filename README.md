# 🚔 Lage Landen RP - Sollicitatie Systeem

## ⚠️ BELANGRIJKE SETUP (VOOR ADMIN)

### Discord Webhook URL Beveiligen

De Discord webhook URL moet als **environment variable** in Netlify ingesteld worden:

1. Ga naar [Netlify Dashboard](https://app.netlify.com)
2. Selecteer je site: **lagelandenrp**
3. Ga naar **Site Settings** → **Environment Variables**
4. Klik **Add a variable**
5. Voeg toe:
   - **Key**: `DISCORD_WEBHOOK_URL`
   - **Value**: `[JE DISCORD WEBHOOK URL HIER]` ⚠️ **VOEG DIT TOE IN NETLIFY DASHBOARD, NIET IN DEZE FILE!**
6. Klik **Save**
7. **Redeploy** je site: Deploys → Trigger Deploy → Deploy site

✅ **Belangrijk**: Sla NOOIT de echte webhook URL op in deze repository!

---

## Overzicht

Dit systeem biedt een volledig geïntegreerde sollicitatie- en toetsomgeving voor Lage Landen RP met:

- ✅ **Discord Webhook Integratie** - Alle sollicitaties worden automatisch naar Discord gestuurd (server-side beveiligd)
- 🔐 **Toegangscode Systeem** - Staff genereert codes, gebruikers moeten deze invoeren
- ⏱️ **24-uurs Cooldown** - Voorkomt spam door sollicitaties te beperken tot 1 per 24 uur
- 👥 **Rolgebaseerde Toegang** - Admin, Staff, Agent rollen met verschillende rechten
- 🎨 **Moderne UI** - Professionele interface met gradient designs
- 🛡️ **Netlify Functions** - Webhook URL verborgen in server-side code

---

## 🔑 Voor Staff: Codes Genereren

### Toegang tot Code Generator
1. Log in op [https://lagelanden.netlify.app](https://lagelanden.netlify.app)
2. Klik op **Dashboard**
3. In de STAFF sectie, klik op **🔑 Sollicitatiecode Generator**

### Een Code Maken
1. Selecteer het sollicitatietype (bijv. "Politie Sollicitatie")
2. Kies hoelang de code geldig blijft (1-30 dagen)
3. Klik op **🎲 Genereer Code**
4. **Kopieer de code** en geef deze aan de sollicitant

### Code Format
Codes hebben het formaat: `ABC-123-XYZ` (9 karakters + 2 streepjes)

Bijvoorbeeld:
- `K7M-P4N-X2J`
- `A9B-C3D-E5F`

### Code Beheer
- **Actieve Codes**: Zie alle actieve codes onderaan de pagina
- **Intrekken**: Klik op "Intrekken" om een code ongeldig te maken
- **Automatisch Gebruik**: Codes worden automatisch gemarkeerd als "gebruikt" na inzending

---

## 👤 Voor Sollicitanten: Sollicitatie Indienen

### Stap 1: Code Verkrijgen
Vraag een **toegangscode** aan bij een staff member via Discord.

### Stap 2: Formulier Invullen
1. Ga naar de Dashboard
2. Klik op de gewenste sollicitatie (bijv. "Politie Sollicitatie")
3. Voer je **toegangscode** in bovenaan het formulier
4. Vul alle vragen nauwkeurig in

### Stap 3: Indienen
1. Klik op **✅ Indienen bij Staff**
2. Het systeem controleert:
   - ✓ Code geldigheid
   - ✓ Cooldown periode (24 uur)
   - ✓ Roblox username ingevuld
3. Bij succes: Bevestiging + formulier wordt gewist
4. Bij fout: Foutmelding met uitleg

### Cooldown Systeem
- **1 sollicitatie per 24 uur** per type
- Voorbeeld: Je kunt WTGM Toets en Politie Sollicitatie op dezelfde dag doen
- Maar NIET 2x Politie Sollicitatie binnen 24 uur

---

## 📋 Beschikbare Sollicitaties

### Politie
1. **Politie Sollicitatie** - Basis sollicitatie voor agent
2. **WTGM Toets** - Wapenstok, Taser, Geweld & Middelmatig geweld
3. **Groot Wapen Toets** - Voor grote vuurwapens
4. **Taser Toets** - Taser certificering

### Rijbewijzen
5. **Rijbewijs Auto** - Auto theorie + praktijk
6. **Rijbewijs Motor** - Motor theorie + praktijk
7. **Rijbewijs Boot** - Boot theorie + praktijk
8. **Rijbewijs Lucht** - Vliegtuig/helikopter certificering

---

## 🔧 Technische Details

### Discord Webhook
- **Webhook URL**: Geconfigureerd in `discord-webhook-v2.js`
- **Embeds**: Kleurgecodeerd per sollicitatietype
- **Velden**: Max 25 velden per embed (Discord limiet)
- **Metadata**: Timestamp, gebruikersnaam, sollicitatietype

### Security Features
1. **Code Verificatie**: LocalStorage-based code management
2. **Cooldown Tracking**: Per gebruiker + sollicitatietype
3. **Role-Based Access**: Netlify Identity roles
4. **Server-Side Redirects**: `_redirects` file beveiligd STAFF pagina's

### File Structure
```
Discord DIngen/
├── index.html                      # Homepage
├── login.html                      # Authentication pagina
├── dashboard.html                  # Role-based dashboard
├── staff-code-generator.html       # Code generator (STAFF only)
├── discord-webhook-v2.js           # Webhook + verificatie systeem
├── auth.js                         # Netlify Identity wrapper
├── _redirects                      # Netlify access control
├── netlify.toml                    # Netlify configuratie
│
├── Politie/
│   └── Sollicitaties/
│       ├── 1. Politie Sollicitatie - Invulbaar.html
│       ├── 2. WTGM Toets - Invulbaar.html
│       ├── 3. Groot Wapen Toets - Invulbaar.html
│       ├── 4. Taser Toets - Invulbaar.html
│       ├── 5. Rijbewijs Auto - Invulbaar.html
│       ├── 6. Rijbewijs Motor - Invulbaar.html
│       ├── 7. Rijbewijs Boot - Invulbaar.html
│       ├── 8. Rijbewijs Lucht - Invulbaar.html
│       ├── STAFF - Politie Sollicitatie Beoordelingsformulier.html
│       ├── STAFF - WTGM Toets Nakijkmodel.html
│       ├── STAFF - Groot Wapen Nakijkmodel.html
│       ├── STAFF - Taser Nakijkmodel.html
│       ├── STAFF - Rijbewijs Auto Nakijkmodel.html
│       ├── STAFF - Rijbewijs Motor Nakijkmodel.html
│       ├── STAFF - Rijbewijs Boot Nakijkmodel.html
│       └── STAFF - Rijbewijs Lucht Nakijkmodel.html
│
└── images/
    ├── logo.png
    └── banner.png
```

### Form Types (voor developers)
```javascript
const formTypes = {
    'politie': '🚔 Politie Sollicitatie',
    'wtgm': '🔫 WTGM Toets',
    'grootwapen': '⚔️ Groot Wapen',
    'taser': '⚡ Taser',
    'rijbewijs-auto': '🚗 Rijbewijs Auto',
    'rijbewijs-motor': '🏍️ Rijbewijs Motor',
    'rijbewijs-boot': '🚤 Rijbewijs Boot',
    'rijbewijs-lucht': '✈️ Rijbewijs Lucht'
};
```

---

## 🚀 Deployment

### Automatische Deploy
- **Repository**: https://github.com/TacticalDuckey/tacticalduckey.github.io
- **Live Site**: https://lagelanden.netlify.app
- **Deploy Trigger**: Push naar `master` branch

### Git Commands
```bash
cd "c:\Discord DIngen"
git add .
git commit -m "Update: beschrijving van wijziging"
git push orgin master
```

⚠️ **Let op**: Remote naam is `orgin` (typo in origin)

### Netlify Settings
- **Build Command**: Geen (static site)
- **Publish Directory**: `/`
- **Identity**: Enabled met email confirmatie
- **Roles**: admin, staff, agent, user

---

## � Beveiliging

### Content Security Policy (CSP)
Alle security headers worden automatisch toegepast via `netlify.toml`:

- **CSP Headers** - Beschermt tegen XSS en data injection
- **X-Frame-Options** - Voorkomt clickjacking (DENY)
- **X-Content-Type-Options** - Voorkomt MIME-sniffing
- **Strict-Transport-Security** - Forceert HTTPS
- **Permissions-Policy** - Beperkt browser features

### Toegestane Sources
```
Scripts:  Netlify Identity, Cloudflare CDN
Styles:   Self + inline styles
Images:   Self + data URIs + HTTPS
Fonts:    Self + Cloudflare CDN
API:      Discord webhooks, Netlify endpoints
```

### Environment Variables
Gevoelige data zoals Discord webhook URL worden **server-side** opgeslagen:
1. Netlify Dashboard → Site Settings → Environment Variables
2. Add: `DISCORD_WEBHOOK_URL`
3. Waarde wordt **nooit** in de code opgeslagen
4. Netlify Functions hebben toegang via `process.env`

### Netlify Identity
- **Trusted Source**: `https://identity.netlify.com/v1/netlify-identity-widget.js`
- **Officiële Netlify service** - Geen integrity hash nodig
- **Auto-updates** - Netlify beheert security patches
- **CSP toegestaan** via `script-src` directive

---

## �📞 Support

Voor vragen of problemen:
- **Discord**: Neem contact op met server admins
- **GitHub Issues**: Voor technische bugs
- **Netlify Dashboard**: https://app.netlify.com voor user management

---

## 🔄 Recent Updates

### v2.0 - Volledig Verificatie Systeem
✅ Toegangscode systeem geïmplementeerd  
✅ 24-uurs cooldown per sollicitatie  
✅ Discord webhook voor alle formulieren  
✅ Code generator voor staff  
✅ Folder restructuur: Politie/Sollicitaties  
✅ Enhanced error handling  

### v1.0 - Initiële Release
✅ Homepage met authentication  
✅ Role-based dashboard  
✅ Netlify Identity integratie  
✅ Basic Discord webhook  

---

**Made with ❤️ for Lage Landen RP**
