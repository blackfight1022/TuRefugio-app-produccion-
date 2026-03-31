const express = require('express');
const db = require('../database');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/usuarios', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT u.id,
            u.nombre,
            u.correo,
            COALESCE(r.nombre, 'sin_rol') AS rol,
            COALESCE(u.estado_cuenta, 'activo') AS estado_cuenta,
            u.suspension_hasta,
            u.suspension_motivo,
            u.creado_en
     FROM usuarios u
     LEFT JOIN roles r ON r.id = u.rol_id
     ORDER BY u.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

router.get('/extractos/reservas', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT r.id,
            r.fecha_entrada,
            r.fecha_salida,
            r.estado,
            r.precio_total,
            r.referencia_pago,
            r.creado_en,
            COALESCE(r.titular_nombre, u.nombre) AS turista,
            COALESCE(r.titular_correo, u.correo) AS correo_turista,
            h.nombre AS habitacion,
            a.titulo AS alojamiento,
            ah.nombre AS anfitrion
     FROM reservas r
     JOIN usuarios u ON u.id = r.id_usuario
     JOIN habitaciones h ON h.id = r.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     JOIN usuarios ah ON ah.id = a.id_anfitrion
     ORDER BY r.id DESC
     LIMIT 300`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo extractos de reservas.' });
      res.json(rows || []);
    }
  );
});

router.get('/extractos/transacciones', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT p.id,
            p.id_reserva,
            p.monto,
            p.metodo_pago,
            p.estado,
            p.referencia_pago,
            p.transaccion_externa,
            p.pasarela,
            p.fecha,
            COALESCE(r.titular_nombre, u.nombre) AS turista,
            COALESCE(r.titular_correo, u.correo) AS correo_turista,
            a.titulo AS alojamiento,
            ah.nombre AS anfitrion
     FROM pagos p
     JOIN reservas r ON r.id = p.id_reserva
     JOIN usuarios u ON u.id = r.id_usuario
     JOIN habitaciones h ON h.id = r.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     JOIN usuarios ah ON ah.id = a.id_anfitrion
     ORDER BY p.id DESC
     LIMIT 300`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo transacciones.' });
      res.json(rows || []);
    }
  );
});

router.patch('/usuarios/:id/suspension', verificarToken, soloRoles('admin'), (req, res) => {
  const userId = Number(req.params.id);
  const { estado, suspension_hasta, suspension_motivo } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'ID de usuario invalido.' });
  }

  const estadoNormalizado = String(estado || '').trim().toLowerCase();
  if (!['activo', 'suspendido'].includes(estadoNormalizado)) {
    return res.status(400).json({ error: 'El estado debe ser activo o suspendido.' });
  }

  db.get(
    `SELECT u.id, COALESCE(r.nombre, 'sin_rol') AS rol
     FROM usuarios u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?`,
    [userId],
    (findErr, user) => {
      if (findErr) return res.status(500).json({ error: 'Error buscando usuario.' });
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

      if (user.id === Number(req.user.id)) {
        return res.status(400).json({ error: 'No puedes suspender tu propia cuenta de administrador.' });
      }

      if (user.rol === 'admin') {
        return res.status(400).json({ error: 'No se permite suspender cuentas con rol admin.' });
      }

      let hasta = null;
      if (estadoNormalizado === 'suspendido' && suspension_hasta) {
        const fecha = new Date(suspension_hasta);
        if (Number.isNaN(fecha.getTime())) {
          return res.status(400).json({ error: 'La fecha de suspension no es valida.' });
        }
        hasta = fecha.toISOString();
      }

      db.run(
        `UPDATE usuarios
         SET estado_cuenta = ?,
             suspension_hasta = ?,
             suspension_motivo = ?
         WHERE id = ?`,
        [
          estadoNormalizado,
          estadoNormalizado === 'suspendido' ? hasta : null,
          estadoNormalizado === 'suspendido' ? String(suspension_motivo || '').trim() || null : null,
          userId
        ],
        function(updateErr) {
          if (updateErr) return res.status(500).json({ error: 'No se pudo actualizar el estado del usuario.' });
          if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado para actualizar.' });
          res.json({ mensaje: `Usuario ${estadoNormalizado} correctamente.` });
        }
      );
    }
  );
});

router.delete('/usuarios/:id', verificarToken, soloRoles('admin'), (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'ID de usuario invalido.' });
  }

  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
  }

  db.get(
    `SELECT u.id, COALESCE(r.nombre, 'sin_rol') AS rol
     FROM usuarios u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?`,
    [userId],
    (findErr, user) => {
      if (findErr) return res.status(500).json({ error: 'Error buscando usuario.' });
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

      if (user.rol === 'admin') {
        return res.status(400).json({ error: 'No se permite eliminar cuentas con rol admin.' });
      }

      const eliminarUsuario = () => {
        db.run('DELETE FROM usuarios WHERE id = ?', [userId], function(deleteErr) {
          if (deleteErr) return res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
          if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado para eliminar.' });
          res.json({ mensaje: 'Usuario eliminado correctamente.' });
        });
      };

      if (user.rol === 'anfitrion') {
        db.run('DELETE FROM alojamientos WHERE id_anfitrion = ?', [userId], (delAlojErr) => {
          if (delAlojErr) return res.status(500).json({ error: 'No se pudieron eliminar los alojamientos del anfitrion.' });
          eliminarUsuario();
        });
        return;
      }

      eliminarUsuario();
    }
  );
});

router.get('/dashboard/resumen', verificarToken, soloRoles('admin'), (req, res) => {
  db.serialize(() => {
    db.get(`SELECT COUNT(*) AS total_usuarios FROM usuarios`, [], (e1, usuarios) => {
      if (e1) return res.status(500).json({ error: 'Error obteniendo usuarios.' });

      db.get(`SELECT COUNT(*) AS total_reservas FROM reservas`, [], (e2, reservas) => {
        if (e2) return res.status(500).json({ error: 'Error obteniendo reservas.' });

        db.get(`SELECT COUNT(*) AS total_transacciones FROM pagos`, [], (e3, pagos) => {
          if (e3) return res.status(500).json({ error: 'Error obteniendo transacciones.' });

          db.get(`SELECT COUNT(*) AS cuentas_suspendidas FROM usuarios WHERE COALESCE(estado_cuenta,'activo')='suspendido'`, [], (e4, suspendidas) => {
            if (e4) return res.status(500).json({ error: 'Error obteniendo suspendidos.' });

            res.json({
              total_usuarios: usuarios?.total_usuarios || 0,
              total_reservas: reservas?.total_reservas || 0,
              total_transacciones: pagos?.total_transacciones || 0,
              cuentas_suspendidas: suspendidas?.cuentas_suspendidas || 0
            });
          });
        });
      });
    });
  });
});

module.exports = router;
