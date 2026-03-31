const db = require('../database');

// ===============================
// LISTAR SERVICIOS DE UN ALOJAMIENTO
// ===============================
const listarServicios = (req, res) => {
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
};

// ===============================
// CREAR SERVICIO PARA UN ALOJAMIENTO
// ===============================
const crearServicio = (req, res) => {
  const { alojamientoId } = req.params;
  let { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "El nombre del servicio es obligatorio" });
  }

  nombre = nombre.trim();

  // Validar si ya existe el servicio para este alojamiento
  db.get(
    "SELECT * FROM servicios WHERE LOWER(nombre) = LOWER(?) AND alojamiento_id = ?",
    [nombre, alojamientoId],
    (err, row) => {
      if (err) {
        console.error("💥 ERROR BUSCANDO SERVICIO:", err);
        return res.status(500).json({ error: "Error verificando servicio" });
      }

      if (row) {
        return res.status(400).json({ error: "El servicio ya existe para este alojamiento" });
      }

      // Insertar servicio
      db.run(
        "INSERT INTO servicios (nombre, alojamiento_id) VALUES (?, ?)",
        [nombre, alojamientoId],
        function (err) {
          if (err) {
            console.error("💥 ERROR INSERTANDO SERVICIO:", err);
            return res.status(500).json({ error: "Error creando servicio" });
          }

          res.status(201).json({
            mensaje: "Servicio creado correctamente",
            id: this.lastID
          });
        }
      );
    }
  );
};

// ===============================
// ACTUALIZAR SERVICIO
// ===============================
const actualizarServicio = (req, res) => {
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
};

// ===============================
// ELIMINAR SERVICIO
// ===============================
const eliminarServicio = (req, res) => {
  const { id } = req.params;

  db.run(
    "DELETE FROM servicios WHERE id = ?",
    [id],
    function (err) {
      if (err) return res.status(500).json({ error: "Error eliminando servicio" });
      if (this.changes === 0) return res.status(404).json({ error: "Servicio no encontrado" });
      res.json({ mensaje: "Servicio eliminado correctamente" });
    }
  );
};

module.exports = {
  listarServicios,
  crearServicio,
  actualizarServicio,
  eliminarServicio
};