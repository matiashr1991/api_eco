// controllers/delegaciones.controller.js
const pool = require('../models/db');

/* ========= Helpers de Roles ========= */
function stripAccents(s = '') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function canon(s = '') {
  return stripAccents(String(s).toLowerCase().trim());
}

/**
 * ❗ Ajustado según tu tabla:
 * 2: admin
 * 3: delegacion
 * 4: control
 * 5: auditor
 * 6: recaudacion
 */
function mapRoleIdToName(id) {
  const map = { 2: 'admin', 3: 'delegacion', 4: 'control', 5: 'auditor', 6: 'recaudacion' };
  return map[Number(id)] || '';
}

function resolveRoleFromReq(req) {
  const u = req.user || {};
  let raw =
    u.role ??
    u.rol ??
    u.roleName ??
    u.nombreRol ??
    u.roles ??
    u.authorities ??
    '';

  // Si vino id numérico
  if (!raw && u.idroles != null) raw = mapRoleIdToName(u.idroles);

  // Si vino arreglo
  if (Array.isArray(raw)) raw = raw[0];

  // Si vino objeto tipo { idroles, dsc }
  if (raw && typeof raw === 'object') {
    const byId = mapRoleIdToName(raw.idroles ?? raw.id);
    if (byId) return byId;
    raw = raw.dsc ?? raw.descripcion ?? raw.nombre ?? '';
  }

  const r = canon(String(raw));
  if (r.startsWith('admin') || r === 'role_admin') return 'admin';
  if (r.startsWith('deleg') || r.includes('role_deleg') || r === 'delegacion' || r === 'delegación') return 'delegacion';
  if (r.startsWith('control')) return 'control';                 // <-- agregado
  if (r.startsWith('recaud') || r.includes('recaudacion') || r.includes('recaudación') || r === 'role_recaud' || r === 'role_recaudacion') return 'recaudacion';
  if (r.startsWith('bosq') || r === 'bosques') return 'bosques';
  if (r.includes('central')) return 'central';
  if (r.startsWith('auditor')) return 'auditor';
  return r || '';
}

function isAllowed(req, allowed = []) {
  if (!allowed.length) return true;
  const role = resolveRoleFromReq(req);
  return allowed.includes(role);
}

function forbid(res, info = '') {
  return res.status(403).json({ error: 'forbidden', info });
}

/* ========= Controladores ========= */

// GET /api/delegaciones/dele
// ✅ Permitir a: admin, central, recaudacion, control
exports.obtenerDelegaciones = async (req, res) => {
  if (!isAllowed(req, ['admin', 'central', 'recaudacion', 'control'])) {
    return forbid(res, 'delegaciones:list');
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM delegaciones ORDER BY nombre ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener delegaciones:', error);
    res.status(500).json({ error: 'Error al obtener delegaciones' });
  }
};

// GET /api/delegaciones/:id
// ✅ Permitir a: admin, central, recaudacion, control
exports.obtenerDelegacionPorId = async (req, res) => {
  if (!isAllowed(req, ['admin', 'central', 'recaudacion', 'control'])) {
    return forbid(res, 'delegaciones:get');
  }

  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM delegaciones WHERE iddelegacion = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Delegación no encontrada' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener delegación:', error);
    res.status(500).json({ error: 'Error interno al obtener delegación' });
  }
};

// POST /api/delegaciones/dele (si lo usás)
// ✅ Sólo admin
exports.crearDelegacion = async (req, res) => {
  if (!isAllowed(req, ['admin'])) {
    return forbid(res, 'delegaciones:create');
  }

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
