const pool = require('../models/db');
const path = require('path');

exports.obtenerControlGeneral = async (req, res) => {
    try {
        // 📌 Parámetros de paginación
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        // 📌 Parámetros de filtro
        const filtroGuia = req.query.guia ? `%${req.query.guia}%` : '%';
        const filtroTitular = req.query.titular ? `%${req.query.titular}%` : '%';
        const fechaInicio = req.query.fechaInicio || null;
        const fechaFin = req.query.fechaFin || null;

        // 📌 URL base imágenes
        const baseUrl = `${req.protocol}://${req.get('host')}/uploads/guias`;

        // 📌 Construcción del WHERE dinámico
        let where = `WHERE g.nrguia LIKE ? AND g.titular LIKE ?`;
        let params = [filtroGuia, filtroTitular];

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

        // 📌 Contar total de registros para calcular paginación
        const [[{ total }]] = await pool.query(`
            SELECT COUNT(DISTINCT g.idguiasr) AS total
            FROM guiasr g
            ${where}
        `, params);

        // 📌 Obtener datos paginados
        const [guias] = await pool.query(`
            SELECT g.*, GROUP_CONCAT(DISTINCT gi.nombreImagen) AS imagenes
            FROM guiasr g
            LEFT JOIN guias_imagenes gi ON g.idguiasr = gi.idguia
            ${where}
            GROUP BY g.idguiasr
            ORDER BY g.fechacarga ASC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // 📌 Formatear datos
        for (const guia of guias) {
            // Convertir imágenes a array de URLs
            guia.imagenes = guia.imagenes
                ? guia.imagenes.split(',').map(img => `${baseUrl}/${img}`)
                : [];

            // Obtener remitos asociados
            const [remitos] = await pool.query(
                `SELECT * FROM remitor WHERE guianr = ? ORDER BY fechacarga ASC`,
                [guia.nrguia]
            );
            guia.remitos_asociados = remitos || [];
        }

        // 📌 Respuesta
        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            guias
        });

    } catch (error) {
        console.error('❌ Error en obtenerControlGeneral:', error);
        res.status(500).json({ error: 'Error al obtener control general' });
    }
};
// controllers/controlGeneral.controller.js

exports.obtenerControlGeneralRemitos = async (req, res) => {
    try {
        // 📌 Parámetros de paginación
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        // 📌 Filtros
        const filtroRemito = req.query.remito ? `%${req.query.remito}%` : '%';
        const filtroGuia = req.query.guia ? `%${req.query.guia}%` : '%';
        const fechaInicio = req.query.fechaInicio || null;
        const fechaFin = req.query.fechaFin || null;

        // 📌 WHERE dinámico
        let where = `WHERE r.nrremito LIKE ? AND r.guianr LIKE ?`;
        let params = [filtroRemito, filtroGuia];

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

        // 📌 Total para paginación
        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM remitor r
            ${where}
        `, params);

        // 📌 Datos paginados
        const [remitos] = await pool.query(`
            SELECT r.*
            FROM remitor r
            ${where}
            ORDER BY r.fechacarga ASC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // 📌 Respuesta
        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            remitos
        });

    } catch (error) {
        console.error('❌ Error en obtenerControlGeneralRemitos:', error);
        res.status(500).json({ error: 'Error al obtener control general de remitos' });
    }
};
