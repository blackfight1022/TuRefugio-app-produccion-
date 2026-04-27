const express = require('express');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const { verificarToken } = require('../middlewares/auth.middleware');
const path = require('path');

// ===============================
// CONFIG MULTER
// ===============================
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../public/uploads'),
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Solo se permiten archivos de imagen'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB máximo por imagen
});

// ===============================
// SUBIR IMÁGENES
// ===============================
router.post('/alojamientos/:id/imagenes', verificarToken, upload.array('imagenes', 10), (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se enviaron imágenes' });
  }

  try {
    // 🔥 1. VERIFICAR SI YA EXISTE UNA PRINCIPAL
    db.get(
      "SELECT id FROM imagenes WHERE id_alojamiento = ? AND principal = 1",
      [id],
      (err, existente) => {

        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error verificando principal' });
        }

        let yaTienePrincipal = !!existente;

        req.files.forEach((file, index) => {

          // 🔥 LIMPIAR RUTA
          const ruta = file.path
  .replace(/^public[\\/]/, '')   // elimina "public/"
  .replace(/\\/g, '/');          // normaliza slashes

          // 🔥 LÓGICA PRINCIPAL
          let esPrincipal = 0;

          if (!yaTienePrincipal && index === 0) {
            esPrincipal = 1;
            yaTienePrincipal = true; // para que solo la primera lo sea
          }

          db.run(
            "INSERT INTO imagenes (id_alojamiento, ruta, principal) VALUES (?, ?, ?)",
            [id, ruta, esPrincipal],
            (err) => {
              if (err) console.error('Error insertando imagen:', err);
            }
          );
        });

        res.status(201).json({
          mensaje: "Imágenes guardadas correctamente",
          principal_auto: !existente
        });
      }
    );

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error subiendo imágenes' });
  }
});

// ===============================
// OBTENER IMÁGENES DE UN ALOJAMIENTO
// ===============================
router.get('/alojamientos/:id/imagenes', (req, res) => {
  db.all(
    `SELECT i.*
     FROM imagenes i
     JOIN alojamientos a ON a.id = i.id_alojamiento
     JOIN usuarios u ON u.id = a.id_anfitrion
     WHERE i.id_alojamiento = ?
       AND NOT (
         COALESCE(u.estado_cuenta, 'activo') = 'suspendido'
         AND (
           u.suspension_hasta IS NULL
           OR datetime(u.suspension_hasta) > datetime('now', 'localtime')
         )
       )`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener imágenes' });
      res.json(rows);
    }
  );
});

// ===============================
// ASIGNAR IMAGEN PRINCIPAL
// ===============================
router.put('/:id/principal', verificarToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT id_alojamiento FROM imagenes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error buscando imagen' });
    if (!row) return res.status(404).json({ error: 'Imagen no encontrada' });

    db.run('UPDATE imagenes SET principal = 0 WHERE id_alojamiento = ?', [row.id_alojamiento], (err) => {
      if (err) return res.status(500).json({ error: 'Error limpiando imagen principal' });

      db.run('UPDATE imagenes SET principal = 1 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error asignando imagen principal' });
        res.json({ mensaje: 'Imagen principal asignada correctamente' });
      });
    });
  });
});




const fs = require('fs');


router.delete('/:id', verificarToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT id_alojamiento, ruta FROM imagenes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error buscando imagen' });
    if (!row) return res.status(404).json({ error: 'Imagen no encontrada' });

    // 🔥 Limpiar ruta
    let rutaArchivo = row.ruta || '';
    rutaArchivo = rutaArchivo.replace(/^public[\\/]+/, ''); // elimina 'public/' inicial
    const filePath = path.join(__dirname, '../public', rutaArchivo);

    // Verificar si existe antes de borrar
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('No se pudo borrar archivo:', err);
      });
    } else {
      console.log('Archivo no encontrado, se omitirá el borrado:', filePath);
    }

    // Borrar registro en DB
    db.run('DELETE FROM imagenes WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: 'Error eliminando imagen en DB' });

      // Limpia referencia legacy para que no siga mostrándose una ruta vieja.
      db.run(
        'UPDATE alojamientos SET imagen = NULL WHERE id = ? AND imagen = ?',
        [row.id_alojamiento, row.ruta],
        () => res.json({ mensaje: 'Imagen eliminada correctamente' })
      );
    });
  });
});



// ===============================
// EXPORTAR ROUTER
// ===============================
module.exports = router;
