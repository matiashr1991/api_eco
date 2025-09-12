// controllers/guias.controller.js
const db = require('../models/db');
const { fetchGuiaById } = require('../helpers/deleg');

/* ====================== helpers de normalización ====================== */

function getRole(req) {
  const u = req.user || {};
  const one = (u.role || '').toString().toLowerCase();
  const many = Array.isArray(u.roles) ? u.roles.map(x => String(x).toLowerCase()) : [];
  return { one, many };
}
function isAdmin(req) {
  const { one, many } = getRole(req);
  return one === 'admin' || many.includes('admin');
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

/** Normaliza payload, con permiso opcional de setear iddelegacion para admin */
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
  if ('informada' in limpio) limpio.informada = castTinyInt(limpio.informada);

  if ('idtitular' in limpio && limpio.idtitular != null) limpio.idtitular = Number(limpio.idtitular);
  if ('idestados' in limpio && limpio.idestados != null) limpio.idestados = Number(limpio.idestados);
  if ('iddelegacion' in limpio && limpio.iddelegacion != null) limpio.iddelegacion = Number(limpio.iddelegacion);

  return limpio;
}

/* ============================ controladores =========================== */

/** Cargar nueva guía (si admin puede indicar iddelegacion, si no se usa la del token) */
exports.cargarGuia = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const campos = filtrarCamposPermitidos(req.body, { allowIdDeleg: isAdmin(req) });

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
      idestados = devueltosn ? 2 : 1,
    } = campos;

    if (!nrguia) return res.status(400).json({ error: 'nrguia es requerido' });

    if (!isAdmin(req) && (iddelegacion == null)) {
      return res.status(400).json({ error: 'No se pudo determinar tu delegación' });
    }

    // Unicidad por número dentro de la misma delegación (o NULL si huérfana)
    const [[dup]] = await db.query(
      `SELECT idguiasr FROM guiasr WHERE nrguia=? AND <COND> LIMIT 1`.replace(
        '<COND>',
        iddelegacion == null ? 'iddelegacion IS NULL' : 'iddelegacion = ?'
      ),
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
        idtitular, iddelegacion, idestados
      ],
    );

    // Tabla puente (si existe)
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

/** PATCH parcial de guía (admin bypass + claim automático si está huérfana) */
exports.actualizarGuiaParcial = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id = Number(req.params.id);
    const admin = isAdmin(req);

    let guia;
    if (admin) {
      const [[row]] = await db.query('SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1', [id]);
      guia = row || null;
    } else {
      const [[row]] = await db.query(
        'SELECT * FROM guiasr WHERE idguiasr=? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
        [id, del]
      );
      guia = row || null;
    }
    if (!guia) return res.status(404).json({ error: 'No encontrada' });

    const campos = filtrarCamposPermitidos(req.body, { allowIdDeleg: admin });

    // Si el usuario es de delegación y la guía está huérfana, la “reclama”
    if (!admin && guia.iddelegacion == null && del != null) {
      campos.iddelegacion = del;
    }

    // Derivar estado por devueltosn si no llegó idestados
    if (!('idestados' in campos) && 'devueltosn' in campos) {
      campos.idestados = campos.devueltosn ? 2 : 1;
    }

    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
    }

    const cols = Object.keys(campos);
    const setClause = cols.map((c) => `${c} = ?`).join(', ');
    const values = cols.map((c) => campos[c]);

    // WHERE con bypass admin
    let where = 'idguiasr = ?';
    let whereParams = [id];

    if (!admin) {
      where += ' AND (iddelegacion = ? OR iddelegacion IS NULL)';
      whereParams.push(del);
    }

    await db.query(`UPDATE guiasr SET ${setClause} WHERE ${where}`, [...values, ...whereParams]);

    res.json({ message: 'Guía actualizada parcialmente' });
  } catch (error) {
    console.error('Error al actualizar guía parcialmente:', error);
    res.status(500).json({ error: 'Error interno al actualizar la guía' });
  }
};

/** Listado completo (admin: todo; delegación: sólo suya) */
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

/** Buscar por número (admin: todo; delegación: suya o huérfana) */
exports.buscarPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const { nrguia } = req.params;
    if (isAdmin(req)) {
      const [[row]] = await db.query('SELECT * FROM guiasr WHERE nrguia = ? LIMIT 1', [nrguia]);
      return row ? res.json(row) : res.status(404).json({ error: 'Guía no encontrada' });
    }
    const [[row]] = await db.query(
      'SELECT * FROM guiasr WHERE nrguia = ? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      [nrguia, del]
    );
    if (!row) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(row);
  } catch (error) {
    console.error('Error al buscar guía:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** Solo números (admin: todo; delegación: suya) */
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
    res.json(rows.map((r) => r.nrguia));
  } catch (error) {
    console.error('Error al obtener números de guías:', error);
    res.status(500).json({ error: 'Error interno al obtener números de guías' });
  }
};

/** Guías “no usadas” = sin vencimiento (delegación: suya o huérfana; admin: todas) */
exports.obtenerGuiasNoUsadas = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    if (isAdmin(req) && del == null) {
      const [rows] = await db.query(
        `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
           FROM guiasr
          WHERE fechavenci IS NULL
          ORDER BY fechacarga ASC`
      );
      return res.json(rows);
    }
    const [rows] = await db.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
         FROM guiasr
        WHERE (iddelegacion=? OR iddelegacion IS NULL)
          AND fechavenci IS NULL
        ORDER BY fechacarga ASC`,
      [del]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías no usadas:', error);
    res.status(500).json({ error: 'Error al obtener guías no utilizadas' });
  }
};

/** Guías “disponibles” para emitir = sin fecha de emisión */
exports.obtenerGuiasSinFechaEmision = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;

    if (isAdmin(req) && del == null) {
      // Admin sin delegación: ve todas las huérfanas y también las que ya tengan delegación (si querés, dejá sólo huérfanas)
      const [rows] = await db.query(
        `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga, iddelegacion
           FROM guiasr
          WHERE fechemision IS NULL
          ORDER BY (iddelegacion IS NULL) DESC, fechacarga ASC`
      );
      return res.json(rows);
    }

    // Usuario de delegación (o admin con del): suyas + huérfanas
    const [rows] = await db.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga, iddelegacion
         FROM guiasr
        WHERE (iddelegacion=? OR iddelegacion IS NULL)
          AND fechemision IS NULL
        ORDER BY (iddelegacion IS NULL) DESC, fechacarga ASC`,
      [del]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías sin fecha de emisión:', error);
    res.status(500).json({ error: 'Error al obtener guías sin fecha de emisión' });
  }
};

/** Buscar guía por ID (admin: cualquiera; delegación: suya o huérfana) */
exports.buscarPorId = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const id = Number(req.params.id);
    if (isAdmin(req)) {
      const [[row]] = await db.query('SELECT * FROM guiasr WHERE idguiasr=? LIMIT 1', [id]);
      return row ? res.json(row) : res.status(404).json({ error: 'Guía no encontrada' });
    }
    const [[row]] = await db.query(
      'SELECT * FROM guiasr WHERE idguiasr = ? AND (iddelegacion=? OR iddelegacion IS NULL) LIMIT 1',
      [id, del]
    );
    if (!row) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(row);
  } catch (error) {
    console.error('Error al buscar guía por ID:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** Control general (admin: todo; delegación: suya) */
exports.obtenerControlGeneral = async (req, res) => {
  try {
    const del = req.delegacionId ?? null;
    const admin = isAdmin(req);

    const where = admin && del == null ? '1=1' : 'g.iddelegacion = ?';
    const params = admin && del == null ? [] : [del];

    const [guiasRows] = await db.query(
      `SELECT g.*,
              GROUP_CONCAT(DISTINCT gi.path) AS imagenes
         FROM guiasr g
         LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
        WHERE ${where}
        GROUP BY g.idguiasr
        ORDER BY g.fechacarga ASC`,
      params
    );

    const guias = guiasRows.map((g) => ({
      ...g,
      imagenes: g.imagenes ? String(g.imagenes).split(',') : [],
    }));

    const [remitosRows] = await db.query(
      `SELECT r.*,
              GROUP_CONCAT(DISTINCT ri.path) AS imagenes
         FROM remitor r
         LEFT JOIN remitos_imagenes ri ON r.idremitor = ri.idremito
        WHERE ${admin && del == null ? '1=1' : 'r.iddelegacion = ?'}
        GROUP BY r.idremitor
        ORDER BY r.fechacarga ASC`,
      admin && del == null ? [] : [del]
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
