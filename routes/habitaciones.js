const multer = require('multer');
const path = require('path');
const express = require('express');
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');
const verificarPropietarioHabitacion =
  require('../middlewares/verificarPropietarioHabitacion');
const router = express.Router();
const sseHabitacionesPorAlojamiento = new Map();

function enviarEventoSSEHabitaciones(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data || {})}\n\n`);
}

function publicarCambioHabitacionesAlojamiento(idAlojamiento, motivo = 'estado_actualizado') {
  const key = Number(idAlojamiento || 0);
  if (!key) return;

  const clientes = sseHabitacionesPorAlojamiento.get(key);
  if (!clientes || !clientes.size) return;

  for (const cliente of clientes) {
    try {
      enviarEventoSSEHabitaciones(cliente, 'habitaciones_actualizadas', {
        alojamientoId: key,
        motivo,
        ts: Date.now()
      });
    } catch (_) {
      // Ignorar errores individuales de clientes desconectados.
    }
  }
}

function toSqlDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function validarCanalYDestinatario(canal, destinatario) {
  const canalNormalizado = String(canal || '').trim().toLowerCase();
  const destino = String(destinatario || '').trim();

  if (canalNormalizado !== 'email') {
    return { ok: false, error: 'Por ahora solo está disponible el canal de correo electrónico.' };
  }

  if (!destino) {
    return { ok: false, error: 'Debes indicar el destinatario para la notificación.' };
  }

  if (canalNormalizado === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(destino)) {
      return { ok: false, error: 'Correo electrónico inválido.' };
    }
  }

  return { ok: true, canal: canalNormalizado, destinatario: destino };
}

function construirMensajeDisponibilidad(alerta) {
  const nombreHabitacion = String(alerta.nombre_habitacion || 'Habitación').trim();
  const tituloAlojamiento = String(alerta.titulo_alojamiento || 'Tu Refugio').trim();
  return `¡Buenas noticias! La habitacion N° ${nombreHabitacion} del alojamiento ${tituloAlojamiento} ya se encuentra disponible para reservar`;
}

function encolarAlertasDisponibilidadHabitaciones(cb) {
  db.all(
    `SELECT ad.id,
            ad.id_habitacion,
            ad.canal,
            ad.destinatario,
            h.nombre AS nombre_habitacion,
            a.titulo AS titulo_alojamiento
     FROM alertas_disponibilidad_habitacion ad
     JOIN habitaciones h ON h.id = ad.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     WHERE ad.estado = 'activa'
       AND NOT EXISTS (
         SELECT 1
         FROM notificaciones_general ng
         WHERE ng.referencia_tipo = 'alerta_disponibilidad_habitacion'
           AND ng.referencia_id = ad.id
       )
       AND COALESCE(h.estado_manual, 'disponible') = 'disponible'
       AND NOT EXISTS (
         SELECT 1
         FROM reservas r
         WHERE r.id_habitacion = h.id
           AND r.estado IN ('pendiente','confirmada','en_curso')
           AND COALESCE(
             datetime(r.fecha_salida || ' 12:00:00'),
             datetime(r.fecha_salida),
             datetime(r.fecha_entrada || ' 12:00:00')
           ) >= datetime('now', 'localtime')
       )`,
    [],
    (err, alertas) => {
      if (err) {
        console.error('[habitaciones] error consultando alertas disponibilidad:', err.message);
        return cb();
      }

      if (!Array.isArray(alertas) || !alertas.length) {
        return cb();
      }

      let pendientes = alertas.length;
      const finalizar = () => {
        pendientes -= 1;
        if (pendientes <= 0) cb();
      };

      alertas.forEach((alerta) => {
        const mensaje = construirMensajeDisponibilidad(alerta);

        db.run(
          `INSERT INTO notificaciones_general (referencia_tipo, referencia_id, canal, destinatario, mensaje, estado)
           VALUES ('alerta_disponibilidad_habitacion', ?, ?, ?, ?, 'pendiente_integracion')`,
          [alerta.id, alerta.canal, alerta.destinatario, mensaje],
          (insertErr) => {
            if (insertErr) {
              console.error('[habitaciones] error encolando alerta disponibilidad:', insertErr.message);
              return finalizar();
            }

            db.run(
              `UPDATE alertas_disponibilidad_habitacion
               SET estado = 'notificada',
                   notificado_en = datetime('now', 'localtime')
               WHERE id = ? AND estado = 'activa'`,
              [alerta.id],
              () => finalizar()
            );
          }
        );
      });
    }
  );
}

function sincronizarEstadosHabitaciones(cb) {
  db.serialize(() => {
    db.run(
      `UPDATE habitaciones
       SET estado_manual = 'disponible',
           limpieza_hasta = NULL,
           mantenimiento_hasta = NULL,
           mantenimiento_estimado_horas = NULL
       WHERE (
         COALESCE(estado_manual, 'disponible') = 'limpieza'
         AND limpieza_hasta IS NOT NULL
         AND datetime(limpieza_hasta) <= datetime('now', 'localtime')
       )
       OR (
         COALESCE(estado_manual, 'disponible') = 'mantenimiento'
         AND mantenimiento_hasta IS NOT NULL
         AND datetime(mantenimiento_hasta) <= datetime('now', 'localtime')
       )`
    );

    db.run(
      `UPDATE habitaciones
       SET estado_manual = 'limpieza',
           limpieza_hasta = NULL,
           limpieza_referencia_checkout = (
             SELECT MAX(datetime(r2.fecha_salida || ' 12:00:00'))
             FROM reservas r2
             WHERE r2.id_habitacion = habitaciones.id
               AND r2.estado IN ('confirmada','en_curso','finalizada')
               AND datetime(r2.fecha_salida || ' 12:00:00') <= datetime('now', 'localtime')
           )
       WHERE COALESCE(estado_manual, 'disponible') = 'disponible'
         AND NOT EXISTS (
           SELECT 1
           FROM reservas r3
           WHERE r3.id_habitacion = habitaciones.id
             AND r3.estado IN ('pendiente','confirmada','en_curso')
            AND COALESCE(
              datetime(r3.fecha_salida || ' 12:00:00'),
              datetime(r3.fecha_salida),
              datetime(r3.fecha_entrada || ' 12:00:00')
            ) >= datetime('now', 'localtime')
         )
         AND (
           SELECT MAX(datetime(r4.fecha_salida || ' 12:00:00'))
           FROM reservas r4
           WHERE r4.id_habitacion = habitaciones.id
             AND r4.estado IN ('confirmada','en_curso','finalizada')
             AND datetime(r4.fecha_salida || ' 12:00:00') <= datetime('now', 'localtime')
         ) IS NOT NULL
         AND (
           limpieza_referencia_checkout IS NULL
           OR datetime(
             (
               SELECT MAX(datetime(r5.fecha_salida || ' 12:00:00'))
               FROM reservas r5
               WHERE r5.id_habitacion = habitaciones.id
                 AND r5.estado IN ('confirmada','en_curso','finalizada')
                 AND datetime(r5.fecha_salida || ' 12:00:00') <= datetime('now', 'localtime')
             )
           ) > datetime(limpieza_referencia_checkout)
         )`
    );

    db.get(`SELECT 1`, [], () => {
      encolarAlertasDisponibilidadHabitaciones(() => cb());
    });
  });
}

router.get('/stream/alojamiento/:alojamientoId', (req, res) => {
  const alojamientoId = Number(req.params.alojamientoId || 0);
  if (!alojamientoId) {
    return res.status(400).json({ error: 'ID de alojamiento inválido para stream.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  if (!sseHabitacionesPorAlojamiento.has(alojamientoId)) {
    sseHabitacionesPorAlojamiento.set(alojamientoId, new Set());
  }

  const clientes = sseHabitacionesPorAlojamiento.get(alojamientoId);
  clientes.add(res);

  enviarEventoSSEHabitaciones(res, 'stream_conectado', {
    ok: true,
    alojamientoId,
    ts: Date.now()
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      // noop
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseHabitacionesPorAlojamiento.get(alojamientoId);
    if (set) {
      set.delete(res);
      if (!set.size) sseHabitacionesPorAlojamiento.delete(alojamientoId);
    }
  });
});


const TIPOS_IMAGEN_PERMITIDOS_HAB = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXTENSION_IMAGEN_HAB = /\.(jpe?g|png|webp|gif)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_IMAGEN_HAB.test(file.originalname)
      ? path.extname(file.originalname).toLowerCase()
      : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_IMAGEN_PERMITIDOS_HAB.includes(file.mimetype) || !EXTENSION_IMAGEN_HAB.test(file.originalname)) {
      return cb(new Error('Solo se permiten imágenes JPG, PNG, WebP o GIF.'));
    }
    cb(null, true);
  }
});


// ======================================================
// CREAR HABITACIÓN
// ======================================================
router.post('/:alojamientoId', verificarToken, (req, res) => {
  const { nombre, capacidad, precio } = req.body;
  const { alojamientoId } = req.params;

  if (!nombre || !capacidad || !precio) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  db.get(
    'SELECT * FROM alojamientos WHERE id = ?',
    [alojamientoId],
    (err, alojamiento) => {
      if (err) return res.status(500).json({ error: 'Error verificando alojamiento.' });
      if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });
      if (req.user.rol !== 'admin' && alojamiento.id_anfitrion !== req.user.id) {
        return res.status(403).json({ error: 'No tienes permiso para agregar habitaciones aquí.' });
      }

      db.run(
        'INSERT INTO habitaciones (nombre, capacidad, precio, estado_manual, id_alojamiento) VALUES (?, ?, ?, ?, ?)',
        [nombre, capacidad, precio, 'disponible', alojamientoId],
        function (err) {
          if (err) return res.status(500).json({ error: 'Error creando habitación.' });
          res.status(201).json({ mensaje: 'Habitación creada correctamente.', id: this.lastID });
        }
      );
    }
  );
});

// ======================================================
// EDITAR HABITACIÓN
// ======================================================
router.put('/:id', verificarToken, verificarPropietarioHabitacion, (req, res) => {
  const habitacionId = Number(req.params.id || 0);
  const nombre = String(req.body?.nombre || '').trim();
  const capacidad = Number(req.body?.capacidad);
  const precio = Number(req.body?.precio);

  if (!habitacionId) {
    return res.status(400).json({ error: 'ID de habitación inválido.' });
  }

  if (!nombre || !Number.isFinite(capacidad) || capacidad <= 0 || !Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: 'Nombre, capacidad y precio son obligatorios y deben ser válidos.' });
  }

  db.run(
    `UPDATE habitaciones
     SET nombre = ?, capacidad = ?, precio = ?
     WHERE id = ?`,
    [nombre, Math.round(capacidad), precio, habitacionId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error actualizando habitación.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Habitación no encontrada.' });
      res.json({ mensaje: 'Habitación actualizada correctamente.' });
    }
  );
});

// ======================================================
// LISTAR HABITACIONES
// ======================================================
router.get('/alojamiento/:alojamientoId', (req, res) => {
  sincronizarEstadosHabitaciones(() => {
    db.all(
    `SELECT
      h.*,
      (
        SELECT MAX(
          COALESCE(
            datetime(r.fecha_salida || ' 12:00:00'),
            datetime(r.fecha_salida),
            datetime(r.fecha_entrada || ' 12:00:00')
          )
        )
        FROM reservas r
        WHERE r.id_habitacion = h.id
          AND r.estado IN ('pendiente','confirmada','en_curso')
          AND COALESCE(
            datetime(r.fecha_salida || ' 12:00:00'),
            datetime(r.fecha_salida),
            datetime(r.fecha_entrada || ' 12:00:00')
          ) >= datetime('now', 'localtime')
      ) AS ocupada_hasta,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM reservas r
          WHERE r.id_habitacion = h.id
            AND r.estado IN ('pendiente','confirmada','en_curso')
            AND COALESCE(
              datetime(r.fecha_salida || ' 12:00:00'),
              datetime(r.fecha_salida),
              datetime(r.fecha_entrada || ' 12:00:00')
            ) >= datetime('now', 'localtime')
        ) THEN 'ocupada'
        WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento'
          AND (
            h.mantenimiento_hasta IS NULL
            OR datetime(h.mantenimiento_hasta) > datetime('now', 'localtime')
          ) THEN 'mantenimiento'
        WHEN COALESCE(h.estado_manual, 'disponible') = 'limpieza'
          AND (
            h.limpieza_hasta IS NULL
            OR datetime(h.limpieza_hasta) > datetime('now', 'localtime')
          ) THEN 'limpieza'
        ELSE 'disponible'
      END AS estado,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM reservas r
          WHERE r.id_habitacion = h.id
            AND r.estado IN ('pendiente','confirmada','en_curso')
            AND COALESCE(
              datetime(r.fecha_salida || ' 12:00:00'),
              datetime(r.fecha_salida),
              datetime(r.fecha_entrada || ' 12:00:00')
            ) >= datetime('now', 'localtime')
        ) THEN (
          SELECT MAX(
            COALESCE(
              datetime(r2.fecha_salida || ' 12:00:00'),
              datetime(r2.fecha_salida),
              datetime(r2.fecha_entrada || ' 12:00:00')
            )
          )
          FROM reservas r2
          WHERE r2.id_habitacion = h.id
            AND r2.estado IN ('pendiente','confirmada','en_curso')
            AND COALESCE(
              datetime(r2.fecha_salida || ' 12:00:00'),
              datetime(r2.fecha_salida),
              datetime(r2.fecha_entrada || ' 12:00:00')
            ) >= datetime('now', 'localtime')
        )
        WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento'
          AND (
            h.mantenimiento_hasta IS NULL
            OR datetime(h.mantenimiento_hasta) > datetime('now', 'localtime')
          ) THEN h.mantenimiento_hasta
        WHEN COALESCE(h.estado_manual, 'disponible') = 'limpieza'
          AND (
            h.limpieza_hasta IS NULL
            OR datetime(h.limpieza_hasta) > datetime('now', 'localtime')
          ) THEN h.limpieza_hasta
        ELSE NULL
      END AS proxima_disponibilidad
     FROM habitaciones h
     JOIN alojamientos a ON a.id = h.id_alojamiento
     JOIN usuarios u ON u.id = a.id_anfitrion
     WHERE h.id_alojamiento = ?
       AND NOT (
         COALESCE(u.estado_cuenta, 'activo') = 'suspendido'
         AND (
           u.suspension_hasta IS NULL
           OR datetime(u.suspension_hasta) > datetime('now', 'localtime')
         )
       )`,
    [req.params.alojamientoId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error obteniendo habitaciones.' });
      res.json(rows);
    }
    );
  });
});

router.get('/mis-alojamiento/:alojamientoId', verificarToken, (req, res) => {
  const alojamientoId = Number(req.params.alojamientoId || 0);
  if (!alojamientoId) {
    return res.status(400).json({ error: 'ID de alojamiento invalido.' });
  }

  db.get(
    `SELECT id, id_anfitrion FROM alojamientos WHERE id = ?`,
    [alojamientoId],
    (checkErr, alojamiento) => {
      if (checkErr) return res.status(500).json({ error: 'Error verificando alojamiento.' });
      if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

      if (req.user.rol !== 'admin' && Number(alojamiento.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para ver habitaciones de este alojamiento.' });
      }

      sincronizarEstadosHabitaciones(() => {
      db.all(
        `SELECT
          h.*,
          (
            SELECT MAX(
              COALESCE(
                datetime(r.fecha_salida || ' 12:00:00'),
                datetime(r.fecha_salida),
                datetime(r.fecha_entrada || ' 12:00:00')
              )
            )
            FROM reservas r
            WHERE r.id_habitacion = h.id
              AND r.estado IN ('pendiente','confirmada','en_curso')
              AND COALESCE(
                datetime(r.fecha_salida || ' 12:00:00'),
                datetime(r.fecha_salida),
                datetime(r.fecha_entrada || ' 12:00:00')
              ) >= datetime('now', 'localtime')
          ) AS ocupada_hasta,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM reservas r
              WHERE r.id_habitacion = h.id
                AND r.estado IN ('pendiente','confirmada','en_curso')
                AND COALESCE(
                  datetime(r.fecha_salida || ' 12:00:00'),
                  datetime(r.fecha_salida),
                  datetime(r.fecha_entrada || ' 12:00:00')
                ) >= datetime('now', 'localtime')
            ) THEN 'ocupada'
            WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento'
              AND (
                h.mantenimiento_hasta IS NULL
                OR datetime(h.mantenimiento_hasta) > datetime('now', 'localtime')
              ) THEN 'mantenimiento'
            WHEN COALESCE(h.estado_manual, 'disponible') = 'limpieza'
              AND (
                h.limpieza_hasta IS NULL
                OR datetime(h.limpieza_hasta) > datetime('now', 'localtime')
              ) THEN 'limpieza'
            ELSE 'disponible'
          END AS estado,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM reservas r
              WHERE r.id_habitacion = h.id
                AND r.estado IN ('pendiente','confirmada','en_curso')
                AND COALESCE(
                  datetime(r.fecha_salida || ' 12:00:00'),
                  datetime(r.fecha_salida),
                  datetime(r.fecha_entrada || ' 12:00:00')
                ) >= datetime('now', 'localtime')
            ) THEN (
              SELECT MAX(
                COALESCE(
                  datetime(r2.fecha_salida || ' 12:00:00'),
                  datetime(r2.fecha_salida),
                  datetime(r2.fecha_entrada || ' 12:00:00')
                )
              )
              FROM reservas r2
              WHERE r2.id_habitacion = h.id
                AND r2.estado IN ('pendiente','confirmada','en_curso')
                AND COALESCE(
                  datetime(r2.fecha_salida || ' 12:00:00'),
                  datetime(r2.fecha_salida),
                  datetime(r2.fecha_entrada || ' 12:00:00')
                ) >= datetime('now', 'localtime')
            )
            WHEN COALESCE(h.estado_manual, 'disponible') = 'mantenimiento'
              AND (
                h.mantenimiento_hasta IS NULL
                OR datetime(h.mantenimiento_hasta) > datetime('now', 'localtime')
              ) THEN h.mantenimiento_hasta
            WHEN COALESCE(h.estado_manual, 'disponible') = 'limpieza'
              AND (
                h.limpieza_hasta IS NULL
                OR datetime(h.limpieza_hasta) > datetime('now', 'localtime')
              ) THEN h.limpieza_hasta
            ELSE NULL
          END AS proxima_disponibilidad
         FROM habitaciones h
         WHERE h.id_alojamiento = ?`,
        [alojamientoId],
        (listErr, rows) => {
          if (listErr) return res.status(500).json({ error: 'Error obteniendo habitaciones.' });
          res.json(rows || []);
        }
      );
      });
    }
  );
});

router.post('/:id/alerta-disponibilidad', (req, res) => {
  const idHabitacion = Number(req.params.id || 0);
  const validacion = validarCanalYDestinatario(req.body?.canal, req.body?.destinatario);

  if (!idHabitacion) {
    return res.status(400).json({ error: 'ID de habitación inválido.' });
  }

  if (!validacion.ok) {
    return res.status(400).json({ error: validacion.error });
  }

  const { canal, destinatario } = validacion;

  db.get(
    `SELECT h.id
     FROM habitaciones h
     WHERE h.id = ?`,
    [idHabitacion],
    (roomErr, room) => {
      if (roomErr) return res.status(500).json({ error: 'Error validando habitación.' });
      if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });

      db.get(
        `SELECT id
         FROM alertas_disponibilidad_habitacion
         WHERE id_habitacion = ?
           AND canal = ?
           AND destinatario = ?
           AND estado = 'activa'`,
        [idHabitacion, canal, destinatario],
        (existErr, existente) => {
          if (existErr) return res.status(500).json({ error: 'Error validando alerta existente.' });

          if (existente) {
            return res.json({
              mensaje: 'Ya tienes una alerta activa para esta habitación y canal.',
              existente: true
            });
          }

          db.run(
            `INSERT INTO alertas_disponibilidad_habitacion (id_habitacion, canal, destinatario, estado)
             VALUES (?, ?, ?, 'activa')`,
            [idHabitacion, canal, destinatario],
            function(insertErr) {
              if (insertErr) return res.status(500).json({ error: 'No se pudo crear la alerta de disponibilidad.' });
              res.status(201).json({
                mensaje: 'Alerta de disponibilidad creada correctamente.',
                id: this.lastID
              });
            }
          );
        }
      );
    }
  );
});

router.put('/:id/estado', verificarToken, (req, res) => {
  const { id } = req.params;
  const { estado, mantenimiento_hasta, mantenimiento_horas } = req.body;
  const estadoNormalizado = String(estado || '').trim().toLowerCase();

  if (!['disponible', 'mantenimiento', 'limpieza'].includes(estadoNormalizado)) {
    return res.status(400).json({ error: 'Estado invalido. Usa disponible, mantenimiento o limpieza.' });
  }

  let mantenimientoHasta = null;
  let mantenimientoHoras = null;
  let limpiezaHasta = null;

  if (estadoNormalizado === 'mantenimiento') {
    const horasNum = Number(mantenimiento_horas);
    const fechaTexto = String(mantenimiento_hasta || '').trim();

    if (fechaTexto) {
      const fecha = new Date(fechaTexto);
      if (Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: 'La fecha de fin de mantenimiento no es válida.' });
      }
      mantenimientoHasta = toSqlDateTime(fecha);
      mantenimientoHoras = null;
    } else if (Number.isFinite(horasNum) && horasNum > 0) {
      const fecha = new Date(Date.now() + (horasNum * 60 * 60 * 1000));
      mantenimientoHasta = toSqlDateTime(fecha);
      mantenimientoHoras = Number(horasNum.toFixed(2));
    } else {
      return res.status(400).json({
        error: 'Debes indicar duración de mantenimiento por horas o una fecha estimada de fin.'
      });
    }
  }

  if (estadoNormalizado === 'limpieza') {
    const fechaTexto = String(req.body?.limpieza_hasta || '').trim();
    if (fechaTexto) {
      const fecha = new Date(fechaTexto);
      if (Number.isNaN(fecha.getTime())) {
        return res.status(400).json({ error: 'La fecha de fin de limpieza no es válida.' });
      }
      limpiezaHasta = toSqlDateTime(fecha);
    }
  }

  db.get(
    `SELECT h.id, h.id_alojamiento, a.id_anfitrion
     FROM habitaciones h
     JOIN alojamientos a ON a.id = h.id_alojamiento
     WHERE h.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error verificando habitación.' });
      if (!row) return res.status(404).json({ error: 'Habitación no encontrada.' });

      if (req.user.rol !== 'admin' && Number(row.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para cambiar el estado de esta habitación.' });
      }

      const continuarActualizacion = () => {
        const estadoFinal = estadoNormalizado;
        const mantenimientoHastaFinal = estadoFinal === 'mantenimiento' ? mantenimientoHasta : null;
        const mantenimientoHorasFinal = estadoFinal === 'mantenimiento' ? mantenimientoHoras : null;
        const limpiezaHastaFinal = estadoFinal === 'limpieza' ? limpiezaHasta : null;

        db.run(
          `UPDATE habitaciones
           SET estado_manual = ?,
               mantenimiento_hasta = ?,
               mantenimiento_estimado_horas = ?,
               limpieza_hasta = ?
           WHERE id = ?`,
          [estadoFinal, mantenimientoHastaFinal, mantenimientoHorasFinal, limpiezaHastaFinal, id],
          function(updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Error actualizando el estado de la habitación.' });
            publicarCambioHabitacionesAlojamiento(row.id_alojamiento, 'estado_manual');
            res.json({
              mensaje: 'Estado actualizado correctamente.',
              estado: estadoFinal,
              mantenimiento_hasta: mantenimientoHastaFinal,
              mantenimiento_estimado_horas: mantenimientoHorasFinal,
              limpieza_hasta: limpiezaHastaFinal
            });
          }
        );
      };

      if (estadoNormalizado !== 'mantenimiento' && estadoNormalizado !== 'limpieza') {
        continuarActualizacion();
        return;
      }

      db.get(
        `SELECT MAX(
            COALESCE(
              datetime(r.fecha_salida || ' 12:00:00'),
              datetime(r.fecha_salida),
              datetime(r.fecha_entrada || ' 12:00:00')
            )
          ) AS ocupada_hasta
         FROM reservas r
         WHERE r.id_habitacion = ?
           AND r.estado IN ('pendiente','confirmada','en_curso')
           AND COALESCE(
             datetime(r.fecha_salida || ' 12:00:00'),
             datetime(r.fecha_salida),
             datetime(r.fecha_entrada || ' 12:00:00')
           ) >= datetime('now', 'localtime')`,
        [id],
        (busyErr, busyRow) => {
          if (busyErr) {
            return res.status(500).json({ error: 'Error verificando ocupación actual de la habitación.' });
          }

          if (busyRow?.ocupada_hasta) {
            return res.status(409).json({
              error: estadoNormalizado === 'mantenimiento'
                ? 'No puedes poner en mantenimiento esta habitación porque actualmente se encuentra ocupada.'
                : 'No puedes poner en limpieza esta habitación porque actualmente se encuentra ocupada.',
              proxima_disponibilidad: busyRow.ocupada_hasta
            });
          }

          continuarActualizacion();
        }
      );
    }
  );
});

// ======================================================
// ASIGNAR SERVICIO (🔥 CORREGIDO)
// ======================================================
router.post('/:id/servicios', verificarToken, (req, res) => {
  const { id } = req.params;
  const { id_servicio } = req.body;

  if (!id_servicio) {
    return res.status(400).json({ error: 'Debes enviar el id del servicio.' });
  }

  // validar habitacion
  db.get('SELECT * FROM habitaciones WHERE id = ?', [id], (err, habitacion) => {
    if (err) return res.status(500).json({ error: 'Error verificando habitación.' });
    if (!habitacion) return res.status(404).json({ error: 'Habitación no encontrada.' });

    // validar servicio existente
    db.get('SELECT * FROM servicios WHERE id = ?', [id_servicio], (err2, servicio) => {
      if (err2) return res.status(500).json({ error: 'Error verificando servicio.' });
      if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });

      // validar si ya existe rapido en la tabla relacional
      db.get(
        'SELECT * FROM habitacion_servicios WHERE id_habitacion = ? AND id_servicio = ?',
        [id, id_servicio],
        (err3, existe) => {
          if (err3) {
            return res.status(500).json({ error: 'Error verificando servicio asignado.' });
          }

          if (existe) {
            return res.status(200).json({ mensaje: '⚠️ Este servicio ya está asignado a esta habitación.' });
          }

          db.run(
            'INSERT INTO habitacion_servicios (id_habitacion, id_servicio) VALUES (?, ?)',
            [id, id_servicio],
            function (err4) {
              if (err4) {
                console.error('DB error al asignar habitacion_servicio:', err4);
                return res.status(500).json({ error: 'Error asignando servicio a la habitación.' });
              }
              res.status(201).json({ mensaje: 'Servicio asignado correctamente.' });
            }
          );
        }
      );
    });
  });
});

// ======================================================
// VER SERVICIOS
// ======================================================
router.get('/:id/servicios', (req, res) => {
  db.all(
    'SELECT s.* FROM servicios s JOIN habitacion_servicios hs ON s.id = hs.id_servicio WHERE hs.id_habitacion = ?',
    [req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Error obteniendo servicios.' });
      }
      res.json(rows);
    }
  );
});

// ======================================================
// ELIMINAR SERVICIO DE UNA HABITACIÓN
// ======================================================
router.delete('/:habitacionId/servicios/:servicioId', verificarToken, (req, res) => {
  const { habitacionId, servicioId } = req.params;
  db.run(
    'DELETE FROM habitacion_servicios WHERE id_habitacion = ? AND id_servicio = ?',
    [habitacionId, servicioId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error eliminando servicio.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'El servicio no está asignado a esta habitación.' });
      }
      res.json({ mensaje: 'Servicio eliminado correctamente.' });
    }
  );
});

// ======================================================
// ELIMINAR HABITACIÓN
// ======================================================
router.delete('/:id', verificarToken, (req, res) => {
  const { id } = req.params;

  // Primero eliminar relaciones
  db.run(
    'DELETE FROM habitacion_servicios WHERE id_habitacion = ?',
    [id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error eliminando servicios asociados.' });
      }

      // Luego eliminar la habitación
      db.run(
        'DELETE FROM habitaciones WHERE id = ?',
        [id],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Error eliminando habitación.' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Habitación no encontrada.' });
          }
          res.json({ mensaje: 'Habitación eliminada correctamente.' });
        }
      );
    }
  );
});



// ======================================================
// HACER IMAGEN PRINCIPAL (HABITACIÓN)
// ======================================================
router.put('/imagenes/:id/principal', verificarToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT id_habitacion FROM imagenes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error buscando imagen' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // 🔥 quitar principal a todas las de esa habitación
    db.run(
      'UPDATE imagenes SET principal = 0 WHERE id_habitacion = ?',
      [row.id_habitacion],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Error limpiando principales' });
        }

        // 🔥 asignar nueva principal
        db.run(
          'UPDATE imagenes SET principal = 1 WHERE id = ?',
          [id],
          function (err) {
            if (err) {
              return res.status(500).json({ error: 'Error asignando imagen principal' });
            }

            return res.json({ mensaje: 'Imagen principal asignada correctamente' });
          }
        );
      }
    );
  });
});


// ======================================================
// OBTENER IMÁGENES DE HABITACIÓN
// ======================================================
router.get('/:id/imagenes', (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM imagenes WHERE id_habitacion = ?',
    [id],
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: 'Error obteniendo imágenes'
        });
      }

      res.json(rows);
    }
  );
});

// ======================================================
// SUBIR IMÁGENES A HABITACIÓN
// ======================================================
router.post('/:id/imagenes', verificarToken, upload.array('imagenes'), (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No se subieron imágenes'
    });
  }

  const stmt = db.prepare(
    'INSERT INTO imagenes (ruta, id_habitacion) VALUES (?, ?)'
  );

  req.files.forEach(file => {
    stmt.run(`/uploads/${file.filename}`, id);
  });

  stmt.finalize();

  res.json({
    mensaje: 'Imágenes subidas correctamente'
  });
});

module.exports = router;
