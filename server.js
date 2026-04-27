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
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi');
const {
  helmetConfig,
  corsConfig,
  limiteGeneral,
  limiteAuth,
  limiteReset,
  limiteUploads,
  sanitizarParametros,
  protegerUploads
} = require('./middlewares/seguridad.middleware');

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
const equipoRoutes = require('./routes/equipo.routes');
const panelChatRoutes = require('./routes/panel_chat');
const estadisticasRoutes = require('./routes/estadisticas');
const favoritosRoutes = require('./routes/favoritos');
const { procesarNotificacionesPendientes, procesarCampanasProgramadas } = require('./services/notificaciones.service');

// ===============================
// INICIALIZACIÓN
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// MIDDLEWARES DE SEGURIDAD
// ===============================
// 1. Oculta X-Powered-By y aplica HTTP security headers (CSP, HSTS, noSniff, etc.)
app.use(helmetConfig);

// 2. CORS restringido
app.use(cors(corsConfig));

// 3. Limita tamaño del payload (previene ataques de payload masivo)
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// 4. Rate limiting general sobre todas las rutas /api/*
app.use('/api/', limiteGeneral);

// 5. Sanitización de path traversal en params y query
app.use(sanitizarParametros);

// Evita que el panel administrativo se sirva desde caché del navegador tras cerrar sesión.
app.use((req, res, next) => {
  if (req.path === '/bienvenido_admin/b_admin.html' || req.path === '/bienvenido_admin/admin_alojamientos.html') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ===============================
// 🔥 SERVIR ARCHIVOS ESTÁTICOS
// ===============================

// Acceso a uploads de imágenes — con protección path traversal
const uploadsDir = path.join(__dirname, 'public/uploads');
app.use('/uploads', protegerUploads(uploadsDir), express.static(uploadsDir));

// Compatibilidad con rutas antiguas que aún piden /public/uploads/...
app.use('/public', express.static(path.join(__dirname, 'public')));

// Acceso general a public (para HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Frontend React (migracion progresiva) servido en /app para no romper el frontend legacy.
const reactDistDir = path.join(__dirname, 'frontend-react', 'dist');
const reactIndexFile = path.join(reactDistDir, 'index.html');

app.use('/app', express.static(reactDistDir, { index: false }));
app.get('/app', (req, res) => {
  if (!fs.existsSync(reactIndexFile)) {
    return res.status(503).send('Frontend React no compilado. Ejecuta: npm run react:build');
  }
  return res.sendFile(reactIndexFile);
});

app.get('/app/*splat', (req, res) => {
  if (!fs.existsSync(reactIndexFile)) {
    return res.status(503).send('Frontend React no compilado. Ejecuta: npm run react:build');
  }
  return res.sendFile(reactIndexFile);
});

// ===============================
// RUTA BASE
// ===============================
app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'OK',
    mensaje: 'API Tu Refugio funcionando correctamente 🚀'
  });
});

// Documentación automática OpenAPI/Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  explorer: true,
  customSiteTitle: 'Tu Refugio API Docs'
}));

app.get('/api/openapi.json', (req, res) => {
  res.status(200).json(openApiSpec);
});

// ===============================
// RUTAS PRINCIPALES DE API
// ===============================
// Rate limiting específico para autenticación y reset de contraseña
app.use('/api/auth/login', limiteAuth);
app.use('/api/auth/registro', limiteAuth);
app.use('/api/auth/login-admin', limiteAuth);
app.use('/api/auth/solicitar-reset', limiteReset);
app.use('/api/auth/verificar-codigo', limiteReset);

// Rate limiting para subida de archivos
app.use('/api/alojamientos', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') return limiteUploads(req, res, next);
  next();
});
app.use('/api/imagenes', (req, res, next) => {
  if (req.method === 'POST') return limiteUploads(req, res, next);
  next();
});

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
app.use('/api/equipo', equipoRoutes);
app.use('/api/panel-chat', panelChatRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/favoritos', favoritosRoutes);

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
  if (req.path === '/app' || req.path.startsWith('/app/')) {
    if (fs.existsSync(reactIndexFile)) {
      return res.sendFile(reactIndexFile);
    }
    return res.status(503).send('Frontend React no compilado. Ejecuta: npm run react:build');
  }

  res.status(404).json({
    status: 'ERROR',
    mensaje: 'Ruta no encontrada'
  });
});

// ===============================
// MANEJO GLOBAL DE ERRORES
// ===============================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Loguear internamente el error real sin exponerlo al cliente
  console.error('[error]', err.message || err);

  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Acceso denegado por política CORS.' });
  }

  // Error de rate limit (express-rate-limit lo envía por el handler, pero por si acaso)
  if (err.status === 429) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' });
  }

  // Error de payload demasiado grande
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado supera el tamaño permitido.' });
  }

  // NUNCA exponer stack trace, mensaje interno ni tipo de error al cliente
  res.status(500).json({
    error: 'Ocurrió un error procesando tu solicitud.'
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
  procesarCampanasProgramadas({ limit: Number(process.env.CAMPANAS_BATCH_SIZE || 10) })
    .catch((err) => console.error('[campanas] error inicio:', err.message));

  procesarNotificacionesPendientes({ limit: Number(process.env.NOTIFICATIONS_BATCH_SIZE || 20) })
    .then((r) => {
      if (r && !r.skipped) {
        console.log(`[notificaciones] inicio -> total:${r.total || 0} enviados:${r.enviados || 0} errores:${r.errores || 0}`);
      }
    })
    .catch((err) => console.error('[notificaciones] error inicio:', err.message));

  setInterval(async () => {
    try {
      const c = await procesarCampanasProgramadas({ limit: Number(process.env.CAMPANAS_BATCH_SIZE || 10) });
      if (c && (c.total || 0) > 0) {
        console.log(`[campanas] ciclo -> total:${c.total} encoladas:${c.encoladas} errores:${c.errores}`);
      }

      const r = await procesarNotificacionesPendientes({ limit: Number(process.env.NOTIFICATIONS_BATCH_SIZE || 20) });
      if (r && !r.skipped && (r.total || 0) > 0) {
        console.log(`[notificaciones] ciclo -> total:${r.total} enviados:${r.enviados} errores:${r.errores}`);
      }
    } catch (err) {
      console.error('[notificaciones] error ciclo:', err.message);
    }
  }, Math.max(5000, intervalMs));
});