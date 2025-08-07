const express = require('express');
const cors = require('cors');
const path = require('path'); // 📌 Importar path
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
const remitosRoutes = require('./routes/remitos.routes');
const guiasRoutes = require('./routes/guias.routes');
const controlGeneralRoutes = require('./routes/controlGeneral.routes');
const entregasRoutes = require('./routes/entregas.routes');
const delegacionesRoutes = require('./routes/delegaciones.routes');

app.use('/api/remitos', remitosRoutes);
app.use('/api/guias', guiasRoutes);
app.use('/api/control-general', controlGeneralRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/delegaciones', delegacionesRoutes);


// 📌 Servir carpeta de imágenes como estática
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
