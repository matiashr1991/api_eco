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
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = (page - 1) * limit;

    // Filtros (mantengo tu lógica original)
    const filtroGuia    = req.query.guia    ? `%${req.query.guia}%`       : '%';
    const filtroTitular = req.query.titular ? `%${req.query.titular}%`    : '%';
    const fechaInicio   = req.query.fechaInicio || null;
    const fechaFin      = req.query.fechaFin    || null;

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
      `SELECT COUNT(*) AS total
         FROM guiasr g
        ${where}`,
      params
    );

    // Para evitar ONLY_FULL_GROUP_BY, hago los agregados en subconsultas y luego JOIN
    // - gi_agg: paths y nombres por idguia
    // - rcount: cantidad de remitos por nrguia (vista rápida)
    const sql = `
      SELECT
        g.*,
        gi_agg.gi_paths,
        gi_agg.gi_names,
        COALESCE(rcount.cnt, 0) AS remitos_count
      FROM guiasr g
      LEFT JOIN (
        SELECT
          idguia,
          GROUP_CONCAT(DISTINCT path)          AS gi_paths,
          GROUP_CONCAT(DISTINCT nombreImagen)  AS gi_names
        FROM guias_imagenes
        GROUP BY idguia
      ) AS gi_agg ON gi_agg.idguia = g.idguiasr
      LEFT JOIN (
        SELECT guianr, COUNT(*) AS cnt
        FROM remitor
        GROUP BY guianr
      ) AS rcount ON rcount.guianr = g.nrguia
      ${where}
      ORDER BY g.fechacarga ASC
      LIMIT ? OFFSET ?`;

    const [rows] = await pool.query(sql, [...params, limit, offset]);

    // Formateo de imágenes + remitos asociados (como hacías)
    // Para no hacer N+1 queries, junto todos los nrguia visibles y traigo sus remitos de una sola vez.
    const nrSet = new Set();
    for (const r of rows) {
      if (r.nrguia != null) nrSet.add(r.nrguia);
    }
    let remitosByGuia = new Map();
    if (nrSet.size) {
      const nrList = Array.from(nrSet);
      // Evito IN vacío; si hay muchos, se podría trocear, pero paginando no debería explotar
      const placeholders = nrList.map(() => '?').join(',');
      const [remitosAll] = await pool.query(
        `SELECT idremitor, nrremito, fechacarga, guianr, iddelegacion, devueltosn
           FROM remitor
          WHERE guianr IN (${placeholders})
          ORDER BY fechacarga ASC`,
        nrList
      );
      remitosByGuia = remitosAll.reduce((acc, r) => {
        const key = r.guianr ?? '__null__';
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push(r);
        return acc;
      }, new Map());
    }

    // Normalizo salida como vos la esperás
    const guias = rows.map((g) => {
      const paths = g.gi_paths ? String(g.gi_paths).split(',') : [];
      const names = g.gi_names ? String(g.gi_names).split(',') : [];
      let imagenes = [];
      if (paths.length) {
        imagenes = paths.filter(Boolean).map(p => toAbsolute(origin, p.trim()));
      } else if (names.length) {
        imagenes = names
          .filter(Boolean)
          .map(n => toAbsolute(origin, `/uploads/guias/${g.idguiasr}/${n.trim()}`));
      }
      // Remitos asociados (del prefetch)
      const remitos = remitosByGuia.get(g.nrguia ?? '__null__') || [];

      // Limpieza de campos auxiliares
      delete g.gi_paths;
      delete g.gi_names;

      return {
        ...g,
        imagenes,
        remitos_asociados: remitos
      };
    });

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
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = (page - 1) * limit;

    // Filtros
    const filtroRemito = req.query.remito ? `%${req.query.remito}%` : '%';
    const filtroGuia   = req.query.guia   ? `%${req.query.guia}%`   : '%';
    const fechaInicio  = req.query.fechaInicio || null;
    const fechaFin     = req.query.fechaFin    || null;

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
