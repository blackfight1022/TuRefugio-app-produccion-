// ===============================
// CARGAR VARIABLES DE ENTORNO
// ===============================
require('dotenv').config();

// ===============================
// IMPORTACIONES
// ===============================
const express = require('express');
const cors = require('cors');
const path = require('path');

// ===============================
// RUTAS
// ===============================
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin');
const anfitrionRoutes = require('./routes/anfitrion');
const visitanteRoutes = require('./routes/visitante');
const alojamientosRoutes = require('./routes/alojamientos');
const habitacionesRoutes = require('./routes/habitaciones');
const reservasRoutes = require('./routes/reservas');
const resenasRoutes = require('./routes/resenas');
const imagenesRoutes = require('./routes/imagenes');

// NUEVAS RUTAS
const servicesRoutes = require('./routes/services.routes');
const paymentsRoutes = require('./routes/payments.routes');
const cancelacionesRoutes = require('./routes/cancelaciones');
const mensajesRoutes = require('./routes/mensajes');
const { procesarNotificacionesPendientes } = require('./services/notificaciones.service');

// ===============================
// INICIALIZACIÓN
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// MIDDLEWARES
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// 🔥 SERVIR ARCHIVOS ESTÁTICOS
// ===============================

// Acceso a uploads de imágenes
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Compatibilidad con rutas antiguas que aún piden /public/uploads/...
app.use('/public', express.static(path.join(__dirname, 'public')));

// Acceso general a public (para HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// ===============================
// RUTA BASE
// ===============================
app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'OK',
    mensaje: 'API Tu Refugio funcionando correctamente 🚀'
  });
});

// ===============================
// RUTAS PRINCIPALES DE API
// ===============================
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/anfitrion', anfitrionRoutes);
app.use('/api/visitante', visitanteRoutes);
app.use('/api/alojamientos', alojamientosRoutes);
app.use('/api/habitaciones', habitacionesRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/resenas', resenasRoutes);

// RUTA DE IMÁGENES
app.use('/api/imagenes', imagenesRoutes);

// NUEVAS FUNCIONALIDADES
app.use('/api/services', servicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/cancelaciones', cancelacionesRoutes);
app.use('/api/mensajes', mensajesRoutes);

// ===============================
// 🔥 RUTA DETALLES DE ALOJAMIENTO
// ===============================
app.get('/detalle/:id', (req, res) => {
  const { id } = req.params;

  // Se envía el HTML de detalles
  res.sendFile(path.join(__dirname, 'public/detalles_alojamiento/detalles.html'));
});

// ===============================
// RUTA NO ENCONTRADA
// ===============================
app.use((req, res) => {
  res.status(404).json({
    status: 'ERROR',
    mensaje: 'Ruta no encontrada'
  });
});

// ===============================
// MANEJO GLOBAL DE ERRORES
// ===============================
app.use((err, req, res, next) => {
  console.error('🔥 Error detectado:', err.message);

  res.status(500).json({
    status: 'ERROR',
    mensaje: 'Error interno del servidor'
  });
});

// ===============================
// INICIAR SERVIDOR
// ===============================
app.listen(PORT, () => {
  console.log(`
====================================
🚀 Servidor Tu Refugio activo
📍 http://localhost:${PORT}
📡 API: http://localhost:${PORT}/api
📸 Imágenes: http://localhost:${PORT}/uploads
====================================
  `);

  // Worker de notificaciones (email/whatsapp/sms) desde cola en BD
  const intervalMs = Number(process.env.NOTIFICATIONS_INTERVAL_MS || 30000);
  procesarNotificacionesPendientes({ limit: Number(process.env.NOTIFICATIONS_BATCH_SIZE || 20) })
    .then((r) => {
      if (r && !r.skipped) {
        console.log(`[notificaciones] inicio -> total:${r.total || 0} enviados:${r.enviados || 0} errores:${r.errores || 0}`);
      }
    })
    .catch((err) => console.error('[notificaciones] error inicio:', err.message));

  setInterval(async () => {
    try {
      const r = await procesarNotificacionesPendientes({ limit: Number(process.env.NOTIFICATIONS_BATCH_SIZE || 20) });
      if (r && !r.skipped && (r.total || 0) > 0) {
        console.log(`[notificaciones] ciclo -> total:${r.total} enviados:${r.enviados} errores:${r.errores}`);
      }
    } catch (err) {
      console.error('[notificaciones] error ciclo:', err.message);
    }
  }, Math.max(5000, intervalMs));
});