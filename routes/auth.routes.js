const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dns = require('dns');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../database');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'clave_super_segura';
const ADMIN_CODE_TTL_MS = 10 * 60 * 1000;
const ADMIN_CODE_MAX_ATTEMPTS = 5;
const adminLoginCodes = new Map();

// Expresión regular para validar email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let adminMailer = null;

function getAdminMailer() {
  if (adminMailer) return adminMailer;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  adminMailer = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
    }
  });

  return adminMailer;
}

async function enviarCodigoAdminPorCorreo(destinatario, codigo) {
  const mailer = getAdminMailer();
  if (!mailer) {
    throw new Error('SMTP no configurado para enviar el código de confirmación.');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await mailer.sendMail({
    from,
    to: destinatario,
    subject: 'Tu Refugio - Código de confirmación administrador',
    text: `Tu código de confirmación es: ${codigo}. Este código expira en 10 minutos.`
  });
}

function crearTokenSesion(user) {
  return jwt.sign(
    {
      id: user.id,
      rol_id: user.rol_id,
      rol: user.rol_nombre
    },
    SECRET,
    { expiresIn: '8h' }
  );
}

function contraseñaCumpleNivelMinimo(password) {
  const valor = String(password || '');
  let puntaje = 0;
  if (valor.length >= 8) puntaje += 1;
  if (/[A-Z]/.test(valor)) puntaje += 1;
  if (/[a-z]/.test(valor)) puntaje += 1;
  if (/\d/.test(valor)) puntaje += 1;
  if (/[^A-Za-z0-9]/.test(valor)) puntaje += 1;
  if (!/\s/.test(valor)) puntaje += 1;
  return puntaje >= 5;
}

const documentosDir = path.join(__dirname, '../public/uploads/documentos');
if (!fs.existsSync(documentosDir)) {
  fs.mkdirSync(documentosDir, { recursive: true });
}

const documentosStorage = multer.diskStorage({
  destination: documentosDir,
  filename: (req, file, cb) => {
    const safeName = String(file.originalname || 'documento')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const uploadDocumentos = multer({
  storage: documentosStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ];

    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Formato de archivo no permitido. Usa JPG, PNG, WEBP o PDF.'));
    }

    cb(null, true);
  }
});


// ======================================================
// OBTENER USUARIO POR ID (PÚBLICO PARA DETALLES)
// ======================================================
router.get('/usuarios/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT nombre, correo, telefono, direccion FROM usuarios WHERE id = ?',
    [id],
    (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error en la base de datos.' });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      res.json(user);
    }
  );
});
router.post('/register', uploadDocumentos.fields([
  { name: 'documentoFrontal', maxCount: 1 },
  { name: 'documentoTrasero', maxCount: 1 },
  { name: 'certificadoNit', maxCount: 1 }
]), async (req, res) => {
  try {

    let {
      nombre,
      correo,
      contraseña,
      telefono,
      direccion,
      rol,
      tipo_persona,
      tipo_documento,
      numero_documento,
      razon_social
    } = req.body;

    const documentoFrontal = req.files?.documentoFrontal?.[0];
    const documentoTrasero = req.files?.documentoTrasero?.[0];
    const certificadoNit = req.files?.certificadoNit?.[0];

    // Limpiar espacios
    nombre = nombre?.trim();
    correo = correo?.trim().toLowerCase();
    contraseña = contraseña?.trim();
    telefono = telefono?.trim();
    direccion = direccion?.trim();
    rol = rol?.trim();
    tipo_persona = tipo_persona?.trim().toLowerCase();
    tipo_documento = tipo_documento?.trim().toUpperCase();
    numero_documento = numero_documento?.trim();
    razon_social = razon_social?.trim();

    // Validar campos obligatorios
    if (!nombre || !correo || !contraseña || !rol) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (!contraseñaCumpleNivelMinimo(contraseña)) {
      return res.status(400).json({
        error: 'La contraseña es insegura. Debe incluir mínimo 8 caracteres, mayúscula, minúscula, número y símbolo, sin espacios.'
      });
    }

    // Validar formato de correo
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ error: 'Correo electrónico inválido.' });
    }

    // Verificar que el dominio del correo tenga registros MX (puede recibir emails)
    const domCorreo = correo.split('@')[1];
    try {
      const mxRecords = await dns.promises.resolveMx(domCorreo);
      if (!mxRecords || mxRecords.length === 0) {
        return res.status(400).json({
          error: 'El dominio del correo no puede recibir emails. Usa una dirección de correo real.'
        });
      }
    } catch (_dnsErr) {
      return res.status(400).json({
        error: 'El dominio del correo no existe o no acepta correos electrónicos. Verifica la dirección ingresada.'
      });
    }

    // Validar teléfono si fue enviado
    if (telefono) {
      const soloDigitosTel = telefono.replace(/\D/g, '');
      const secuenciasFalsas = ['1234567', '12345678', '123456789', '1234567890', '0123456789'];
      if (/[^0-9+\s\-()]/.test(telefono)) {
        return res.status(400).json({ error: 'El teléfono contiene caracteres no válidos.' });
      }
      if (soloDigitosTel.length < 7 || soloDigitosTel.length > 15) {
        return res.status(400).json({ error: 'El teléfono debe tener entre 7 y 15 dígitos.' });
      }
      if (/^(\d)\1+$/.test(soloDigitosTel) || secuenciasFalsas.includes(soloDigitosTel)) {
        return res.status(400).json({ error: 'El número de teléfono no parece real.' });
      }
    }

    if (rol === 'anfitrion') {
      if (!tipo_persona || !['natural', 'empresa'].includes(tipo_persona)) {
        return res.status(400).json({ error: 'Debes indicar si el anfitrión se registra como persona natural o empresa.' });
      }

      if (!numero_documento) {
        return res.status(400).json({ error: 'Debes ingresar el número de documento o NIT.' });
      }

      if (tipo_persona === 'natural') {
        if (!tipo_documento) {
          return res.status(400).json({ error: 'Debes seleccionar el tipo de documento de identidad.' });
        }

        if (!documentoFrontal || !documentoTrasero) {
          return res.status(400).json({ error: 'Debes cargar la cédula por ambas caras.' });
        }
      }

      if (tipo_persona === 'empresa') {
        if (!razon_social) {
          return res.status(400).json({ error: 'Debes ingresar la razón social de la empresa.' });
        }

        if (!certificadoNit) {
          return res.status(400).json({ error: 'Debes cargar el certificado del NIT de la empresa.' });
        }

        if (!tipo_documento) {
          tipo_documento = 'NIT';
        }
      }
    }

    // Verificar que el rol exista
    db.get(
      'SELECT id FROM roles WHERE nombre = ?',
      [rol],
      async (err, rolEncontrado) => {

        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error verificando rol.' });
        }

        if (!rolEncontrado) {
          return res.status(400).json({ error: 'Rol inválido.' });
        }

        // Verificar si el correo ya está registrado
        db.get(
          'SELECT id FROM usuarios WHERE correo = ?',
          [correo],
          async (err, user) => {

            if (err) {
              console.error(err);
              return res.status(500).json({ error: 'Error en la base de datos.' });
            }

            if (user) {
              return res.status(409).json({ error: 'Este correo ya está registrado.' });
            }

            // Encriptar contraseña
            const hash = await bcrypt.hash(contraseña, 10);

            // Insertar usuario
            db.run(
              `INSERT INTO usuarios (
                nombre,
                correo,
                contraseña,
                telefono,
                direccion,
                tipo_persona,
                tipo_documento,
                numero_documento,
                razon_social,
                documento_frontal,
                documento_trasero,
                certificado_empresa,
                verificacion_documental_estado,
                rol_id
              )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                nombre,
                correo,
                hash,
                telefono,
                direccion,
                tipo_persona || null,
                tipo_documento || null,
                numero_documento || null,
                razon_social || null,
                documentoFrontal ? `/uploads/documentos/${path.basename(documentoFrontal.path)}` : null,
                documentoTrasero ? `/uploads/documentos/${path.basename(documentoTrasero.path)}` : null,
                certificadoNit ? `/uploads/documentos/${path.basename(certificadoNit.path)}` : null,
                rol === 'anfitrion' ? 'pendiente_revision' : 'aprobado',
                rolEncontrado.id
              ],
              function (err) {

                if (err) {
                  console.error(err);
                  return res.status(500).json({ error: 'No se pudo registrar el usuario.' });
                }

                return res.status(201).json({
                  mensaje: 'Registro exitoso.',
                  usuario: {
                    id: this.lastID,
                    nombre,
                    correo,
                    rol,
                    tipo_persona: tipo_persona || null
                  }
                });

              }
            );
          }
        );
      }
    );

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});


// ======================================================
// LOGIN
// ======================================================
router.post('/admin/request-code', async (req, res) => {
  let { correo, contraseña } = req.body || {};

  correo = String(correo || '').trim().toLowerCase();
  contraseña = String(contraseña || '').trim();

  if (!correo || !contraseña) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  db.get(
    `SELECT u.id, u.nombre, u.correo, u.contraseña, u.rol_id, r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.correo = ?`,
    [correo],
    async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al buscar el usuario.' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado.' });
      }

      if (String(user.rol_nombre || '').toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Esta cuenta no tiene permisos de administrador.' });
      }

      const match = await bcrypt.compare(contraseña, user.contraseña);
      if (!match) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }

      const codigo = String(crypto.randomInt(100000, 1000000));
      const expiraEn = Date.now() + ADMIN_CODE_TTL_MS;

      adminLoginCodes.set(correo, {
        codigo,
        userId: user.id,
        expiraEn,
        intentos: 0
      });

      try {
        await enviarCodigoAdminPorCorreo(correo, codigo);
      } catch (mailErr) {
        console.error(mailErr);
        adminLoginCodes.delete(correo);
        return res.status(500).json({ error: 'No se pudo enviar el código al correo del administrador.' });
      }

      return res.json({
        mensaje: 'Se envió un código de confirmación al correo del administrador.',
        expira_en_minutos: 10
      });
    }
  );
});

router.post('/admin/verify-code', (req, res) => {
  let { correo, codigo } = req.body || {};

  correo = String(correo || '').trim().toLowerCase();
  codigo = String(codigo || '').trim();

  if (!correo || !codigo) {
    return res.status(400).json({ error: 'Correo y código son requeridos.' });
  }

  const challenge = adminLoginCodes.get(correo);
  if (!challenge) {
    return res.status(400).json({ error: 'No hay un código activo para este correo. Solicita uno nuevo.' });
  }

  if (Date.now() > challenge.expiraEn) {
    adminLoginCodes.delete(correo);
    return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
  }

  if (challenge.codigo !== codigo) {
    challenge.intentos += 1;
    if (challenge.intentos >= ADMIN_CODE_MAX_ATTEMPTS) {
      adminLoginCodes.delete(correo);
      return res.status(401).json({ error: 'Código incorrecto. Se agotaron los intentos y debes solicitar uno nuevo.' });
    }
    adminLoginCodes.set(correo, challenge);
    return res.status(401).json({ error: 'Código incorrecto.' });
  }

  db.get(
    `SELECT u.id, u.nombre, u.correo, u.rol_id, r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.id = ?`,
    [challenge.userId],
    (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error validando el usuario administrador.' });
      }

      if (!user || String(user.rol_nombre || '').toLowerCase() !== 'admin') {
        adminLoginCodes.delete(correo);
        return res.status(403).json({ error: 'La cuenta ya no tiene permisos de administrador.' });
      }

      const token = crearTokenSesion(user);
      adminLoginCodes.delete(correo);

      return res.json({
        mensaje: 'Código verificado. Inicio de sesión exitoso.',
        token,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          correo: user.correo,
          rol: user.rol_nombre
        }
      });
    }
  );
});

router.post('/login', (req, res) => {

  let { correo, contraseña } = req.body;

  // Limpiar espacios
  correo = correo?.trim().toLowerCase();
  contraseña = contraseña?.trim();

  // Validar campos
  if (!correo || !contraseña) {
    return res.status(400).json({
      error: 'Correo y contraseña son requeridos.'
    });
  }

  db.get(
    `SELECT u.id, u.nombre, u.correo, u.contraseña, u.rol_id,
            COALESCE(u.estado_cuenta, 'activo') AS estado_cuenta,
            u.suspension_hasta,
            r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.correo = ?`,
    [correo],
    async (err, user) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al buscar el usuario.' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado.' });
      }

      const match = await bcrypt.compare(contraseña, user.contraseña);

      if (!match) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }

      const rol = String(user.rol_nombre || '').toLowerCase();
      const estadoCuenta = String(user.estado_cuenta || 'activo').toLowerCase();
      const suspensionHasta = user.suspension_hasta ? new Date(user.suspension_hasta) : null;
      const suspensionVigente = estadoCuenta === 'suspendido' && (!suspensionHasta || suspensionHasta > new Date());

      // Regla de negocio: un turista o anfitrión suspendido no puede ingresar a su panel.
      if (suspensionVigente && (rol === 'visitante' || rol === 'anfitrion')) {
        return res.status(403).json({
          error: 'Tu cuenta está suspendida temporalmente. No puedes ingresar al panel en este momento.'
        });
      }

      const token = crearTokenSesion(user);

      return res.json({
        mensaje: 'Inicio de sesión exitoso.',
        token,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          correo: user.correo,
          rol: user.rol_nombre
        }
      });

    }
  );

});


// ======================================================
// OBTENER USUARIO AUTENTICADO
// ======================================================
router.get('/me', verificarToken, (req, res) => {

  db.get(
    `SELECT u.id, u.nombre, u.correo, u.telefono, u.direccion, u.tipo_documento, u.numero_documento, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.id = ?`,
    [req.user.id],
    (err, user) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error obteniendo usuario.' });
      }

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      res.json(user);

    }
  );

});

// ======================================================
// ACTUALIZAR PERFIL DE USUARIO AUTENTICADO
// ======================================================
router.put('/me', verificarToken, async (req, res) => {
  let {
    nombre,
    telefono,
    direccion,
    tipo_documento,
    numero_documento,
    contrasena_actual,
    contrasena_nueva
  } = req.body || {};

  nombre = String(nombre || '').trim();
  telefono = String(telefono || '').trim();
  direccion = String(direccion || '').trim();
  tipo_documento = String(tipo_documento || '').trim().toUpperCase();
  numero_documento = String(numero_documento || '').trim();

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  // Manejo opcional de cambio de contraseña
  let hashedNueva = null;
  if (contrasena_actual || contrasena_nueva) {
    if (!contrasena_actual || !contrasena_nueva) {
      return res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva.' });
    }
    if (String(contrasena_nueva).length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }
    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT contrasena FROM usuarios WHERE id = ?', [req.user.id], (err, r) => {
          if (err) reject(err); else resolve(r);
        });
      });
      if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const coincide = await bcrypt.compare(String(contrasena_actual), row.contrasena);
      if (!coincide) {
        return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
      }
      hashedNueva = await bcrypt.hash(String(contrasena_nueva), 10);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Error al verificar la contraseña.' });
    }
  }

  const sql = hashedNueva
    ? `UPDATE usuarios SET nombre = ?, telefono = ?, direccion = ?, tipo_documento = ?, numero_documento = ?, contrasena = ? WHERE id = ?`
    : `UPDATE usuarios SET nombre = ?, telefono = ?, direccion = ?, tipo_documento = ?, numero_documento = ? WHERE id = ?`;

  const params = hashedNueva
    ? [nombre, telefono || null, direccion || null, tipo_documento || null, numero_documento || null, hashedNueva, req.user.id]
    : [nombre, telefono || null, direccion || null, tipo_documento || null, numero_documento || null, req.user.id];

  db.run(sql, params, function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'No se pudo actualizar el perfil.' });
    }

    db.get(
      `SELECT u.id, u.nombre, u.correo, u.telefono, u.direccion, u.tipo_documento, u.numero_documento, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ?`,
      [req.user.id],
      (getErr, user) => {
        if (getErr) {
          console.error(getErr);
          return res.status(500).json({ error: 'Perfil actualizado, pero no se pudo recargar la información.' });
        }
        res.json({ mensaje: 'Perfil actualizado correctamente.', usuario: user });
      }
    );
  });
});


// ======================================================
// OBTENER TODOS LOS USUARIOS (SOLO ADMIN)
// ======================================================
router.get(
  '/usuarios',
  verificarToken,
  soloRoles('admin'),
  (req, res) => {

    db.all(
      `SELECT u.id, u.nombre, u.correo, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id`,
      [],
      (err, rows) => {

        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error obteniendo usuarios.' });
        }

        res.json(rows);

      }
    );

  }
);

module.exports = router;