const pool = require('../models/db');

// Cargar nuevo remito
exports.cargarRemito = async (req, res) => {
  const { nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO remitor (nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nrremito, fechavencimiento, guianr, fechacarga, fechadevolucion, devueltosn]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Error al cargar remito:', error);
    res.status(500).json({ error: 'Error al cargar remito' });
  }
};

// Actualizar parcialmente un remito
exports.actualizarRemitoParcial = async (req, res) => {
  const { id } = req.params;
  const campos = req.body;

  if (!Object.keys(campos).length) return res.status(400).json({ error: 'No se proporcionaron campos' });

  const columnas = Object.keys(campos).map(col => `${col} = ?`).join(', ');
  const valores = Object.values(campos);

  try {
    await pool.query(`UPDATE remitor SET ${columnas} WHERE idremitor = ?`, [...valores, id]);
    res.json({ message: 'Remito actualizado parcialmente' });
  } catch (error) {
    console.error('Error al actualizar remito:', error);
    res.status(500).json({ error: 'Error al actualizar remito' });
  }
};

// Obtener todos los remitos
exports.obtenerTodosRemitos = async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM remitor ORDER BY nrremito ASC`);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener remitos:', error);
    res.status(500).json({ error: 'Error al obtener los remitos' });
  }
};

// Obtener remitos no usados
exports.obtenerRemitosNoUsados = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT nrremito, fechavencimiento, fechacarga, idremitor
      FROM remitor
      WHERE fechavencimiento IS NULL
      ORDER BY fechacarga ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener remitos no usados:', error);
    res.status(500).json({ error: 'Error al obtener remitos no utilizados' });
  }
};

// Vincular remito a guía
exports.vincularAGuia = async (req, res) => {
  const { id } = req.params;
  const { idguia } = req.body;
  try {
    await pool.query(
      `UPDATE remitor SET idguiaremovido = ?, guianr = (SELECT nrguia FROM guiasr WHERE idguiasr = ?) WHERE idremitor = ?`,
      [idguia, idguia, id]
    );
    res.json({ message: 'Remito vinculado correctamente' });
  } catch (error) {
    console.error('Error al vincular remito:', error);
    res.status(500).json({ error: 'Error al vincular remito' });
  }
};

// remitos.controller.js
exports.obtenerRemitoPorNumero = async (req, res) => {
  const { nrremito } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM remitor WHERE nrremito = ?`,
      [nrremito]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Remito no encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener remito por número:', error);
    res.status(500).json({ error: 'Error al obtener remito' });
  }
};

