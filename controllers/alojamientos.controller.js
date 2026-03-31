const db = require('../database');

// ======================================================
// LISTAR TODOS LOS ALOJAMIENTOS CON SERVICIOS
// ======================================================
const listarAlojamientos = (req, res) => {
  const query = `
    SELECT a.*, u.nombre AS anfitrion,
      GROUP_CONCAT(s.nombre) AS servicios
    FROM alojamientos a
    JOIN usuarios u ON a.id_anfitrion = u.id
    LEFT JOIN alojamiento_servicios aserv ON a.id = aserv.id_alojamiento
    LEFT JOIN servicios s ON aserv.id_servicio = s.id
    GROUP BY a.id
    ORDER BY a.id DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error obteniendo alojamientos' });
    }
    res.json(rows);
  });
};

// ======================================================
// CREAR ALOJAMIENTO (ANFITRION)
// ======================================================
const crearAlojamiento = (req, res) => {
  const { titulo, descripcion, precio, ubicacion, capacidad_personas, zona, cercania, vistas, politicas } = req.body;
  if (!titulo || !precio || !ubicacion || !capacidad_personas) {
    return res.status(400).json({
      error: 'Título, precio, ubicación y capacidad de personas son obligatorios'
    });
  }

  const id_anfitrion = req.user.id;

  db.run(
    `INSERT INTO alojamientos 
      (titulo, descripcion, precio, ubicacion, capacidad_personas, zona, cercania, vistas, politicas, id_anfitrion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [titulo, descripcion, precio, ubicacion, capacidad_personas, zona || null, cercania || null, vistas || null, politicas || null, id_anfitrion],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'No se pudo crear el alojamiento' });
      }
      res.status(201).json({ mensaje: 'Alojamiento creado correctamente', id: this.lastID });
    }
  );
};

// ======================================================
// BUSCAR ALOJAMIENTOS CON FILTROS
// ======================================================
const buscarAlojamientos = (req, res) => {
  const { ciudad, personas } = req.query;

  let query = `
    SELECT a.*, u.nombre AS anfitrion,
      GROUP_CONCAT(s.nombre) AS servicios
    FROM alojamientos a
    JOIN usuarios u ON a.id_anfitrion = u.id
    LEFT JOIN alojamiento_servicios aserv ON a.id = aserv.id_alojamiento
    LEFT JOIN servicios s ON aserv.id_servicio = s.id
    WHERE 1=1
  `;

  const params = [];

  if (ciudad) {
    query += ` AND a.ubicacion LIKE ?`;
    params.push(`%${ciudad}%`);
  }

  if (personas) {
    query += ` AND a.capacidad_personas >= ?`;
    params.push(personas);
  }

  query += ` GROUP BY a.id ORDER BY a.id DESC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error buscando alojamientos' });
    }
    res.json(rows);
  });
};

// ======================================================
// OBTENER ALOJAMIENTO POR ID CON SERVICIOS
// ======================================================
const obtenerAlojamiento = (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT a.*, u.nombre AS anfitrion,
      GROUP_CONCAT(s.nombre) AS servicios
    FROM alojamientos a
    JOIN usuarios u ON a.id_anfitrion = u.id
    LEFT JOIN alojamiento_servicios aserv ON a.id = aserv.id_alojamiento
    LEFT JOIN servicios s ON aserv.id_servicio = s.id
    WHERE a.id = ?
    GROUP BY a.id
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error obteniendo alojamiento' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Alojamiento no encontrado' });
    }
    res.json(row);
  });
};

// ======================================================
// ACTUALIZAR ALOJAMIENTO
// ======================================================
const actualizarAlojamiento = (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion, precio, ubicacion, capacidad_personas } = req.body;

  db.get('SELECT * FROM alojamientos WHERE id = ?', [id], (err, alojamiento) => {
    if (err) return res.status(500).json({ error: 'Error buscando alojamiento' });
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado' });
    if (req.user.rol !== 'admin' && alojamiento.id_anfitrion !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para editar este alojamiento' });
    }

    db.run(
      `UPDATE alojamientos
       SET titulo = ?, descripcion = ?, precio = ?, ubicacion = ?, capacidad_personas = ?
       WHERE id = ?`,
      [
        titulo || alojamiento.titulo,
        descripcion || alojamiento.descripcion,
        precio || alojamiento.precio,
        ubicacion || alojamiento.ubicacion,
        capacidad_personas || alojamiento.capacidad_personas,
        id
      ],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error actualizando alojamiento' });
        res.json({ mensaje: 'Alojamiento actualizado correctamente' });
      }
    );
  });
};

// ======================================================
// ELIMINAR ALOJAMIENTO
// ======================================================
const eliminarAlojamiento = (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM alojamientos WHERE id = ?', [id], (err, alojamiento) => {
    if (err) return res.status(500).json({ error: 'Error buscando alojamiento' });
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado' });
    if (req.user.rol !== 'admin' && alojamiento.id_anfitrion !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este alojamiento' });
    }

    db.run('DELETE FROM alojamientos WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: 'Error eliminando alojamiento' });
      res.json({ mensaje: 'Alojamiento eliminado correctamente' });
    });
  });
};

// ======================================================
// ASIGNAR SERVICIOS A UN ALOJAMIENTO
// ======================================================
const agregarServicios = (req, res) => {
  const { id } = req.params;
  const { servicios } = req.body; // Array de ids de servicios

  if (!Array.isArray(servicios) || servicios.length === 0) {
    return res.status(400).json({ error: 'Debe enviar un array de servicios' });
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alojamiento_servicios (id_alojamiento, id_servicio)
    VALUES (?, ?)
  `);

  servicios.forEach(servicioId => {
    stmt.run(id, servicioId);
  });

  stmt.finalize(err => {
    if (err) return res.status(500).json({ error: 'Error asignando servicios' });
    res.json({ mensaje: 'Servicios asignados correctamente' });
  });
};

// ======================================================
// ELIMINAR SERVICIO DE UN ALOJAMIENTO
// ======================================================
const eliminarServicio = (req, res) => {
  const { id, id_servicio } = req.params;

  db.run(
    `DELETE FROM alojamiento_servicios WHERE id_alojamiento = ? AND id_servicio = ?`,
    [id, id_servicio],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error eliminando servicio' });
      res.json({ mensaje: 'Servicio eliminado correctamente' });
    }
  );
};

module.exports = {
  listarAlojamientos,
  crearAlojamiento,
  buscarAlojamientos,
  obtenerAlojamiento,
  actualizarAlojamiento,
  eliminarAlojamiento,
  agregarServicios,
  eliminarServicio
};