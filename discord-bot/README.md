# Discord Blacklist Bot - Lokaal Draaien

## 🚀 Quick Start

1. **Installeer Node.js** (als nog niet geïnstalleerd):
   - Download: https://nodejs.org
   - Kies "LTS" versie
   - Installeer met standaard instellingen

2. **Start de bot:**
   - Dubbel-klik op: `start-bot.bat`
   - Bot draait nu! ✅

3. **Test in Discord:**
   
   **Enkele server:**
   ```
   Rotterdam Zuid
   ```
   
   **Meerdere servers (elke regel = 1 server):**
   ```
   Rotterdam Zuid
   Amsterdam Noord
   Leakstad 1
   Utrecht Centraal
   ```
   
   **OF komma-gescheiden op 1 regel:**
   ```
   Rotterdam Zuid, Amsterdam Noord, Leakstad 1, Utrecht Centraal
   ```
   
   Bot reageert automatisch met embed! 🎉

## 🎯 Hoe werkt het?

### ✅ Single Server
Type één server naam → Bot voegt toe → Embed bevestiging

### 📝 Multiple Servers
Type meerdere servers (elke regel = 1 server):
```
Server Naam 1
Server Naam Met Spaties
Server Naam 3
```

Bot verwerkt alle servers in één keer:
- ✅ Toegevoegd: Lijst met nieuwe servers
- ⚠️ Duplicaten: Servers die al bestaan (overgeslagen)
- ❌ Fouten: Als er iets mis ging

### 💡 Voorbeelden

**Voorbeeld 1 - Mix van servers:**
```
Rotterdam Zuid
Amsterdam Noord
Leakstad 1
```
Result: 3 servers toegevoegd ✅

**Voorbeeld 2 - Met duplicaat:**
```
Rotterdam Zuid
Amsterdam Noord
Rotterdam Zuid
```
Result: 
- ✅ 2 nieuwe: Rotterdam Zuid, Amsterdam Noord
- ⚠️ 1 duplicaat: Rotterdam Zuid (tweede keer)

**Voorbeeld 3 - Spaties in naam:**
```
De Grote Server V1
Ultra Mega RP 2.0
Test Server Alpha
```
Result: Alle 3 correct verwerkt! ✅

## 🛑 Stoppen

- Close het command prompt venster
- Of druk `Ctrl+C` in het venster

## ⚙️ Environment Variables

De bot gebruikt deze variables uit je systeem of `.env` file:

```
BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
```

⚠️ **Belangrijk**: Vervang de placeholder waarden met je eigen Discord bot token en channel ID.

## 🔧 Troubleshooting

### "Node.js is niet geinstalleerd!"
- Download en installeer Node.js van https://nodejs.org

### "Cannot find module 'discord.js'"
- Bot installeert dit automatisch bij eerste start
- Of run handmatig: `npm install`

### Bot reageert niet in Discord
- Check of MESSAGE CONTENT INTENT is enabled in Discord Developer Portal:
  1. Ga naar https://discord.com/developers/applications
  2. Selecteer je bot applicatie
  3. Ga naar "Bot" tab
  4. Enable "Message Content Intent"
  5. Save changes
  6. Herstart bot

## 💡 Wanneer te gebruiken?

**Bot NIET nodig voor:**
- Server toevoegen via admin panel ✅
- Website blacklist bekijken ✅
- Server verwijderen via admin panel ✅

**Bot WEL nodig voor:**
- Automatische reactie wanneer iemand server typt in Discord ✨
- Real-time duplicate checking 🔄
- Embeds wanneer rechtstreeks in kanaal wordt getypt 📢

## 🎯 Beste Werkwijze

1. **Dagelijks gebruik:** Gebruik admin panel (altijd beschikbaar)
2. **Tijdens events:** Start bot voor automatische Discord integratie
3. **Maintenance:** Stop bot, nobody home!
