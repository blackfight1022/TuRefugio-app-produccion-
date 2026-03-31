const db = require('../database');

function verificarPropietarioHabitacion(req, res, next) {

  const habitacionId =
    req.params.id || req.params.habitacionId;

  db.get(`
    SELECT a.id_anfitrion
    FROM habitaciones h
    JOIN alojamientos a ON h.id_alojamiento = a.id
    WHERE h.id = ?
  `,
  [habitacionId],
  (err, row) => {

    if (err) {
      return res.status(500).json({ error: 'Error verificando permisos' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Habitación no encontrada' });
    }

    if (req.user.rol !== 'admin' &&
        row.id_anfitrion !== req.user.id) {
      return res.status(403).json({
        error: 'No tienes permiso'
      });
    }

    next();
  });
}

module.exports = verificarPropietarioHabitacion;