// controllers/remitos.controller.js
const db = require('../models/db');
const { fetchGuiaById, fetchRemitoById } = require('../helpers/deleg');

/* ===== helpers de rol ===== */
function getRole(req) {
  const u = req.user || {};
  const one = String(u.role || '').toLowerCase();
  const many = Array.isArray(u.roles) ? u.roles.map(r => String(r).toLowerCase()) : [];
  return { one, many };
}
function isAdmin(req) {
  const { one, many } = getRole(req);
  return one === 'admin' || many.includes('admin');
}

/* =================================================================== */
/* GET /api/remitos/all  → admin: todos | delegación: sólo suyos       */
/* =================================================================== */
exports.obtenerTodosRemitos = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    if (isAdmin(req) && del == null) {
      const [rows] = await db.query(
        `SELECT r.*
           FROM remitor r
          ORDER BY r.nrremito ASC`
      );
      return res.json(rows);
    }
    const [rows] = await db.query(
      `SELECT r.*
         FROM remitor r
        WHERE r.iddelegacion = ?
        ORDER BY r.nrremito ASC`,
      [del]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'Error listando remitos' });
  }
};

/* ================================================================================== */
/* GET /api/remitos/no-usados  → admin: todos; delegación: suyos + huérfanos         */
/* ================================================================================== */
exports.obtenerRemitosNoUsados = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;

    let limit = Number.parseInt(req.query.limit, 10);
    let offset = Number.parseInt(req.query.offset, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 500) limit = 500;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    // Condición de “no usado”
    const notUsed = `(guianr IS NULL OR guianr = 0) AND (idguiaremovido IS NULL OR idguiaremovido = 0)`;

    if (isAdmin(req) && del == null) {
      const [rows] = await db.query(
        `SELECT idremitor, nrremito, fechavencimiento, fechacarga, guianr, idguiaremovido, iddelegacion
           FROM remitor
          WHERE ${notUsed}
          ORDER BY nrremito ASC
          LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      res.set('X-Query-Limit', String(limit));
      return res.json(rows);
    }

    // Usuario de delegación (o admin con delegación): propios + huérfanos
    const [rows] = await db.query(
      `SELECT idremitor, nrremito, fechavencimiento, fechacarga, guianr, idguiaremovido, iddelegacion
         FROM remitor
        WHERE (iddelegacion = ? OR iddelegacion IS NULL)
          AND ${notUsed}
        ORDER BY (iddelegacion IS NULL) DESC, nrremito ASC
        LIMIT ? OFFSET ?`,
      [del, limit, offset]
    );

    res.set('X-Query-Limit', String(limit));
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    console.error('Error al obtener remitos no usados:', e);
    res.status(500).json({ error: 'Error al obtener remitos no utilizados' });
  }
};

/* =================================================================== */
/* GET /api/remitos/:nrremito (por número)                             */
/* =================================================================== */
exports.obtenerRemitoPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const nr = req.params.nrremito;

    if (isAdmin(req) && del == null) {
      const [[row]] = await db.query(
        `SELECT r.* FROM remitor r WHERE r.nrremito = ? LIMIT 1`,
        [nr]
      );
      return row ? res.json(row) : res.status(404).json({ error:'Remito no encontrado' });
    }

    const [[row]] = await db.query(
      `SELECT r.*
         FROM remitor r
        WHERE r.nrremito = ?
          AND (r.iddelegacion = ? OR r.iddelegacion IS NULL)
        LIMIT 1`,
      [nr, del]
    );
    if (!row) return res.status(404).json({ error:'Remito no encontrado' });
    res.json(row);
  } catch (e) {
    console.error('Error al obtener remito por número:', e);
    res.status(500).json({ error: 'Error al obtener remito' });
  }
};

/* =================================================================== */
/* POST /api/remitos/carga  – admin puede indicar iddelegacion         */
/* =================================================================== */
exports.cargarRemito = async (req, res) => {
  try {
    const delToken = req.delegacionId ?? null;
    const admin = isAdmin(req);

    const {
      nrremito,
      fechavencimiento = null,
      guianr = null,
      fechacarga = new Date(),
      fechadevolucion = null,
      devueltosn = 0,
      iddelegacion = admin ? (req.body.iddelegacion ?? delToken) : delToken
    } = req.body;

    if (!nrremito) return res.status(400).json({ error: 'nrremito es requerido' });
    if (!admin && iddelegacion == null) return res.status(400).json({ error: 'No se pudo determinar tu delegación' });

    const [[dup]] = await db.query(
      `SELECT idremitor FROM remitor WHERE nrremito=? AND ${iddelegacion == null ? 'iddelegacion IS NULL' : 'iddelegacion=?'} LIMIT 1`,
      iddelegacion == null ? [nrremito] : [nrremito, iddelegacion]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe un remito con ese número en esa delegación' });

    const [ins] = await db.query(
      `INSERT INTO remitor
         (nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn, iddelegacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn ? 1 : 0, iddelegacion]
    );

    res.status(201).json({ ok:true, id: ins.insertId });
  } catch (e) {
    console.error('Error al cargar remito:', e);
    res.status(500).json({ error: 'Error al cargar remito' });
  }
};

/* =================================================================== */
/* PATCH /api/remitos/:id – permite setear idguiaremovido              */
/*        admin bypass + claim de huérfanos                             */
/* =================================================================== */
exports.actualizarRemitoParcial = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id  = Number(req.params.id);
    const admin = isAdmin(req);

    let remito;
    if (admin && del == null) {
      const [[r]] = await db.query('SELECT * FROM remitor WHERE idremitor=? LIMIT 1', [id]);
      remito = r || null;
    } else {
      const [[r]] = await db.query(
        'SELECT * FROM remitor WHERE idremitor=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
        [id, del]
      );
      remito = r || null;
    }
    if (!remito) return res.status(404).json({ error:'No encontrado' });

    // Campos permitidos; admin puede cambiar iddelegacion
    const allow = new Set(['fechavencimiento','guianr','fechacarga','fechadevolucion','devueltosn','idguiaremovido']);
    if (admin) allow.add('iddelegacion');

    const campos = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allow.has(k)) continue;
      if (k === 'devueltosn') campos[k] = v ? 1 : 0;
      else if (k === 'iddelegacion') campos[k] = (v == null ? null : Number(v));
      else campos[k] = v;
    }

    // Si el usuario de delegación toca un remito huérfano, lo reclama
    if (!admin && remito.iddelegacion == null && del != null) {
      campos.iddelegacion = del;
    }

    if (!Object.keys(campos).length) return res.json({ ok:true, changed: 0 });

    const setCols = Object.keys(campos).map(c => `${c}=?`).join(', ');
    const vals = Object.values(campos);

    // WHERE con bypass admin
    let where = 'idremitor=?';
    const whereVals = [id];
    if (!(admin && del == null)) {
      where += ' AND (iddelegacion=? OR iddelegacion IS NULL)';
      whereVals.push(del);
    }

    const [resUpd] = await db.query(
      `UPDATE remitor SET ${setCols} WHERE ${where}`,
      [...vals, ...whereVals]
    );

    res.json({ ok:true, changed: resUpd.affectedRows });
  } catch (e) {
    console.error('Error al actualizar remito:', e);
    res.status(500).json({ error: 'Error al actualizar remito' });
  }
};

/* =================================================================== */
/* PATCH /api/remitos/:id/vincular – vincula a guía                    */
/* =================================================================== */
exports.vincularAGuia = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const admin = isAdmin(req);
    const idRemito = Number(req.params.id);
    const idGuia   = Number(req.body.idguia);

    // Remito con bypass admin + huérfanos para delegación
    let remito;
    if (admin && del == null) {
      const [[r]] = await db.query('SELECT * FROM remitor WHERE idremitor=? LIMIT 1', [idRemito]);
      remito = r || null;
    } else {
      const [[r]] = await db.query(
        'SELECT * FROM remitor WHERE idremitor=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
        [idRemito, del]
      );
      remito = r || null;
    }
    if (!remito) return res.status(404).json({ error:'Remito no encontrado' });

    // Guía: admin cualquier; delegación: suya o huérfana (se reclama)
    let guia;
    if (admin && del == null) {
      const [[g]] = await db.query('SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1', [idGuia]);
      guia = g || null;
    } else {
      const [[g]] = await db.query(
        'SELECT * FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
        [idGuia, del]
      );
      guia = g || null;
    }
    if (!guia) return res.status(400).json({ error:'La guía no pertenece a tu delegación' });

    // Si usuario (no admin) y alguno está huérfano → asignar a su delegación
    if (!admin && del != null) {
      if (remito.iddelegacion == null) {
        await db.query('UPDATE remitor SET iddelegacion=? WHERE idremitor=?', [del, idRemito]);
      }
      if (guia.iddelegacion == null) {
        await db.query('UPDATE guiasr SET iddelegacion=? WHERE idguiasr=?', [del, idGuia]);
      }
    }

    const [upd] = await db.query(
      `UPDATE remitor
          SET idguiaremovido = ?, guianr = ?
        WHERE idremitor = ?`,
      [idGuia, guia.nrguia, idRemito]
    );

    res.json({ ok:true, changed: upd.affectedRows });
  } catch (e) {
    console.error('Error al vincular remito:', e);
    res.status(500).json({ error: 'Error al vincular remito' });
  }
};
