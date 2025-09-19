// controllers/remitos.controller.js
'use strict';

const db = require('../models/db');

/* ===== helpers de rol ===== */
function roleInfo(req) {
  const u = req.user || {};
  const one  = String(u.role || '').toLowerCase();
  const many = Array.isArray(u.roles) ? u.roles.map(r => String(r).toLowerCase()) : [];
  const admin       = one === 'admin'       || many.includes('admin');
  const recaudacion = one === 'recaudacion' || many.includes('recaudacion');
  return { admin, recaudacion };
}

/* Admin: todo; delegación: suyos + huérfanos (en los endpoints que corresponde) */

exports.obtenerTodosRemitos = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const { admin } = roleInfo(req);

    const [rows] = await db.query(
      admin && del == null
        ? `SELECT r.* FROM remitor r ORDER BY r.nrremito ASC`
        : `SELECT r.* FROM remitor r WHERE (r.iddelegacion=? OR r.iddelegacion IS NULL)
           ORDER BY (r.iddelegacion IS NULL) DESC, r.nrremito ASC`,
      admin && del == null ? [] : [del]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'Error listando remitos' });
  }
};

exports.obtenerRemitosNoUsados = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const { admin } = roleInfo(req);

    const notUsed = `(guianr IS NULL OR guianr = 0) AND (idguiaremovido IS NULL OR idguiaremovido = 0)`;

    const [rows] = await db.query(
      admin && del == null
        ? `SELECT idremitor, nrremito, fechavencimiento, fechacarga, guianr, idguiaremovido, iddelegacion
             FROM remitor
            WHERE ${notUsed}
            ORDER BY nrremito ASC`
        : `SELECT idremitor, nrremitor, fechavencimiento, fechacarga, guianr, idguiaremovido, iddelegacion
             FROM remitor
            WHERE (iddelegacion=? OR iddelegacion IS NULL) AND ${notUsed}
            ORDER BY (iddelegacion IS NULL) DESC, nrremito ASC`,
      admin && del == null ? [] : [del]
    );
    res.json(rows);
  } catch (e) {
    console.error('Error al obtener remitos no usados:', e);
    res.status(500).json({ error: 'Error al obtener remitos no utilizados' });
  }
};

exports.obtenerRemitoPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const nr  = req.params.nrremito;
    const { admin } = roleInfo(req);

    const [[row]] = await db.query(
      admin && del == null
        ? `SELECT r.* FROM remitor r WHERE r.nrremito=? LIMIT 1`
        : `SELECT r.* FROM remitor r WHERE r.nrremito=? AND (r.iddelegacion=? OR r.iddelegacion IS NULL) LIMIT 1`,
      admin && del == null ? [nr] : [nr, del]
    );
    if (!row) return res.status(404).json({ error:'Remito no encontrado' });
    res.json(row);
  } catch (e) {
    console.error('Error al obtener remito por número:', e);
    res.status(500).json({ error: 'Error al obtener remito' });
  }
};

exports.cargarRemito = async (req, res) => {
  try {
    const delToken = req.delegacionId ?? null;
    const { admin, recaudacion } = roleInfo(req);

    const {
      nrremito,
      fechavencimiento = null,
      guianr = null,
      fechacarga = new Date(),
      fechadevolucion = null,
      devueltosn = 0,
      iddelegacion: idDelegBody = null
    } = req.body || {};

    // ⬇️ permitir a admin y recaudacion indicar iddelegacion en el body
    const iddelegacion = (admin || recaudacion) ? (idDelegBody ?? delToken) : delToken;

    if (!nrremito) return res.status(400).json({ error: 'nrremito es requerido' });
    if (!(admin || recaudacion) && iddelegacion == null) {
      return res.status(400).json({ error: 'No se pudo determinar tu delegación' });
    }

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

exports.actualizarRemitoParcial = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id  = Number(req.params.id);
    const { admin, recaudacion } = roleInfo(req);

    const [[remito]] = await db.query(
      admin && del == null
        ? 'SELECT * FROM remitor WHERE idremitor=? LIMIT 1'
        : 'SELECT * FROM remitor WHERE idremitor=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      admin && del == null ? [id] : [id, del]
    );
    if (!remito) return res.status(404).json({ error:'No encontrado' });

    const allow = new Set(['fechavencimiento','guianr','fechacarga','fechadevolucion','devueltosn']);
    if (admin || recaudacion) allow.add('iddelegacion'); // ⬅️ permitir a recaudación

    const campos = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allow.has(k)) continue;
      if (k === 'devueltosn') campos[k] = v ? 1 : 0;
      else if (k === 'iddelegacion') campos[k] = (v == null ? null : Number(v));
      else campos[k] = v;
    }

    if (!admin && !recaudacion && remito.iddelegacion == null && del != null) {
      campos.iddelegacion = del; // claim de huérfanos
    }

    if (!Object.keys(campos).length) return res.json({ ok:true, changed: 0 });

    const setCols = Object.keys(campos).map(c => `${c}=?`).join(', ');
    const vals = Object.values(campos);

    let where = 'idremitor=?';
    const wv = [id];
    if (!(admin && del == null)) {
      where += ' AND (iddelegacion=? OR iddelegacion IS NULL)';
      wv.push(del);
    }

    const [upd] = await db.query(`UPDATE remitor SET ${setCols} WHERE ${where}`, [...vals, ...wv]);
    res.json({ ok:true, changed: upd.affectedRows });
  } catch (e) {
    console.error('Error al actualizar remito:', e);
    res.status(500).json({ error: 'Error al actualizar remito' });
  }
};

exports.vincularAGuia = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const { admin } = roleInfo(req);
    const idRemito = Number(req.params.id);
    const idGuia   = Number(req.body.idguia);

    const [[remito]] = await db.query(
      admin && del == null
        ? 'SELECT * FROM remitor WHERE idremitor=? LIMIT 1'
        : 'SELECT * FROM remitor WHERE idremitor=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      admin && del == null ? [idRemito] : [idRemito, del]
    );
    if (!remito) return res.status(404).json({ error:'Remito no encontrado' });

    const [[guia]] = await db.query(
      admin && del == null
        ? 'SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1'
        : 'SELECT * FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      admin && del == null ? [idGuia] : [idGuia, del]
    );
    if (!guia) return res.status(400).json({ error:'La guía no pertenece a tu delegación' });

    if (!admin && del != null) {
      if (remito.iddelegacion == null) await db.query('UPDATE remitor SET iddelegacion=? WHERE idremitor=?', [del, idRemito]);
      if (guia.iddelegacion == null)   await db.query('UPDATE guiasr SET iddelegacion=? WHERE idguiasr=?', [del, idGuia]);
    }

    const [upd] = await db.query(
      `UPDATE remitor SET idguiaremovido=?, guianr=? WHERE idremitor=?`,
      [idGuia, guia.nrguia, idRemito]
    );

    res.json({ ok:true, changed: upd.affectedRows });
  } catch (e) {
    console.error('Error al vincular remito:', e);
    res.status(500).json({ error: 'Error al vincular remito' });
  }
};
