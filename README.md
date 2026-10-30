# TikTok Downloader API (Sin Marca de Agua + Audio MP3)

Backend desarrollado en Node.js y Express para extraer información y descargar videos públicos de TikTok sin marca de agua y pistas de audio en formato MP3 mediante streaming directo con `yt-dlp-exec` y `ffmpeg-static`.

---

## 🚀 Requisitos previos

- **Node.js**: v16 o superior.
- **Python**: v3.x (requerido por `yt-dlp`).
- *Nota*: **No** necesitas instalar `ffmpeg` a nivel de sistema operativo: el proyecto utiliza `ffmpeg-static` como binario autocontenido.

---

## 📦 Instalación

1. Clona o abre el directorio del proyecto.
2. Instala las dependencias:

```bash
npm install
```

---

## ⚙️ Scripts disponibles

- `npm start`: Inicia el servidor de producción (`node server.js`).
- `npm run dev`: Inicia el servidor con recarga automática (`node --watch server.js`).
- `npm test`: Ejecuta la suite de pruebas automatizadas de endpoints.

---

## 📡 Endpoints de la API

### 1. `POST /api/info`
Extrae metadatos del video sin descargarlo al disco local.

- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "url": "https://www.tiktok.com/@usuario/video/1234567890123456789"
  }
  ```
  > *Soporta URLs estándar (`tiktok.com/@user/video/...`) y enlaces acortados (`vt.tiktok.com/...` o `vm.tiktok.com/...`).*

- **Respuesta (200 OK)**:
  ```json
  {
    "title": "Descripción del video...",
    "author": "nombre_creador",
    "thumbnail": "https://p16-sign.../obj/tos-maliva-p-0068/...",
    "duration": 45,
    "downloadUrl": "https://v16-webapp-prime.../video/tos/useast2a/...",
    "audioUrl": "https://v16-webapp-prime.../audio/tos/useast2a/..."
  }
  ```

---

### 2. `GET /api/download`
Descarga y canaliza (stream) el video MP4 limpio directamente al cliente mediante `yt-dlp` (`stdout` pipe), evitando cualquier bloqueo 403 del CDN de TikTok.

- **Parámetro Query**:
  `?url=<URL_ORIGINAL_DE_TIKTOK>` (URL estándar o enlace corto `vt.tiktok.com`).

- **Cabeceras**:
  - `Content-Disposition: attachment; filename="tiktok_video.mp4"`
  - `Content-Type: video/mp4`

---

### 3. `GET /api/download-audio`
Descarga y canaliza la pista de audio en formato **MP3 nativo**.
- Recibe la URL original de TikTok.
- Utiliza `yt-dlp` con extracción de audio al vuelo (`--extract-audio`, `--audio-format mp3`) canalizando `stdout` directamente a la respuesta HTTP.
- Maneja desconexiones prematuras del cliente matando el subproceso para evitar procesos zombies.

- **Parámetro Query**:
  `?url=<URL_ORIGINAL_DE_TIKTOK>`.

- **Cabeceras**:
  - `Content-Disposition: attachment; filename="tiktok_audio.mp3"`
  - `Content-Type: audio/mpeg`

---

### 4. `GET /`
Interfaz web interactiva servida desde `/public/index.html` en `http://localhost:4000/`.
