// controllers/remitos.controller.js
const db = require('../models/db');
const { fetchGuiaById, fetchRemitoById } = require('../helpers/deleg');

// GET /api/remitos/all  → solo mi delegación
exports.obtenerTodosRemitos = async (req, res) => {
  try {
    const del = req.delegacionId;
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

// GET /api/remitos/no-usados
exports.obtenerRemitosNoUsados = async (req, res) => {
  try {
    const del = req.delegacionId;

    let limit = Number.parseInt(req.query.limit, 10);
    let offset = Number.parseInt(req.query.offset, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 500) limit = 500;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const [rows] = await db.query(
      `SELECT idremitor, nrremito, fechavencimiento, fechacarga, guianr, idguiaremovido
         FROM remitor
        WHERE iddelegacion = ?
          AND (guianr IS NULL OR guianr = 0)
          AND (idguiaremovido IS NULL OR idguiaremovido = 0)
        ORDER BY nrremito ASC
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

// GET /api/remitos/:nrremito (por número) – en mi delegación
exports.obtenerRemitoPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId;
    const nr = req.params.nrremito;
    const [[row]] = await db.query(
      `SELECT r.*
         FROM remitor r
        WHERE r.nrremito = ? AND r.iddelegacion = ?
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

// POST /api/remitos/carga  – fuerza iddelegacion = req.delegacionId
exports.cargarRemito = async (req, res) => {
  try {
    const del = req.delegacionId;
    const {
      nrremito,
      fechavencimiento = null,
      guianr = null,
      fechacarga = new Date(),
      fechadevolucion = null,
      devueltosn = 0
      // iddelegacion (si viene en body, se IGNORA y se fuerza del JWT)
    } = req.body;

    if (!nrremito) return res.status(400).json({ error: 'nrremito es requerido' });

    // Unicidad por número dentro de la misma delegación
    const [[dup]] = await db.query(
      `SELECT idremitor FROM remitor WHERE nrremito=? AND iddelegacion=? LIMIT 1`,
      [nrremito, del]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe un remito con ese número en tu delegación' });

    const [ins] = await db.query(
      `INSERT INTO remitor
         (nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn, iddelegacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn ? 1 : 0, del]
    );

    res.status(201).json({ ok:true, id: ins.insertId });
  } catch (e) {
    console.error('Error al cargar remito:', e);
    res.status(500).json({ error: 'Error al cargar remito' });
  }
};

// PATCH /api/remitos/:id – solo si el remito es de mi delegación
exports.actualizarRemitoParcial = async (req, res) => {
  try {
    const del = req.delegacionId;
    const id  = Number(req.params.id);

    const remito = await fetchRemitoById(id, del);
    if (!remito) return res.status(404).json({ error:'No encontrado' });

    // Campos permitidos (no permitir cambiar delegación)
    const allow = new Set(['fechavencimiento','guianr','fechacarga','fechadevolucion','devueltosn']);
    const campos = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allow.has(k)) campos[k] = (k === 'devueltosn') ? (v ? 1 : 0) : v;
    }
    if (!Object.keys(campos).length) return res.json({ ok:true, changed: 0 });

    const setCols = Object.keys(campos).map(c => `${c}=?`).join(', ');
    const vals = Object.values(campos);

    vals.push(id, del);
    const [resUpd] = await db.query(
      `UPDATE remitor SET ${setCols}
        WHERE idremitor=? AND iddelegacion=?`,
      vals
    );

    res.json({ ok:true, changed: resUpd.affectedRows });
  } catch (e) {
    console.error('Error al actualizar remito:', e);
    res.status(500).json({ error: 'Error al actualizar remito' });
  }
};

// PATCH /api/remitos/:id/vincular  – guía de la misma delegación
exports.vincularAGuia = async (req, res) => {
  try {
    const del = req.delegacionId;
    const idRemito = Number(req.params.id);
    const idGuia   = Number(req.body.idguia);

    const remito = await fetchRemitoById(idRemito, del);
    if (!remito) return res.status(404).json({ error:'Remito no encontrado en tu delegación' });

    const guia = await fetchGuiaById(idGuia, del);
    if (!guia) return res.status(400).json({ error:'La guía no pertenece a tu delegación' });

    const [upd] = await db.query(
      `UPDATE remitor
          SET idguiaremovido = ?, guianr = ?
        WHERE idremitor = ? AND iddelegacion = ?`,
      [idGuia, guia.nrguia, idRemito, del]
    );

    res.json({ ok:true, changed: upd.affectedRows });
  } catch (e) {
    console.error('Error al vincular remito:', e);
    res.status(500).json({ error: 'Error al vincular remito' });
  }
};
