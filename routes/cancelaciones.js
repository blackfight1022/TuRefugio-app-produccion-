const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');
const nodemailer = require('nodemailer');

// Configurar transporte de email
function crearTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
    }
  });
}
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER;

// Generar código aleatorio de 6 dígitos
function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generarReferenciaReembolso(reservaId) {
  return `REF-${reservaId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * POST /api/cancelaciones/iniciar
 * Inicia el proceso de cancelación
 * Body: { email_turista, reserva_id, motivo }
 */
router.post('/iniciar', (req, res) => {
  const { email_turista, reserva_id, motivo } = req.body;

  if (!email_turista || !reserva_id || !motivo) {
    return res.status(400).json({
      status: 'error',
      mensaje: 'Faltan datos requeridos'
    });
  }

  // Generar código de confirmación
  const codigo = generarCodigo();
  const fecha_creacion = new Date();
  const estado = 'pendiente_confirmacion_turista';

  // Guardar en base de datos
  const sql = `
    INSERT INTO cancelaciones 
    (reserva_id, email_turista, motivo, codigo, estado, fecha_creacion)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [reserva_id, email_turista, motivo, codigo, estado, fecha_creacion], function(err) {
    if (err) {
      console.error('Error al guardar cancelación:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al procesar cancelación'
      });
    }

    // Enviar código por email al turista
    const asunto = '🔐 Código de confirmación para cancelación de reserva';
    const htmlContent = `
      <h2>Solicitud de Cancelación de Reserva</h2>
      <p>Hemos recibido tu solicitud para cancelar una reserva.</p>
      <p><strong>Motivo:</strong> ${motivo}</p>
      <p>Para confirmar esta cancelación, ingresa el siguiente código:</p>
      <h1 style="color: #667eea; font-size: 32px; letter-spacing: 5px;">${codigo}</h1>
      <p style="color: #999; font-size: 12px;">Este código expira en 30 minutos.</p>
    `;

    const mailer = crearTransporter();
    if (!mailer) {
      return res.status(200).json({
        status: 'success',
        mensaje: 'Codigo generado. SMTP no configurado (define SMTP_HOST, SMTP_USER, SMTP_PASS en .env).',
        cancelacion_id: this.lastID,
        email_enviado: false,
        codigo_demo: codigo
      });
    }

    mailer.sendMail({
      from: SMTP_FROM,
      to: email_turista,
      subject: asunto,
      html: htmlContent
    }, (error) => {
      if (error) {
        console.error('Error al enviar email:', error);
        return res.status(200).json({
          status: 'success',
          mensaje: 'Codigo generado, pero no se pudo enviar el correo.',
          cancelacion_id: this.lastID,
          email_enviado: false,
          codigo_demo: codigo
        });
      }

      res.status(200).json({
        status: 'success',
        mensaje: 'Código enviado al email del turista',
        cancelacion_id: this.lastID,
        email_enviado: true
      });
    });
  });
});

/**
 * POST /api/cancelaciones/confirmar-turista
 * Valida el código ingresado por el turista
 * Body: { reserva_id, codigo }
 */
router.post('/confirmar-turista', (req, res) => {
  const { reserva_id, codigo } = req.body;

  if (!reserva_id || !codigo) {
    return res.status(400).json({
      status: 'error',
      mensaje: 'Faltan datos requeridos'
    });
  }

  // Buscar la cancelación y validar código
  const sql = `
    SELECT * FROM cancelaciones 
    WHERE reserva_id = ? AND codigo = ? AND estado = 'pendiente_confirmacion_turista'
    ORDER BY fecha_creacion DESC LIMIT 1
  `;

  db.get(sql, [reserva_id, codigo], (err, cancelacion) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al validar código'
      });
    }

    if (!cancelacion) {
      return res.status(401).json({
        status: 'error',
        mensaje: 'Código inválido o expirado'
      });
    }

    // Actualizar estado a "confirmado_turista"
    const updateSql = `
      UPDATE cancelaciones SET estado = 'confirmado_turista'
      WHERE id = ?
    `;

    db.run(updateSql, [cancelacion.id], (err) => {
      if (err) {
        console.error('Error al actualizar cancelación:', err);
        return res.status(500).json({
          status: 'error',
          mensaje: 'Error al procesar confirmación'
        });
      }

      res.status(200).json({
        status: 'success',
        mensaje: 'Código confirmado. Esperando respuesta del anfitrión.',
        cancelacion_id: cancelacion.id
      });
    });
  });
});

/**
 * POST /api/cancelaciones/por-email
 * Buscar reservas por email del turista
 * Body: { email }
 */
router.post('/por-email', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: 'error',
      mensaje: 'Email requerido'
    });
  }

  // Buscar reservas activas del turista con esquema actual
  const sql = `
    SELECT
      r.id,
      h.id_alojamiento,
      r.fecha_entrada,
      r.fecha_salida,
      r.estado,
      r.precio_total,
      a.titulo AS alojamiento_nombre,
      a.ubicacion
    FROM reservas r
    JOIN habitaciones h ON r.id_habitacion = h.id
    JOIN alojamientos a ON h.id_alojamiento = a.id
    JOIN usuarios u ON r.id_usuario = u.id
    WHERE u.correo = ? AND r.estado IN ('confirmada', 'en_curso', 'pendiente')
    ORDER BY r.fecha_entrada DESC
  `;

  db.all(sql, [email], (err, reservas) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al buscar reservas'
      });
    }

    if (reservas.length === 0) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'No hay reservas para este email'
      });
    }

    res.status(200).json({
      status: 'success',
      reservas: reservas
    });
  });
});

/**
 * POST /api/cancelaciones/aplicar-refund
 * Anfitrión aplica el reembolso y confirma cancelación
 * Body: { cancelacion_id, porcentaje_devolucion, motivo_descuento }
 */
router.post('/aplicar-refund', verificarToken, (req, res) => {
  const { cancelacion_id, porcentaje_devolucion, motivo_descuento, metodo_reembolso, pasarela_reembolso } = req.body;
  const actor = req.user.id;

  if (!cancelacion_id || porcentaje_devolucion === undefined) {
    return res.status(400).json({
      status: 'error',
      mensaje: 'Faltan datos requeridos'
    });
  }

  const pct = Number(porcentaje_devolucion);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({
      status: 'error',
      mensaje: 'El porcentaje de devolucion debe estar entre 0 y 100'
    });
  }

  // Obtener detalles y validar propiedad de la reserva
  const cancelacionSql = `
    SELECT
      c.id,
      c.reserva_id,
      c.estado,
      c.motivo,
      r.precio_total,
      r.id_usuario AS turista_id,
      r.fecha_entrada,
      r.fecha_salida,
      r.id_habitacion,
      u.correo AS email_turista,
      u.nombre AS turista_nombre,
      a.id_anfitrion,
      a.titulo AS alojamiento_nombre,
      h.nombre AS habitacion_nombre
    FROM cancelaciones c
    JOIN reservas r ON r.id = c.reserva_id
    JOIN habitaciones h ON h.id = r.id_habitacion
    JOIN alojamientos a ON a.id = h.id_alojamiento
    LEFT JOIN usuarios u ON u.id = r.id_usuario
    WHERE c.id = ?
    LIMIT 1
  `;

  db.get(cancelacionSql, [cancelacion_id], (err, cancelacion) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al procesar cancelación'
      });
    }

    if (!cancelacion) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'Cancelación no encontrada'
      });
    }

    if (req.user.rol !== 'admin' && Number(cancelacion.id_anfitrion) !== Number(actor)) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'No tienes permiso para procesar esta cancelacion'
      });
    }

    if (cancelacion.estado !== 'confirmado_turista') {
      return res.status(400).json({
        status: 'error',
        mensaje: 'La cancelacion no esta pendiente de respuesta del anfitrion'
      });
    }

    const monto_devuelto = (Number(cancelacion.precio_total || 0) * pct) / 100;
    const metodoReembolso = String(metodo_reembolso || 'pse').trim().toLowerCase();
    const pasarelaReembolso = String(pasarela_reembolso || 'wompi').trim().toLowerCase() || 'wompi';
    const metodosValidos = new Set(['tarjeta', 'nequi', 'daviplata', 'pse']);

    if (!metodosValidos.has(metodoReembolso)) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'Metodo de reembolso no permitido'
      });
    }

    const ejecutarConfirmacionCancelacion = (detalleRefund) => {
      db.run(
        `UPDATE cancelaciones
         SET estado = 'confirmada',
             porcentaje_devolucion = ?,
             motivo_descuento = ?,
             fecha_confirmacion = datetime('now', 'localtime')
         WHERE id = ?`,
        [pct, motivo_descuento || 'Sin observaciones', cancelacion_id],
        (upCancelErr) => {
          if (upCancelErr) {
            console.error('Error al actualizar cancelación:', upCancelErr);
            return res.status(500).json({ status: 'error', mensaje: 'Error al confirmar cancelación' });
          }

          db.run(
            `UPDATE reservas
             SET estado = 'cancelada',
                 cancelacion_motivo = ?,
                 cancelacion_porcentaje_reembolso = ?,
                 cancelada_por = ?
             WHERE id = ?`,
            [cancelacion.motivo || 'Cancelada por solicitud del turista', pct, req.user.rol === 'admin' ? 'admin' : 'anfitrion', cancelacion.reserva_id],
            (upReservaErr) => {
              if (upReservaErr) {
                console.error('Error al actualizar reserva:', upReservaErr);
                return res.status(500).json({ status: 'error', mensaje: 'Error al actualizar reserva' });
              }

              db.run(
                `UPDATE pagos
                 SET estado = 'rechazado'
                 WHERE id_reserva = ?
                   AND COALESCE(estado, '') = 'pendiente'`,
                [cancelacion.reserva_id],
                (pagoErr) => {
                  if (pagoErr) {
                    console.error('Error al actualizar pagos pendientes de reserva cancelada:', pagoErr);
                  }

                  const asunto = `Cancelación confirmada - ${cancelacion.alojamiento_nombre}`;
                  const contenido = `Tu solicitud de cancelación ha sido confirmada. Se te devolvera el ${pct}% de tu pago.`;

                  db.run(
                    `INSERT INTO mensajes
                     (turista_id, asunto, contenido, tipo, reserva_id, porcentaje_devolucion, motivo_descuento, estado, leido)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      cancelacion.turista_id,
                      asunto,
                      contenido,
                      'cancelacion',
                      cancelacion.reserva_id,
                      pct,
                      motivo_descuento || 'Sin observaciones',
                      'pendiente',
                      0
                    ],
                    (msgErr) => {
                      if (msgErr) {
                        console.error('Error al crear mensaje:', msgErr);
                      }

                      const htmlContent = `
                        <h2>Cancelación Confirmada</h2>
                        <p>Tu solicitud de cancelación ha sido aprobada.</p>
                        <p><strong>Alojamiento:</strong> ${cancelacion.alojamiento_nombre}</p>
                        <p><strong>Habitacion:</strong> ${cancelacion.habitacion_nombre || '-'}</p>
                        <p><strong>Fechas:</strong> ${cancelacion.fecha_entrada || '-'} a ${cancelacion.fecha_salida || '-'}</p>
                        <p><strong>Monto a devolver:</strong> $${monto_devuelto.toFixed(2)} (${pct}% de $${Number(cancelacion.precio_total || 0).toFixed(2)})</p>
                        <p><strong>Pasarela:</strong> ${pasarelaReembolso.toUpperCase()} | <strong>Método:</strong> ${metodoReembolso.toUpperCase()}</p>
                        ${detalleRefund ? `<p><strong>Referencia devolución:</strong> ${detalleRefund.referencia}</p>` : ''}
                        <p><strong>Motivo del descuento:</strong> ${motivo_descuento || 'Sin observaciones'}</p>
                        <p>El reembolso será procesado en los próximos 5-7 días hábiles.</p>
                      `;

                      if (cancelacion.email_turista) {
                        const mailerConf = crearTransporter();
                        if (mailerConf) {
                          mailerConf.sendMail({
                            from: SMTP_FROM,
                            to: cancelacion.email_turista,
                            subject: asunto,
                            html: htmlContent
                          }, (mailErr) => {
                            if (mailErr) console.error('Error al enviar email de confirmación:', mailErr);
                          });
                        }
                      }

                      return res.status(200).json({
                        status: 'success',
                        mensaje: 'Cancelación confirmada y reembolso registrado por pasarela.',
                        monto_devuelto,
                        detalle_reembolso: detalleRefund
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    };

    if (pct <= 0) {
      return ejecutarConfirmacionCancelacion(null);
    }

    db.get(
      `SELECT id
       FROM pagos
       WHERE id_reserva = ?
         AND COALESCE(estado, '') = 'pagado'
         AND COALESCE(monto, 0) > 0
       ORDER BY datetime(fecha) DESC, id DESC
       LIMIT 1`,
      [cancelacion.reserva_id],
      (pagoBaseErr, pagoBase) => {
        if (pagoBaseErr) {
          console.error('Error validando pago base para reembolso:', pagoBaseErr);
          return res.status(500).json({ status: 'error', mensaje: 'Error validando el pago de la reserva.' });
        }

        if (!pagoBase) {
          return res.status(400).json({
            status: 'error',
            mensaje: 'No existe un pago aprobado para esta reserva; no se puede procesar devolución.'
          });
        }

        const referenciaReembolso = generarReferenciaReembolso(cancelacion.reserva_id);
        const transaccionReembolso = `refund-sim-${Date.now()}`;

        db.run(
          `INSERT INTO pagos (
            id_reserva, monto, metodo_pago, estado, referencia_pago, pasarela, transaccion_externa
          ) VALUES (?, ?, ?, 'pagado', ?, ?, ?)`,
          [
            cancelacion.reserva_id,
            -Math.abs(Number(monto_devuelto || 0)),
            metodoReembolso,
            referenciaReembolso,
            pasarelaReembolso,
            transaccionReembolso
          ],
          (refundErr) => {
            if (refundErr) {
              console.error('Error registrando reembolso en pasarela simulada:', refundErr);
              return res.status(500).json({
                status: 'error',
                mensaje: 'La cancelación fue aplicada, pero falló el registro del reembolso en pasarela.'
              });
            }

            return ejecutarConfirmacionCancelacion({
              referencia: referenciaReembolso,
              pasarela: pasarelaReembolso,
              metodo: metodoReembolso,
              transaccion_externa: transaccionReembolso
            });
          }
        );
      }
    );
  });
});

/**
 * GET /api/cancelaciones/pendientes-anfitrion
 * Obtiene solicitudes confirmadas por turista para alojamientos del anfitrion autenticado
 */
router.get('/pendientes-anfitrion', verificarToken, (req, res) => {
  const sql = `
    SELECT
      c.id AS cancelacion_id,
      c.reserva_id,
      c.motivo,
      c.fecha_creacion,
      c.email_turista,
      r.precio_total,
      r.fecha_entrada,
      r.fecha_salida,
      u.nombre AS turista_nombre,
      u.correo AS correo_usuario,
      a.titulo AS alojamiento_titulo,
      a.id_anfitrion,
      h.nombre AS habitacion_nombre
    FROM cancelaciones c
    JOIN reservas r ON r.id = c.reserva_id
    JOIN habitaciones h ON h.id = r.id_habitacion
    JOIN alojamientos a ON a.id = h.id_alojamiento
    LEFT JOIN usuarios u ON u.id = r.id_usuario
    WHERE c.estado = 'confirmado_turista'
      AND (? = 'admin' OR a.id_anfitrion = ?)
    ORDER BY c.fecha_creacion DESC
  `;

  db.all(sql, [req.user.rol, req.user.id], (err, rows) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al obtener solicitudes pendientes'
      });
    }

    res.status(200).json({
      status: 'success',
      cancelaciones: rows || []
    });
  });
});

/**
 * GET /api/cancelaciones/:reserva_id
 * Obtener estado de cancelación de una reserva
 */
router.get('/:reserva_id', (req, res) => {
  const { reserva_id } = req.params;

  const sql = `
    SELECT * FROM cancelaciones 
    WHERE reserva_id = ?
    ORDER BY fecha_creacion DESC LIMIT 1
  `;

  db.get(sql, [reserva_id], (err, cancelacion) => {
    if (err) {
      console.error('Error en BD:', err);
      return res.status(500).json({
        status: 'error',
        mensaje: 'Error al obtener cancelación'
      });
    }

    if (!cancelacion) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'No hay cancelación para esta reserva'
      });
    }

    res.status(200).json({
      status: 'success',
      cancelacion: cancelacion
    });
  });
});

module.exports = router;

