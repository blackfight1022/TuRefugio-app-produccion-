const db = require('../database');

const listarHabitacionesPorAlojamiento = (req, res) => {
  const { id_alojamiento } = req.params;

  db.all(
    `SELECT * FROM habitaciones WHERE id_alojamiento = ?`,
    [id_alojamiento],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Error obteniendo habitaciones' });
      }
      res.json(rows);
    }
  );
};

module.exports = { listarHabitacionesPorAlojamiento };