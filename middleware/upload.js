const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../models/db'); // para consultar el número de guía

// Carpeta donde se guardarán las imágenes
const uploadDir = path.join(__dirname, '..', 'uploads', 'guias');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración del almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: async (req, file, cb) => {
    try {
      const idguia = req.params.idguia;

      // Buscar el número de guía y la fecha de carga en la BD
      const [rows] = await pool.query(
        `SELECT nrguia, DATE_FORMAT(NOW(), '%Y-%m-%d') as fecha_actual
         FROM guiasr
         WHERE idguiasr = ?`,
        [idguia]
      );

      let nombreBase = Date.now().toString(); // fallback

      if (rows.length > 0) {
        const guia = rows[0];
        nombreBase = `${guia.nrguia}_${guia.fecha_actual}`;
      }

      const ext = path.extname(file.originalname);
      cb(null, `${nombreBase}${ext}`);
    } catch (error) {
      console.error('Error generando nombre de archivo:', error);
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}${ext}`);
    }
  }
});

// Filtro para aceptar solo imágenes
const fileFilter = (req, file, cb) => {
  const valid = /jpeg|jpg|png/i.test(path.extname(file.originalname));
  if (valid) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (jpg, jpeg, png)'));
  }
};

module.exports = multer({ storage, fileFilter });
