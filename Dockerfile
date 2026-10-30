FROM node:20-bookworm-slim

# Instalar dependencias esenciales del sistema sin paquetes innecesarios
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias de Node
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el código de la aplicación
COPY . .

# Configurar el puerto para producción
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
