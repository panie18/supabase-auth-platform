FROM node:20-alpine

# System-Abhängigkeiten für Docker-CLI und Certbot-Interaktion
RUN apk add --no-cache \
    docker-cli \
    docker-cli-compose \
    curl \
    bash \
    openssl

WORKDIR /app

# Dependencies zuerst (Cache-Optimierung)
COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

EXPOSE 4000

# Non-root User für Sicherheit (außer Docker-Socket-Zugriff)
USER node

CMD ["node", "src/index.js"]
