const db = require('../database');


// ==========================================
// LISTAR TODOS LOS SERVICIOS
// ==========================================
const listarServicios = (req, res) => {

  db.all(
    `SELECT * FROM servicios`,
    [],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo servicios'
        });
      }

      res.status(200).json(rows);
    }
  );
};


// ==========================================
// AGREGAR SERVICIO A UN ALOJAMIENTO
// ==========================================
const agregarServicioAlojamiento = (req, res) => {

  const id_alojamiento = req.params.id; // tomamos el id de la URL
  const { id_servicio } = req.body;     // solo necesitamos el id_servicio

  if (!id_servicio) {
    return res.status(400).json({
      error: 'Debe enviar id_servicio'
    });
  }

  db.run(
    `INSERT INTO alojamiento_servicios
     (id_alojamiento, id_servicio)
     VALUES (?, ?)`,
    [id_alojamiento, id_servicio],
    function (err) {

      if (err) {
        return res.status(500).json({
          error: 'Error agregando servicio al alojamiento'
        });
      }

      res.status(201).json({
        mensaje: 'Servicio agregado al alojamiento'
      });
    }
  );
};

// ==========================================
// VER SERVICIOS DE UN ALOJAMIENTO
// ==========================================
const verServiciosAlojamiento = (req, res) => {

  const { id } = req.params;

  db.all(
    `SELECT s.nombre
     FROM alojamiento_servicios a_s
     JOIN servicios s
     ON a_s.id_servicio = s.id
     WHERE a_s.id_alojamiento = ?`,
    [id],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo servicios'
        });
      }

      res.status(200).json(rows);
    }
  );
};


module.exports = {
  listarServicios,
  agregarServicioAlojamiento,
  verServiciosAlojamiento
};