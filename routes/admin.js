const express = require('express');
const db = require('../database');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');

const router = express.Router();

function obtenerFlagSuperadmin(userId, callback) {
  db.get(
    `SELECT COALESCE(u.es_superadmin, 0) AS es_superadmin
     FROM usuarios u
     WHERE u.id = ?`,
    [Number(userId || 0)],
    (err, row) => {
      if (err) return callback(err);
      callback(null, Number(row?.es_superadmin || 0) === 1);
    }
  );
}

router.get('/usuarios', verificarToken, soloRoles('admin'), (req, res) => {
  db.run(
    `UPDATE usuarios
     SET estado_cuenta = 'activo',
         suspension_hasta = NULL,
         suspension_motivo = NULL
     WHERE COALESCE(estado_cuenta, 'activo') = 'suspendido'
       AND suspension_hasta IS NOT NULL
       AND TRIM(COALESCE(suspension_hasta, '')) <> ''
       AND julianday(suspension_hasta) <= julianday('now')`,
    [],
    (upErr) => {
      if (upErr) return res.status(500).json({ error: 'Error actualizando suspensiones vencidas.' });

      db.all(
        `SELECT u.id,
                u.nombre,
                u.correo,
                COALESCE(r.nombre, 'sin_rol') AS rol,
                COALESCE(u.es_superadmin, 0) AS es_superadmin,
                COALESCE(u.estado_cuenta, 'activo') AS estado_cuenta,
                u.suspension_hasta,
                u.suspension_motivo,
                u.creado_en,
                (
                  SELECT GROUP_CONCAT(x.titulo, ' / ')
                  FROM (
                    SELECT a.titulo
                    FROM equipo_alojamiento ea
                    JOIN alojamientos a ON a.id = ea.id_alojamiento
                    WHERE ea.id_usuario = u.id
                      AND LOWER(COALESCE(ea.rol, '')) = 'administrador'
                      AND COALESCE(ea.estado, '') = 'activo'

                    UNION

                    SELECT a2.titulo
                    FROM admin_anfitriones aa
                    JOIN alojamientos a2 ON a2.id_anfitrion = aa.anfitrion_id
                    WHERE aa.admin_id = u.id
                  ) x
                ) AS alojamiento_asignado
         FROM usuarios u
         LEFT JOIN roles r ON r.id = u.rol_id
         ORDER BY u.id DESC`,
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(rows);
        }
      );
    }
  );
});

router.get('/extractos/reservas', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT r.id,
            r.fecha_entrada,
            r.fecha_salida,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM pagos p2
                WHERE p2.id_reserva = r.id
                  AND LOWER(TRIM(COALESCE(p2.estado, ''))) = 'rechazado'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM pagos p3
                WHERE p3.id_reserva = r.id
                  AND LOWER(TRIM(COALESCE(p3.estado, ''))) = 'pagado'
              ) THEN 'rechazado'
              ELSE r.estado
            END AS estado,
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
            CASE
              WHEN LOWER(COALESCE(r.estado, '')) = 'cancelada'
                   AND LOWER(COALESCE(p.estado, '')) = 'pagado' THEN 'cancelado'
              ELSE COALESCE(p.estado, 'pendiente')
            END AS estado,
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

router.get('/alojamientos/lista', verificarToken, soloRoles('admin'), (_req, res) => {
  db.all(
    `SELECT a.id, a.titulo
     FROM alojamientos a
     ORDER BY a.titulo ASC, a.id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo alojamientos.' });
      res.json(rows || []);
    }
  );
});

router.get('/anfitriones/lista', verificarToken, soloRoles('admin'), (_req, res) => {
  db.all(
    `SELECT DISTINCT ah.id, ah.nombre
     FROM alojamientos a
     JOIN usuarios ah ON ah.id = a.id_anfitrion
     ORDER BY ah.nombre ASC, ah.id ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo anfitriones.' });
      res.json(rows || []);
    }
  );
});

router.get('/finanzas/reservas', verificarToken, soloRoles('admin'), (req, res) => {
  const fechaInicio = String(req.query?.fecha_inicio || '').trim();
  const fechaFin = String(req.query?.fecha_fin || '').trim();
  const alojamientoId = Number(req.query?.alojamiento_id || 0);

  const params = [];
  let whereExtra = '';

  if (alojamientoId) {
    whereExtra += ' AND a.id = ?';
    params.push(alojamientoId);
  }

  if (fechaInicio) {
    whereExtra += ' AND date(r.creado_en) >= date(?)';
    params.push(fechaInicio);
  }

  if (fechaFin) {
    whereExtra += ' AND date(r.creado_en) <= date(?)';
    params.push(fechaFin);
  }

  const sql = `
    WITH base AS (
      SELECT
        r.id AS reserva_id,
        r.creado_en,
        COALESCE(r.estado, 'pendiente') AS estado_reserva,
        COALESCE(r.precio_total, 0) AS valor_reserva,
        a.id AS alojamiento_id,
        a.titulo AS alojamiento,
        ah.nombre AS anfitrion,
        COALESCE(
          (
            SELECT c.porcentaje_devolucion
            FROM cancelaciones c
            WHERE c.reserva_id = r.id
              AND COALESCE(c.estado, '') = 'confirmada'
            ORDER BY datetime(c.fecha_confirmacion) DESC, c.id DESC
            LIMIT 1
          ),
          COALESCE(r.cancelacion_porcentaje_reembolso, 0),
          0
        ) AS porcentaje_devolucion,
        COALESCE(
          (
            SELECT p.estado
            FROM pagos p
            WHERE p.id_reserva = r.id
            ORDER BY datetime(p.fecha) DESC, p.id DESC
            LIMIT 1
          ),
          'pendiente'
        ) AS estado_pago_raw
      FROM reservas r
      JOIN habitaciones h ON h.id = r.id_habitacion
      JOIN alojamientos a ON a.id = h.id_alojamiento
      JOIN usuarios ah ON ah.id = a.id_anfitrion
      WHERE 1 = 1
      ${whereExtra}
    )
    SELECT
      reserva_id,
      alojamiento_id,
      alojamiento,
      anfitrion,
      creado_en,
      estado_reserva,
      CASE
        WHEN LOWER(COALESCE(estado_reserva, '')) = 'cancelada'
             AND LOWER(COALESCE(estado_pago_raw, '')) = 'pagado' THEN 'cancelado'
        WHEN LOWER(COALESCE(estado_pago_raw, '')) = 'rechazado' THEN 'rechazado'
        WHEN LOWER(COALESCE(estado_pago_raw, '')) = 'pagado' THEN 'pago'
        ELSE 'pendiente por pago'
      END AS estado_pago,
      ROUND(valor_reserva, 2) AS valor_reserva,
      ROUND(COALESCE(porcentaje_devolucion, 0), 2) AS porcentaje_devolucion,
      ROUND(
        CASE
          WHEN LOWER(COALESCE(estado_reserva, '')) = 'cancelada'
               AND LOWER(COALESCE(estado_pago_raw, '')) = 'pagado'
            THEN valor_reserva * (COALESCE(porcentaje_devolucion, 0) / 100.0)
          ELSE 0
        END,
      2) AS valor_devolucion,
      ROUND(
        CASE
          WHEN LOWER(COALESCE(estado_pago_raw, '')) = 'pagado' THEN valor_reserva * 0.15
          ELSE 0
        END,
      2) AS comision_plataforma,
      ROUND(
        CASE
          WHEN LOWER(COALESCE(estado_pago_raw, '')) = 'pagado' THEN
            valor_reserva
            - (valor_reserva * 0.15)
            - CASE
                WHEN LOWER(COALESCE(estado_reserva, '')) = 'cancelada'
                  THEN valor_reserva * (COALESCE(porcentaje_devolucion, 0) / 100.0)
                ELSE 0
              END
          ELSE 0
        END,
      2) AS neto_alojamiento
    FROM base
    ORDER BY reserva_id DESC
    LIMIT 800
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error obteniendo informe financiero.' });

    const lista = rows || [];
    const totales = lista.reduce((acc, row) => {
      const estadoPago = String(row.estado_pago || '').toLowerCase();
      const valor = Number(row.valor_reserva || 0);
      const devolucion = Number(row.valor_devolucion || 0);
      const comision = Number(row.comision_plataforma || 0);
      const neto = Number(row.neto_alojamiento || 0);

      acc.total_reservas += 1;
      acc.valor_total_reservas += valor;
      acc.total_devoluciones += devolucion;
      acc.total_comision_plataforma += comision;
      acc.total_neto_alojamientos += neto;

      if (estadoPago === 'pago') {
        acc.total_pago += valor;
      } else if (estadoPago === 'cancelado') {
        acc.total_cancelado += valor;
      } else {
        acc.total_pendiente += valor;
      }

      return acc;
    }, {
      total_reservas: 0,
      valor_total_reservas: 0,
      total_pago: 0,
      total_pendiente: 0,
      total_cancelado: 0,
      total_devoluciones: 0,
      total_comision_plataforma: 0,
      total_neto_alojamientos: 0
    });

    res.json({
      totales,
      reservas: lista
    });
  });
});

router.get('/transacciones/devoluciones', verificarToken, soloRoles('admin'), (req, res) => {
  const fechaInicio = String(req.query?.fecha_inicio || '').trim();
  const fechaFin = String(req.query?.fecha_fin || '').trim();
  const alojamientoId = Number(req.query?.alojamiento_id || 0);
  const pasarela = String(req.query?.pasarela || '').trim().toLowerCase();
  const metodoPago = String(req.query?.metodo_pago || '').trim().toLowerCase();
  const anfitrionId = Number(req.query?.anfitrion_id || 0);

  const params = [];
  let whereExtra = '';

  if (alojamientoId) {
    whereExtra += ' AND a.id = ?';
    params.push(alojamientoId);
  }

  if (anfitrionId) {
    whereExtra += ' AND a.id_anfitrion = ?';
    params.push(anfitrionId);
  }

  if (fechaInicio) {
    whereExtra += ' AND date(r.creado_en) >= date(?)';
    params.push(fechaInicio);
  }

  if (fechaFin) {
    whereExtra += ' AND date(r.creado_en) <= date(?)';
    params.push(fechaFin);
  }

  const filtroPasarelaParams = [];
  const filtroPasarelaSql = pasarela
    ? ` AND LOWER(TRIM(COALESCE(pasarela_reembolso, pasarela_pago, 'wompi'))) = ?`
    : '';
  const filtroMetodoParams = [];
  const filtroMetodoSql = metodoPago
    ? ` AND LOWER(TRIM(COALESCE(metodo_pago, 'pse'))) = ?`
    : '';

  if (pasarela) {
    filtroPasarelaParams.push(pasarela);
  }
  if (metodoPago) {
    filtroMetodoParams.push(metodoPago);
  }

  const sql = `
    WITH base AS (
      SELECT
        r.id AS reserva_id,
        r.creado_en,
        a.id AS alojamiento_id,
        a.titulo AS alojamiento,
        ah.nombre AS anfitrion,
        COALESCE(r.titular_nombre, u.nombre) AS turista,
        COALESCE(r.titular_correo, u.correo) AS correo_turista,
        COALESCE(
          (
            SELECT c.porcentaje_devolucion
            FROM cancelaciones c
            WHERE c.reserva_id = r.id
              AND COALESCE(c.estado, '') = 'confirmada'
            ORDER BY datetime(c.fecha_confirmacion) DESC, c.id DESC
            LIMIT 1
          ),
          COALESCE(r.cancelacion_porcentaje_reembolso, 0),
          0
        ) AS porcentaje_devolucion,
        COALESCE(
          (
            SELECT p2.monto
            FROM pagos p2
            WHERE p2.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p2.estado, ''))) = 'pagado'
              AND COALESCE(p2.monto, 0) > 0
            ORDER BY datetime(p2.fecha) DESC, p2.id DESC
            LIMIT 1
          ),
          0
        ) AS valor_pagado,
        COALESCE(
          (
            SELECT p2.metodo_pago
            FROM pagos p2
            WHERE p2.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p2.estado, ''))) = 'pagado'
              AND COALESCE(p2.monto, 0) > 0
            ORDER BY datetime(p2.fecha) DESC, p2.id DESC
            LIMIT 1
          ),
          'pse'
        ) AS metodo_pago,
        COALESCE(
          (
            SELECT p2.pasarela
            FROM pagos p2
            WHERE p2.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p2.estado, ''))) = 'pagado'
              AND COALESCE(p2.monto, 0) > 0
            ORDER BY datetime(p2.fecha) DESC, p2.id DESC
            LIMIT 1
          ),
          'wompi'
        ) AS pasarela_pago,
        COALESCE(
          (
            SELECT p2.referencia_pago
            FROM pagos p2
            WHERE p2.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p2.estado, ''))) = 'pagado'
              AND COALESCE(p2.monto, 0) > 0
            ORDER BY datetime(p2.fecha) DESC, p2.id DESC
            LIMIT 1
          ),
          r.referencia_pago,
          '-'
        ) AS referencia_pago,
        ABS(COALESCE(
          (
            SELECT p3.monto
            FROM pagos p3
            WHERE p3.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p3.estado, ''))) = 'pagado'
              AND COALESCE(p3.monto, 0) < 0
            ORDER BY datetime(p3.fecha) DESC, p3.id DESC
            LIMIT 1
          ),
          0
        )) AS devolucion_pasarela,
        COALESCE(
          (
            SELECT p3.pasarela
            FROM pagos p3
            WHERE p3.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p3.estado, ''))) = 'pagado'
              AND COALESCE(p3.monto, 0) < 0
            ORDER BY datetime(p3.fecha) DESC, p3.id DESC
            LIMIT 1
          ),
          NULL
        ) AS pasarela_reembolso,
        COALESCE(
          (
            SELECT p3.referencia_pago
            FROM pagos p3
            WHERE p3.id_reserva = r.id
              AND LOWER(TRIM(COALESCE(p3.estado, ''))) = 'pagado'
              AND COALESCE(p3.monto, 0) < 0
            ORDER BY datetime(p3.fecha) DESC, p3.id DESC
            LIMIT 1
          ),
          NULL
        ) AS referencia_reembolso
      FROM reservas r
      JOIN habitaciones h ON h.id = r.id_habitacion
      JOIN alojamientos a ON a.id = h.id_alojamiento
      JOIN usuarios ah ON ah.id = a.id_anfitrion
      LEFT JOIN usuarios u ON u.id = r.id_usuario
      WHERE LOWER(TRIM(COALESCE(r.estado, ''))) = 'cancelada'
      ${whereExtra}
    )
    SELECT
      reserva_id,
      alojamiento_id,
      alojamiento,
      anfitrion,
      turista,
      correo_turista,
      creado_en,
      ROUND(valor_pagado, 2) AS valor_pagado,
      ROUND(COALESCE(porcentaje_devolucion, 0), 2) AS porcentaje_devolucion,
      metodo_pago,
      pasarela_pago,
      referencia_pago,
      COALESCE(pasarela_reembolso, pasarela_pago, 'wompi') AS pasarela_reembolso,
      referencia_reembolso,
      ROUND(
        CASE
          WHEN devolucion_pasarela > 0 THEN devolucion_pasarela
          ELSE valor_pagado * (COALESCE(porcentaje_devolucion, 0) / 100.0)
        END,
      2) AS valor_devolucion,
      ROUND(
        CASE
          WHEN valor_pagado > 0 THEN
            valor_pagado - (
              CASE
                WHEN devolucion_pasarela > 0 THEN devolucion_pasarela
                ELSE valor_pagado * (COALESCE(porcentaje_devolucion, 0) / 100.0)
              END
            )
          ELSE 0
        END,
      2) AS saldo_descuento,
      ROUND(
        CASE
          WHEN valor_pagado > 0 THEN (100 - COALESCE(porcentaje_devolucion, 0))
          ELSE 0
        END,
      2) AS porcentaje_descuento
    FROM base
    WHERE COALESCE(valor_pagado, 0) > 0
    ${filtroPasarelaSql}
    ${filtroMetodoSql}
    ORDER BY reserva_id DESC
    LIMIT 1000
  `;

  db.all(sql, [...params, ...filtroPasarelaParams, ...filtroMetodoParams], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error obteniendo transacciones de devoluciones.' });
    }

    const lista = rows || [];
    const totales = lista.reduce((acc, row) => {
      acc.total_transacciones += 1;
      acc.total_pagado_turistas += Number(row.valor_pagado || 0);
      acc.total_devuelto_turistas += Number(row.valor_devolucion || 0);
      acc.total_descuento_alojamientos += Number(row.saldo_descuento || 0);
      return acc;
    }, {
      total_transacciones: 0,
      total_pagado_turistas: 0,
      total_devuelto_turistas: 0,
      total_descuento_alojamientos: 0
    });

    totales.porcentaje_devuelto_global = totales.total_pagado_turistas > 0
      ? Number(((totales.total_devuelto_turistas / totales.total_pagado_turistas) * 100).toFixed(2))
      : 0;
    totales.porcentaje_descuento_global = totales.total_pagado_turistas > 0
      ? Number(((totales.total_descuento_alojamientos / totales.total_pagado_turistas) * 100).toFixed(2))
      : 0;

    res.json({
      totales,
      transacciones: lista
    });
  });
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
    `SELECT u.id,
            COALESCE(r.nombre, 'sin_rol') AS rol,
            COALESCE(u.es_superadmin, 0) AS es_superadmin
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

      obtenerFlagSuperadmin(req.user.id, (permErr, actorEsSuperadmin) => {
        if (permErr) return res.status(500).json({ error: 'Error validando permisos del administrador.' });

        if (user.rol === 'admin') {
          if (Number(user.es_superadmin || 0) === 1) {
            return res.status(400).json({ error: 'No se permite suspender cuentas de admin de plataforma.' });
          }

          if (!actorEsSuperadmin) {
            return res.status(403).json({ error: 'Solo el admin de plataforma puede suspender administradores de alojamientos.' });
          }
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
      });
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
    `SELECT u.id,
            COALESCE(r.nombre, 'sin_rol') AS rol,
            COALESCE(u.es_superadmin, 0) AS es_superadmin
     FROM usuarios u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?`,
    [userId],
    (findErr, user) => {
      if (findErr) return res.status(500).json({ error: 'Error buscando usuario.' });
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

      obtenerFlagSuperadmin(req.user.id, (permErr, actorEsSuperadmin) => {
        if (permErr) return res.status(500).json({ error: 'Error validando permisos del administrador.' });

        if (user.rol === 'admin') {
          if (Number(user.es_superadmin || 0) === 1) {
            return res.status(400).json({ error: 'No se permite eliminar cuentas de admin de plataforma.' });
          }

          if (!actorEsSuperadmin) {
            return res.status(403).json({ error: 'Solo el admin de plataforma puede eliminar administradores de alojamientos.' });
          }
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
      });
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

router.get('/alojamientos-admin/anfitriones', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT u.id,
            u.nombre,
            u.correo,
            COALESCE(u.estado_cuenta, 'activo') AS estado_cuenta,
            aa.admin_id AS admin_id,
            aa.anfitrion_id,
            aa.asignado_en AS asignado_en,
            adm.nombre AS admin_nombre,
            COALESCE(GROUP_CONCAT(DISTINCT CAST(a.id AS TEXT)), '') AS alojamiento_ids,
            MIN(a.id) AS alojamiento_id,
            COALESCE(GROUP_CONCAT(DISTINCT a.titulo), '') AS alojamiento_titulo
     FROM admin_anfitriones aa
     JOIN usuarios u ON u.id = aa.anfitrion_id
     LEFT JOIN usuarios adm ON adm.id = aa.admin_id
     LEFT JOIN alojamientos a ON a.id_anfitrion = aa.anfitrion_id
     WHERE aa.admin_id = ?
     GROUP BY u.id, u.nombre, u.correo, u.estado_cuenta, aa.admin_id, aa.anfitrion_id, aa.asignado_en, adm.nombre
     ORDER BY datetime(aa.asignado_en) DESC`,
    [Number(req.user.id || 0)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo anfitriones.' });
      res.json(rows || []);
    }
  );
});

router.get('/alojamientos-admin/permisos', verificarToken, soloRoles('admin'), (req, res) => {
  obtenerFlagSuperadmin(req.user.id, (err, esSuperadmin) => {
    if (err) return res.status(500).json({ error: 'Error validando permisos del administrador.' });
    res.json({ es_superadmin: esSuperadmin });
  });
});

router.get('/alojamientos-admin/admins', verificarToken, soloRoles('admin'), (req, res) => {
  db.all(
    `SELECT u.id,
            u.nombre,
            u.correo,
            COALESCE(u.es_superadmin, 0) AS es_superadmin
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'admin'
     ORDER BY COALESCE(u.es_superadmin, 0) DESC, u.nombre ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo administradores.' });
      res.json(rows || []);
    }
  );
});

router.post('/alojamientos-admin/asignaciones', verificarToken, soloRoles('admin'), (req, res) => {
  const anfitrionId = Number(req.body?.anfitrion_id || 0);
  const adminId = Number(req.body?.admin_id || req.user.id || 0);

  if (!anfitrionId || !adminId) {
    return res.status(400).json({ error: 'anfitrion_id y admin_id son requeridos.' });
  }

  obtenerFlagSuperadmin(req.user.id, (permErr, esSuperadmin) => {
    if (permErr) return res.status(500).json({ error: 'Error validando permisos del administrador.' });

    if (!esSuperadmin) {
      return res.status(403).json({ error: 'No tienes permiso para asignar anfitriones manualmente.' });
    }

    if (!esSuperadmin && adminId !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Solo un superadmin puede asignar anfitriones a otros administradores.' });
    }

    db.get(
      `SELECT u.id
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ? AND r.nombre = 'anfitrion'`,
      [anfitrionId],
      (hostErr, host) => {
        if (hostErr) return res.status(500).json({ error: 'Error validando anfitrión.' });
        if (!host) return res.status(404).json({ error: 'Anfitrión no encontrado.' });

        db.get(
          `SELECT u.id
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
           WHERE u.id = ? AND r.nombre = 'admin'`,
          [adminId],
          (adminErr, admin) => {
            if (adminErr) return res.status(500).json({ error: 'Error validando administrador.' });
            if (!admin) return res.status(404).json({ error: 'Administrador no encontrado.' });

            db.get(
              `SELECT admin_id
               FROM admin_anfitriones
               WHERE anfitrion_id = ?`,
              [anfitrionId],
              (assignmentErr, currentAssignment) => {
                if (assignmentErr) return res.status(500).json({ error: 'Error validando asignación actual.' });

                const adminActual = Number(currentAssignment?.admin_id || 0);
                const esReasignacion = adminActual > 0 && adminActual !== adminId;

                if (!esSuperadmin && esReasignacion) {
                  return res.status(403).json({ error: 'Solo un superadmin puede reasignar anfitriones entre administradores.' });
                }

                db.run(
                  `INSERT INTO admin_anfitriones (admin_id, anfitrion_id, asignado_por)
                   VALUES (?, ?, ?)
                   ON CONFLICT(anfitrion_id)
                   DO UPDATE SET
                     admin_id = excluded.admin_id,
                     asignado_por = excluded.asignado_por,
                     asignado_en = CURRENT_TIMESTAMP`,
                  [adminId, anfitrionId, Number(req.user.id || 0)],
                  function(assignErr) {
                    if (assignErr) return res.status(500).json({ error: 'No se pudo guardar la asignación.' });
                    res.json({ ok: true, mensaje: 'Asignación guardada correctamente.' });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

router.delete('/alojamientos-admin/asignaciones/:anfitrionId', verificarToken, soloRoles('admin'), (req, res) => {
  const idObjetivo = Number(req.params.anfitrionId || 0);
  if (!idObjetivo) {
    return res.status(400).json({ error: 'Identificador invalido.' });
  }

  db.run(
    `DELETE FROM admin_anfitriones
     WHERE anfitrion_id = ?
       AND admin_id = ?`,
    [idObjetivo, Number(req.user.id || 0)],
    function onUpdate(err) {
      if (err) return res.status(500).json({ error: 'No se pudo retirar la asignacion.' });
      if (!this.changes) {
        return res.status(404).json({ error: 'No existe una asignacion activa para retirar con ese anfitrion.' });
      }
      res.json({ ok: true, mensaje: 'Asignacion retirada del panel correctamente.' });
    }
  );
});

router.get('/alojamientos-admin/resumen', verificarToken, soloRoles('admin'), (req, res) => {
  const adminId = Number(req.user.id || 0);

  const sql = `
    WITH alojamientos_asignados AS (
      SELECT DISTINCT a.id, a.id_anfitrion
      FROM admin_anfitriones aa
      JOIN alojamientos a ON a.id_anfitrion = aa.anfitrion_id
      WHERE aa.admin_id = ?
    )
    SELECT
      (SELECT COUNT(DISTINCT la.id_anfitrion) FROM alojamientos_asignados la) AS anfitriones_asignados,
      (SELECT COUNT(*) FROM alojamientos_asignados) AS alojamientos_asignados,
      (SELECT COUNT(*)
         FROM reservas r
         JOIN habitaciones h ON h.id = r.id_habitacion
         JOIN alojamientos_asignados la ON la.id = h.id_alojamiento) AS reservas_total,
      (SELECT COALESCE(SUM(p.monto), 0)
         FROM pagos p
         JOIN reservas r ON r.id = p.id_reserva
         JOIN habitaciones h ON h.id = r.id_habitacion
         JOIN alojamientos_asignados la ON la.id = h.id_alojamiento
        WHERE COALESCE(p.estado, '') = 'pagado') AS ingresos_pagados
  `;

  db.get(sql, [adminId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error obteniendo resumen de alojamientos.' });
    res.json(row || {
      anfitriones_asignados: 0,
      alojamientos_asignados: 0,
      reservas_total: 0,
      ingresos_pagados: 0
    });
  });
});

router.get('/alojamientos-admin/movimientos', verificarToken, soloRoles('admin'), (req, res) => {
  const adminId = Number(req.user.id || 0);
  const alojamientoId = Number(req.query?.alojamiento_id || 0);
  const limit = Math.min(Math.max(Number(req.query?.limit || 200), 20), 500);

  const query = `
    WITH alojamientos_asignados AS (
      SELECT DISTINCT a.id
      FROM admin_anfitriones aa
      JOIN alojamientos a ON a.id_anfitrion = aa.anfitrion_id
      WHERE aa.admin_id = ?
        ${alojamientoId ? 'AND a.id = ?' : ''}
    )
    SELECT * FROM (
      SELECT 'alojamiento_creado' AS tipo,
             a.creado_en AS fecha,
             a.id AS alojamiento_id,
             a.titulo AS alojamiento,
             u.id AS anfitrion_id,
             u.nombre AS anfitrion,
             'Se registró un nuevo alojamiento' AS detalle,
             NULL AS valor
      FROM alojamientos a
      JOIN usuarios u ON u.id = a.id_anfitrion
      JOIN alojamientos_asignados la ON la.id = a.id

      UNION ALL

      SELECT 'reserva' AS tipo,
             r.creado_en AS fecha,
             a.id AS alojamiento_id,
             a.titulo AS alojamiento,
             u.id AS anfitrion_id,
             u.nombre AS anfitrion,
             ('Reserva #' || r.id || ' estado: ' || COALESCE(r.estado, 'pendiente')) AS detalle,
             r.precio_total AS valor
      FROM reservas r
      JOIN habitaciones h ON h.id = r.id_habitacion
      JOIN alojamientos a ON a.id = h.id_alojamiento
      JOIN usuarios u ON u.id = a.id_anfitrion
      JOIN alojamientos_asignados la ON la.id = a.id

      UNION ALL

      SELECT 'pago' AS tipo,
             p.fecha AS fecha,
             a.id AS alojamiento_id,
             a.titulo AS alojamiento,
             u.id AS anfitrion_id,
             u.nombre AS anfitrion,
             ('Pago ' || COALESCE(p.metodo_pago, '-') || ' | estado: ' || COALESCE(p.estado, 'pendiente')) AS detalle,
             p.monto AS valor
      FROM pagos p
      JOIN reservas r ON r.id = p.id_reserva
      JOIN habitaciones h ON h.id = r.id_habitacion
      JOIN alojamientos a ON a.id = h.id_alojamiento
      JOIN usuarios u ON u.id = a.id_anfitrion
      JOIN alojamientos_asignados la ON la.id = a.id
    ) movimientos
    ORDER BY datetime(fecha) DESC
    LIMIT ${limit}
  `;

  const params = alojamientoId ? [adminId, alojamientoId] : [adminId];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error obteniendo movimientos.' });
    res.json(rows || []);
  });
});

router.get('/alojamientos-admin/extractos', verificarToken, soloRoles('admin'), (req, res) => {
  const adminId = Number(req.user.id || 0);
  const alojamientoId = Number(req.query?.alojamiento_id || 0);

  const query = `
    WITH alojamientos_asignados AS (
      SELECT DISTINCT a.id
      FROM admin_anfitriones aa
      JOIN alojamientos a ON a.id_anfitrion = aa.anfitrion_id
      WHERE aa.admin_id = ?
        ${alojamientoId ? 'AND a.id = ?' : ''}
    )
    SELECT a.id AS alojamiento_id,
           a.titulo AS alojamiento,
           u.id AS anfitrion_id,
           u.nombre AS anfitrion,
           COUNT(DISTINCT r.id) AS reservas_total,
           SUM(CASE WHEN COALESCE(r.estado, '') = 'confirmada' THEN 1 ELSE 0 END) AS reservas_confirmadas,
           SUM(CASE WHEN COALESCE(r.estado, '') = 'cancelada' THEN 1 ELSE 0 END) AS reservas_canceladas,
           COALESCE(SUM(CASE WHEN COALESCE(p.estado, '') = 'pagado' THEN p.monto ELSE 0 END), 0) AS ingresos_pagados,
           MAX(r.creado_en) AS ultima_reserva
    FROM alojamientos a
    JOIN alojamientos_asignados la ON la.id = a.id
    JOIN usuarios u ON u.id = a.id_anfitrion
    LEFT JOIN habitaciones h ON h.id_alojamiento = a.id
    LEFT JOIN reservas r ON r.id_habitacion = h.id
    LEFT JOIN pagos p ON p.id_reserva = r.id
    GROUP BY a.id, a.titulo, u.id, u.nombre
    ORDER BY a.id DESC
  `;

  const params = alojamientoId ? [adminId, alojamientoId] : [adminId];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error obteniendo extractos informativos.' });
    res.json(rows || []);
  });
});

module.exports = router;
