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

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('[SEGURIDAD] JWT_SECRET no está definido en las variables de entorno.');
}
const ADMIN_CODE_TTL_MS = 10 * 60 * 1000;
const ADMIN_CODE_MAX_ATTEMPTS = 5;
const adminLoginCodes = new Map();
const passwordResetCodes = new Map();

// Expresión regular para validar email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let adminMailer = null;

function getAdminMailer() {
  if (adminMailer) return adminMailer;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const rawPass = String(process.env.SMTP_PASS || '');
  const pass = String(host || '').toLowerCase().includes('gmail')
    ? rawPass.replace(/\s+/g, '')
    : rawPass.trim();

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

async function enviarCodigoResetPorCorreo(destinatario, codigo) {
  const mailer = getAdminMailer();
  if (!mailer) {
    throw new Error('SMTP no configurado para enviar el código de restablecimiento.');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await mailer.sendMail({
    from,
    to: destinatario,
    subject: 'Tu Refugio - Código para restablecer contraseña',
    text: `Tu código para restablecer contraseña es: ${codigo}. Este código expira en 10 minutos. Si no solicitaste este cambio, ignora este mensaje.`
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

function contraseñaCumpleReset(password) {
  const valor = String(password || '');
  return (
    valor.length >= 8 &&
    /[A-Z]/.test(valor) &&
    /\d/.test(valor) &&
    /[!@#$%^&*]/.test(valor)
  );
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
    `SELECT u.id, u.nombre, u.correo, u.contraseña, u.rol_id,
            COALESCE(u.es_superadmin, 0) AS es_superadmin,
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

      const esAdmin = String(user.rol_nombre || '').toLowerCase() === 'admin';
      const esSuperadmin = Number(user.es_superadmin || 0) === 1;
      if (!esAdmin || !esSuperadmin) {
        return res.status(403).json({ error: 'Solo el administrador de la plataforma puede iniciar sesión aquí.' });
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
    `SELECT u.id, u.nombre, u.correo, u.rol_id,
            COALESCE(u.es_superadmin, 0) AS es_superadmin,
            r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON u.rol_id = r.id
     WHERE u.id = ?`,
    [challenge.userId],
    (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error validando el usuario administrador.' });
      }

      const esAdmin = String(user?.rol_nombre || '').toLowerCase() === 'admin';
      const esSuperadmin = Number(user?.es_superadmin || 0) === 1;
      if (!user || !esAdmin || !esSuperadmin) {
        adminLoginCodes.delete(correo);
        return res.status(403).json({ error: 'Solo el administrador de la plataforma puede iniciar sesión aquí.' });
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
          rol: user.rol_nombre,
          es_superadmin: esSuperadmin ? 1 : 0
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
            COALESCE(u.es_superadmin, 0) AS es_superadmin,
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

      let rol = String(user.rol_nombre || '').toLowerCase();
      const estadoCuenta = String(user.estado_cuenta || 'activo').toLowerCase();
      const suspensionHasta = user.suspension_hasta ? new Date(user.suspension_hasta) : null;
      const suspensionVigente = estadoCuenta === 'suspendido' && (!suspensionHasta || suspensionHasta > new Date());
      let esSuperadmin = Number(user.es_superadmin || 0) === 1;

      // Si el usuario es miembro administrador de equipo, aseguramos su acceso al panel de administracion de alojamientos.
      const membresiaAdminEquipo = await new Promise((resolve, reject) => {
        db.get(
          `SELECT ea.id
           FROM equipo_alojamiento ea
           WHERE ea.id_usuario = ?
             AND LOWER(COALESCE(ea.rol, '')) = 'administrador'
             AND COALESCE(ea.estado, '') = 'activo'
           LIMIT 1`,
          [user.id],
          (mErr, row) => mErr ? reject(mErr) : resolve(row)
        );
      });

      if (membresiaAdminEquipo && rol !== 'admin') {
        const rolAdmin = await new Promise((resolve, reject) => {
          db.get(`SELECT id FROM roles WHERE nombre = 'admin'`, [], (rErr, row) => rErr ? reject(rErr) : resolve(row));
        });

        if (rolAdmin && rolAdmin.id) {
          await new Promise((resolve, reject) => {
            db.run(`UPDATE usuarios SET rol_id = ? WHERE id = ?`, [rolAdmin.id, user.id], (uErr) => uErr ? reject(uErr) : resolve());
          });
          rol = 'admin';
          user.rol_id = rolAdmin.id;
        }

        // Registrar asignaciones del admin a los anfitriones de sus alojamientos.
        const anfitrionesRelacionados = await new Promise((resolve, reject) => {
          db.all(
            `SELECT DISTINCT a.id_anfitrion
             FROM equipo_alojamiento ea
             JOIN alojamientos a ON a.id = ea.id_alojamiento
             WHERE ea.id_usuario = ?
               AND LOWER(COALESCE(ea.rol, '')) = 'administrador'
               AND COALESCE(ea.estado, '') = 'activo'`,
            [user.id],
            (aErr, rows) => aErr ? reject(aErr) : resolve(rows || [])
          );
        });

        for (const row of anfitrionesRelacionados) {
          await new Promise((resolve) => {
            db.run(
              `INSERT OR IGNORE INTO admin_anfitriones (admin_id, anfitrion_id, asignado_por)
               VALUES (?, ?, ?)`,
              [user.id, Number(row.id_anfitrion || 0), user.id],
              () => resolve()
            );
          });
        }
      }

      user.rol_nombre = rol;

      // Regla de negocio: visitante suspendido no puede ingresar a su panel.
      // El anfitrión suspendido sí puede ingresar para gestionar su cuenta.
      if (suspensionVigente && rol === 'visitante') {
        return res.status(403).json({
          error: 'Tu cuenta está suspendida temporalmente. No puedes ingresar al panel en este momento.'
        });
      }

      const token = crearTokenSesion(user);

      const panelDestino = rol === 'admin'
        ? (esSuperadmin ? '../bienvenido_admin/b_admin.html' : '../bienvenido_admin/admin_alojamientos.html')
        : (rol === 'anfitrion' ? '../anfitrion/anfitrion.html' : '../turista/turista.html');

      return res.json({
        mensaje: 'Inicio de sesión exitoso.',
        token,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          correo: user.correo,
          rol,
          es_superadmin: esSuperadmin ? 1 : 0,
          panel_destino: panelDestino
        },
        panel_destino: panelDestino
      });

    }
  );

});

// ======================================================
// RESTABLECIMIENTO DE CONTRASENA (UNICO PARA TODOS LOS ROLES)
// ======================================================
router.post('/solicitar-reset', (req, res) => {
  let { email } = req.body || {};
  email = String(email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Correo electronico invalido.' });
  }

  db.get(
    'SELECT id FROM usuarios WHERE correo = ?',
    [email],
    async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error en la base de datos.' });
      }

      if (!user) {
        return res.status(404).json({ error: 'No existe una cuenta registrada con ese correo.' });
      }

      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const expiracion = Date.now() + (10 * 60 * 1000);

      passwordResetCodes.set(email, {
        codigo,
        expiracion,
        intentosFallidos: 0
      });

      try {
        await enviarCodigoResetPorCorreo(email, codigo);
      } catch (mailErr) {
        console.error('[reset-password] error enviando correo:', mailErr.message);
        passwordResetCodes.delete(email);
        return res.status(500).json({
          error: 'No se pudo enviar el código al correo. Verifica la configuración SMTP e intenta de nuevo.'
        });
      }

      return res.json({
        mensaje: 'Codigo enviado al correo. Expira en 10 minutos.'
      });
    }
  );
});

router.post('/verificar-codigo', (req, res) => {
  let { email, codigo } = req.body || {};
  email = String(email || '').trim().toLowerCase();
  codigo = String(codigo || '').trim();

  if (!email || !codigo) {
    return res.status(400).json({ error: 'Email y codigo son obligatorios.' });
  }

  const resetData = passwordResetCodes.get(email);
  if (!resetData) {
    return res.status(400).json({ error: 'No hay solicitud de restablecimiento activa para ese correo.' });
  }

  if (Date.now() > Number(resetData.expiracion || 0)) {
    passwordResetCodes.delete(email);
    return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.' });
  }

  if (String(resetData.codigo) !== codigo) {
    resetData.intentosFallidos = Number(resetData.intentosFallidos || 0) + 1;

    if (resetData.intentosFallidos >= 3) {
      passwordResetCodes.delete(email);
      return res.status(400).json({ error: 'Demasiados intentos fallidos. Solicita un codigo nuevo.' });
    }

    return res.status(400).json({ error: 'Codigo incorrecto.' });
  }

  return res.json({ mensaje: 'Codigo verificado correctamente.' });
});

const restablecerContrasenaHandler = async (req, res) => {
  let { email, codigo, nuevaContraseña, nuevaContrasena } = req.body || {};
  email = String(email || '').trim().toLowerCase();
  codigo = String(codigo || '').trim();
  const passwordNueva = String(nuevaContrasena || nuevaContraseña || '');

  if (!email || !codigo || !passwordNueva) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  if (!contraseñaCumpleReset(passwordNueva)) {
    return res.status(400).json({
      error: 'La contraseña debe tener minimo 8 caracteres, una mayuscula, un numero y un caracter especial (!@#$%^&*).'
    });
  }

  const resetData = passwordResetCodes.get(email);
  if (!resetData) {
    return res.status(400).json({ error: 'No hay solicitud de restablecimiento activa para ese correo.' });
  }

  if (Date.now() > Number(resetData.expiracion || 0)) {
    passwordResetCodes.delete(email);
    return res.status(400).json({ error: 'El codigo ha expirado. Solicita uno nuevo.' });
  }

  if (String(resetData.codigo) !== codigo) {
    return res.status(400).json({ error: 'Codigo de verificacion invalido.' });
  }

  try {
    const hash = await bcrypt.hash(passwordNueva, 10);

    db.run(
      'UPDATE usuarios SET contraseña = ? WHERE correo = ?',
      [hash, email],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error al actualizar la contraseña.' });
        }

        passwordResetCodes.delete(email);
        return res.json({ mensaje: 'Contraseña restablecida correctamente.' });
      }
    );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
};

router.post('/restablecer-contrasena', restablecerContrasenaHandler);
router.post('/restablecer-contraseña', restablecerContrasenaHandler);


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
        db.get('SELECT contraseña AS contrasena_hash FROM usuarios WHERE id = ?', [req.user.id], (err, r) => {
          if (err) reject(err); else resolve(r);
        });
      });
      if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const coincide = await bcrypt.compare(String(contrasena_actual), row.contrasena_hash);
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
    ? `UPDATE usuarios SET nombre = ?, telefono = ?, direccion = ?, tipo_documento = ?, numero_documento = ?, contraseña = ? WHERE id = ?`
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