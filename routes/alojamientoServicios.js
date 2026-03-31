// controlador para agregar un servicio a un alojamiento
const express = require('express');
const router = express.Router();
const db = require('./db'); // tu conexión SQLite

router.post('/api/alojamientos/:id/servicios', (req, res) => {
  const id_alojamiento = parseInt(req.params.id);
  const { id_servicio } = req.body;

  if (!id_servicio) {
    return res.status(400).json({ error: 'Debes enviar id_servicio' });
  }

  // Validar que el alojamiento exista
  db.get(`SELECT * FROM alojamientos WHERE id = ?`, [id_alojamiento], (err, alojamiento) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado' });

    // Validar que el servicio exista
    db.get(`SELECT * FROM servicios WHERE id = ?`, [id_servicio], (err, servicio) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

      // Insertar en alojamiento_servicios
      db.run(
        `INSERT INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES (?, ?)`,
        [id_alojamiento, id_servicio],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(400).json({ error: 'El servicio ya está agregado a este alojamiento' });
            }
            return res.status(500).json({ error: err.message });
          }
          res.json({ message: 'Servicio agregado correctamente', id: this.lastID });
        }
      );
    });
  });
});

module.exports = router;