// controllers/titulares.controller.js
const pool = require('../models/db');

function normLike(x) {
  return `%${String(x || '').trim()}%`;
}

function buildUpdateSet(body) {
  const allowed = ['razonsocial', 'cuit', 'nombre', 'apellido'];
  const set = [];
  const values = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      set.push(`${k} = ?`);
      values.push(body[k] === '' ? null : body[k]);
    }
  }
  return { set, values };
}

/* ================== LISTAR (GET /api/titulares?q=...) ================== */
exports.listar = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q) {
      const [rows] = await pool.query(
        `SELECT
           idtitualares AS id,
           razonsocial, cuit, nombre, apellido
         FROM titulares
         ORDER BY razonsocial ASC, apellido ASC, nombre ASC
         LIMIT 200`
      );
      return res.json(rows);
    }

    const like = normLike(q);
    const [rows] = await pool.query(
      `SELECT
         idtitualares AS id,
         razonsocial, cuit, nombre, apellido
       FROM titulares
       WHERE cuit = ? OR razonsocial LIKE ? OR nombre LIKE ? OR apellido LIKE ?
       ORDER BY razonsocial ASC, apellido ASC, nombre ASC
       LIMIT 200`,
      [q, like, like, like]
    );

    res.json(rows);
  } catch (e) {
    console.error('titulares.listar', e);
    res.status(500).json({ error: 'Error al listar titulares' });
  }
};

/* ================== OBTENER (GET /api/titulares/:id) ================== */
exports.obtener = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const [rows] = await pool.query(
      `SELECT
         idtitualares AS id,
         razonsocial, cuit, nombre, apellido
       FROM titulares
       WHERE idtitualares = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error('titulares.obtener', e);
    res.status(500).json({ error: 'Error al obtener titular' });
  }
};

/* ================== CREAR (POST /api/titulares) ================== */
exports.crear = async (req, res) => {
  try {
    const { razonsocial = null, cuit = null, nombre = null, apellido = null } = req.body || {};
    if (!razonsocial && !nombre && !apellido) {
      return res.status(400).json({ error: 'Debe indicar al menos razonsocial o nombre/apellido' });
    }

    const [ins] = await pool.query(
      `INSERT INTO titulares (razonsocial, cuit, nombre, apellido)
       VALUES (?, ?, ?, ?)`,
      [razonsocial || null, cuit || null, nombre || null, apellido || null]
    );

    const [rows] = await pool.query(
      `SELECT
         idtitualares AS id,
         razonsocial, cuit, nombre, apellido
       FROM titulares
       WHERE idtitualares = ?
       LIMIT 1`,
      [ins.insertId]
    );

    res.status(201).json(rows[0] || { id: ins.insertId, razonsocial, cuit, nombre, apellido });
  } catch (e) {
    console.error('titulares.crear', e);
    res.status(500).json({ error: 'Error al crear titular' });
  }
};

/* ================== ACTUALIZAR (PATCH /api/titulares/:id) ================== */
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { set, values } = buildUpdateSet(req.body || {});
    if (!set.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

    const [upd] = await pool.query(
      `UPDATE titulares SET ${set.join(', ')} WHERE idtitualares = ?`,
      [...values, id]
    );
    if (!upd.affectedRows) return res.status(404).json({ error: 'No encontrado' });

    const [rows] = await pool.query(
      `SELECT
         idtitualares AS id,
         razonsocial, cuit, nombre, apellido
       FROM titulares
       WHERE idtitualares = ?
       LIMIT 1`,
      [id]
    );

    res.json(rows[0] || { ok: true });
  } catch (e) {
    console.error('titulares.actualizar', e);
    res.status(500).json({ error: 'Error al actualizar titular' });
  }
};
