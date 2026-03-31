const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();

const SECRET = 'clave_super_segura';

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

module.exports = router;
