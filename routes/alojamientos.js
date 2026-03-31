const express = require('express');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const path = require('path');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');

// ======================================
// CONFIGURAR MULTER
// ======================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads'); // carpeta donde se guardan
  },
  filename: (req, file, cb) => {
    const nombre = Date.now() + path.extname(file.originalname);
    cb(null, nombre);
  }
});
const upload = multer({ storage });

function verificarPropietarioAlojamientoPorIdParam(paramName = 'id') {
  return (req, res, next) => {
    const alojamientoId = Number(req.params?.[paramName] || 0);
    if (!alojamientoId) {
      return res.status(400).json({ error: 'ID de alojamiento inválido.' });
    }

    db.get(`SELECT id, id_anfitrion FROM alojamientos WHERE id = ?`, [alojamientoId], (err, row) => {
      if (err) return res.status(500).json({ error: 'Error verificando alojamiento.' });
      if (!row) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

      if (req.user.rol !== 'admin' && Number(row.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para operar este alojamiento.' });
      }

      req.alojamiento = row;
      next();
    });
  };
}

function verificarPropietarioAlojamientoPorImagenId(paramName = 'id') {
  return (req, res, next) => {
    const imagenId = Number(req.params?.[paramName] || 0);
    if (!imagenId) {
      return res.status(400).json({ error: 'ID de imagen inválido.' });
    }

    db.get(
      `SELECT i.id AS id_imagen, i.id_alojamiento, a.id_anfitrion
       FROM imagenes i
       JOIN alojamientos a ON a.id = i.id_alojamiento
       WHERE i.id = ?`,
      [imagenId],
      (err, row) => {
        if (err) return res.status(500).json({ error: 'Error verificando imagen.' });
        if (!row) return res.status(404).json({ error: 'Imagen no encontrada.' });

        if (req.user.rol !== 'admin' && Number(row.id_anfitrion) !== Number(req.user.id)) {
          return res.status(403).json({ error: 'No tienes permiso para operar esta imagen.' });
        }

        req.imagenAlojamiento = row;
        next();
      }
    );
  };
}

// ======================================================
// GALERÍA RESUMEN (UNA IMAGEN POR ALOJAMIENTO)
// ======================================================
router.get('/imagenes/principales', (req, res) => {
  const query = `
    SELECT 
      a.id AS alojamiento_id,
      a.titulo,
      i.ruta
    FROM alojamientos a
    LEFT JOIN imagenes i ON i.id = (
        SELECT id
        FROM imagenes
        WHERE id_alojamiento = a.id
        ORDER BY principal DESC, id ASC
        LIMIT 1
    )
    WHERE i.ruta IS NOT NULL
    ORDER BY a.id DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error obteniendo galería" });
    }
    res.json(rows);
  });
});

// ======================================
// SUBIR IMÁGENES
// ======================================
router.post(
  '/:id/imagenes',
  verificarToken,
  soloRoles('admin', 'anfitrion'),
  verificarPropietarioAlojamientoPorIdParam('id'),
  upload.array('imagenes', 10),
  (req, res) => {
  const { id } = req.params;
  const archivos = req.files;

  if (!archivos || archivos.length === 0) {
    return res.status(400).json({ error: "No se enviaron imágenes" });
  }

  const stmt = db.prepare(`INSERT INTO imagenes (id_alojamiento, ruta) VALUES (?, ?)`);
  archivos.forEach(file => {
    stmt.run(id, file.path.replace('public/', ''));
  });
  stmt.finalize();

  res.json({ mensaje: "Imágenes subidas correctamente" });
});

// ======================================
// OBTENER IMÁGENES
// ======================================
router.get('/:id/imagenes', (req, res) => {
  const { id } = req.params;

  db.all("SELECT * FROM imagenes WHERE id_alojamiento = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error obteniendo imágenes" });
    res.json(rows);
  });
});

// ======================================================
// CREAR ALOJAMIENTO
// ======================================================
router.post('/', verificarToken, soloRoles('admin', 'anfitrion'), (req, res) => {
  const { titulo, descripcion, ubicacion, imagen, precio, capacidad_personas, zona, cercania, vistas, politicas } = req.body;

  if (!titulo || !precio || !capacidad_personas) {
    return res.status(400).json({ error: 'Título, precio y capacidad de personas son obligatorios.' });
  }

  db.all('SELECT id FROM alojamientos ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('Error DB:', err);
      return res.status(500).json({ error: 'Error creando alojamiento.' });
    }

    let nextId = 1;
    for (const row of rows) {
      if (row.id === nextId) {
        nextId += 1;
      } else if (row.id > nextId) {
        break;
      }
    }

    db.run(
      `INSERT INTO alojamientos 
       (id, titulo, descripcion, ubicacion, imagen, precio, capacidad_personas, zona, cercania, vistas, politicas, id_anfitrion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, titulo, descripcion || null, ubicacion || null, imagen || null, precio, capacidad_personas, zona || null, cercania || null, vistas || null, politicas || null, req.user.id],
      function (insertErr) {
        if (insertErr) {
          console.error('Error DB:', insertErr);
          return res.status(500).json({ error: 'Error creando alojamiento.' });
        }
        res.status(201).json({ mensaje: 'Alojamiento creado correctamente.', id: nextId });
      }
    );
  });
});

// ======================================================
// LISTAR TODOS LOS ALOJAMIENTOS
// ======================================================
router.put('/:id', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion, ubicacion, precio, capacidad_personas, zona, cercania, vistas, politicas } = req.body;

  if (!titulo || !precio || !capacidad_personas) {
    return res.status(400).json({ error: 'Título, precio y capacidad de personas son obligatorios.' });
  }

  db.run(
    `UPDATE alojamientos
     SET titulo = ?, descripcion = ?, ubicacion = ?, precio = ?, capacidad_personas = ?, zona = ?, cercania = ?, vistas = ?, politicas = ?
     WHERE id = ?`,
    [titulo, descripcion || null, ubicacion || null, precio, capacidad_personas, zona || null, cercania || null, vistas || null, politicas || null, id],
    function (err) {
      if (err) {
        console.error('Error DB:', err);
        return res.status(500).json({ error: 'Error actualizando alojamiento.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Alojamiento no encontrado.' });
      }
      res.status(200).json({ mensaje: 'Alojamiento actualizado correctamente.' });
    }
  );
});

router.get('/', (req, res) => {
  db.all(
    `SELECT a.*, u.nombre AS anfitrion,
            COALESCE(
              (
                SELECT i.ruta
                FROM imagenes i
                WHERE i.id_alojamiento = a.id AND i.principal = 1
                ORDER BY i.id ASC
                LIMIT 1
              ),
              (
                SELECT i.ruta
                FROM imagenes i
                WHERE i.id_alojamiento = a.id
                ORDER BY i.id ASC
                LIMIT 1
              )
            ) AS imagen_principal,
            COALESCE(stats.total_reservas, 0) AS total_reservas
     FROM alojamientos a
     JOIN usuarios u ON a.id_anfitrion = u.id
     LEFT JOIN (
       SELECT h.id_alojamiento, COUNT(r.id) AS total_reservas
       FROM habitaciones h
       LEFT JOIN reservas r ON r.id_habitacion = h.id
       GROUP BY h.id_alojamiento
     ) stats ON stats.id_alojamiento = a.id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo alojamientos.' });
      res.status(200).json(rows);
    }
  );
});

router.get('/top/reservas-diarias', (req, res) => {
  db.all(
    `SELECT
      a.id,
      a.titulo,
      a.precio,
      a.ubicacion,
      a.calificacion_promedio,
      COUNT(r.id) AS reservas_hoy,
      (
        SELECT i.ruta
        FROM imagenes i
        WHERE i.id_alojamiento = a.id
        ORDER BY i.principal DESC, i.id ASC
        LIMIT 1
      ) AS imagen_principal
     FROM alojamientos a
     JOIN habitaciones h ON h.id_alojamiento = a.id
     JOIN reservas r ON r.id_habitacion = h.id
     WHERE date(r.creado_en) = date('now')
     GROUP BY a.id
     ORDER BY reservas_hoy DESC, a.id DESC
     LIMIT 20`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo ranking de alojamientos.' });
      res.json(rows || []);
    }
  );
});

// ======================================================
// BUSCAR ALOJAMIENTOS
// ======================================================
router.get('/buscar', (req, res) => {
  const { ciudad, personas, precio_max } = req.query;
  let query = `
    SELECT a.*, u.nombre AS anfitrion
    FROM alojamientos a
    JOIN usuarios u ON a.id_anfitrion = u.id
    WHERE 1=1
  `;
  let params = [];

  if (ciudad) {
    query += ` AND a.ubicacion LIKE ?`;
    params.push(`%${ciudad}%`);
  }
  if (personas) {
    query += ` AND a.capacidad_personas >= ?`;
    params.push(personas);
  }
  if (precio_max) {
    query += ` AND a.precio <= ?`;
    params.push(precio_max);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error buscando alojamientos.' });
    res.status(200).json(rows);
  });
});

/**
 * GET /api/alojamientos/mis-favoritos
 * Obtener los alojamientos favoritos del turista
 */
router.get('/mis-favoritos', verificarToken, (req, res) => {
  const turista_id = req.user.id;

  const sql = `
    SELECT DISTINCT
      a.id,
      a.titulo,
      a.descripcion,
      a.ubicacion,
      a.precio,
      a.imagen,
      (
        SELECT i.ruta
        FROM imagenes i
        WHERE i.id_alojamiento = a.id
        ORDER BY i.principal DESC, i.id ASC
        LIMIT 1
      ) AS imagen_principal,
      MAX(r.creado_en) AS ultima_reserva,
      COUNT(DISTINCT r.id) as reservas_totales,
      AVG(re.calificacion) as calificacion_promedio
    FROM alojamientos a
    LEFT JOIN habitaciones h ON a.id = h.id_alojamiento
    LEFT JOIN reservas r ON h.id = r.id_habitacion AND r.id_usuario = ? AND r.estado IN ('confirmada', 'finalizada')
    LEFT JOIN reseñas re ON a.id = re.id_alojamiento
    WHERE EXISTS (
      SELECT 1 FROM habitaciones hh
      JOIN reservas rr ON hh.id = rr.id_habitacion
      WHERE hh.id_alojamiento = a.id AND rr.id_usuario = ? AND rr.estado IN ('confirmada', 'finalizada')
    )
    GROUP BY a.id
    ORDER BY datetime(ultima_reserva) DESC, a.titulo ASC
  `;

  db.all(sql, [turista_id, turista_id], (err, alojamientos) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al obtener favoritos',
        detalles: err.message
      });
    }

    res.status(200).json({
      status: 'success',
      alojamientos: alojamientos || []
    });
  });
});

// ======================================================
// OBTENER ALOJAMIENTO POR ID
// ======================================================
router.get('/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT a.*, u.nombre AS anfitrion
     FROM alojamientos a
     JOIN usuarios u ON a.id_anfitrion = u.id
     WHERE a.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo alojamiento.' });
      if (!row) return res.status(404).json({ error: 'Alojamiento no encontrado.' });
      res.status(200).json(row);
    }
  );
});

// ======================================================
// ACTUALIZAR ALOJAMIENTO
// ======================================================
router.put('/:id', verificarToken, (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion, ubicacion, imagen, precio, capacidad_personas } = req.body;

  db.get('SELECT * FROM alojamientos WHERE id = ?', [id], (err, alojamiento) => {
    if (err) return res.status(500).json({ error: 'Error buscando alojamiento.' });
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });
    if (req.user.rol !== 'admin' && alojamiento.id_anfitrion !== req.user.id)
      return res.status(403).json({ error: 'No tienes permiso para editar este alojamiento.' });

    db.run(
      `UPDATE alojamientos
       SET titulo = ?, descripcion = ?, ubicacion = ?, imagen = ?, precio = ?, capacidad_personas = ?
       WHERE id = ?`,
      [
        titulo || alojamiento.titulo,
        descripcion || alojamiento.descripcion,
        ubicacion || alojamiento.ubicacion,
        imagen || alojamiento.imagen,
        precio || alojamiento.precio,
        capacidad_personas || alojamiento.capacidad_personas,
        id
      ],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error actualizando alojamiento.' });
        res.status(200).json({ mensaje: 'Alojamiento actualizado correctamente.' });
      }
    );
  });
});

// ======================================================
// ELIMINAR ALOJAMIENTO
// ======================================================
router.delete('/:id', verificarToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM alojamientos WHERE id = ?', [id], (err, alojamiento) => {
    if (err) return res.status(500).json({ error: 'Error buscando alojamiento.' });
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

    const loggedUserId = Number(req.user.id);
    const ownerId = Number(alojamiento.id_anfitrion);

    console.log('DEBUG DELETE ALOJAMIENTO', {
      rutaId: id,
      tokenUserId: loggedUserId,
      tokenRole: req.user.rol,
      alojamientoOwnerId: ownerId,
      alojamientoUser: alojamiento.id_anfitrion
    });

    if (req.user.rol !== 'admin' && ownerId !== loggedUserId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este alojamiento.' });
    }

    db.run('DELETE FROM alojamientos WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: 'Error eliminando alojamiento.' });
      res.status(200).json({ mensaje: 'Alojamiento eliminado correctamente.' });
    });
  });
});

// ======================================================
// HACER IMAGEN PRINCIPAL (ALOJAMIENTO)
// ======================================================
router.put('/:id/principal', verificarToken, verificarPropietarioAlojamientoPorImagenId('id'), (req, res) => {
  const { id } = req.params;

  db.get('SELECT id_alojamiento FROM imagenes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error buscando imagen' });
    if (!row) return res.status(404).json({ error: 'Imagen no encontrada' });

    db.run('UPDATE imagenes SET principal = 0 WHERE id_alojamiento = ?', [row.id_alojamiento], (err) => {
      if (err) return res.status(500).json({ error: 'Error limpiando principales' });

      db.run('UPDATE imagenes SET principal = 1 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error asignando imagen principal' });
        res.json({ mensaje: 'Imagen principal asignada' });
      });
    });
  });
});

// ======================================================
// ⭐ RUTAS ALOJAMIENTO - SERVICIOS
// ======================================================

// AGREGAR SERVICIO ALOJAMIENTO
router.post('/:id/servicios', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), (req, res) => {
  const { id } = req.params;
  const { id_servicio } = req.body;

  if (!id_servicio) {
    return res.status(400).json({ error: "El id_servicio es obligatorio" });
  }

  db.run(
    `INSERT OR IGNORE INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES (?, ?)`,
    [id, id_servicio],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error agregando servicio al alojamiento' });
      res.status(201).json({ mensaje: 'Servicio agregado al alojamiento correctamente.' });
    }
  );
});

// ELIMINAR SERVICIO DE ALOJAMIENTO
router.delete('/:id/servicios/:id_servicio', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), (req, res) => {
  const { id, id_servicio } = req.params;

  db.run(
    `DELETE FROM alojamiento_servicios WHERE id_alojamiento = ? AND id_servicio = ?`,
    [id, id_servicio],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error eliminando servicio del alojamiento' });
      if (this.changes === 0) return res.status(404).json({ error: 'Servicio no encontrado para este alojamiento' });
      res.json({ mensaje: 'Servicio eliminado del alojamiento correctamente.' });
    }
  );
});






// ======================================
// AGREGAR SERVICIO A ALOJAMIENTO
// ======================================
router.post('/:id/servicios', verificarToken, (req, res) => {

  const id_alojamiento = req.params.id;
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({
      error: "Nombre del servicio requerido"
    });
  }

  // 1️⃣ Buscar si el servicio ya existe
  db.get(
    `SELECT id FROM servicios WHERE nombre = ?`,
    [nombre],
    (err, servicio) => {

      if (err)
        return res.status(500).json({ error: "Error buscando servicio" });

      const insertarRelacion = (id_servicio) => {

        db.run(
          `INSERT INTO alojamiento_servicios
           (id_alojamiento, id_servicio)
           VALUES (?, ?)`,
          [id_alojamiento, id_servicio],
          function(err) {

            if (err)
              return res.status(500).json({
                error: "Error asociando servicio"
              });

            res.status(201).json({
              mensaje: "Servicio agregado al alojamiento"
            });
          }
        );
      };

      // 2️⃣ Si existe → usarlo
      if (servicio) {
        insertarRelacion(servicio.id);
      }
      // 3️⃣ Si NO existe → crearlo
      else {
        db.run(
          `INSERT INTO servicios(nombre) VALUES(?)`,
          [nombre],
          function(err) {

            if (err)
              return res.status(500).json({
                error: "Error creando servicio"
              });

            insertarRelacion(this.lastID);
          }
        );
      }
    }
  );
});


// ======================================
// VER SERVICIOS DE UN ALOJAMIENTO (PÚBLICO)
// ======================================
router.get('/:id/servicios', (req, res) => {

  const id_alojamiento = req.params.id;

  db.all(
    `SELECT s.id,
            s.nombre,
            a_s.valor_adicional,
            a_s.categoria
     FROM alojamiento_servicios a_s
     JOIN servicios s
       ON s.id = a_s.id_servicio
     WHERE a_s.id_alojamiento = ?
       AND COALESCE(a_s.es_adicional, 0) = 0`,
    [id_alojamiento],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: "Error obteniendo servicios"
        });
      }

      res.json(rows);
    }
  );
});

// ======================================
// GESTIONAR SERVICIOS ADICIONALES CON VALOR
// ======================================
router.post('/:id/servicios-adicionales', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), (req, res) => {
  const id_alojamiento = req.params.id;
  const { id_servicio, nombre, valor, categoria } = req.body;

  const valorNumerico = valor === '' || valor === null || valor === undefined
    ? null
    : Number(valor);

  if (valorNumerico !== null && (!Number.isFinite(valorNumerico) || valorNumerico < 0)) {
    return res.status(400).json({ error: 'El valor del servicio debe ser un numero valido mayor o igual a 0.' });
  }

  const upsertRelacion = (servicioId) => {
    db.run(
      `INSERT INTO alojamiento_servicios (id_alojamiento, id_servicio, valor_adicional, categoria, es_adicional)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id_alojamiento, id_servicio)
       DO UPDATE SET valor_adicional = excluded.valor_adicional,
                     categoria = excluded.categoria,
                     es_adicional = 1`,
      [id_alojamiento, servicioId, valorNumerico, (categoria || '').trim() || null],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error guardando servicio adicional.' });
        }

        res.status(201).json({ mensaje: 'Servicio adicional guardado correctamente.' });
      }
    );
  };

  if (id_servicio) {
    return upsertRelacion(id_servicio);
  }

  const nombreServicio = (nombre || '').trim();
  if (!nombreServicio) {
    return res.status(400).json({ error: 'Debes enviar el nombre del servicio o un id_servicio.' });
  }

  db.get(`SELECT id FROM servicios WHERE LOWER(nombre) = LOWER(?)`, [nombreServicio], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error validando servicio.' });
    }

    if (row) {
      return upsertRelacion(row.id);
    }

    db.run(`INSERT INTO servicios(nombre) VALUES(?)`, [nombreServicio], function(insertErr) {
      if (insertErr) {
        console.error(insertErr);
        return res.status(500).json({ error: 'Error creando servicio.' });
      }

      upsertRelacion(this.lastID);
    });
  });
});

router.get('/:id/servicios-adicionales', (req, res) => {
  const id_alojamiento = req.params.id;

  db.all(
    `SELECT s.id,
            s.nombre,
            a_s.valor_adicional,
            a_s.categoria
     FROM alojamiento_servicios a_s
     JOIN servicios s ON s.id = a_s.id_servicio
     WHERE a_s.id_alojamiento = ?
       AND COALESCE(a_s.es_adicional, 0) = 1
     ORDER BY s.nombre ASC`,
    [id_alojamiento],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error obteniendo servicios adicionales.' });
      }
      res.json(rows);
    }
  );
});



// ======================================
// ELIMINAR SERVICIO DE UN ALOJAMIENTO
// ======================================
router.delete('/:id/servicios/:servicioId', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), (req, res) => {
  const { id, servicioId } = req.params;

  db.run(
    `DELETE FROM alojamiento_servicios 
     WHERE id_alojamiento = ? AND id_servicio = ?`,
    [id, servicioId],
    function (err) {
      if (err) return res.status(500).json(err);

      res.json({ mensaje: "Servicio eliminado del alojamiento" });
    }
  );
});



router.post('/:id/servicios', verificarToken, soloRoles('admin', 'anfitrion'), verificarPropietarioAlojamientoPorIdParam('id'), async (req, res) => {
  const { id } = req.params;
  const { id_servicio } = req.body;

  try {
    const stmt = db.prepare('INSERT INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES (?, ?)');
    stmt.run(id, id_servicio, function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ mensaje: 'Servicio agregado', id: this.lastID });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;