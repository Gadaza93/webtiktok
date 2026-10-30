FROM node:20-bookworm-slim

# 1. Instalar dependencias del sistema, ffmpeg y curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Descargar el binario oficial de yt-dlp directamente al sistema
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# 3. Variable de entorno para evitar que yt-dlp-exec intente descargar un binario durante npm install
ENV YTDLP_SKIP_DOWNLOAD=true
ENV YOUTUBE_DL_SKIP_DOWNLOAD=true
ENV YOUTUBE_DL_DIR=/usr/local/bin
ENV YOUTUBE_DL_FILENAME=yt-dlp
ENV PORT=4000

# 4. Copiar package.json y ejecutar npm install con tolerancia a lockfiles cruzados
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit

# 5. Copiar el código fuente
COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
