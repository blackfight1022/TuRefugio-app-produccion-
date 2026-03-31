const express = require('express');
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');
const { procesarNotificacionesPendientes } = require('../services/notificaciones.service');

const router = express.Router();

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function consultarTransaccionWompiPorReferencia(reference) {
  const privateKey = String(process.env.WOMPI_PRIVATE_KEY || '').trim();
  if (!privateKey || !reference) {
    return null;
  }

  const wompiMode = (process.env.WOMPI_MODE || '').trim().toLowerCase() || 'sandbox';
  const baseUrl = wompiMode === 'production'
    ? 'https://api.wompi.co/v1'
    : 'https://api-sandbox.wompi.co/v1';

  const response = await fetch(`${baseUrl}/transactions?reference=${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${privateKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar Wompi (${response.status}).`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.data) || !payload.data.length) {
    return null;
  }

  return payload.data[0];
}

async function sincronizarPagoReservaConWompi(idReserva, referenciaPago) {
  const transaccion = await consultarTransaccionWompiPorReferencia(referenciaPago);
  if (!transaccion?.reference) {
    return null;
  }

  const estadoPago = mapearEstadoPago(transaccion.status);
  const metodoPago = String(transaccion.payment_method_type || 'pse').toLowerCase();
  const nuevoEstadoReserva = estadoPago === 'pagado' ? 'confirmada' : (estadoPago === 'rechazado' ? 'cancelada' : 'pendiente');

  await dbRunAsync(
    `UPDATE pagos
     SET estado = ?, metodo_pago = ?, transaccion_externa = ?, referencia_pago = ?
     WHERE id_reserva = ?`,
    [estadoPago, metodoPago, transaccion.id || null, transaccion.reference, idReserva]
  );

  await dbRunAsync(
    `UPDATE reservas
     SET estado = ?, referencia_pago = ?
     WHERE id = ?`,
    [nuevoEstadoReserva, transaccion.reference, idReserva]
  );

  if (estadoPago === 'pagado') {
    await new Promise((resolve, reject) => {
      crearFacturaYColaNotificaciones(idReserva, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      });
    });
  }

  return {
    estadoPago,
    nuevoEstadoReserva,
    referenciaPago: transaccion.reference,
    transaccionExterna: transaccion.id || null
  };
}

function mapearEstadoPago(status) {
  const estado = String(status || '').toUpperCase();

  if (estado === 'APPROVED' || estado === 'PAGADO') {
    return 'pagado';
  }

  if (['DECLINED', 'VOIDED', 'ERROR', 'REJECTED', 'RECHAZADO'].includes(estado)) {
    return 'rechazado';
  }

  return 'pendiente';
}

function crearFacturaYColaNotificaciones(idReserva, callback) {
  db.get(
    `SELECT
      r.id,
      r.fecha_entrada,
      r.fecha_salida,
      r.personas,
      r.precio_total,
      r.subtotal_hospedaje,
      r.subtotal_servicios,
      r.noches,
      r.detalle_servicios_json,
      r.titular_nombre,
      r.titular_documento_tipo,
      r.titular_documento_numero,
      r.titular_correo,
      r.titular_telefono,
      h.nombre AS habitacion_nombre,
      a.titulo AS alojamiento_titulo,
      host.nombre AS anfitrion_nombre,
      host.correo AS anfitrion_correo,
      host.telefono AS anfitrion_telefono,
      host.tipo_persona AS anfitrion_tipo_persona,
      host.numero_documento AS anfitrion_documento,
      host.razon_social AS anfitrion_razon_social
     FROM reservas r
     JOIN habitaciones h ON h.id = r.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     JOIN usuarios host ON host.id = a.id_anfitrion
     WHERE r.id = ?`,
    [idReserva],
    (reservaErr, reserva) => {
      if (reservaErr) {
        return callback(reservaErr);
      }

      if (!reserva) {
        return callback(new Error('Reserva no encontrada para facturación.'));
      }

      db.get(`SELECT id, numero_factura FROM facturas WHERE id_reserva = ?`, [idReserva], (facturaErr, existente) => {
        if (facturaErr) {
          return callback(facturaErr);
        }

        if (existente) {
          return callback(null, { facturaId: existente.id, numeroFactura: existente.numero_factura, existente: true });
        }

        const numeroFactura = `FE-${Date.now()}-${idReserva}`;
        const detalleServicios = JSON.parse(reserva.detalle_servicios_json || '[]');
        const datosCliente = {
          nombre: reserva.titular_nombre,
          documentoTipo: reserva.titular_documento_tipo,
          documentoNumero: reserva.titular_documento_numero,
          correo: reserva.titular_correo,
          telefono: reserva.titular_telefono
        };
        const datosAnfitrion = {
          nombre: reserva.anfitrion_nombre,
          tipoPersona: reserva.anfitrion_tipo_persona,
          documento: reserva.anfitrion_tipo_persona === 'empresa'
            ? reserva.anfitrion_razon_social || reserva.anfitrion_documento
            : reserva.anfitrion_documento,
          correo: reserva.anfitrion_correo,
          telefono: reserva.anfitrion_telefono
        };
        const detalle = {
          alojamiento: reserva.alojamiento_titulo,
          habitacion: reserva.habitacion_nombre,
          fechaEntrada: reserva.fecha_entrada,
          fechaSalida: reserva.fecha_salida,
          personas: reserva.personas,
          noches: reserva.noches,
          subtotalHospedaje: reserva.subtotal_hospedaje,
          subtotalServicios: reserva.subtotal_servicios,
          total: reserva.precio_total,
          servicios: detalleServicios
        };

        db.run(
          `INSERT INTO facturas (
            id_reserva, numero_factura, estado, datos_cliente_json, datos_anfitrion_json, detalle_json
          ) VALUES (?, ?, 'emitida', ?, ?, ?)`,
          [
            idReserva,
            numeroFactura,
            JSON.stringify(datosCliente),
            JSON.stringify(datosAnfitrion),
            JSON.stringify(detalle)
          ],
          function(insertErr) {
            if (insertErr) {
              return callback(insertErr);
            }

            const facturaId = this.lastID;
            const mensajeBase = `Reserva confirmada para ${reserva.alojamiento_titulo}, habitación ${reserva.habitacion_nombre}. Factura ${numeroFactura} por ${Number(reserva.precio_total || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}.`;
            const notificaciones = [
              { canal: 'email', destinatario: reserva.titular_correo },
              { canal: 'sms', destinatario: reserva.titular_telefono },
              { canal: 'whatsapp', destinatario: reserva.titular_telefono },
              { canal: 'email', destinatario: reserva.anfitrion_correo },
              { canal: 'whatsapp', destinatario: reserva.anfitrion_telefono }
            ].filter((item) => item.destinatario);

            if (!notificaciones.length) {
              return callback(null, { facturaId, numeroFactura, existente: false });
            }

            const placeholders = notificaciones.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const values = notificaciones.flatMap((item) => [
              idReserva,
              item.canal,
              item.destinatario,
              mensajeBase,
              'pendiente_integracion',
              JSON.stringify({ facturaId, numeroFactura, canal: item.canal })
            ]);

            db.run(
              `INSERT INTO notificaciones (id_reserva, canal, destinatario, mensaje, estado, payload_json)
               VALUES ${placeholders}`,
              values,
              (notificationErr) => {
                if (notificationErr) {
                  return callback(notificationErr);
                }

                callback(null, { facturaId, numeroFactura, existente: false });
              }
            );
          }
        );
      });
    }
  );
}


// ==========================================
// REGISTRAR PAGO DE UNA RESERVA
// ==========================================
router.post(
  '/',
  verificarToken,
  (req, res) => {

    const { id_reserva, monto, metodo_pago } = req.body;

    if (!id_reserva || !monto || !metodo_pago) {
      return res.status(400).json({
        error: 'Debe enviar id_reserva, monto y metodo_pago'
      });
    }

    const referencia = "PAY-" + Date.now();

    db.run(
      `INSERT INTO pagos
       (id_reserva, monto, metodo_pago, estado, referencia_pago)
       VALUES (?, ?, ?, 'pagado', ?)`,
      [
        id_reserva,
        monto,
        metodo_pago,
        referencia
      ],
      function (err) {

        if (err) {
          return res.status(500).json({
            error: 'Error registrando pago'
          });
        }

        res.status(201).json({
          mensaje: 'Pago registrado correctamente',
          referencia_pago: referencia
        });
      }
    );
  }
);


// ==========================================
// WEBHOOK DE Wompi PARA CAMBIO DE ESTADO
// ==========================================
router.post('/wompi/webhook', (req, res) => {
  const transaction = req.body?.data?.transaction || req.body?.transaction || null;

  if (!transaction?.reference) {
    return res.status(400).json({ error: 'No se recibió una referencia de pago válida.' });
  }

  const referenciaPago = transaction.reference;
  const estadoPago = mapearEstadoPago(transaction.status);
  const metodoPago = String(transaction.payment_method_type || 'pse').toLowerCase();

  db.get(`SELECT id_reserva FROM pagos WHERE referencia_pago = ?`, [referenciaPago], (searchErr, pago) => {
    if (searchErr) {
      return res.status(500).json({ error: 'Error localizando el pago.' });
    }

    if (!pago) {
      return res.status(404).json({ error: 'No existe un pago asociado a la referencia enviada.' });
    }

    db.run(
      `UPDATE pagos
       SET estado = ?, metodo_pago = ?, transaccion_externa = ?
       WHERE referencia_pago = ?`,
      [estadoPago, metodoPago, transaction.id || null, referenciaPago],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ error: 'Error actualizando el pago.' });
        }

        const nuevoEstadoReserva = estadoPago === 'pagado' ? 'confirmada' : 'cancelada';
        db.run(
          `UPDATE reservas
           SET estado = ?
           WHERE id = ?`,
          [nuevoEstadoReserva, pago.id_reserva],
          (reserveErr) => {
            if (reserveErr) {
              return res.status(500).json({ error: 'Error actualizando la reserva asociada.' });
            }

            if (estadoPago !== 'pagado') {
              return res.json({ ok: true, reservaId: pago.id_reserva, estadoPago });
            }

            crearFacturaYColaNotificaciones(pago.id_reserva, (facturaErr, facturaInfo) => {
              if (facturaErr) {
                console.error(facturaErr);
                return res.status(500).json({ error: 'El pago fue confirmado, pero falló la emisión de factura.' });
              }

              res.json({
                ok: true,
                reservaId: pago.id_reserva,
                estadoPago,
                factura: facturaInfo
              });
            });
          }
        );
      }
    );
  });
});


// ==========================================
// VER PAGOS DE UNA RESERVA
// ==========================================
router.get(
  '/reserva/:id',
  verificarToken,
  (req, res) => {

    const { id } = req.params;

    db.all(
      `SELECT * FROM pagos
       WHERE id_reserva = ?`,
      [id],
      (err, rows) => {

        if (err) {
          return res.status(500).json({
            error: 'Error obteniendo pagos'
          });
        }

        res.status(200).json(rows);
      }
    );
  }
);


// ==========================================
// ESTADO PÚBLICO DE RESERVA Y PAGO
// ==========================================
router.get('/estado-reserva/:id', async (req, res) => {
  try {
    let row = await dbGetAsync(
      `SELECT
        r.id,
        r.estado AS estado_reserva,
        r.precio_total,
        r.referencia_pago,
        p.estado AS estado_pago,
        p.transaccion_externa,
        f.numero_factura
       FROM reservas r
       LEFT JOIN pagos p ON p.id_reserva = r.id
       LEFT JOIN facturas f ON f.id_reserva = r.id
       WHERE r.id = ?`,
      [req.params.id]
    );

    if (!row) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const estadoReserva = String(row.estado_reserva || '').toLowerCase();
    const estadoPago = String(row.estado_pago || '').toLowerCase();
    const debeSincronizar = row.referencia_pago && estadoReserva !== 'confirmada' && estadoPago !== 'pagado';

    if (debeSincronizar) {
      try {
        const sync = await sincronizarPagoReservaConWompi(row.id, row.referencia_pago);
        if (sync) {
          row = await dbGetAsync(
            `SELECT
              r.id,
              r.estado AS estado_reserva,
              r.precio_total,
              r.referencia_pago,
              p.estado AS estado_pago,
              p.transaccion_externa,
              f.numero_factura
             FROM reservas r
             LEFT JOIN pagos p ON p.id_reserva = r.id
             LEFT JOIN facturas f ON f.id_reserva = r.id
             WHERE r.id = ?`,
            [req.params.id]
          );
        }
      } catch (syncErr) {
        console.error('[wompi-sync]', syncErr.message);
      }
    }

    res.json(row);
  } catch (err) {
    return res.status(500).json({ error: 'Error consultando el estado de la reserva.' });
  }
});


// ==========================================
// FACTURA PÚBLICA POR RESERVA
// ==========================================
router.get('/factura/reserva/:id', (req, res) => {
  db.get(
    `SELECT * FROM facturas WHERE id_reserva = ?`,
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Error obteniendo la factura.' });
      }

      if (!row) {
        return res.status(404).json({ error: 'La factura aún no ha sido emitida.' });
      }

      res.json({
        ...row,
        datos_cliente_json: JSON.parse(row.datos_cliente_json || '{}'),
        datos_anfitrion_json: JSON.parse(row.datos_anfitrion_json || '{}'),
        detalle_json: JSON.parse(row.detalle_json || '{}')
      });
    }
  );
});


// ==========================================
// VER TODOS LOS PAGOS
// ==========================================
router.get(
  '/',
  verificarToken,
  (req, res) => {

    db.all(
      `SELECT 
        p.id,
        p.id_reserva,
        p.monto,
        p.metodo_pago,
        p.estado,
        p.referencia_pago,
        r.id_usuario
       FROM pagos p
       JOIN reservas r ON p.id_reserva = r.id`,
      [],
      (err, rows) => {

        if (err) {
          return res.status(500).json({
            error: 'Error obteniendo pagos'
          });
        }

        res.status(200).json(rows);
      }
    );
  }
);

router.post('/notificaciones/procesar', verificarToken, async (req, res) => {
  try {
    const limit = Number(req.body?.limit || 20);
    const resultado = await procesarNotificacionesPendientes({ limit });
    res.json({ ok: true, resultado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo procesar la cola de notificaciones.' });
  }
});


module.exports = router;