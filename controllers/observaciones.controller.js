// src/controllers/observaciones.controller.js
const pool = require('../models/db');

// Intenta obtener el id de usuario desde el JWT puesto por tu middleware global
function getUserId(req) {
    const u = req.user || {};
    return Number(u.sub || u.id || u.idusuarios || u.id_user || 0) || null;
}

/** GET /api/guias/:id/observaciones -> lista observaciones de una guía */
exports.listarPorGuia = async (req, res) => {
    const idguia = Number(req.params.id);
    if (!Number.isInteger(idguia) || idguia <= 0) {
        return res.status(400).json({ error: 'Parámetro id inválido' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT 
         go.idgui_obs AS id,
         go.idguias,
         go.idusr,
         go.obs,
         go.fech,
         COALESCE(u.nombre, u.email, CONCAT('usr#', go.idusr)) AS usuario
       FROM guias_observaciones go
       LEFT JOIN usuarios u ON u.idusuarios = go.idusr
       WHERE go.idguias = ?
       ORDER BY go.fech DESC`,
            [idguia]
        );
        res.json(rows);
    } catch (e) {
        console.error('OBS listarPorGuia:', e);
        res.status(500).json({ error: 'Error al obtener observaciones' });
    }
};

/** POST /api/guias/:id/observaciones -> crea una observación para la guía */
exports.crearParaGuia = async (req, res) => {
    const idguia = Number(req.params.id);
    const texto = (req.body?.obs ?? '').toString().trim();

    if (!Number.isInteger(idguia) || idguia <= 0) {
        return res.status(400).json({ error: 'Parámetro id inválido' });
    }
    if (!texto) {
        return res.status(400).json({ error: 'La observación (obs) es requerida' });
    }

    try {
        const idusr = getUserId(req); // puede ser null si tu token no trae id
        await pool.query(
            `INSERT INTO guias_observaciones (idguias, idusr, obs, fech)
       VALUES (?, ?, ?, NOW())`,
            [idguia, idusr, texto]
        );
        res.status(201).json({ ok: true });
    } catch (e) {
        console.error('OBS crearParaGuia:', e);
        res.status(500).json({ error: 'Error al guardar observación' });
    }
};
