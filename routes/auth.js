const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();

const SECRET = process.env.JWT_SECRET || '';
// ADVERTENCIA: Este archivo es legacy y no está montado en el servidor.

// REGISTRO DE USUARIO
router.post('/register', async (req, res) => {
  const { nombre, correo, contraseña, rol } = req.body;

  if (!nombre || !correo || !contraseña || !rol) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  // Verificar si el correo ya existe
  db.get('SELECT * FROM usuarios WHERE correo = ?', [correo], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos.' });
    if (user) return res.status(400).json({ error: 'Este correo ya está registrado.' });

    try {
      const hash = await bcrypt.hash(contraseña, 10);

      db.run(
        'INSERT INTO usuarios (nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?)',
        [nombre, correo, hash, rol],
        function (err) {
          if (err) return res.status(400).json({ error: 'No se pudo registrar el usuario.' });
          res.status(201).json({ mensaje: '✅ Registro exitoso. Ahora puedes iniciar sesión.', id: this.lastID });
        }
      );
    } catch (e) {
      res.status(500).json({ error: 'Error al encriptar la contraseña.' });
    }
  });
});

// INICIO DE SESIÓN
router.post('/login', (req, res) => {
  const { correo, contraseña } = req.body;

  if (!correo || !contraseña) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
  }

  db.get('SELECT * FROM usuarios WHERE correo = ?', [correo], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Error al buscar el usuario.' });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });

    const match = await bcrypt.compare(contraseña, user.contraseña);
    if (!match) return res.status(401).json({ error: 'Contraseña incorrecta.' });

    const token = jwt.sign({ id: user.id, rol: user.rol }, SECRET, { expiresIn: '2h' });
    res.json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      nombre: user.nombre,
      rol: user.rol
    });
  });
});

// ============================================
// RESTABLECIMIENTO DE CONTRASEÑA
// ============================================

// Almacenar códigos de reset temporales (en producción usar Redis o base de datos)
const codigosReset = new Map();

// PASO 1: SOLICITAR CÓDIGO DE RESET
router.post('/solicitar-reset', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  db.get('SELECT * FROM usuarios WHERE correo = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos.' });

    if (!user) {
      // No revelar si el usuario existe o no (seguridad)
      return res.json({
        mensaje: 'Si el correo existe, recibirás un código de verificación.',
        codigo: null // No devolver código si el usuario no existe
      });
    }

    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracion = Date.now() + 600000; // 10 minutos

    // Guardar el código temporalmente
    codigosReset.set(email, {
      codigo,
      expiracion,
      intentosFallidos: 0
    });

    // En producción, aquí iría el envío de email
    console.log(`📧 Código de reset para ${email}: ${codigo} (expira en 10 minutos)`);

    res.json({
      mensaje: 'Código enviado al correo. Expira en 10 minutos.',
      codigo // SOLO PARA TESTING - Remover en producción
    });
  });
});

// PASO 2: VERIFICAR CÓDIGO
router.post('/verificar-codigo', (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) {
    return res.status(400).json({ error: 'Email y código son obligatorios.' });
  }

  const resetData = codigosReset.get(email);

  if (!resetData) {
    return res.status(400).json({ error: 'No hay una solicitud de reset válida para este correo.' });
  }

  // Verificar expiración
  if (Date.now() > resetData.expiracion) {
    codigosReset.delete(email);
    return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
  }

  // Verificar código
  if (resetData.codigo !== codigo) {
    resetData.intentosFallidos++;
    if (resetData.intentosFallidos >= 3) {
      codigosReset.delete(email);
      return res.status(400).json({ error: 'Demasiados intentos fallidos. Solicita un código nuevo.' });
    }
    return res.status(400).json({ error: 'Código incorrecto.' });
  }

  // Código válido
  res.json({ mensaje: 'Código verificado correctamente.' });
});

// PASO 3: RESTABLECER CONTRASEÑA
router.post('/restablecer-contraseña', async (req, res) => {
  const { email, codigo, nuevaContraseña } = req.body;

  if (!email || !codigo || !nuevaContraseña) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  // Validar requisitos de contraseña
  if (nuevaContraseña.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  if (!/[A-Z]/.test(nuevaContraseña)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos una mayúscula.' });
  }

  if (!/[0-9]/.test(nuevaContraseña)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos un número.' });
  }

  if (!/[!@#$%^&*]/.test(nuevaContraseña)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos un carácter especial (!@#$%^&*).' });
  }

  const resetData = codigosReset.get(email);

  // Verificar que el código sea válido
  if (!resetData || resetData.codigo !== codigo) {
    return res.status(400).json({ error: 'Código de verificación inválido.' });
  }

  // Verificar expiración
  if (Date.now() > resetData.expiracion) {
    codigosReset.delete(email);
    return res.status(400).json({ error: 'El código ha expirado.' });
  }

  try {
    const hash = await bcrypt.hash(nuevaContraseña, 10);

    db.run(
      'UPDATE usuarios SET contraseña = ? WHERE correo = ?',
      [hash, email],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Error al actualizar la contraseña.' });
        }

        // Limpiar el código de reset
        codigosReset.delete(email);

        res.json({ mensaje: '✅ Contraseña restablecida correctamente. Ahora puedes iniciar sesión.' });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

module.exports = router;
