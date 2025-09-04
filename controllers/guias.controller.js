// controllers/guias.controller.js
const db = require('../models/db');
const { fetchGuiaById } = require('../helpers/deleg');

/** 🧹 Limpia fechas vacías -> NULL */
function limpiarFechas(campos) {
  const fechas = ['fechemision', 'fechavenci', 'fechacarga', 'fechentregaguia'];
  const out = { ...campos };
  fechas.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(out, f)) {
      if (out[f] === '' || out[f] === null) out[f] = null;
    }
  });
  return out;
}

/** 🔄 Casteo de flags a tinyint(1) */
function castTinyInt(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

/** 🧭 Normaliza campos de entrada a columnas reales */
function filtrarCamposPermitidos(body) {
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
    // 'iddelegacion'  ← se IGNORA en updates/insert: siempre usamos req.delegacionId
    'idestados',
  ]);

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

  return limpio;
}

/** ✅ Cargar nueva guía (fuerza iddelegacion = req.delegacionId) */
exports.cargarGuia = async (req, res) => {
  try {
    const del = req.delegacionId;
    const campos = filtrarCamposPermitidos(req.body);

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
      idestados = devueltosn ? 2 : 1,
    } = campos;

    if (!nrguia) return res.status(400).json({ error: 'nrguia es requerido' });

    // Unicidad por número dentro de la misma delegación
    const [[dup]] = await db.query(
      `SELECT idguiasr FROM guiasr WHERE nrguia=? AND iddelegacion=? LIMIT 1`,
      [nrguia, del]
    );
    if (dup) return res.status(409).json({ error: 'Ya existe una guía con ese número en tu delegación' });

    const [result] = await db.query(
      `INSERT INTO guiasr (
        nrguia, fechemision, fechavenci, fechacarga, fechentregaguia,
        depositosn, devueltosn, titular, destino, informada,
        idtitular, iddelegacion, idestados
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nrguia, fechemision, fechavenci, fechacarga, fechentregaguia,
        depositosn, devueltosn, titular, destino, informada,
        idtitular, del, idestados
      ],
    );

    // (si tenés tabla puente y la mantenés por compatibilidad)
    await db.query('INSERT INTO guias_delegaciones (idguia, iddelegacion) VALUES (?, ?)', [result.insertId, del])
      .catch(() => { /* si no existe, ignorar */ });

    res.status(201).json({ message: 'Guía cargada exitosamente', id: result.insertId });
  } catch (error) {
    console.error('Error al cargar guía:', error);
    res.status(500).json({ error: 'Error interno al cargar la guía' });
  }
};

/** ✅ Actualizar parcialmente una guía (solo de mi delegación) */
exports.actualizarGuiaParcial = async (req, res) => {
  try {
    const del = req.delegacionId;
    const id = Number(req.params.id);

    const guia = await fetchGuiaById(id, del);
    if (!guia) return res.status(404).json({ error: 'No encontrada' });

    const campos = filtrarCamposPermitidos(req.body);

    // No permitir cambiar delegación
    delete campos.iddelegacion;

    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
    }

    if (!('idestados' in campos) && 'devueltosn' in campos) {
      campos.idestados = campos.devueltosn ? 2 : 1;
    }

    const cols = Object.keys(campos);
    const setClause = cols.map((c) => `${c} = ?`).join(', ');
    const values = cols.map((c) => campos[c]);

    values.push(id, del);
    await db.query(
      `UPDATE guiasr SET ${setClause} WHERE idguiasr = ? AND iddelegacion = ?`,
      values
    );

    res.json({ message: 'Guía actualizada parcialmente' });
  } catch (error) {
    console.error('Error al actualizar guía parcialmente:', error);
    res.status(500).json({ error: 'Error interno al actualizar la guía' });
  }
};

/** ✅ Obtener todas las guías (solo mi delegación) */
exports.obtenerTodasGuias = async (req, res) => {
  try {
    const del = req.delegacionId;
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

/** ✅ Buscar guía por número (mi delegación) */
exports.buscarPorNumero = async (req, res) => {
  try {
    const del = req.delegacionId;
    const { nrguia } = req.params;
    const [[row]] = await db.query(
      'SELECT * FROM guiasr WHERE nrguia = ? AND iddelegacion=? LIMIT 1',
      [nrguia, del]
    );
    if (!row) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(row);
  } catch (error) {
    console.error('Error al buscar guía:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** ✅ Solo números de guías (mi delegación) */
exports.obtenerNumerosGuias = async (req, res) => {
  try {
    const del = req.delegacionId;
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

/** ✅ Guías no usadas (sin fecha de vencimiento) – mi delegación */
exports.obtenerGuiasNoUsadas = async (req, res) => {
  try {
    const del = req.delegacionId;
    const [rows] = await db.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
         FROM guiasr
        WHERE iddelegacion=? AND fechavenci IS NULL
        ORDER BY fechacarga ASC`,
      [del]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías no usadas:', error);
    res.status(500).json({ error: 'Error al obtener guías no utilizadas' });
  }
};

/** ✅ Guías sin fecha de emisión (mi delegación) */
exports.obtenerGuiasSinFechaEmision = async (req, res) => {
  try {
    const del = req.delegacionId;
    const [rows] = await db.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
         FROM guiasr
        WHERE iddelegacion=? AND fechemision IS NULL
        ORDER BY fechacarga ASC`,
      [del]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías sin fecha de emisión:', error);
    res.status(500).json({ error: 'Error al obtener guías sin fecha de emisión' });
  }
};

/** ✅ Buscar guía por ID (mi delegación) */
exports.buscarPorId = async (req, res) => {
  try {
    const del = req.delegacionId;
    const id = Number(req.params.id);
    const guia = await fetchGuiaById(id, del);
    if (!guia) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(guia);
  } catch (error) {
    console.error('Error al buscar guía por ID:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** 📊 Control general (mi delegación) */
exports.obtenerControlGeneral = async (req, res) => {
  try {
    const del = req.delegacionId;

    const [guiasRows] = await db.query(
      `SELECT g.*,
              GROUP_CONCAT(DISTINCT gi.path) AS imagenes
         FROM guiasr g
         LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
        WHERE g.iddelegacion=?
        GROUP BY g.idguiasr
        ORDER BY g.fechacarga ASC`,
      [del]
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
        WHERE r.iddelegacion=?
        GROUP BY r.idremitor
        ORDER BY r.fechacarga ASC`,
      [del]
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
