FROM node:18-alpine

WORKDIR /app

# Kopieer alle package.json files
COPY package*.json ./

# Installeer root dependencies
RUN npm install --only=production

# Kopieer discord-bot folder
COPY discord-bot ./discord-bot

# Installeer bot dependencies
WORKDIR /app/discord-bot
RUN npm install --only=production

# Terug naar root voor start
WORKDIR /app

# Start bot
CMD ["node", "discord-bot/bot.js"]
