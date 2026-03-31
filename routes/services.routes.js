// ./routes/services.routes.js
const express = require('express');
const router = express.Router();
const db = require('../database'); // tu conexión SQLite
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');

// =====================================================
// 🚀 RUTAS DE SERVICIOS PARA ALOJAMIENTOS
// =====================================================
// GET /api/services → lista todos los servicios
router.get('/', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  db.all("SELECT * FROM servicios ORDER BY nombre", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error obteniendo servicios" });
    res.json(rows);
  });
});
// ======================================
// LISTAR SERVICIOS DE UN ALOJAMIENTO
// ======================================
router.get('/:alojamientoId', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { alojamientoId } = req.params;

  db.all(
    "SELECT * FROM servicios WHERE alojamiento_id = ? ORDER BY nombre",
    [alojamientoId],
    (err, rows) => {
      if (err) {
        console.error("💥 ERROR OBTENIENDO SERVICIOS:", err);
        return res.status(500).json({ error: "Error obteniendo servicios" });
      }
      res.json(rows);
    }
  );
});

// ======================================
// CREAR SERVICIO INDIVIDUAL PARA UN ALOJAMIENTO
// ======================================
router.post('/:alojamientoId', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { alojamientoId } = req.params;
  const { id_servicio, nombre } = req.body;

  if (!id_servicio && !nombre) {
    return res.status(400).json({ error: 'El id_servicio o nombre del servicio es obligatorio' });
  }

  const insertarRelacion = (servicioId) => {
    db.get(
      'SELECT * FROM alojamiento_servicios WHERE id_alojamiento = ? AND id_servicio = ?',
      [alojamientoId, servicioId],
      (err, existingRow) => {
        if (err) {
          console.error('💥 ERROR VERIFICANDO RELACIÓN:', err);
          return res.status(500).json({ error: 'Error verificando servicio en el alojamiento' });
        }

        if (existingRow) {
          return res.status(200).json({ mensaje: 'este servico ya se encuentra incluido en este alojamiento' });
        }

        db.run(
          'INSERT INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES (?, ?)',
          [alojamientoId, servicioId],
          function (err) {
            if (err) {
              console.error('💥 ERROR ASIGNANDO SERVICIO:', err);
              return res.status(500).json({ error: 'Error asignando servicio al alojamiento' });
            }

            res.status(201).json({ mensaje: 'Servicio agregado al alojamiento correctamente', id: this.lastID });
          }
        );
      }
    );
  };

  if (id_servicio) {
    return insertarRelacion(id_servicio);
  }

  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) {
    return res.status(400).json({ error: 'El nombre del servicio es obligatorio' });
  }

  // 1) Buscar servicio global
  db.get('SELECT * FROM servicios WHERE LOWER(nombre) = LOWER(?)', [nombreLimpio], (err, servicioRow) => {
    if (err) {
      console.error('💥 ERROR BUSCANDO SERVICIO:', err);
      return res.status(500).json({ error: 'Error verificando servicio' });
    }

    if (servicioRow) {
      return insertarRelacion(servicioRow.id);
    }

    // 2) Crear servicio global y luego relacionar
    db.run('INSERT INTO servicios (nombre) VALUES (?)', [nombreLimpio], function (err) {
      if (err) {
        console.error('💥 ERROR INSERTANDO SERVICIO:', err);
        return res.status(500).json({ error: 'Error creando servicio' });
      }

      insertarRelacion(this.lastID);
    });
  });
});

// ======================================
// AGREGAR VARIOS SERVICIOS A UN ALOJAMIENTO
// ======================================
router.post('/:id/servicios', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { id } = req.params;
  const { servicios } = req.body;

  if (!Array.isArray(servicios) || servicios.length === 0) {
    return res.status(400).json({ error: 'No se recibieron servicios válidos' });
  }

  // Generar placeholders para SQLite
  const placeholders = servicios.map(() => '(?, ?)').join(', ');
  const values = servicios.flatMap(id_servicio => [id, id_servicio]);

  const sql = `INSERT OR IGNORE INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES ${placeholders}`;

  db.run(sql, values, function(err) {
    if (err) {
      console.error("💥 ERROR INSERTANDO SERVICIOS MULTIPLES:", err);
      return res.status(500).json({ error: 'Error al insertar servicios' });
    }
    res.json({ mensaje: 'Servicios agregados correctamente', rowsAffected: this.changes });
  });
});

// ======================================
// ACTUALIZAR SERVICIO
// ======================================
router.put('/:id', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;

  if (!nombre) return res.status(400).json({ error: "El nombre del servicio es obligatorio" });

  db.run(
    "UPDATE servicios SET nombre = ? WHERE id = ?",
    [nombre, id],
    function (err) {
      if (err) return res.status(500).json({ error: "Error actualizando servicio" });
      if (this.changes === 0) return res.status(404).json({ error: "Servicio no encontrado" });
      res.json({ mensaje: "Servicio actualizado correctamente" });
    }
  );
});

// ======================================
// ELIMINAR SERVICIO
// ======================================
router.delete('/:id', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM servicios WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: "Error eliminando servicio" });
    if (this.changes === 0) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json({ mensaje: "Servicio eliminado correctamente" });
  });
});

module.exports = router;