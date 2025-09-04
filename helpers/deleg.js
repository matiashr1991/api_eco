// helpers/deleg.js
const db = require('../models/db');

// Valida ownership en una tabla que tenga iddelegacion
async function assertRowDeleg(table, idField, id, deleg) {
  const [[row]] = await db.query(
    `SELECT ${idField} AS id FROM ${table}
      WHERE ${idField}=? AND iddelegacion=? LIMIT 1`,
    [id, deleg]
  );
  return !!row;
}

// Guías
async function fetchGuiaById(id, deleg) {
  const [[row]] = await db.query(
    `SELECT * FROM guiasr WHERE idguiasr=? AND iddelegacion=? LIMIT 1`,
    [id, deleg]
  );
  return row || null;
}

// Remitos
async function fetchRemitoById(id, deleg) {
  const [[row]] = await db.query(
    `SELECT * FROM remitor WHERE idremitor=? AND iddelegacion=? LIMIT 1`,
    [id, deleg]
  );
  return row || null;
}

module.exports = { assertRowDeleg, fetchGuiaById, fetchRemitoById };
