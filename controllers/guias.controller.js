// controllers/guias.controller.js
const pool = require('../models/db');

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
  // columnas reales en guiasr
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
    'iddelegacion',
    'idestados',
  ]);

  const data = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (allowed.has(k)) data[k] = v;
  }

  // limpiar fechas vacías
  const limpio = limpiarFechas(data);

  // castear tinyints
  if ('depositosn' in limpio) limpio.depositosn = castTinyInt(limpio.depositosn);
  if ('devueltosn' in limpio) limpio.devueltosn = castTinyInt(limpio.devueltosn);
  if ('informada' in limpio) limpio.informada = castTinyInt(limpio.informada);

  // asegurar enteros donde aplica
  if ('idtitular' in limpio && limpio.idtitular != null) limpio.idtitular = Number(limpio.idtitular);
  if ('iddelegacion' in limpio && limpio.iddelegacion != null) limpio.iddelegacion = Number(limpio.iddelegacion);
  if ('idestados' in limpio && limpio.idestados != null) limpio.idestados = Number(limpio.idestados);

  return limpio;
}

/** ✅ Cargar nueva guía */
exports.cargarGuia = async (req, res) => {
  try {
    // Filtrar/normalizar campos válidos
    const campos = filtrarCamposPermitidos(req.body);

    const {
      nrguia,
      fechemision,
      fechavenci,
      fechacarga,
      fechentregaguia,
      depositosn = 0,
      devueltosn = 0,
      titular = null,
      destino = null,
      informada = 0,
      idtitular = null,
      iddelegacion = null,
      // si no viene idestados, lo inferimos (1 activo si no devuelto; 2 inactivo si devuelto)
      idestados = devueltosn ? 2 : 1,
    } = campos;

    if (!nrguia) {
      return res.status(400).json({ error: 'nrguia es requerido' });
    }

    // ¿Existe guía con ese número?
    const [existentes] = await pool.query('SELECT idguiasr FROM guiasr WHERE nrguia = ?', [nrguia]);
    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Ya existe una guía con ese número' });
    }

    // Insert principal
    const [result] = await pool.query(
      `INSERT INTO guiasr (
        nrguia, fechemision, fechavenci, fechacarga, fechentregaguia,
        depositosn, devueltosn, titular, destino, informada,
        idtitular, iddelegacion, idestados
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nrguia,
        fechemision,
        fechavenci,
        fechacarga,
        fechentregaguia,
        depositosn,
        devueltosn,
        titular,
        destino,
        informada,
        idtitular,
        iddelegacion,
        idestados,
      ],
    );

    const idGuia = result.insertId;

    // Relación guía-delegación (si viene iddelegacion)
    if (iddelegacion != null) {
      await pool.query('INSERT INTO guias_delegaciones (idguia, iddelegacion) VALUES (?, ?)', [idGuia, iddelegacion]);
    }

    res.status(201).json({ message: 'Guía cargada exitosamente', id: idGuia });
  } catch (error) {
    console.error('Error al cargar guía:', error);
    res.status(500).json({ error: 'Error interno al cargar la guía' });
  }
};

/** ✅ Actualizar parcialmente una guía */
exports.actualizarGuiaParcial = async (req, res) => {
  try {
    const { id } = req.params;

    // Filtrar/normalizar campos válidos
    const campos = filtrarCamposPermitidos(req.body);

    // Si llega vacío después de filtrar, evitar UPDATE vacío
    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
    }

    // Si NO viene idestados pero viene devueltosn, podemos inferir:
    if (!('idestados' in campos) && 'devueltosn' in campos) {
      campos.idestados = campos.devueltosn ? 2 : 1;
    }

    const cols = Object.keys(campos);
    const setClause = cols.map((c) => `${c} = ?`).join(', ');
    const values = cols.map((c) => campos[c]);

    await pool.query(`UPDATE guiasr SET ${setClause} WHERE idguiasr = ?`, [...values, id]);

    res.json({ message: 'Guía actualizada parcialmente' });
  } catch (error) {
    console.error('Error al actualizar guía parcialmente:', error);
    res.status(500).json({ error: 'Error interno al actualizar la guía' });
  }
};

/** ✅ Obtener todas las guías */
exports.obtenerTodasGuias = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM guiasr ORDER BY nrguia ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías:', error);
    res.status(500).json({ error: 'Error interno al obtener las guías' });
  }
};

/** ✅ Buscar guía por número */
exports.buscarPorNumero = async (req, res) => {
  try {
    const { nrguia } = req.params;
    const [rows] = await pool.query('SELECT * FROM guiasr WHERE nrguia = ?', [nrguia]);
    if (rows.length === 0) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al buscar guía:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** ✅ Solo números de guías */
exports.obtenerNumerosGuias = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT nrguia FROM guiasr ORDER BY nrguia ASC');
    res.json(rows.map((r) => r.nrguia));
  } catch (error) {
    console.error('Error al obtener números de guías:', error);
    res.status(500).json({ error: 'Error interno al obtener números de guías' });
  }
};

/** ✅ Guías no usadas (sin fecha de vencimiento), ordenadas por fecha de carga */
exports.obtenerGuiasNoUsadas = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
       FROM guiasr
       WHERE fechavenci IS NULL
       ORDER BY fechacarga ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías no usadas:', error);
    res.status(500).json({ error: 'Error al obtener guías no utilizadas' });
  }
};

/** ✅ Subir imágenes de guía */
exports.subirImagenes = async (req, res) => {
  try {
    const { idguia } = req.params;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron imágenes' });
    }

    const values = req.files.map((f) => [f.path, f.filename, idguia]);
    await pool.query(
      'INSERT INTO guias_imagenes (path, nombreImagen, idguia) VALUES ?',
      [values],
    );

    res.json({ message: 'Imágenes cargadas correctamente' });
  } catch (error) {
    console.error('Error al guardar imágenes:', error);
    res.status(500).json({ error: 'Error interno al guardar imágenes' });
  }
};

/** ✅ Guías sin fecha de emisión (para delegaciones) */
exports.obtenerGuiasSinFechaEmision = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
       FROM guiasr
       WHERE fechemision IS NULL
       ORDER BY fechacarga ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías sin fecha de emisión:', error);
    res.status(500).json({ error: 'Error al obtener guías sin fecha de emisión' });
  }
};

/** ✅ Buscar guía por ID */
exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM guiasr WHERE idguiasr = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Guía no encontrada' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al buscar guía por ID:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

/** 📊 Vista de control general: guías + remitos con imágenes (como arrays) */
exports.obtenerControlGeneral = async (_req, res) => {
  try {
    // Guías con imágenes
    const [guiasRows] = await pool.query(
      `SELECT g.*,
              GROUP_CONCAT(DISTINCT gi.path) AS imagenes
       FROM guiasr g
       LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
       GROUP BY g.idguiasr
       ORDER BY g.fechacarga ASC`,
    );

    const guias = guiasRows.map((g) => ({
      ...g,
      imagenes: g.imagenes ? String(g.imagenes).split(',') : [],
    }));

    // Remitos con imágenes (si existe tabla remitos_imagenes)
    const [remitosRows] = await pool.query(
      `SELECT r.*,
              GROUP_CONCAT(DISTINCT ri.path) AS imagenes
       FROM remitor r
       LEFT JOIN remitos_imagenes ri ON r.idremitor = ri.idremito
       GROUP BY r.idremitor
       ORDER BY r.fechacarga ASC`,
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
