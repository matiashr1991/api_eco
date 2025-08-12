// controllers/guiasImagenes.controller.js
const path = require('path');
const fs = require('fs/promises');
const exifr = require('exifr');
const pool = require('../models/db');
const { ensureDelegDir, slugifyFolder } = require('../middleware/upload');

async function readImageGPS(filePath) {
    try {
        const gps = await exifr.gps(filePath);
        if (!gps) return {};
        return {
            gps_lat: gps.latitude ?? null,
            gps_lng: gps.longitude ?? null,
            gps_alt: gps.altitude ?? null,
        };
    } catch {
        return {};
    }
}

exports.subirImagenes = async (req, res) => {
    const { idguia } = req.params;

    try {
        if (!req.files?.length) {
            return res.status(400).json({ ok: false, error: 'No se enviaron imágenes' });
        }

        // 1) Datos de la guía para nombre de archivo y (fallback) carpeta
        const [[g]] = await pool.query(
            'SELECT nrguia, destino FROM guiasr WHERE idguiasr = ? LIMIT 1',
            [idguia]
        );
        const nrguia = g?.nrguia || null;

        // 2) Delegación: primero lo que mande el front; si no, uso destino
        let delegNombre = (req.body?.delegacion || '').toString();
        if (!delegNombre) delegNombre = g?.destino || 'sin-delegacion';
        const { dir: delegDir, slug: delegSlug } = ensureDelegDir(delegNombre);

        // 3) Nombre de archivo: NRGUIA_YYYY-MM-DD_HH-mm-ss.ext
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const uploaded = [];
        const errors = [];

        for (const f of req.files) {
            try {
                const ext = (path.extname(f.originalname || '').toLowerCase()) || '.jpg';
                const finalName = nrguia ? `${nrguia}_${stamp}${ext}` : `${stamp}${ext}`;

                // mover desde TMP a carpeta por delegación
                const tmpPath = f.path;
                const finalPath = path.join(delegDir, finalName);
                await fs.rename(tmpPath, finalPath);

                // EXIF GPS (no rompe si no hay)
                const gps = await readImageGPS(finalPath);

                // Ruta pública (normalizo separadores para Windows)
                const relPath = `/uploads/guias/${delegSlug}/${finalName}`.replace(/\\/g, '/');

                // Persistencia en DB
                const [ins] = await pool.query(
                    `INSERT INTO guias_imagenes
            (path, nombreImagen, idguia, mime, size_bytes, gps_lat, gps_lng, gps_alt, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        relPath,
                        finalName,
                        idguia,
                        f.mimetype,
                        f.size,
                        gps.gps_lat ?? null,
                        gps.gps_lng ?? null,
                        gps.gps_alt ?? null,
                    ]
                );

                uploaded.push({
                    id: ins.insertId,
                    filename: finalName,
                    url: `${baseUrl}${relPath}`,
                    mime: f.mimetype,
                    size: f.size,
                    ...gps,
                });
            } catch (e) {
                console.error('Error procesando imagen:', e);
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
        console.error('upload fatal:', e);
        return res.status(500).json({ ok: false, error: 'Error interno' });
    }
};
