// controllers/guiasImagenes.controller.js
'use strict';

const path = require('path');
const fs = require('fs/promises');
const exifr = require('exifr');
const pool = require('../models/db');
const { ensureDelegDir } = require('../middleware/upload');

/* ========= helpers ========= */

async function readImageGPS(filePath) {
  try {
    const gps = await exifr.gps(filePath);
    if (!gps) return {};
    return {
      gps_lat: gps.latitude ?? null,
      gps_lng: gps.longitude ?? null,
      gps_alt: gps.altitude ?? null,
    };
  } catch (err) {
    console.warn('[IMG][EXIF] Error leyendo GPS:', err?.message || err);
    return {};
  }
}

/** Devuelve string con escala fija para DECIMAL o null (tolera strings/espacios) */
function normalizeDecimal(value, scale = 8) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(scale); // string con punto y escala fija (ej: "-27.36428995")
}

/* ========= controller ========= */

/** GET /api/guias/:idguia/imagenes
 *  Lista imágenes de la guía con coordenadas (si existen).
 *  Devuelve campos que usa el front: path, url, gps_lat, gps_lng, gps_alt.
 */
exports.listarImagenesGuia = async (req, res) => {
  try {
    const { idguia } = req.params;
    const [rows] = await pool.query(
      `SELECT path, nombreImagen, gps_lat, gps_lng, gps_alt, mime, size_bytes, created_at
         FROM guias_imagenes
        WHERE idguia = ?
        ORDER BY created_at ASC, nombreImagen ASC`,
      [idguia]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data = rows.map(r => ({
      path: r.path,
      url: `${baseUrl}${r.path}`,
      nombreImagen: r.nombreImagen,
      gps_lat: r.gps_lat === null ? null : Number(r.gps_lat),
      gps_lng: r.gps_lng === null ? null : Number(r.gps_lng),
      gps_alt: r.gps_alt === null ? null : Number(r.gps_alt),
      mime: r.mime,
      size_bytes: r.size_bytes,
      created_at: r.created_at,
    }));

    return res.json(data);
  } catch (e) {
    console.error('[IMG] listarImagenesGuia fatal:', e);
    return res.status(500).json({ ok: false, error: 'Error al listar imágenes' });
  }
};

exports.subirImagenes = async (req, res) => {
  const { idguia } = req.params;

  try {
    if (!req.files?.length) {
      return res.status(400).json({ ok: false, error: 'No se enviaron imágenes' });
    }

    // 1) Datos guía (para nombre/carpeta)
    const [[g]] = await pool.query(
      'SELECT nrguia, destino FROM guiasr WHERE idguiasr = ? LIMIT 1',
      [idguia]
    );
    if (!g) return res.status(404).json({ ok: false, error: 'Guía no encontrada' });

    const nrguia = g.nrguia || null;

    // 2) Delegación: body > guía.destino > sin-delegacion
    let delegNombre = (req.body?.delegacion || '').toString();
    if (!delegNombre) delegNombre = g.destino || 'sin-delegacion';
    const { dir: delegDir, slug: delegSlug } = ensureDelegDir(delegNombre);

    // 3) Timestamp para nombre de archivo
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const uploaded = [];
    const errors = [];

    // 4) GPS recibido por body (se aplica a todo el batch)
    const bodyLatRaw = req.body?.gps_lat;
    const bodyLngRaw = req.body?.gps_lng;
    const bodyAltRaw = req.body?.gps_alt;

    console.log('[IMG][REQ] Body GPS recibido =>', {
      gps_lat: bodyLatRaw, gps_lng: bodyLngRaw, gps_alt: bodyAltRaw
    });

    for (const f of req.files) {
      try {
        const ext = (path.extname(f.originalname || '').toLowerCase()) || '.jpg';
        const finalName = nrguia ? `${nrguia}_${stamp}${ext}` : `${stamp}${ext}`;

        // mover desde TMP a carpeta por delegación
        const tmpPath = f.path;
        const finalPath = path.join(delegDir, finalName);
        await fs.rename(tmpPath, finalPath);

        // EXIF GPS por archivo (si existe)
        const exifGPS = await readImageGPS(finalPath);

        // 5) Elegimos: body > exif > null
        const latUsed = bodyLatRaw ?? exifGPS.gps_lat ?? null;
        const lngUsed = bodyLngRaw ?? exifGPS.gps_lng ?? null;
        const altUsed = bodyAltRaw ?? exifGPS.gps_alt ?? null;

        // Normalizamos a la escala de tu tabla (como strings)
        const latForDB = normalizeDecimal(latUsed, 8); // DECIMAL(10,8)
        const lngForDB = normalizeDecimal(lngUsed, 8); // DECIMAL(11,8)
        const altForDB = normalizeDecimal(altUsed, 2); // DECIMAL(8,2)

        console.log('[IMG][GPS] EXIF=', exifGPS, '→ USED=', {
          gps_lat: latUsed, gps_lng: lngUsed, gps_alt: altUsed
        }, '→ DB(strings)=', { latForDB, lngForDB, altForDB });

        const relPath = `/uploads/guias/${delegSlug}/${finalName}`.replace(/\\/g, '/');

        // 6) Insert con CAST para DECIMAL (respetando tu esquema)
        const sql = `
          INSERT INTO guias_imagenes
            (path, nombreImagen, idguia, mime, size_bytes, gps_lat, gps_lng, gps_alt, created_at)
          VALUES
            (?, ?, ?, ?, ?, CAST(? AS DECIMAL(10,8)), CAST(? AS DECIMAL(11,8)), CAST(? AS DECIMAL(8,2)), NOW())
        `;
        const params = [
          relPath,
          finalName,
          idguia,
          f.mimetype,
          f.size,
          latForDB,   // puede ser string con "-27.36428995" o null
          lngForDB,   // idem
          altForDB,   // idem
        ];

        const [ins] = await pool.query(sql, params);

        uploaded.push({
          id: ins.insertId,
          filename: finalName,
          url: `${baseUrl}${relPath}`,
          path: relPath,
          mime: f.mimetype,
          size: f.size,
          gps_lat: latForDB ? Number(latForDB) : null,
          gps_lng: lngForDB ? Number(lngForDB) : null,
          gps_alt: altForDB ? Number(altForDB) : null,
        });
      } catch (e) {
        console.error('[IMG] Error procesando imagen:', e);
        errors.push({ file: f.originalname, error: e.message || 'Error procesando imagen' });
      }
    }

    if (uploaded.length && !errors.length) {
      return res.status(201).json({ ok: true, uploaded });
    }
    if (uploaded.length && errors.length) {
      return res.status(207).json({ ok: true, uploaded, errors });
    }
    return res.status(400).json({ ok: false, errors });
  } catch (e) {
    console.error('[IMG] upload fatal:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
};
