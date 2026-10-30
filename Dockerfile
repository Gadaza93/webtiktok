FROM node:20-bullseye-slim

# Instalar dependencias del sistema: Python3 (para yt-dlp) y FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists//*

WORKDIR /app

# Instalar dependencias de Node
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Exponer el puerto dinámico de la plataforma
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
