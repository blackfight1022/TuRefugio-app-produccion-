const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');

function validarCalificacion(calificacion) {
  const valor = Number(calificacion);
  return Number.isInteger(valor) && valor >= 1 && valor <= 5;
}


// ======================================================
// CREAR RESEÑA
// Solo si el usuario tuvo una reserva FINALIZADA
// ======================================================
router.post('/', verificarToken, (req, res) => {

  const { id_alojamiento, calificacion, comentario } = req.body;

  if (!id_alojamiento || !calificacion) {
    return res.status(400).json({
      error: 'El alojamiento y la calificación son obligatorios.'
    });
  }

  if (!validarCalificacion(calificacion)) {
    return res.status(400).json({
      error: 'La calificación debe estar entre 1 y 5.'
    });
  }

  db.get(
    `SELECT r.id
     FROM reservas r
     JOIN habitaciones h ON r.id_habitacion = h.id
     WHERE r.id_usuario = ?
       AND h.id_alojamiento = ?
       AND r.estado = 'finalizada'`,
    [req.user.id, id_alojamiento],
    (err, reservaValida) => {

      if (err) {
        return res.status(500).json({ error: 'Error verificando reserva.' });
      }

      if (!reservaValida) {
        return res.status(403).json({
          error: 'Solo puedes reseñar alojamientos donde hayas completado una reserva.'
        });
      }

      db.get(
        `SELECT id FROM reseñas
         WHERE id_usuario = ? AND id_alojamiento = ?`,
        [req.user.id, id_alojamiento],
        (err, yaExiste) => {

          if (err) {
            return res.status(500).json({
              error: 'Error verificando reseña existente.'
            });
          }

          if (yaExiste) {
            return res.status(409).json({
              error: 'Ya has dejado una reseña para este alojamiento.'
            });
          }

          db.run(
            `INSERT INTO reseñas
             (id_usuario, id_alojamiento, calificacion, comentario)
             VALUES (?, ?, ?, ?)`,
            [req.user.id, id_alojamiento, calificacion, comentario || null],
            function (err) {

              if (err) {
                return res.status(500).json({
                  error: 'Error creando reseña.'
                });
              }

              db.get(
                `SELECT AVG(calificacion) AS promedio
                 FROM reseñas
                 WHERE id_alojamiento = ?`,
                [id_alojamiento],
                (err, resultado) => {

                  if (!err && resultado) {

                    const promedio = parseFloat(resultado.promedio || 0).toFixed(2);

                    db.run(
                      `UPDATE alojamientos
                       SET calificacion_promedio = ?
                       WHERE id = ?`,
                      [promedio, id_alojamiento]
                    );
                  }
                }
              );

              res.status(201).json({
                mensaje: 'Reseña creada correctamente.',
                reseña: {
                  id: this.lastID,
                  id_usuario: req.user.id,
                  id_alojamiento,
                  calificacion,
                  comentario
                }
              });
            }
          );
        }
      );
    }
  );
});


// ======================================================
// VER TODAS LAS RESEÑAS
// ======================================================
router.get('/', (req, res) => {

  db.all(
    `SELECT 
      r.id,
      r.calificacion,
      r.comentario,
      a.titulo AS alojamiento,
      u.nombre AS usuario
     FROM reseñas r
     JOIN alojamientos a ON r.id_alojamiento = a.id
     JOIN usuarios u ON r.id_usuario = u.id`,
    [],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo reseñas.'
        });
      }

      res.json(rows);
    }
  );
});


// ======================================================
// LISTAR RESEÑAS DE UN ALOJAMIENTO
// ======================================================
router.get('/alojamiento/:id', (req, res) => {

  db.all(
    `SELECT 
        r.calificacion,
        r.comentario,
        u.nombre AS usuario,
        u.correo AS correo_usuario,
        r.fecha
     FROM reseñas r
     JOIN usuarios u ON r.id_usuario = u.id
     WHERE r.id_alojamiento = ?
     ORDER BY datetime(r.fecha) DESC, r.id DESC`,
    [req.params.id],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo reseñas.'
        });
      }

      res.json(rows);
    }
  );
});

router.post('/validar-acceso', (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();

  if (!correo) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  db.get(
    `SELECT r.id, r.id_usuario, r.fecha_entrada, r.fecha_salida, r.estado,
            h.nombre AS habitacion, h.id_alojamiento, a.titulo AS alojamiento
     FROM reservas r
     JOIN habitaciones h ON h.id = r.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     WHERE LOWER(r.titular_correo) = ?
       AND (r.estado = 'finalizada' OR date(r.fecha_salida) < date('now'))
       AND COALESCE(r.resena_realizada, 0) = 0
     ORDER BY date(r.fecha_salida) DESC, r.id DESC
     LIMIT 1`,
    [correo],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error validando acceso a reseña.' });
      if (!row) return res.status(403).json({ error: 'No encontramos una estadía finalizada pendiente de reseña para este correo.' });

      return res.json({
        habilitado: true,
        reserva: {
          id: row.id,
          id_alojamiento: row.id_alojamiento,
          alojamiento: row.alojamiento,
          habitacion: row.habitacion,
          fecha_entrada: row.fecha_entrada,
          fecha_salida: row.fecha_salida
        }
      });
    }
  );
});

router.post('/publica', (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const idReserva = Number(req.body?.id_reserva || 0);
  const calificacion = Number(req.body?.calificacion || 0);
  const comentario = String(req.body?.comentario || '').trim();

  if (!correo || !validarCalificacion(calificacion)) {
    return res.status(400).json({ error: 'Datos incompletos para crear la reseña.' });
  }

  db.get(
    `SELECT r.id, r.id_usuario, h.id_alojamiento
     FROM reservas r
     JOIN habitaciones h ON h.id = r.id_habitacion
     WHERE LOWER(r.titular_correo) = ?
       AND (? = 0 OR r.id = ?)
       AND (r.estado = 'finalizada' OR date(r.fecha_salida) < date('now'))
       AND COALESCE(r.resena_realizada, 0) = 0
     ORDER BY date(r.fecha_salida) DESC, r.id DESC
     LIMIT 1`,
    [correo, idReserva, idReserva],
    (err, reservaValida) => {
      if (err) return res.status(500).json({ error: 'Error verificando reserva para reseña.' });
      if (!reservaValida) {
        return res.status(403).json({ error: 'No hay una reserva finalizada válida para este correo.' });
      }

      db.run(
        `INSERT INTO reseñas (id_usuario, id_alojamiento, calificacion, comentario)
         VALUES (?, ?, ?, ?)`,
        [reservaValida.id_usuario, reservaValida.id_alojamiento, calificacion, comentario || null],
        function(insertErr) {
          if (insertErr) return res.status(500).json({ error: 'Error creando reseña.' });

          db.run(`UPDATE reservas SET resena_realizada = 1, puede_resenar = 1 WHERE id = ?`, [reservaValida.id]);
          db.get(
            `SELECT AVG(calificacion) AS promedio FROM reseñas WHERE id_alojamiento = ?`,
            [reservaValida.id_alojamiento],
            (avgErr, promedioRow) => {
              if (!avgErr && promedioRow) {
                const promedio = parseFloat(promedioRow.promedio || 0).toFixed(2);
                db.run(`UPDATE alojamientos SET calificacion_promedio = ? WHERE id = ?`, [promedio, reservaValida.id_alojamiento]);
              }
            }
          );

          res.status(201).json({ mensaje: 'Reseña registrada correctamente.' });
        }
      );
    }
  );
});

module.exports = router;