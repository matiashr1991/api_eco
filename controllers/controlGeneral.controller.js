// controllers/controlGeneral.controller.js
const pool = require('../models/db');

/* Util: normaliza a URL absoluta */
function toAbsolute(origin, p) {
    if (!p) return '';
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    return origin + (p.startsWith('/') ? p : `/${p}`);
}

/* ===================== CONTROL GENERAL (GUÍAS) ===================== */
exports.obtenerControlGeneral = async (req, res) => {
    try {
        // Paginación
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 30;
        const offset = (page - 1) * limit;

        // Filtros
        const filtroGuia = req.query.guia ? `%${req.query.guia}%` : '%';
        const filtroTitular = req.query.titular ? `%${req.query.titular}%` : '%';
        const fechaInicio = req.query.fechaInicio || null;
        const fechaFin = req.query.fechaFin || null;

        // WHERE dinámico
        let where = `WHERE g.nrguia LIKE ? AND g.titular LIKE ?`;
        const params = [filtroGuia, filtroTitular];

        if (fechaInicio && fechaFin) {
            where += ` AND g.fechemision BETWEEN ? AND ?`;
            params.push(fechaInicio, fechaFin);
        } else if (fechaInicio) {
            where += ` AND g.fechemision >= ?`;
            params.push(fechaInicio);
        } else if (fechaFin) {
            where += ` AND g.fechemision <= ?`;
            params.push(fechaFin);
        }

        // Origen (para armar URL absoluta)
        const origin = `${req.protocol}://${req.get('host')}`;

        // Total
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(DISTINCT g.idguiasr) AS total
       FROM guiasr g
       ${where}`,
            params
        );

        // Datos (usamos path y también nombreImagen como fallback)
        const [guias] = await pool.query(
            `SELECT
          g.*,
          GROUP_CONCAT(DISTINCT gi.path)          AS gi_paths,
          GROUP_CONCAT(DISTINCT gi.nombreImagen)  AS gi_names
       FROM guiasr g
       LEFT JOIN guias_imagenes gi ON gi.idguia = g.idguiasr
       ${where}
       GROUP BY g.idguiasr
       ORDER BY g.fechacarga ASC
       LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        // Formateo de imágenes + remitos asociados
        for (const guia of guias) {
            const paths = guia.gi_paths ? guia.gi_paths.split(',') : [];
            const names = guia.gi_names ? guia.gi_names.split(',') : [];

            let imagenes = [];
            if (paths.length) {
                imagenes = paths
                    .filter(Boolean)
                    .map(p => toAbsolute(origin, p.trim()));
            } else if (names.length) {
                // Fallback: si no hay path, construyo con id + nombre
                imagenes = names
                    .filter(Boolean)
                    .map(n => toAbsolute(origin, `/uploads/guias/${guia.idguiasr}/${n.trim()}`));
            }
            guia.imagenes = imagenes;

            delete guia.gi_paths;
            delete guia.gi_names;

            // Remitos asociados a la guía (por número de guía)
            const [remitos] = await pool.query(
                `SELECT * FROM remitor WHERE guianr = ? ORDER BY fechacarga ASC`,
                [guia.nrguia]
            );
            guia.remitos_asociados = remitos || [];
        }

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            guias,
        });
    } catch (error) {
        console.error('❌ Error en obtenerControlGeneral:', error);
        res.status(500).json({ error: 'Error al obtener control general' });
    }
};

/* ===================== CONTROL GENERAL (REMITOS) ===================== */
exports.obtenerControlGeneralRemitos = async (req, res) => {
    try {
        // Paginación
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 30;
        const offset = (page - 1) * limit;

        // Filtros
        const filtroRemito = req.query.remito ? `%${req.query.remito}%` : '%';
        const filtroGuia = req.query.guia ? `%${req.query.guia}%` : '%';
        const fechaInicio = req.query.fechaInicio || null;
        const fechaFin = req.query.fechaFin || null;

        // WHERE
        let where = `WHERE r.nrremito LIKE ? AND r.guianr LIKE ?`;
        const params = [filtroRemito, filtroGuia];

        if (fechaInicio && fechaFin) {
            where += ` AND r.fechacarga BETWEEN ? AND ?`;
            params.push(fechaInicio, fechaFin);
        } else if (fechaInicio) {
            where += ` AND r.fechacarga >= ?`;
            params.push(fechaInicio);
        } else if (fechaFin) {
            where += ` AND r.fechacarga <= ?`;
            params.push(fechaFin);
        }

        // Total
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total
       FROM remitor r
       ${where}`,
            params
        );

        // Datos
        const [remitos] = await pool.query(
            `SELECT r.*
       FROM remitor r
       ${where}
       ORDER BY r.fechacarga ASC
       LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            remitos,
        });
    } catch (error) {
        console.error('❌ Error en obtenerControlGeneralRemitos:', error);
        res.status(500).json({ error: 'Error al obtener control general de remitos' });
    }
};
