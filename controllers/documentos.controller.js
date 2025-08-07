// controllers/documentos.controller.js
const pool = require('../models/db');

exports.obtenerTodosDocumentos = async (req, res) => {
  try {
    const [guias] = await pool.query(`
      SELECT 'Guía' AS tipo, idguiasr AS id, nrguia AS numero, fechacarga, devueltosn AS devuelto, destino AS relacion
      FROM guiasr
    `);
    const [remitos] = await pool.query(`
      SELECT 'Remito' AS tipo, idremitor AS id, nrremito AS numero, fechacarga, devueltosn AS devuelto, guianr AS relacion
      FROM remitor
    `);
    const documentos = [...guias, ...remitos];
    res.json(documentos);
  } catch (error) {
    console.error('Error al obtener documentos:', error);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
};
