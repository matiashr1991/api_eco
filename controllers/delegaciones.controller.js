const pool = require('../models/db');

// Obtener todas las delegaciones
exports.obtenerDelegaciones = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM delegaciones ORDER BY nombre ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener delegaciones:', error);
    res.status(500).json({ error: 'Error al obtener delegaciones' });
  }
};

// Obtener una delegación por ID (opcional)
exports.obtenerDelegacionPorId = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM delegaciones WHERE iddelegacion = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Delegación no encontrada' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener delegación:', error);
    res.status(500).json({ error: 'Error interno al obtener delegación' });
  }
};

// Crear nueva delegación (opcional)
exports.crearDelegacion = async (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son obligatorios' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO delegaciones (nombre, email) VALUES (?, ?)',
      [nombre, email]
    );
    res.status(201).json({ message: 'Delegación creada', id: result.insertId });
  } catch (error) {
    console.error('Error al crear delegación:', error);
    res.status(500).json({ error: 'Error al crear delegación' });
  }
};
