const db = require('../database'); // ajusta si tu ruta es distinta

const crearReserva = (req, res) => {
  const { id_habitacion, fecha_entrada, fecha_salida } = req.body;
  const id_usuario = req.user.id;

  // Validar campos
  if (!id_habitacion || !fecha_entrada || !fecha_salida) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const entrada = new Date(fecha_entrada);
  const salida = new Date(fecha_salida);

  if (entrada >= salida) {
    return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la de entrada.' });
  }

  const noches = Math.ceil((salida - entrada) / (1000 * 60 * 60 * 24));

  // Obtener precio de la habitación
  db.get(
    `SELECT precio FROM habitaciones WHERE id = ?`,
    [id_habitacion],
    (err, habitacion) => {
      if (err) return res.status(500).json({ error: 'Error consultando habitación.' });
      if (!habitacion) return res.status(404).json({ error: 'Habitación no encontrada.' });

      const precio_total = noches * habitacion.precio;

      // Validar solapamiento de reservas
      db.all(
        `SELECT * FROM reservas
         WHERE id_habitacion = ?
           AND estado IN ('pendiente','confirmada','en_curso')
           AND (
             (? BETWEEN fecha_entrada AND fecha_salida) OR
             (? BETWEEN fecha_entrada AND fecha_salida) OR
             (fecha_entrada BETWEEN ? AND ?) OR
             (fecha_salida BETWEEN ? AND ?)
           )`,
        [id_habitacion, fecha_entrada, fecha_salida, fecha_entrada, fecha_salida, fecha_entrada, fecha_salida],
        (err, reservasExistentes) => {
          if (err) return res.status(500).json({ error: 'Error validando disponibilidad.' });

          if (reservasExistentes.length > 0) {
            return res.status(409).json({
              error: 'La habitación ya está reservada en esas fechas.'
            });
          }

          // Insertar reserva
          db.run(
            `INSERT INTO reservas
             (id_habitacion, id_usuario, fecha_entrada, fecha_salida, precio_total, estado)
             VALUES (?, ?, ?, ?, ?, 'pendiente')`,
            [id_habitacion, id_usuario, fecha_entrada, fecha_salida, precio_total],
            function (err) {
              if (err) return res.status(500).json({ error: 'Error creando reserva.' });

              res.status(201).json({
                mensaje: 'Reserva creada exitosamente.',
                reserva: {
                  id: this.lastID,
                  id_habitacion,
                  id_usuario,
                  fecha_entrada,
                  fecha_salida,
                  noches,
                  precio_por_noche: habitacion.precio,
                  precio_total,
                  estado: 'pendiente'
                }
              });
            }
          );
        }
      );
    }
  );
};

module.exports = { crearReserva };