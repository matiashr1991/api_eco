const pool = require('../models/db');

// ✅ Limpiar fechas vacías
function limpiarFechas(campos) {
  const camposFecha = ['fechemision', 'fechavenci', 'fechacarga', 'fechentregaguia'];
  camposFecha.forEach(campo => {
    if (campos.hasOwnProperty(campo) && (campos[campo] === '' || campos[campo] === null)) {
      campos[campo] = null;
    }
  });
  return campos;
}

// ✅ Cargar nueva guía
exports.cargarGuia = async (req, res) => {
  const {
    nrguia,
    fechemision,
    fechavenci,
    fechacarga,
    fechentregaguia,
    depositosn,
    devueltosn,
    destino,
    iddelegacion
  } = limpiarFechas(req.body);

  try {
    const [existentes] = await pool.query(
      'SELECT idguiasr FROM guiasr WHERE nrguia = ?',
      [nrguia]
    );

    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Ya existe una guía con ese número' });
    }

    const [result] = await pool.query(
      `INSERT INTO guiasr 
        (nrguia, fechemision, fechavenci, fechacarga, fechentregaguia, depositosn, devueltosn, destino, iddelegacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nrguia, fechemision, fechavenci, fechacarga, fechentregaguia, depositosn, devueltosn, destino, iddelegacion]
    );

    const idGuia = result.insertId;

    // Asociar guía a delegación
    await pool.query(
      'INSERT INTO guias_delegaciones (idguia, iddelegacion) VALUES (?, ?)',
      [idGuia, iddelegacion]
    );

    res.status(201).json({ message: 'Guía cargada exitosamente', id: idGuia });

  } catch (error) {
    console.error('Error al cargar guía:', error);
    res.status(500).json({ error: 'Error interno al cargar la guía' });
  }
};

// ✅ Actualizar parcialmente una guía
exports.actualizarGuiaParcial = async (req, res) => {
  const { id } = req.params;
  let campos = req.body;

  if (!Object.keys(campos).length) {
    return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
  }

  campos = limpiarFechas(campos);

  const columnas = Object.keys(campos).map(col => `${col} = ?`).join(', ');
  const valores = Object.values(campos);

  try {
    await pool.query(
      `UPDATE guiasr SET ${columnas} WHERE idguiasr = ?`,
      [...valores, id]
    );
    res.json({ message: 'Guía actualizada parcialmente' });
  } catch (error) {
    console.error('Error al actualizar guía parcialmente:', error);
    res.status(500).json({ error: 'Error interno al actualizar la guía' });
  }
};

// ✅ Obtener todas las guías
exports.obtenerTodasGuias = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM guiasr ORDER BY nrguia ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías:', error);
    res.status(500).json({ error: 'Error interno al obtener las guías' });
  }
};

// ✅ Buscar guía por número
exports.buscarPorNumero = async (req, res) => {
  const { nrguia } = req.params;

  try {
    const [rows] = await pool.query('SELECT * FROM guiasr WHERE nrguia = ?', [nrguia]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al buscar guía:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

// ✅ Obtener solo los números de guías
exports.obtenerNumerosGuias = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT nrguia FROM guiasr ORDER BY nrguia ASC');
    res.json(rows.map(r => r.nrguia));
  } catch (error) {
    console.error('Error al obtener números de guías:', error);
    res.status(500).json({ error: 'Error interno al obtener números de guías' });
  }
};

// ✅ Obtener guías no utilizadas (sin fecha de vencimiento), ordenadas por fecha de carga
exports.obtenerGuiasNoUsadas = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT nrguia, fechemision, fechavenci, fechacarga, idguiasr
      FROM guiasr
      WHERE fechavenci IS NULL
      ORDER BY fechacarga ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías no usadas:', error);
    res.status(500).json({ error: 'Error al obtener guías no utilizadas' });
  }
};

exports.subirImagenes = async (req, res) => {
  const { idguia } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subieron imágenes' });
  }

  try {
    for (const file of req.files) {
      await pool.query(
        `INSERT INTO guias_imagenes (path, nombreImagen, idguia) VALUES (?, ?, ?)`,
        [file.path, file.filename, idguia]
      );
    }

    res.json({ message: 'Imágenes cargadas correctamente' });
  } catch (error) {
    console.error('Error al guardar imágenes:', error);
    res.status(500).json({ error: 'Error interno al guardar imágenes' });
  }
};

// ✅ Obtener guías sin fecha de emisión (para delegaciones)
exports.obtenerGuiasSinFechaEmision = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT idguiasr, nrguia, fechemision, fechavenci, fechacarga
      FROM guiasr
      WHERE fechemision IS NULL
      ORDER BY fechacarga ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener guías sin fecha de emisión:', error);
    res.status(500).json({ error: 'Error al obtener guías sin fecha de emisión' });
  }
};
exports.buscarPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM guiasr WHERE idguiasr = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al buscar guía por ID:', error);
    res.status(500).json({ error: 'Error interno al buscar la guía' });
  }
};

// 📌 Vista de control general: guías + remitos con imágenes
exports.obtenerControlGeneral = async (_req, res) => {
  try {
    // 📌 Traer guías con imágenes
    const [guias] = await pool.query(`
      SELECT g.*, 
             GROUP_CONCAT(DISTINCT gi.path) AS imagenes
      FROM guiasr g
      LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
      GROUP BY g.idguiasr
      ORDER BY g.fechacarga ASC
    `);

    // 📌 Traer remitos con imágenes (si existe tabla remitos_imagenes)
    const [remitos] = await pool.query(`
      SELECT r.*, 
             GROUP_CONCAT(DISTINCT ri.path) AS imagenes
      FROM remitor r
      LEFT JOIN remitos_imagenes ri ON r.idremitor = ri.idremito
      GROUP BY r.idremitor
      ORDER BY r.fechacarga ASC
    `);

    res.json({
      guias,
      remitos
    });

  } catch (error) {
    console.error('Error al obtener control general:', error);
    res.status(500).json({ error: 'Error al obtener control general' });
  }
};
