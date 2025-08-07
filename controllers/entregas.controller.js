const pool = require('../models/db');
const nodemailer = require('nodemailer');
const axios = require('axios');

// Configurar SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'rodonimatiash@gmail.com',
        pass: 'iohkfhqkoqwymazl'
    }
});

exports.entregarTalonarios = async (req, res) => {
    const { guiaDesde, guiaHasta, remitoDesde, remitoHasta, iddelegacion, incluirGuias, incluirRemitos } = req.body;

    if (!iddelegacion || (!incluirGuias && !incluirRemitos)) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 🔎 Delegación
        const [[delegacion]] = await connection.query(
            'SELECT * FROM delegaciones WHERE iddelegacion = ?',
            [iddelegacion]
        );
        if (!delegacion) {
            return res.status(404).json({ error: 'Delegación no encontrada' });
        }

        // 📊 Guías previas sin emisión
        const [[{ cantidad_anteriores }]] = await connection.query(
            `SELECT COUNT(*) AS cantidad_anteriores 
       FROM guiasr g
       JOIN guias_delegaciones gd ON g.idguiasr = gd.idguia
       WHERE gd.iddelegacion = ? AND g.fechemision IS NULL`,
            [iddelegacion]
        );

        const guiasCreadas = [];
        const remitosCreados = [];

        // ✅ GUÍAS
        if (incluirGuias && guiaDesde && guiaHasta) {
            for (let nrguia = guiaDesde; nrguia <= guiaHasta; nrguia++) {
                const [guiaResult] = await connection.query(
                    `INSERT INTO guiasr (nrguia, fechacarga) VALUES (?, NOW())`,
                    [nrguia]
                );
                const idguia = guiaResult.insertId;

                await connection.query(
                    `INSERT INTO guias_delegaciones (idguia, iddelegacion) VALUES (?, ?)`,
                    [idguia, iddelegacion]
                );

                guiasCreadas.push(nrguia);
            }
        }

        // ✅ REMITOS usando tu API existente
        if (incluirRemitos && remitoDesde && remitoHasta) {
            for (let nrremito = remitoDesde; nrremito <= remitoHasta; nrremito++) {
                await axios.post(`http://localhost:3000/api/remitos/carga`, {
                    nrremito,
                    fechacarga: new Date(),
                    fechavencimiento: null,
                    guianr: null,
                    fechadevolucion: null,
                    devueltosn: 0
                });

                remitosCreados.push(nrremito);
            }
        }

        await connection.commit();

        // 📧 ENVIAR EMAIL
        const mailOptions = {
            from: '"Mesa de Entrada" <rodonimatiash@gmail.com>',
            to: delegacion.email,
            subject: `Entrega de talonarios a ${delegacion.nombre}`,
            html: `
        <p>Hola <b>${delegacion.nombre}</b>,</p>
        <p>Se han entregado los siguientes talonarios a su delegación:</p>
        <ul>
          ${guiasCreadas.length > 0 ? `<li>Guías entregadas: <b>${guiasCreadas.length}</b> (del ${guiaDesde} al ${guiaHasta})</li>` : ''}
          ${remitosCreados.length > 0 ? `<li>Remitos entregados: <b>${remitosCreados.length}</b> (del ${remitoDesde} al ${remitoHasta})</li>` : ''}
          <li>Guías anteriores sin emitir: <b>${cantidad_anteriores}</b></li>
          <li>Total de guías ahora pendientes: <b>${cantidad_anteriores + guiasCreadas.length}</b></li>
        </ul>
        <p>Por favor confirme la recepción.</p>
      `
        };

        await transporter.sendMail(mailOptions);

        res.json({
            message: 'Entrega registrada y correo enviado',
            guias: guiasCreadas,
            remitos: remitosCreados
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error en entrega de talonarios:', error);
        res.status(500).json({ error: 'Error al procesar la entrega' });
    } finally {
        connection.release();
    }
};
