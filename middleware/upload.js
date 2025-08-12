// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const baseDir = path.join(__dirname, '..', 'uploads');
const tmpDir = path.join(baseDir, 'tmp');

for (const d of [baseDir, tmpDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// helper: slug para carpeta (San Vicente -> San_Vicente, sin acentos)
function slugifyFolder(s) {
  if (!s) return 'sin-delegacion';
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// crea /uploads/guias/<delegacion_slug>
function ensureDelegDir(delegacionNombre) {
  const slug = slugifyFolder(delegacionNombre);
  const dir = path.join(baseDir, 'guias', slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { dir, slug };
}

// === dejamos el storage en TMP y después movemos en el controller ===
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']); // amplíe si querés
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedExt.has(ext)) return cb(null, true);
  cb(new Error('Solo se permiten imágenes (jpg, jpeg, png, webp)'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

module.exports = { upload, ensureDelegDir, slugifyFolder };
