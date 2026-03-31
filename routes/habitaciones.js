const multer = require('multer');
const path = require('path');
const express = require('express');
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');
const verificarPropietarioHabitacion =
  require('../middlewares/verificarPropietarioHabitacion');
const router = express.Router();



const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });


// ======================================================
// CREAR HABITACIÓN
// ======================================================
router.post('/:alojamientoId', verificarToken, (req, res) => {
  const { nombre, capacidad, precio } = req.body;
  const { alojamientoId } = req.params;

  if (!nombre || !capacidad || !precio) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  db.get(
    'SELECT * FROM alojamientos WHERE id = ?',
    [alojamientoId],
    (err, alojamiento) => {
      if (err) return res.status(500).json({ error: 'Error verificando alojamiento.' });
      if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });
      if (req.user.rol !== 'admin' && alojamiento.id_anfitrion !== req.user.id) {
        return res.status(403).json({ error: 'No tienes permiso para agregar habitaciones aquí.' });
      }

      db.run(
        'INSERT INTO habitaciones (nombre, capacidad, precio, estado_manual, id_alojamiento) VALUES (?, ?, ?, ?, ?)',
        [nombre, capacidad, precio, 'disponible', alojamientoId],
        function (err) {
          if (err) return res.status(500).json({ error: 'Error creando habitación.' });
          res.status(201).json({ mensaje: 'Habitación creada correctamente.', id: this.lastID });
        }
      );
    }
  );
});

// ======================================================
// LISTAR HABITACIONES
// ======================================================
router.get('/alojamiento/:alojamientoId', (req, res) => {
  db.all(
    `SELECT
      h.*,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM reservas r
          WHERE r.id_habitacion = h.id
            AND r.estado IN ('pendiente','confirmada','en_curso')
            AND date(r.fecha_salida) >= date('now')
        ) THEN 'ocupada'
        WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento' THEN 'mantenimiento'
        ELSE 'disponible'
      END AS estado
     FROM habitaciones h
     WHERE h.id_alojamiento = ?`,
    [req.params.alojamientoId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo habitaciones.' });
      res.json(rows);
    }
  );
});

router.get('/mis-alojamiento/:alojamientoId', verificarToken, (req, res) => {
  const alojamientoId = Number(req.params.alojamientoId || 0);
  if (!alojamientoId) {
    return res.status(400).json({ error: 'ID de alojamiento invalido.' });
  }

  db.get(
    `SELECT id, id_anfitrion FROM alojamientos WHERE id = ?`,
    [alojamientoId],
    (checkErr, alojamiento) => {
      if (checkErr) return res.status(500).json({ error: 'Error verificando alojamiento.' });
      if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

      if (req.user.rol !== 'admin' && Number(alojamiento.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para ver habitaciones de este alojamiento.' });
      }

      db.all(
        `SELECT
          h.*,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM reservas r
              WHERE r.id_habitacion = h.id
                AND r.estado IN ('pendiente','confirmada','en_curso')
                AND date(r.fecha_salida) >= date('now')
            ) THEN 'ocupada'
            WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento' THEN 'mantenimiento'
            ELSE 'disponible'
          END AS estado
         FROM habitaciones h
         WHERE h.id_alojamiento = ?`,
        [alojamientoId],
        (listErr, rows) => {
          if (listErr) return res.status(500).json({ error: 'Error obteniendo habitaciones.' });
          res.json(rows || []);
        }
      );
    }
  );
});

router.put('/:id/estado', verificarToken, (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const estadoNormalizado = String(estado || '').trim().toLowerCase();

  if (!['disponible', 'mantenimiento'].includes(estadoNormalizado)) {
    return res.status(400).json({ error: 'Estado invalido. Usa disponible o mantenimiento.' });
  }

  db.get(
    `SELECT h.id, a.id_anfitrion
     FROM habitaciones h
     JOIN alojamientos a ON a.id = h.id_alojamiento
     WHERE h.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error verificando habitación.' });
      if (!row) return res.status(404).json({ error: 'Habitación no encontrada.' });

      if (req.user.rol !== 'admin' && Number(row.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para cambiar el estado de esta habitación.' });
      }

      db.run(
        `UPDATE habitaciones SET estado_manual = ? WHERE id = ?`,
        [estadoNormalizado, id],
        function(updateErr) {
          if (updateErr) return res.status(500).json({ error: 'Error actualizando el estado de la habitación.' });
          res.json({ mensaje: 'Estado actualizado correctamente.', estado: estadoNormalizado });
        }
      );
    }
  );
});

// ======================================================
// ASIGNAR SERVICIO (🔥 CORREGIDO)
// ======================================================
router.post('/:id/servicios', verificarToken, (req, res) => {
  const { id } = req.params;
  const { id_servicio } = req.body;

  if (!id_servicio) {
    return res.status(400).json({ error: 'Debes enviar el id del servicio.' });
  }

  // validar habitacion
  db.get('SELECT * FROM habitaciones WHERE id = ?', [id], (err, habitacion) => {
    if (err) return res.status(500).json({ error: 'Error verificando habitación.' });
    if (!habitacion) return res.status(404).json({ error: 'Habitación no encontrada.' });

    // validar servicio existente
    db.get('SELECT * FROM servicios WHERE id = ?', [id_servicio], (err2, servicio) => {
      if (err2) return res.status(500).json({ error: 'Error verificando servicio.' });
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });

      // validar si ya existe rapido en la tabla relacional
      db.get(
        'SELECT * FROM habitacion_servicios WHERE id_habitacion = ? AND id_servicio = ?',
        [id, id_servicio],
        (err3, existe) => {
          if (err3) {
            return res.status(500).json({ error: 'Error verificando servicio asignado.' });
          }

          if (existe) {
            return res.status(200).json({ mensaje: '⚠️ Este servicio ya está asignado a esta habitación.' });
          }

          db.run(
            'INSERT INTO habitacion_servicios (id_habitacion, id_servicio) VALUES (?, ?)',
            [id, id_servicio],
            function (err4) {
              if (err4) {
                console.error('DB error al asignar habitacion_servicio:', err4);
                return res.status(500).json({ error: 'Error asignando servicio a la habitación.' });
              }
              res.status(201).json({ mensaje: 'Servicio asignado correctamente.' });
            }
          );
        }
      );
    });
  });
});

// ======================================================
// VER SERVICIOS
// ======================================================
router.get('/:id/servicios', (req, res) => {
  db.all(
    'SELECT s.* FROM servicios s JOIN habitacion_servicios hs ON s.id = hs.id_servicio WHERE hs.id_habitacion = ?',
    [req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Error obteniendo servicios.' });
      }
      res.json(rows);
    }
  );
});

// ======================================================
// ELIMINAR SERVICIO DE UNA HABITACIÓN
// ======================================================
router.delete('/:habitacionId/servicios/:servicioId', verificarToken, (req, res) => {
  const { habitacionId, servicioId } = req.params;
  db.run(
    'DELETE FROM habitacion_servicios WHERE id_habitacion = ? AND id_servicio = ?',
    [habitacionId, servicioId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error eliminando servicio.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'El servicio no está asignado a esta habitación.' });
      }
      res.json({ mensaje: 'Servicio eliminado correctamente.' });
    }
  );
});

// ======================================================
// ELIMINAR HABITACIÓN
// ======================================================
router.delete('/:id', verificarToken, (req, res) => {
  const { id } = req.params;

  // Primero eliminar relaciones
  db.run(
    'DELETE FROM habitacion_servicios WHERE id_habitacion = ?',
    [id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error eliminando servicios asociados.' });
      }

      // Luego eliminar la habitación
      db.run(
        'DELETE FROM habitaciones WHERE id = ?',
        [id],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Error eliminando habitación.' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Habitación no encontrada.' });
          }
          res.json({ mensaje: 'Habitación eliminada correctamente.' });
        }
      );
    }
  );
});



// ======================================================
// HACER IMAGEN PRINCIPAL (HABITACIÓN)
// ======================================================
router.put('/imagenes/:id/principal', verificarToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT id_habitacion FROM imagenes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error buscando imagen' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // 🔥 quitar principal a todas las de esa habitación
    db.run(
      'UPDATE imagenes SET principal = 0 WHERE id_habitacion = ?',
      [row.id_habitacion],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Error limpiando principales' });
        }

        // 🔥 asignar nueva principal
        db.run(
          'UPDATE imagenes SET principal = 1 WHERE id = ?',
          [id],
          function (err) {
            if (err) {
              return res.status(500).json({ error: 'Error asignando imagen principal' });
            }

            return res.json({ mensaje: 'Imagen principal asignada correctamente' });
          }
        );
      }
    );
  });
});


// ======================================================
// OBTENER IMÁGENES DE HABITACIÓN
// ======================================================
router.get('/:id/imagenes', (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM imagenes WHERE id_habitacion = ?',
    [id],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo imágenes'
        });
      }

      res.json(rows);
    }
  );
});

// ======================================================
// SUBIR IMÁGENES A HABITACIÓN
// ======================================================
router.post('/:id/imagenes', verificarToken, upload.array('imagenes'), (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No se subieron imágenes'
    });
  }

  const stmt = db.prepare(
    'INSERT INTO imagenes (ruta, id_habitacion) VALUES (?, ?)'
  );

  req.files.forEach(file => {
    stmt.run(`/uploads/${file.filename}`, id);
  });

  stmt.finalize();

  res.json({
    mensaje: 'Imágenes subidas correctamente'
  });
});

module.exports = router;