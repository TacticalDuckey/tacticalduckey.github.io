# 🎯 Discord Webhook Setup (Zonder 24/7 Bot)

## ✅ Wat werkt:
- ✨ Type server naam in Discord kanaal
- 🔄 Webhook triggert Netlify function automatisch
- 💾 Server wordt toegevoegd aan blacklist
- 📢 Bot reageert met mooie embed bevestiging
- 🆓 **100% gratis - geen hosting nodig!**

---

## 📋 Setup Stappen:

### Stap 1: Maak Discord Webhook

1. Open je Discord server
2. Right-click op je **blacklist kanaal** (kanaal ID: `1471529070712848588`)
3. Kies **Edit Channel** ⚙️
4. Ga naar **Integrations** tab
5. Click **Create Webhook** of **View Webhooks**
6. Click **New Webhook**
7. Geef een naam: `Blacklist Manager` 🤖
8. Click **Copy Webhook URL** 📋
9. **LET OP:** Bewaar deze URL veilig! Dit is belangrijk voor stap 2.

### Stap 2: Voeg Webhook URL toe aan Netlify

1. Ga naar [Netlify Dashboard](https://app.netlify.com)
2. Selecteer je site: **lagelandenrp**
3. Ga naar **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Voeg toe:
   - **Key:** `DISCORD_WEBHOOK_URL`
   - **Value:** [plak de webhook URL uit stap 1]
6. Click **Save**

### Stap 3: ❌ NIET NODIG - Webhook triggert NIET onze function

**LET OP:** Discord webhooks werken andersom dan ik dacht. Discord kan NIET automatisch een POST request sturen naar onze Netlify function wanneer een bericht wordt verstuurd.

**Oplossing:** We hebben toch een kleine bot nodig, MAAR deze kan op je eigen PC draaien en hoeft NIET 24/7 aan te staan. Alleen wanneer je wilt dat berichten automatisch worden verwerkt.

---

## 🎮 Alternatief: Bot op je PC (Simpel!)

### ✅ Voordelen:
- ✨ Automatische reactie op berichten in Discord
- 🆓 Volledig gratis - geen hosting
- 💻 Draait alleen wanneer jij het aanzet
- 🔧 Makkelijk te starten/stoppen

### 📦 Installatie:

1. **Download Node.js** (als je die nog niet hebt):
   - Ga naar: https://nodejs.org
   - Download LTS versie (20.x)
   - Installeer met standaard instellingen

2. **Start de bot:**
   - Open je folder: `C:\Discord DIngen`
   - Dubbel-klik op: `start-bot.bat`
   - Klaar! Bot draait nu 🎉

3. **Stop de bot:**
   - Close het command prompt venster
   - Of druk `Ctrl+C`

---

## 🧪 Test het!

### Optie A: Admin Panel (werkt altijd)
1. Ga naar: https://lagelandenrp.netlify.app/blacklist-admin.html
2. Type server naam
3. Click "Server Toevoegen"
4. ✅ Embed verschijnt in Discord!

### Optie B: Discord Direct (alleen als bot draait)
1. Start bot via `start-bot.bat`
2. Type server naam in blacklist kanaal
3. ✅ Bot reageert automatisch met embed!

---

## 🔧 Hoe het werkt:

### Admin Panel Mode:
```
Admin panel → POST request → Netlify function
                                   ↓
                          Voegt server toe in Discord
                                   ↓
                          Stuurt embed bevestiging
```

### Bot Mode (op PC):
```
Gebruiker typt in Discord → Bot luistert
                               ↓
                        Check of server al bestaat
                               ↓
                    Voegt toe + stuurt embed reactie
```

---

## 🎯 Wat heb je nodig?

| Functie | Admin Panel | Bot op PC |
|---------|-------------|-----------|
| Server toevoegen | ✅ Werkt altijd | ✅ Als bot draait |
| Server verwijderen | ✅ Werkt altijd | ❌ Via admin panel |
| Website blacklist | ✅ Werkt altijd | ✅ Werkt altijd |
| Auto reactie in Discord | ❌ | ✅ Als bot draait |
| 24/7 beschikbaar | ✅ | ❌ Alleen als PC aan staat |
| Kosten | 🆓 Gratis | 🆓 Gratis |

---

## 💡 Aanbeveling:

**Gebruik admin panel voor dagelijks beheer** - werkt altijd, geen gedoe!

**Start bot alleen als je wilt dat spelers direct in Discord kunnen typen** - start `start-bot.bat` en laat PC aanstaan.

**Voordeel:** Beste van beide werelden! Flexibel en 100% gratis 🎉
