const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');

/**
 * GET /api/favoritos
 * Listar favoritos del usuario autenticado
 */
router.get('/', verificarToken, (req, res) => {
  const usuarioId = req.user.id;

  const sql = `
    SELECT
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
      fa.creado_en AS fecha_favorito,
      COUNT(DISTINCT r.id) AS reservas_totales,
      AVG(re.calificacion) AS calificacion_promedio
    FROM favoritos_alojamientos fa
    JOIN alojamientos a ON a.id = fa.id_alojamiento
    JOIN usuarios uo ON uo.id = a.id_anfitrion
    LEFT JOIN habitaciones h ON a.id = h.id_alojamiento
    LEFT JOIN reservas r ON h.id = r.id_habitacion AND r.id_usuario = ?
    LEFT JOIN reseñas re ON a.id = re.id_alojamiento
    WHERE fa.id_usuario = ?
      AND NOT (
        COALESCE(uo.estado_cuenta, 'activo') = 'suspendido'
        AND (
          uo.suspension_hasta IS NULL
          OR datetime(uo.suspension_hasta) > datetime('now', 'localtime')
        )
      )
    GROUP BY a.id, fa.creado_en
    ORDER BY datetime(fa.creado_en) DESC, a.titulo ASC
  `;

  db.all(sql, [usuarioId, usuarioId], (err, alojamientos) => {
    if (err) {
      console.error('Error listando favoritos:', err);
      return res.status(500).json({ status: 'error', mensaje: 'Error al obtener favoritos.' });
    }

    return res.status(200).json({ status: 'success', alojamientos: alojamientos || [] });
  });
});

/**
 * POST /api/favoritos/:idAlojamiento
 * Agregar favorito (idempotente)
 */
router.post('/:idAlojamiento', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  const alojamientoId = Number(req.params.idAlojamiento);

  if (!Number.isFinite(alojamientoId) || alojamientoId <= 0) {
    return res.status(400).json({ status: 'error', mensaje: 'ID de alojamiento inválido.' });
  }

  db.get('SELECT id FROM alojamientos WHERE id = ?', [alojamientoId], (findErr, alojamiento) => {
    if (findErr) {
      return res.status(500).json({ status: 'error', mensaje: 'Error validando alojamiento.' });
    }
    if (!alojamiento) {
      return res.status(404).json({ status: 'error', mensaje: 'Alojamiento no encontrado.' });
    }

    db.run(
      'INSERT OR IGNORE INTO favoritos_alojamientos (id_usuario, id_alojamiento) VALUES (?, ?)',
      [usuarioId, alojamientoId],
      (insertErr) => {
        if (insertErr) {
          return res.status(500).json({ status: 'error', mensaje: 'No se pudo guardar favorito.' });
        }
        return res.status(200).json({ status: 'success', mensaje: 'Alojamiento guardado en favoritos.' });
      }
    );
  });
});

/**
 * DELETE /api/favoritos/:idAlojamiento
 * Eliminar favorito
 */
router.delete('/:idAlojamiento', verificarToken, (req, res) => {
  const usuarioId = req.user.id;
  const alojamientoId = Number(req.params.idAlojamiento);

  if (!Number.isFinite(alojamientoId) || alojamientoId <= 0) {
    return res.status(400).json({ status: 'error', mensaje: 'ID de alojamiento inválido.' });
  }

  db.run(
    'DELETE FROM favoritos_alojamientos WHERE id_usuario = ? AND id_alojamiento = ?',
    [usuarioId, alojamientoId],
    function(deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ status: 'error', mensaje: 'No se pudo eliminar favorito.' });
      }

      return res.status(200).json({
        status: 'success',
        mensaje: this.changes > 0
          ? 'Alojamiento eliminado de favoritos.'
          : 'El alojamiento ya no estaba en favoritos.'
      });
    }
  );
});

module.exports = router;
