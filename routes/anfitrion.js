const express = require('express');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const db = require('../database');
const router = express.Router();

router.get('/panel', verificarToken, soloRoles('anfitrion', 'admin'), (req, res) => {
  res.json({ mensaje: `Bienvenido al panel del anfitrión: ${req.user.id}` });
});

// Listar alojamientos del anfitrión logueado
router.get('/alojamientos', verificarToken, soloRoles('anfitrion', 'admin'), (req, res) => {
  const anfitrionId = req.user.id;

  const isAdmin = req.user.rol === 'admin';

  const query = isAdmin
    ? `
      SELECT a.*, u.nombre AS anfitrion
      FROM alojamientos a
      JOIN usuarios u ON a.id_anfitrion = u.id
      ORDER BY a.id DESC
    `
    : `
      SELECT a.*, u.nombre AS anfitrion
      FROM alojamientos a
      JOIN usuarios u ON a.id_anfitrion = u.id
      WHERE a.id_anfitrion = ?
      ORDER BY a.id DESC
    `;

  const params = isAdmin ? [] : [anfitrionId];

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error obteniendo alojamientos del anfitrión.' });
    }

    res.json(rows);
  });
});

module.exports = router;
