const express = require('express');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const router = express.Router();

router.get('/panel', verificarToken, soloRoles('visitante'), (req, res) => {
  res.json({ mensaje: `Bienvenido visitante: ${req.user.id}` });
});

module.exports = router;
