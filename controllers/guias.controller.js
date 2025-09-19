// controllers/guias.controller.js
'use strict';

const db = require('../models/db');

/* ====================== helpers ====================== */

function getRole(req) {
  const u = req.user || {};
  const one = (u.role || '').toString().toLowerCase();
  const many = Array.isArray(u.roles) ? u.roles.map(r => String(r).toLowerCase()) : [];
  return { one, many };
}
function isAdmin(req) {
  const { one, many } = getRole(req);
  return one === 'admin' || many.includes('admin');
}
// ✅ Nuevo: helper genérico para chequear un rol específico
function hasRole(req, role) {
  const { one, many } = getRole(req);
  const r = String(role).toLowerCase();
  return one === r || many.includes(r);
}

function limpiarFechas(campos) {
  const fechas = ['fechemision', 'fechavenci', 'fechacarga', 'fechentregaguia'];
  const out = { ...campos };
  for (const f of fechas) {
    if (Object.prototype.hasOwnProperty.call(out, f)) {
      if (out[f] === '' || out[f] === null) out[f] = null;
    }
  }
  return out;
}

function castTinyInt(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

/** Sólo permitimos estos campos en POST/PATCH */
function filtrarCamposPermitidos(body, { allowIdDeleg = false } = {}) {
  const allowed = new Set([
    'nrguia',
    'fechemision',
    'fechavenci',
    'fechacarga',
    'fechentregaguia',
    'depositosn',
    'devueltosn',
    'titular',
    'destino',
    'informada',
    'idtitular',
    'idestados',
  ]);
  if (allowIdDeleg) allowed.add('iddelegacion');

  const data = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (allowed.has(k)) data[k] = v;
  }

  const limpio = limpiarFechas(data);

  if ('depositosn' in limpio) limpio.depositosn = castTinyInt(limpio.depositosn);
  if ('devueltosn' in limpio) limpio.devueltosn = castTinyInt(limpio.devueltosn);
  if ('informada'  in limpio) limpio.informada  = castTinyInt(limpio.informada);

  if ('idtitular'    in limpio && limpio.idtitular    != null) limpio.idtitular    = Number(limpio.idtitular);
  if ('idestados'    in limpio && limpio.idestados    != null) limpio.idestados    = Number(limpio.idestados);
  if ('iddelegacion' in limpio && limpio.iddelegacion != null) limpio.iddelegacion = Number(limpio.iddelegacion);

  return limpio;
}

function makeAbsUrl(req, maybePath) {
  if (!maybePath) return null;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  return `${req.protocol}://${req.get('host')}${maybePath.startsWith('/') ? '' : '/'}${maybePath}`;
}

/* ===================================================== */
/* ===================== CONTROLADORES ================= */
/* ===================================================== */

/** POST /api/guias/carga */
exports.cargarGuia = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;

    // ✅ Permitir que admin o recaudacion envíen iddelegacion
    const campos = filtrarCamposPermitidos(req.body, {
      allowIdDeleg: isAdmin(req) || hasRole(req, 'recaudacion'),
    });

    let {
      nrguia,
      fechemision,
      fechavenci,
      fechacarga = new Date(),
      fechentregaguia,
      depositosn = 0,
      devueltosn = 0,
      titular = null,
      destino = null,
      informada = 0,
      idtitular = null,
      iddelegacion = del ?? null,
      // por defecto: si devuelto => "no vigente"(4), sino "vigente"(3)
      idestados = devueltosn ? 4 : 3,
    } = campos;

    if (!nrguia) return res.status(400).json({ error: 'nrguia es requerido' });
    if (!isAdmin(req) && iddelegacion == null) {
      return res.status(400).json({ error: 'No se pudo determinar tu delegación' });
    }

    // Unicidad por número dentro de la delegación (o NULL si huérfana)
    const [[dup]] = await db.query(
      `SELECT idguiasr FROM guiasr WHERE nrguia=? AND ${iddelegacion == null ? 'iddelegacion IS NULL' : 'iddelegacion = ?'} LIMIT 1`,
      iddelegacion == null ? [nrguia] : [nrguia, iddelegacion]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe una guía con ese número en esa delegación' });

    const [result] = await db.query(
      `INSERT INTO guiasr (
        nrguia, fechemision, fechavenci, fechacarga, fechentregaguia,
        depositosn, devueltosn, titular, destino, informada,
        idtitular, iddelegacion, idestados
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nrguia, fechemision, fechavenci, fechacarga, fechentregaguia,
        depositosn, devueltosn, titular, destino, informada,
        idtitular, iddelegacion, idestados,
      ]
    );

    // Enlazamos en tabla puente si existe
    if (iddelegacion != null) {
      await db.query(
        'INSERT INTO guias_delegaciones (idguia, iddelegacion) VALUES (?, ?)',
        [result.insertId, iddelegacion]
      ).catch(() => {});
    }

    res.status(201).json({ message: 'Guía cargada exitosamente', id: result.insertId });
  } catch (error) {
    console.error('Error al cargar guía:', error);
    res.status(500).json({ error: 'Error interno al cargar la guía' });
  }
};

/** PATCH /api/guias/:id */
exports.actualizarGuiaParcial = async (req, res) => {
  try {
    const del   = req.delegacionId ?? null;
    const id    = Number(req.params.id);
    const admin = isAdmin(req);

    // Buscamos con scope
    const [[guia]] = await db.query(
      admin
        ? 'SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1'
        : 'SELECT * FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      admin ? [id] : [id, del]
    );
    if (!guia) return res.status(404).json({ error: 'No encontrada' });

    // ✅ También permitir iddelegacion a recaudacion en PATCH
    const campos = filtrarCamposPermitidos(req.body, {
      allowIdDeleg: admin || hasRole(req, 'recaudacion'),
    });

    // Si la guía está huérfana y el usuario tiene delegación, la “reclama”
    if (!admin && guia.iddelegacion == null && del != null && !('iddelegacion' in campos)) {
      campos.iddelegacion = del;
    }

    // Si llega devueltosn y NO llega idestados, derivamos 4/3 (no vigente/vigente)
    if (!('idestados' in campos) && 'devueltosn' in campos) {
      campos.idestados = campos.devueltosn ? 4 : 3;
    }

    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
    }

    const cols   = Object.keys(campos);
    const values = cols.map((c) => campos[c]);

    let where = 'idguiasr = ?';
    const whereParams = [id];

    if (!admin) {
      where += ' AND (iddelegacion = ? OR iddelegacion IS NULL)';
      whereParams.push(del);
    }

    await db.query(`UPDATE guiasr SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE ${where}`, [...values, ...whereParams]);

    res.json({ message: 'Guía actualizada parcialmente' });
  } catch (error) {
    console.error('Error al actualizar guía parcialmente:', error);
    res.status(500).json({ error: 'Error interno al actualizar la guía' });
  }
};

/** GET /api/guias/all (admin: todo; delegación: sólo suyas) */
exports.obtenerTodasGuias = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    if (isAdmin(req) && del == null) {
      const [rows] = await db.query('SELECT * FROM guiasr ORDER BY nrguia ASC');
      return res.json(rows);
    }
    const [rows] = await db.query(
      'SELECT * FROM guiasr WHERE iddelegacion=? ORDER BY nrguia ASC',
      [del]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías:', error);
    res.status(500).json({ error: 'Error interno al obtener las guías' });
  }
};

/** GET /api/guias/:nrguia (admin: todo; delegación: suyas o huérfanas) */
exports.buscarPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const { nrguia } = req.params;

    const [[row]] = await db.query(
      isAdmin(req)
        ? 'SELECT * FROM guiasr WHERE nrguia=? LIMIT 1'
        : 'SELECT * FROM guiasr WHERE nrguia=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      isAdmin(req) ? [nrguia] : [nrguia, del]
    );

    if (!row) return res.status(404).json({ error: 'Guía no encontrada' });

    // Adjuntamos lista de paths (para el fallback del front)
    const [imgs] = await db.query(
      'SELECT path FROM guias_imagenes WHERE idguia=? ORDER BY created_at ASC, idguias_imagenes ASC',
      [row.idguiasr]
    );
    row.imagenes = imgs.map(i => i.path);

    res.json(row);
  } catch (error) {
    console.error('Error al buscar guía por número:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** GET /api/guias/numeros */
exports.obtenerNumerosGuias = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    if (isAdmin(req) && del == null) {
      const [rows] = await db.query('SELECT nrguia FROM guiasr ORDER BY nrguia ASC');
      return res.json(rows.map(r => r.nrguia));
    }
    const [rows] = await db.query(
      'SELECT nrguia FROM guiasr WHERE iddelegacion=? ORDER BY nrguia ASC',
      [del]
    );
    res.json(rows.map(r => r.nrguia));
  } catch (error) {
    console.error('Error al obtener números de guías:', error);
    res.status(500).json({ error: 'Error interno al obtener números de guías' });
  }
};

/** GET /api/guias/no-usadas */
exports.obtenerGuiasNoUsadas = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;

    const [rows] = await db.query(
      (isAdmin(req) && del == null)
        ? `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
             FROM guiasr
            WHERE fechavenci IS NULL
            ORDER BY fechacarga ASC`
        : `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
             FROM guiasr
            WHERE (iddelegacion=? OR iddelegacion IS NULL)
              AND fechavenci IS NULL
            ORDER BY fechacarga ASC`,
      (isAdmin(req) && del == null) ? [] : [del]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías:', error);
    res.status(500).json({ error: 'Error al obtener guías no utilizadas' });
  }
};

/** GET /api/guias/sin-fecha-emision */
exports.obtenerGuiasSinFechaEmision = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;

    const [rows] = await db.query(
      (isAdmin(req) && del == null)
        ? `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga, iddelegacion
             FROM guiasr
            WHERE fechemision IS NULL
            ORDER BY (iddelegacion IS NULL) DESC, fechacarga ASC`
        : `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga, iddelegacion
             FROM guiasr
            WHERE (iddelegacion=? OR iddelegacion IS NULL)
              AND fechemision IS NULL
            ORDER BY (iddelegacion IS NULL) DESC, fechacarga ASC`,
      (isAdmin(req) && del == null) ? [] : [del]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías sin fecha de emisión:', error);
    res.status(500).json({ error: 'Error al obtener guías sin fecha de emisión' });
  }
};

/** GET /api/guias/id/:id (admin: cualquiera; delegación: suya o huérfana)
 *  Devuelve la guía + imagenes (array de paths relativos) para el fallback del front.
 */
exports.buscarPorId = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id  = Number(req.params.id);

    const [[row]] = await db.query(
      isAdmin(req)
        ? 'SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1'
        : 'SELECT * FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      isAdmin(req) ? [id] : [id, del]
    );
    if (!row) return res.status(404).json({ error: 'Guía no encontrada' });

    // Adjuntamos paths de imágenes (para que el front actual funcione)
    const [imgs] = await db.query(
      'SELECT path FROM guias_imagenes WHERE idguia=? ORDER BY created_at ASC, idguias_imagenes ASC',
      [id]
    );
    row.imagenes = imgs.map(i => i.path);

    res.json(row);
  } catch (error) {
    console.error('Error al buscar guía por ID:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** GET /api/guias/control-general
 *  Devuelve { guias, remitos } con imagenes (paths) para la grilla.
 */
exports.obtenerControlGeneral = async (req, res) => {
  try {
    const del   = req.delegacionId ?? null;
    const admin = isAdmin(req);

    const whereG = admin && del == null ? '1=1' : 'g.iddelegacion = ?';
    const parsG  = admin && del == null ? [] : [del];

    const [guiasRows] = await db.query(
      `SELECT g.*,
              GROUP_CONCAT(DISTINCT gi.path ORDER BY gi.created_at ASC, gi.idguias_imagenes ASC) AS imagenes
         FROM guiasr g
         LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
        WHERE ${whereG}
        GROUP BY g.idguiasr
        ORDER BY g.fechacarga ASC`,
      parsG
    );

    const guias = guiasRows.map((g) => ({
      ...g,
      imagenes: g.imagenes ? String(g.imagenes).split(',') : [],
    }));

    const whereR = admin && del == null ? '1=1' : 'r.iddelegacion = ?';
    const parsR  = admin && del == null ? [] : [del];

    const [remitosRows] = await db.query(
      `SELECT r.*,
              GROUP_CONCAT(DISTINCT ri.path ORDER BY ri.created_at ASC, ri.idremitos_imagenes ASC) AS imagenes
         FROM remitor r
         LEFT JOIN remitos_imagenes ri ON r.idremitor = ri.idremito
        WHERE ${whereR}
        GROUP BY r.idremitor
        ORDER BY r.fechacarga ASC`,
      parsR
    );

    const remitos = remitosRows.map((r) => ({
      ...r,
      imagenes: r.imagenes ? String(r.imagenes).split(',') : [],
    }));

    res.json({ guias, remitos });
  } catch (error) {
    console.error('Error al obtener control general:', error);
    res.status(500).json({ error: 'Error al obtener control general' });
  }
};

/** NUEVO: GET /api/guias/:id/imagenes
 *  Devuelve imágenes de la guía con URL absoluta y GPS (para el modal + mapa).
 *  ⚠️ Acordate en guias.routes.js de declarar esta ruta ANTES de '/:nrguia':
 *     router.get('/:id/imagenes', ...gate(READ_ROLES), guiasController.listarImagenesGuia);
 */
exports.listarImagenesGuia = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id  = Number(req.params.id);
    const admin = isAdmin(req);

    // Chequeo de acceso: la guía debe ser de su delegación o estar huérfana (o admin)
    const [[ok]] = await db.query(
      admin
        ? 'SELECT idguiasr FROM guiasr WHERE idguiasr=? LIMIT 1'
        : 'SELECT idguiasr FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      admin ? [id] : [id, del]
    );
    if (!ok) return res.status(404).json({ error: 'Guía no encontrada' });

    const [rows] = await db.query(
      `SELECT idguias_imagenes, path, nombreImagen, gps_lat, gps_lng, gps_alt, created_at
         FROM guias_imagenes
        WHERE idguia = ?
        ORDER BY created_at ASC, idguias_imagenes ASC`,
      [id]
    );

    const out = rows.map((r) => ({
      id: r.idguias_imagenes,
      path: r.path,
      url: makeAbsUrl(req, r.path), // por comodidad del front
      nombreImagen: r.nombreImagen,
      gps_lat: r.gps_lat != null ? Number(r.gps_lat) : null,
      gps_lng: r.gps_lng != null ? Number(r.gps_lng) : null,
      gps_alt: r.gps_alt != null ? Number(r.gps_alt) : null,
      created_at: r.created_at,
    }));

    res.json(out);
  } catch (error) {
    console.error('Error al listar imágenes de guía:', error);
    res.status(500).json({ error: 'Error interno al listar imágenes' });
  }
};
