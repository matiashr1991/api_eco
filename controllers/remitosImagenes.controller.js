// controllers/remitosImagenes.controller.js
const path = require('path');
const fs = require('fs');
const db = require('../models/db'); // ✅ pool correcto

// carpeta final: /uploads/remitos/:idremito
function ensureRemitoDir(idremito) {
    const base = path.join(__dirname, '..', 'uploads', 'remitos', String(idremito));
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    return base;
}

function moveFileSync(src, dest) {
    fs.renameSync(src, dest);
}

/**
 * POST /api/remitos/:id/imagenes
 * campo form-data: imagenes (multiple)
 * opcionales en body: gps_lat, gps_lng, gps_alt
 */
async function subirImagenes(req, res) {
    const idremito = Number(req.params.id);
    const { gps_lat = null, gps_lng = null, gps_alt = null } = req.body;

    try {
        if (!idremito) {
            return res.status(400).json({ ok: false, error: 'idremito inválido' });
        }
        if (!req.files?.length) {
            return res.status(400).json({ ok: false, error: 'No se recibieron imágenes' });
        }

        // mover de /uploads/tmp a /uploads/remitos/:id/
        const finalDir = ensureRemitoDir(idremito);
        const relBase = `/uploads/remitos/${idremito}/`;

        const inserts = [];
        for (const f of req.files) {
            const finalAbs = path.join(finalDir, f.filename);
            // origen absoluto (tmp)
            const srcAbs = path.join(__dirname, '..', 'uploads', 'tmp', f.filename);
            try {
                moveFileSync(srcAbs, finalAbs);
            } catch (e) {
                // si el move falla, limpiamos tmp por las dudas
                try { fs.unlinkSync(srcAbs); } catch { /* noop */ }
                throw e;
            }

            inserts.push([
                relBase + f.filename,                // path (relativo para el front)
                f.originalname || f.filename,        // nombreImagen
                idremito,                            // idremito
                f.mimetype,                          // mime
                f.size,                              // size_bytes
                gps_lat ? Number(gps_lat) : null,
                gps_lng ? Number(gps_lng) : null,
                gps_alt ? Number(gps_alt) : null,
            ]);
        }

        const sql = `
      INSERT INTO remitos_imagenes
        (path, nombreImagen, idremito, mime, size_bytes, gps_lat, gps_lng, gps_alt)
      VALUES ?
    `;
        await db.query(sql, [inserts]); // mysql2 soporta VALUES ? con array de arrays

        return res.status(201).json({ ok: true, count: inserts.length });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: 'Error subiendo imágenes' });
    }
}

/**
 * GET /api/remitos/:id/imagenes
 */
async function listarImagenes(req, res) {
    const idremito = Number(req.params.id);
    try {
        const [rows] = await db.query(
            `SELECT idremitos_imagenes, path, nombreImagen, mime, size_bytes, created_at
         FROM remitos_imagenes
        WHERE idremito = ?
        ORDER BY idremitos_imagenes DESC`,
            [idremito]
        );
        return res.json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: 'Error listando imágenes' });
    }
}

/**
 * DELETE /api/remitos/imagenes/:idimg
 * (borra el registro y, si existe, el archivo físico)
 */
async function eliminarImagen(req, res) {
    const idimg = Number(req.params.idimg);
    try {
        const [[img]] = await db.query(
            'SELECT idremitos_imagenes, path FROM remitos_imagenes WHERE idremitos_imagenes = ?',
            [idimg]
        );
        if (!img) return res.status(404).json({ ok: false, error: 'No encontrado' });

        await db.query('DELETE FROM remitos_imagenes WHERE idremitos_imagenes = ?', [idimg]);

        // borrar archivo físico (best-effort)
        try {
            const abs = path.join(__dirname, '..', img.path.replace(/^\//, ''));
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch { /* noop */ }

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: 'Error eliminando imagen' });
    }
}

module.exports = {
    subirImagenes,
    listarImagenes,
    eliminarImagen,
};
