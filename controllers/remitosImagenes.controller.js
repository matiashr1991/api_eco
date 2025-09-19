// controllers/remitosImagenes.controller.js
'use strict';

const path = require('path');
const fs = require('fs/promises');
const db = require('../models/db');

/* ============ helpers ============ */

async function ensureDir(absPath) {
  await fs.mkdir(absPath, { recursive: true });
}

function absUploads(...p) {
  // /api_eco/uploads/...
  return path.join(__dirname, '..', 'uploads', ...p);
}

function makeAbsUrl(req, relPath) {
  if (!relPath) return null;
  if (/^https?:\/\//i.test(relPath)) return relPath;
  const host = `${req.protocol}://${req.get('host')}`;
  return `${host}${relPath.startsWith('/') ? '' : '/'}${relPath}`;
}

/* Chequeo de acceso: admin ve todo; delegación ve propios + huérfanos */
async function assertRemitoVisible(req, idremito) {
  const del = req.delegacionId ?? null;
  const u = req.user || {};
  const isAdmin =
    String(u.role || '').toLowerCase() === 'admin' ||
    (Array.isArray(u.roles) && u.roles.map(r => String(r).toLowerCase()).includes('admin'));

  const sql = isAdmin && del == null
    ? 'SELECT idremitor, nrremito, iddelegacion FROM remitor WHERE idremitor=? LIMIT 1'
    : 'SELECT idremitor, nrremito, iddelegacion FROM remitor WHERE idremitor=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1';

  const params = isAdmin && del == null ? [idremito] : [idremito, del];
  const [[row]] = await db.query(sql, params);
  if (!row) return null;
  return { isAdmin, row, del };
}

/* ============ controladores ============ */

/**
 * POST /api/remitos/:id/imagenes
 * form-data: imagenes[] (multiple)
 * opcional: gps_lat, gps_lng, gps_alt  (se guardan tal cual si vienen)
 */
exports.subirImagenes = async (req, res) => {
  try {
    const idremito = Number(req.params.id);
    if (!Number.isFinite(idremito) || idremito <= 0) {
      return res.status(400).json({ ok: false, error: 'id remito inválido' });
    }

    // visibilidad
    const vis = await assertRemitoVisible(req, idremito);
    if (!vis) return res.status(404).json({ ok: false, error: 'Remito no encontrado' });

    if (!req.files?.length) {
      return res.status(400).json({ ok: false, error: 'No se recibieron imágenes' });
    }

    // para nombre de archivo (opcional, prolijo)
    const [[rinfo]] = await db.query(
      'SELECT nrremito FROM remitor WHERE idremitor=? LIMIT 1',
      [idremito]
    );
    const nrremito = rinfo?.nrremito || null;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    // destino final
    const destAbsDir = absUploads('remitos', String(idremito));
    await ensureDir(destAbsDir);

    const relBase = `/uploads/remitos/${idremito}/`;
    const uploaded = [];
    const errors = [];

    const bodyLat = req.body?.gps_lat ?? null;
    const bodyLng = req.body?.gps_lng ?? null;
    const bodyAlt = req.body?.gps_alt ?? null;

    for (const f of req.files) {
      try {
        // origen según multer
        const tmpAbs = f.path; // multer guarda path absoluto
        const ext = path.extname(f.originalname || '') || '.jpg';
        const finalName = nrremito ? `${nrremito}_${stamp}${ext}` : `${stamp}${ext}`;
        const finalAbs = path.join(destAbsDir, finalName);

        await fs.rename(tmpAbs, finalAbs);

        const relPath = (relBase + finalName).replace(/\\/g, '/');

        // Insert
        const [ins] = await db.query(
          `INSERT INTO remitos_imagenes
             (path, nombreImagen, idremito, mime, size_bytes, gps_lat, gps_lng, gps_alt, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            relPath,
            f.originalname || finalName,
            idremito,
            f.mimetype || 'image/jpeg',
            f.size ?? null,
            bodyLat !== '' ? bodyLat : null,
            bodyLng !== '' ? bodyLng : null,
            bodyAlt !== '' ? bodyAlt : null,
          ]
        );

        uploaded.push({
          id: ins.insertId,
          path: relPath,
          url: makeAbsUrl(req, relPath),
          nombreImagen: f.originalname || finalName,
          mime: f.mimetype || 'image/jpeg',
          size_bytes: f.size ?? null,
          gps_lat: bodyLat !== '' ? (bodyLat != null ? Number(bodyLat) : null) : null,
          gps_lng: bodyLng !== '' ? (bodyLng != null ? Number(bodyLng) : null) : null,
          gps_alt: bodyAlt !== '' ? (bodyAlt != null ? Number(bodyAlt) : null) : null,
        });
      } catch (e) {
        console.error('[REMIMG] error moviendo/insertando:', e);
        errors.push({ file: f.originalname, error: e.message || 'error al guardar' });
        // intento de limpieza del tmp si falló el rename
        try { f.path && await fs.unlink(f.path).catch(()=>{}); } catch {}
      }
    }

    if (uploaded.length && !errors.length) {
      return res.status(201).json({ ok: true, uploaded });
    }
    if (uploaded.length && errors.length) {
      return res.status(207).json({ ok: true, uploaded, errors });
    }
    return res.status(400).json({ ok: false, errors: errors.length ? errors : [{ error: 'No se pudo subir nada' }] });
  } catch (err) {
    console.error('[REMIMG] fatal:', err);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
};

/**
 * GET /api/remitos/:id/imagenes
 * Lista con URL absoluta (para tu front) + campos básicos.
 */
exports.listarImagenes = async (req, res) => {
  try {
    const idremito = Number(req.params.id);
    if (!Number.isFinite(idremito) || idremito <= 0) {
      return res.status(400).json({ ok: false, error: 'id inválido' });
    }

    const vis = await assertRemitoVisible(req, idremito);
    if (!vis) return res.status(404).json({ ok: false, error: 'Remito no encontrado' });

    const [rows] = await db.query(
      `SELECT idremitos_imagenes, path, nombreImagen, mime, size_bytes, gps_lat, gps_lng, gps_alt, created_at
         FROM remitos_imagenes
        WHERE idremito = ?
        ORDER BY created_at ASC, idremitos_imagenes ASC`,
      [idremito]
    );

    const out = rows.map(r => ({
      id: r.idremitos_imagenes,
      path: r.path,
      url: makeAbsUrl(req, r.path),
      nombreImagen: r.nombreImagen,
      mime: r.mime,
      size_bytes: r.size_bytes,
      gps_lat: r.gps_lat != null ? Number(r.gps_lat) : null,
      gps_lng: r.gps_lng != null ? Number(r.gps_lng) : null,
      gps_alt: r.gps_alt != null ? Number(r.gps_alt) : null,
      created_at: r.created_at,
    }));

    return res.json(out);
  } catch (err) {
    console.error('[REMIMG] list:', err);
    return res.status(500).json({ ok: false, error: 'Error listando imágenes' });
  }
};

/**
 * DELETE /api/remitos/imagenes/:idimg
 * Elimina DB y hace best-effort de borrar el archivo físico.
 */
exports.eliminarImagen = async (req, res) => {
  try {
    const idimg = Number(req.params.idimg);
    if (!Number.isFinite(idimg) || idimg <= 0) {
      return res.status(400).json({ ok: false, error: 'id de imagen inválido' });
    }

    // Traemos imagen + remito para validación de scope
    const [[img]] = await db.query(
      `SELECT ri.idremitos_imagenes, ri.path, ri.idremito, r.iddelegacion
         FROM remitos_imagenes ri
         JOIN remitor r ON r.idremitor = ri.idremito
        WHERE ri.idremitos_imagenes=? LIMIT 1`,
      [idimg]
    );
    if (!img) return res.status(404).json({ ok: false, error: 'No encontrada' });

    // visibilidad
    const fakeReq = { ...req, params: { id: img.idremito } };
    const vis = await assertRemitoVisible(fakeReq, img.idremito);
    if (!vis) return res.status(403).json({ ok: false, error: 'Sin permiso' });

    await db.query('DELETE FROM remitos_imagenes WHERE idremitos_imagenes=?', [idimg]);

    // borrar archivo físico (best-effort)
    try {
      const abs = absUploads(img.path.replace(/^\/?uploads\//, ''));
      await fs.unlink(abs);
    } catch (_) {}

    return res.json({ ok: true });
  } catch (err) {
    console.error('[REMIMG] delete:', err);
    return res.status(500).json({ ok: false, error: 'Error eliminando imagen' });
  }
};
