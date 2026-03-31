const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');

/**
 * GET /api/mensajes/turista
 * Obtener todos los mensajes del turista autenticado
 */
router.get('/turista', verificarToken, (req, res) => {
  const turista_id = req.user.id;

  const sql = `
    SELECT 
      id,
      asunto,
      contenido,
      tipo,
      reserva_id,
      porcentaje_devolucion,
      motivo_descuento,
      estado,
      leido,
      fecha_creacion
    FROM mensajes
    WHERE turista_id = ?
    ORDER BY fecha_creacion DESC
  `;

  db.all(sql, [turista_id], (err, mensajes) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al obtener mensajes'
      });
    }

    res.status(200).json({
      status: 'success',
      mensajes: mensajes || []
    });
  });
});

/**
 * PUT /api/mensajes/:id/leido
 * Marcar un mensaje como leído
 */
router.put('/:id/leido', verificarToken, (req, res) => {
  const { id } = req.params;
  const turista_id = req.user.id;

  const sql = `
    UPDATE mensajes
    SET leido = 1
    WHERE id = ? AND turista_id = ?
  `;

  db.run(sql, [id, turista_id], function(err) {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al actualizar mensaje'
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'Mensaje no encontrado'
      });
    }

    res.status(200).json({
      status: 'success',
      mensaje: 'Mensaje marcado como leído'
    });
  });
});

/**
 * GET /api/mensajes/turista/sin-leer
 * Obtener cantidad de mensajes sin leer
 */
router.get('/turista/sin-leer', verificarToken, (req, res) => {
  const turista_id = req.user.id;

  const sql = `
    SELECT COUNT(*) as cantidad FROM mensajes
    WHERE turista_id = ? AND leido = 0
  `;

  db.get(sql, [turista_id], (err, result) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al contar mensajes'
      });
    }

    res.status(200).json({
      status: 'success',
      sin_leer: result.cantidad
    });
  });
});

/**
 * DELETE /api/mensajes/:id
 * Eliminar un mensaje
 */
router.delete('/:id', verificarToken, (req, res) => {
  const { id } = req.params;
  const turista_id = req.user.id;

  const sql = `
    DELETE FROM mensajes
    WHERE id = ? AND turista_id = ?
  `;

  db.run(sql, [id, turista_id], function(err) {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al eliminar mensaje'
      });
    }

    res.status(200).json({
      status: 'success',
      mensaje: 'Mensaje eliminado'
    });
  });
});

module.exports = router;
