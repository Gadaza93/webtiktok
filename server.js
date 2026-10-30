const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configuración del binario de FFmpeg (usa ffmpeg-static si existe en disco, de lo contrario binario del sistema)
const resolvedFfmpegPath = ffmpegPath && fs.existsSync(ffmpegPath) ? ffmpegPath : 'ffmpeg';
try {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
} catch (e) {
  console.warn('Aviso al configurar ruta de FFmpeg:', e.message);
}

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración de middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Expresión regular para validar enlaces de TikTok:
 * - URLs estándar: https://www.tiktok.com/@usuario/video/1234567890
 * - URLs móviles: https://m.tiktok.com/v/1234567890.html
 * - Enlaces acortados: https://vt.tiktok.com/ZSxxx/ o https://vm.tiktok.com/ZMxxx/
 */
const TIKTOK_URL_REGEX = /^https?:\/\/(?:(?:www|m|vt|vm)\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|[\w.-]+|\S+)/i;

/**
 * User-Agent de navegador moderno para evitar bloqueos por parte de TikTok
 */
const MODERN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Resuelve enlaces acortados (vt.tiktok.com o vm.tiktok.com) siguiendo las redirecciones HTTP
 * antes de pasarlo a yt-dlp para garantizar máxima compatibilidad.
 */
async function resolveShortUrl(rawUrl) {
  if (/(?:vt|vm)\.tiktok\.com/i.test(rawUrl)) {
    try {
      const response = await fetch(rawUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': MODERN_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        }
      });
      if (response.url && response.url !== rawUrl) {
        return response.url;
      }
    } catch (err) {
      console.warn('[Resolver] No se pudo seguir la redirección previamente, se delega a yt-dlp:', err.message);
    }
  }
  return rawUrl;
}

/**
 * POST /api/info
 * Recibe { url } en el cuerpo de la petición.
 * Valida la URL de TikTok y extrae metadatos mediante yt-dlp-exec sin descargar el archivo localmente.
 */
app.post('/api/info', async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || !TIKTOK_URL_REGEX.test(url.trim())) {
      return res.status(400).json({
        error: 'URL inválida. Debe proporcionar un enlace válido de TikTok (estándar o acortado: vt.tiktok.com / vm.tiktok.com).',
        status: 400
      });
    }

    const initialUrl = url.trim();

    // Resolver enlaces acortados (vt.tiktok.com / vm.tiktok.com) a su URL canónica
    const canonicalUrl = await resolveShortUrl(initialUrl);

    // Extraer metadatos con yt-dlp sin descargar el archivo localmente
    const metadata = await youtubedl(canonicalUrl, {
      dumpSingleJson: true,
      preferFreeFormats: true,
      formatSort: ['vcodec:h264', 'ext:mp4'],
      noWarnings: true,
      noCheckCertificates: true,
      userAgent: MODERN_USER_AGENT,
      referer: 'https://www.tiktok.com/'
    });

    // 1. Localizar URL directa limpia de video (sin marca de agua, prefiriendo H.264/AVC)
    let downloadUrl = null;

    if (Array.isArray(metadata.formats) && metadata.formats.length > 0) {
      // Priorizar formato sin marca de agua y con códec H.264 compatible
      const cleanH264Format = metadata.formats.find((f) =>
        f.url &&
        f.vcodec &&
        (f.vcodec.startsWith('avc') || f.vcodec.includes('h264')) &&
        (
          (f.format_note && f.format_note.toLowerCase().includes('without watermark')) ||
          (f.format_id && (f.format_id.includes('play_addr') || f.format_id.includes('direct')))
        )
      );

      const cleanFormat = cleanH264Format || metadata.formats.find((f) =>
        f.url && (
          (f.format_note && f.format_note.toLowerCase().includes('without watermark')) ||
          (f.format_id && (f.format_id.includes('play_addr') || f.format_id.includes('direct')))
        )
      );

      if (cleanFormat) {
        downloadUrl = cleanFormat.url;
      }
    }

    if (!downloadUrl) {
      downloadUrl = metadata.url;
    }

    if (!downloadUrl && Array.isArray(metadata.formats)) {
      const validFormat = [...metadata.formats].reverse().find((f) => f.url && f.vcodec !== 'none') || metadata.formats[metadata.formats.length - 1];
      downloadUrl = validFormat?.url || null;
    }

    if (!downloadUrl) {
      return res.status(500).json({
        error: 'No se pudo obtener la URL de descarga directa del video.',
        status: 500
      });
    }

    // 2. Detección de pista de audio
    let audioUrl = null;

    if (Array.isArray(metadata.formats) && metadata.formats.length > 0) {
      const audioFormats = metadata.formats.filter((f) =>
        f.url && (
          f.vcodec === 'none' ||
          f.resolution === 'audio only' ||
          (f.format_note && f.format_note.toLowerCase().includes('audio only'))
        )
      );

      if (audioFormats.length > 0) {
        const bestAudio = audioFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
        audioUrl = bestAudio?.url || null;
      }
    }

    if (!audioUrl) {
      audioUrl = downloadUrl;
    }

    // Extraer miniatura (thumbnail) de mayor resolución disponible
    let thumbnail = metadata.thumbnail || null;
    if (!thumbnail && Array.isArray(metadata.thumbnails) && metadata.thumbnails.length > 0) {
      thumbnail = metadata.thumbnails[metadata.thumbnails.length - 1].url;
    }

    return res.status(200).json({
      title: metadata.title || metadata.description || 'TikTok Video',
      author: metadata.uploader || metadata.creator || metadata.uploader_id || 'TikTok User',
      thumbnail: thumbnail,
      duration: metadata.duration || 0,
      downloadUrl: downloadUrl,
      audioUrl: audioUrl
    });

  } catch (error) {
    console.error('Error al procesar metadatos con yt-dlp:', error.message);
    return res.status(500).json({
      error: 'Error al procesar el video con yt-dlp. Asegúrate de que el video sea público y accesible.',
      details: error.stderr || error.message,
      status: 500
    });
  }
});

/**
 * GET /api/download
 * Recibe la URL original de TikTok (?url=https://www.tiktok.com/... o enlace corto).
 * Valida la URL con el Regex de TikTok.
 * Ejecuta yt-dlp-exec.exec para canalizar directamente la salida de stdout a la respuesta HTTP.
 */
app.get('/api/download', async (req, res, next) => {
  try {
    const rawUrl = req.query.url;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({
        error: 'El parámetro "url" es requerido en la consulta (?url=...).',
        status: 400
      });
    }

    let targetUrl = rawUrl.trim();
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (decodeErr) {
      console.warn('Aviso: No se pudo decodificar el parámetro "url", se usará el valor original:', decodeErr.message);
    }

    // Validar mediante Regex que sea un enlace legítimo de TikTok
    if (!TIKTOK_URL_REGEX.test(targetUrl)) {
      return res.status(400).json({
        error: 'La URL proporcionada no es un enlace válido de TikTok (estándar o acortado: vt.tiktok.com / vm.tiktok.com).',
        status: 400
      });
    }

    // Resolver enlaces acortados a su URL canónica
    const canonicalUrl = await resolveShortUrl(targetUrl);

    // Cabeceras de descarga directa
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    // Transmitir binario directamente a stdout con yt-dlp prefiriendo H.264 (AVC)
    const downloadProcess = youtubedl.exec(canonicalUrl, {
      output: '-',
      format: 'best[vcodec^=avc1]/best[vcodec^=avc]/bestvideo[vcodec^=avc]+bestaudio/best',
      formatSort: ['vcodec:h264', 'ext:mp4'],
      noWarnings: true,
      noCheckCertificates: true,
      userAgent: MODERN_USER_AGENT,
      referer: 'https://www.tiktok.com/'
    });

    // Canalizar la salida stdout directamente hacia el cliente
    downloadProcess.stdout.pipe(res);

    downloadProcess.on('error', (err) => {
      console.error('[yt-dlp download error]:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error al procesar la transmisión del video con yt-dlp.',
          details: err.message,
          status: 500
        });
      }
    });

    downloadProcess.stderr.on('data', (chunk) => {
      console.error('[yt-dlp download stderr]:', chunk.toString());
    });

    // Abortar proceso si el cliente cierra la conexión
    req.on('close', () => {
      if (!res.writableEnded) {
        console.log('[Download] Cliente desconectado. Terminando proceso yt-dlp...');
        try {
          downloadProcess.kill('SIGKILL');
        } catch (_) {}
      }
    });

  } catch (error) {
    console.error('Error en endpoint download:', error.message);
    next(error);
  }
});

/**
 * GET /api/download-audio
 * Recibe la URL original de TikTok (?url=...).
 * Valida la URL con el Regex de TikTok.
 * Usa yt-dlp-exec.exec para extraer el mejor audio y canalizarlo directamente como MP3 a la respuesta.
 */
app.get('/api/download-audio', async (req, res, next) => {
  try {
    const rawUrl = req.query.url;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({
        error: 'El parámetro "url" es requerido en la consulta (?url=...).',
        status: 400
      });
    }

    let targetUrl = rawUrl.trim();
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (decodeErr) {
      console.warn('Aviso: No se pudo decodificar el parámetro "url", se usará el valor original:', decodeErr.message);
    }

    // Validar mediante Regex que sea un enlace legítimo de TikTok
    if (!TIKTOK_URL_REGEX.test(targetUrl)) {
      return res.status(400).json({
        error: 'La URL proporcionada no es un enlace válido de TikTok (estándar o acortado: vt.tiktok.com / vm.tiktok.com).',
        status: 400
      });
    }

    // Resolver enlaces acortados a su URL canónica
    const canonicalUrl = await resolveShortUrl(targetUrl);

    // Cabeceras de descarga de audio MP3
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok_audio.mp3"');
    res.setHeader('Content-Type', 'audio/mpeg');

    // Extracción de audio al vuelo mediante yt-dlp y ffmpeg
    const audioProcess = youtubedl.exec(canonicalUrl, {
      output: '-',
      extractAudio: true,
      audioFormat: 'mp3',
      format: 'bestaudio/best',
      ffmpegLocation: resolvedFfmpegPath,
      noWarnings: true,
      noCheckCertificates: true,
      userAgent: MODERN_USER_AGENT,
      referer: 'https://www.tiktok.com/'
    });

    // Canalizar la salida stdout directamente hacia el cliente
    audioProcess.stdout.pipe(res);

    audioProcess.on('error', (err) => {
      console.error('[yt-dlp audio error]:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error al procesar la transmisión del audio con yt-dlp.',
          details: err.message,
          status: 500
        });
      }
    });

    audioProcess.stderr.on('data', (chunk) => {
      console.error('[yt-dlp audio stderr]:', chunk.toString());
    });

    // Abortar proceso si el cliente cierra la conexión
    req.on('close', () => {
      if (!res.writableEnded) {
        console.log('[Download Audio] Cliente desconectado. Terminando proceso yt-dlp...');
        try {
          audioProcess.kill('SIGKILL');
        } catch (_) {}
      }
    });

  } catch (error) {
    console.error('Error en endpoint download-audio:', error.message);
    next(error);
  }
});

// Manejo centralizado de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    status: 404
  });
});

// Manejador centralizado de errores (500)
app.use((err, req, res, next) => {
  console.error('Error centralizado:', err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Error interno del servidor',
    status: statusCode
  });
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
