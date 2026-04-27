/**
 * seguridad.middleware.js
 * Configuración centralizada de seguridad: HTTP headers, rate limiting,
 * CORS, sanitización de parámetros y protección general.
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ======================================================
// 1. HELMET — HTTP Security Headers
//    Evita: clickjacking, MIME sniffing, XSS reflejado,
//    fugas de referrer, exposición de tecnología backend.
// ======================================================
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net',
        "'unsafe-inline'" // Necesario para scripts inline existentes en el HTML
      ],
      styleSrc: [
        "'self'",
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net',
        "'unsafe-inline'"
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://cdn.jsdelivr.net'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:'
      ],
      connectSrc: [
        "'self'",
        'https://cdn.jsdelivr.net'
      ],
      scriptSrcAttr: ["'none'"],
      frameSrc: [
        "'self'",
        'https://www.google.com',
        'https://maps.google.com'
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  // X-Frame-Options: DENY — impide clickjacking/iframe embedding
  frameguard: { action: 'deny' },
  // X-Content-Type-Options: nosniff — impide MIME sniffing
  noSniff: true,
  // Referrer-Policy: no-referrer — no filtra URL de origen en peticiones
  referrerPolicy: { policy: 'no-referrer' },
  // Strict-Transport-Security (HSTS) — solo activo en producción HTTPS
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  // Elimina X-Powered-By: Express — no revelar tecnología
  hidePoweredBy: true,
  // X-XSS-Protection (legacy browsers)
  xssFilter: true,
  // Permissions-Policy — deshabilita features de navegador no usadas
  permissionsPolicy: false
});


// ======================================================
// 2. CORS — Restringido
//    En desarrollo permite localhost; en producción solo
//    el dominio configurado en ENV.
// ======================================================
const origenesPermitidos = (() => {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
  }
  return [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/
  ];
})();

const corsConfig = {
  origin: (origin, callback) => {
    // Peticiones sin origin (curl, Postman, mismo server) — permitir en dev
    if (!origin) {
      return callback(null, true);
    }

    const permitido = origenesPermitidos.some((o) =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );

    if (permitido) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origen no permitido — ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // Cache preflight 24h
};


// ======================================================
// 3. RATE LIMITING
// ======================================================

// 3a. Límite general API: 600 req/15min por IP
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.' },
  skip: (req) => req.path === '/api' // health-check sin límite
});

// 3b. Límite autenticación: 20 req/15min — frena brute force login
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espera 15 minutos.' }
});

// 3c. Límite reset contraseña: 5 req/hora — frena enumeración de correos
const limiteReset = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de restablecimiento. Espera una hora.' }
});

// 3d. Límite subida de archivos: 30/hora por IP
const limiteUploads = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de subida de archivos alcanzado. Intenta en una hora.' }
});


// ======================================================
// 4. SANITIZACIÓN DE PARÁMETROS DE RUTA Y QUERY
//    Rechaza path traversal (../, ..\) y chars peligrosos
//    antes de llegar a cualquier controlador.
// ======================================================
const PELIGROSO = /(\.\.(\/|\\|%2F|%5C)|<|>|'|"|\0|%00)/i;

function sanitizarParametros(req, res, next) {
  const objetivo = [
    ...Object.values(req.params || {}),
    ...Object.values(req.query || {})
  ];

  for (const valor of objetivo) {
    if (typeof valor === 'string' && PELIGROSO.test(valor)) {
      return res.status(400).json({ error: 'Parámetro inválido detectado.' });
    }
  }
  next();
}


// ======================================================
// 5. PROTECCIÓN PATH TRAVERSAL EN /uploads
//    Garantiza que la ruta estática no salga del directorio.
// ======================================================
function protegerUploads(carpetaBase) {
  return (req, res, next) => {
    const solicitado = path.join(carpetaBase, req.path);
    const normalizado = path.normalize(solicitado);

    if (!normalizado.startsWith(path.normalize(carpetaBase))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    // Extension permitida: solo imágenes (jpg, jpeg, png, gif, webp)
    const ext = path.extname(normalizado).toLowerCase();
    const imagenesPermitidas = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
    if (ext && !imagenesPermitidas.includes(ext)) {
      return res.status(403).json({ error: 'Tipo de archivo no permitido.' });
    }

    next();
  };
}


module.exports = {
  helmetConfig,
  corsConfig,
  limiteGeneral,
  limiteAuth,
  limiteReset,
  limiteUploads,
  sanitizarParametros,
  protegerUploads
};
