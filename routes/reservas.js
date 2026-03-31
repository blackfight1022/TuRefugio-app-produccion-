const express = require('express');
const router = express.Router();
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const db = require('../database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const PAYMENT_PROVIDER_LABEL = process.env.PAYMENT_PROVIDER_LABEL || 'PSE';
const PAYMENT_MODE = (process.env.WOMPI_MODE || '').trim().toLowerCase() || 'sandbox';

function construirBaseUrl(req) {
  return process.env.PAYMENT_REDIRECT_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function construirRedirectUrlWompi(req, reservaId) {
  const baseUrl = construirBaseUrl(req).replace(/\/+$/, '');
  // Wompi exige que el dominio del redirect-url esté registrado en el dashboard.
  // localhost nunca puede registrarse, así que se omite el campo en entornos locales.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl)) {
    return null;
  }
  return `${baseUrl}/index.html`;
}

function generarReferenciaPago() {
  return `TR-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function generarFirmaWompi(reference, amountInCents, currency) {
  const integrityKey = process.env.WOMPI_INTEGRITY_KEY;
  if (!integrityKey) {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${integrityKey}`)
    .digest('hex');
}

async function obtenerOcrearVisitante({ nombre, correo, telefono, tipoDocumento, numeroDocumento, loginUrl }) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, nombre, correo FROM usuarios WHERE correo = ?`,
      [correo],
      async (searchErr, existente) => {
        if (searchErr) {
          return reject(searchErr);
        }

        if (existente) {
          return resolve({
            ...existente,
            autoCreado: false,
            passwordTemporal: null,
            loginUrl: loginUrl || 'http://localhost:3000/login/login.html'
          });
        }

        db.get(`SELECT id FROM roles WHERE nombre = 'visitante'`, [], async (roleErr, roleRow) => {
          if (roleErr) {
            return reject(roleErr);
          }

          if (!roleRow) {
            return reject(new Error('No existe el rol visitante.'));
          }

          const passwordTemporal = String(numeroDocumento || '').trim() || crypto.randomBytes(12).toString('hex');
          const hash = await bcrypt.hash(passwordTemporal, 10);

          db.run(
            `INSERT INTO usuarios (
              nombre, correo, contraseña, telefono, tipo_persona, tipo_documento, numero_documento, verificacion_documental_estado, rol_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              nombre,
              correo,
              hash,
              telefono || null,
              'natural',
              tipoDocumento || 'CC',
              numeroDocumento || null,
              'aprobado',
              roleRow.id
            ],
            function(insertErr) {
              if (insertErr) {
                return reject(insertErr);
              }

              resolve({
                id: this.lastID,
                nombre,
                correo,
                autoCreado: true,
                passwordTemporal,
                loginUrl: loginUrl || 'http://localhost:3000/login/login.html'
              });
            }
          );
        });
      }
    );
  });
}


// ======================================================
// CREAR RESERVA
// ======================================================
router.post('/', verificarToken, (req, res) => {

  const { id_habitacion, fecha_entrada, fecha_salida } = req.body;
  const id_usuario = req.user.id;

  if (!id_habitacion || !fecha_entrada || !fecha_salida) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const entrada = new Date(fecha_entrada);
  const salida = new Date(fecha_salida);

  if (entrada >= salida) {
    return res.status(400).json({ error: 'La fecha de salida debe ser posterior.' });
  }

  const noches = Math.ceil((salida - entrada) / (1000 * 60 * 60 * 24));

  // Verificar habitación
  db.get(
    `SELECT h.precio,
            COALESCE(ua.estado_cuenta, 'activo') AS estado_anfitrion,
            ua.suspension_hasta AS suspension_anfitrion_hasta
     FROM habitaciones h
     JOIN alojamientos a ON a.id = h.id_alojamiento
     JOIN usuarios ua ON ua.id = a.id_anfitrion
     WHERE h.id = ?`,
    [id_habitacion],
    (err, habitacion) => {

      if (err) return res.status(500).json({ error: 'Error obteniendo habitación.' });
      if (!habitacion) return res.status(404).json({ error: 'Habitación no encontrada.' });

      const estadoAnfitrion = String(habitacion.estado_anfitrion || 'activo').toLowerCase();
      const suspensionHasta = habitacion.suspension_anfitrion_hasta ? new Date(habitacion.suspension_anfitrion_hasta) : null;
      const suspensionVigente = estadoAnfitrion === 'suspendido' && (!suspensionHasta || suspensionHasta > new Date());
      if (suspensionVigente) {
        return res.status(403).json({
          error: 'Este alojamiento está temporalmente suspendido por el administrador y no admite reservas.'
        });
      }

      // Verificar solapamiento
      db.get(
        `SELECT * FROM reservas
         WHERE id_habitacion = ?
         AND estado IN ('pendiente','confirmada','en_curso')
         AND fecha_entrada <= ?
         AND fecha_salida >= ?`,
        [id_habitacion, fecha_salida, fecha_entrada],
        (err, conflicto) => {

          if (err) return res.status(500).json({ error: 'Error verificando disponibilidad.' });

          if (conflicto) {
            return res.status(409).json({ error: 'La habitación ya está reservada en esas fechas.' });
          }

          const precio_total = noches * habitacion.precio;

          db.run(
            `INSERT INTO reservas
             (id_usuario,id_habitacion,fecha_entrada,fecha_salida,precio_total,estado)
             VALUES (?,?,?,?,?,'pendiente')`,
            [id_usuario,id_habitacion,fecha_entrada,fecha_salida,precio_total],
            function (err) {

              if (err) return res.status(500).json({ error: 'No se pudo crear la reserva.' });

              res.status(201).json({
                mensaje: 'Reserva creada correctamente.',
                reserva: {
                  id: this.lastID,
                  id_usuario,
                  id_habitacion,
                  fecha_entrada,
                  fecha_salida,
                  noches,
                  precio_por_noche: habitacion.precio,
                  precio_total,
                  estado: 'pendiente'
                }
              });
            }
          );
        }
      );
    }
  );
});


// ======================================================
// CHECKOUT PÚBLICO DE RESERVA + PAGO Wompi
// ======================================================
router.post('/checkout-public', async (req, res) => {
  try {
    const {
      id_habitacion,
      fecha_entrada,
      fecha_salida,
      personas,
      cliente,
      servicios
    } = req.body;

    if (!id_habitacion || !fecha_entrada || !fecha_salida || !cliente) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para preparar la reserva.' });
    }

    const titularNombre = String(cliente.nombre || '').trim();
    const titularDocumentoTipo = String(cliente.tipoDocumento || '').trim().toUpperCase();
    const titularDocumentoNumero = String(cliente.numeroDocumento || '').trim();
    const titularCorreo = String(cliente.correo || '').trim().toLowerCase();
    const titularTelefono = String(cliente.telefono || '').trim();

    if (!titularNombre || !titularDocumentoTipo || !titularDocumentoNumero || !titularCorreo || !titularTelefono) {
      return res.status(400).json({ error: 'Todos los datos del titular de la reserva son obligatorios.' });
    }

    const entrada = new Date(`${fecha_entrada}T00:00:00`);
    const salida = new Date(`${fecha_salida}T00:00:00`);
    if (Number.isNaN(entrada.getTime()) || Number.isNaN(salida.getTime()) || entrada >= salida) {
      return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de inicio.' });
    }

    const noches = Math.ceil((salida - entrada) / (1000 * 60 * 60 * 24));
    const cantidadPersonas = Math.max(1, Number(personas || 1));

    const responderCheckout = ({
      reservaId,
      referenciaPago,
      subtotalHospedaje,
      subtotalServicios,
      total,
      nochesReserva,
      alojamientoNombre,
      habitacionNombre,
      statusCode = 201,
      mensaje
    }) => {
      const amountInCents = Math.round(Number(total || 0) * 100);
      const currency = 'COP';
      const signature = generarFirmaWompi(referenciaPago, amountInCents, currency);
      const redirectUrl = construirRedirectUrlWompi(req, reservaId);
      const wompiEnabled = Boolean(process.env.WOMPI_PUBLIC_KEY && signature);
      const fields = wompiEnabled ? {
        'public-key': process.env.WOMPI_PUBLIC_KEY,
        currency,
        'amount-in-cents': amountInCents,
        reference: referenciaPago,
        'signature:integrity': signature,
        'customer-data:email': titularCorreo,
        'customer-data:full-name': titularNombre,
        'customer-data:phone-number': titularTelefono,
        'customer-data:phone-number-prefix': '+57',
        'customer-data:legal-id': titularDocumentoNumero,
        'customer-data:legal-id-type': titularDocumentoTipo,
        'collect-customer-legal-id': 'true'
      } : null;

      if (fields) {
        Object.keys(fields).forEach((key) => {
          const value = fields[key];
          if (value === undefined || value === null || String(value).trim() === '' || String(value).trim().toLowerCase() === 'undefined') {
            delete fields[key];
          }
        });
      }

      if (fields && redirectUrl) {
        fields['redirect-url'] = redirectUrl;
      }

      const checkoutConfig = wompiEnabled ? {
        enabled: true,
        provider: 'wompi',
        mode: PAYMENT_MODE,
        action: 'https://checkout.wompi.co/p/',
        fields
      } : {
        enabled: false,
        provider: 'wompi',
        mode: PAYMENT_MODE,
        message: 'El pago no está disponible en este momento. Intenta nuevamente en unos minutos.'
      };

      return res.status(statusCode).json({
        mensaje: wompiEnabled
          ? (mensaje || 'Reserva preparada. Continúa con el pago.')
          : 'Reserva preparada. El pago no está disponible en este momento.',
        reserva: {
          id: reservaId,
          alojamiento: alojamientoNombre,
          habitacion: habitacionNombre,
          noches: nochesReserva,
          subtotalHospedaje,
          subtotalServicios,
          total,
          referenciaPago
        },
        checkout: checkoutConfig,
        wompi: checkoutConfig,
        pago: {
          proveedor: PAYMENT_PROVIDER_LABEL,
          metodo: 'pse',
          modo: PAYMENT_MODE
        }
      });
    };

    db.get(
      `SELECT h.id, h.nombre, h.capacidad, h.precio, h.id_alojamiento, a.titulo,
              COALESCE(ua.estado_cuenta, 'activo') AS estado_anfitrion,
              ua.suspension_hasta AS suspension_anfitrion_hasta
      FROM habitaciones h
       JOIN alojamientos a ON a.id = h.id_alojamiento
       JOIN usuarios ua ON ua.id = a.id_anfitrion
       WHERE h.id = ?`,
      [id_habitacion],
      async (habitacionErr, habitacion) => {
        if (habitacionErr) {
          console.error(habitacionErr);
          return res.status(500).json({ error: 'Error obteniendo la habitación seleccionada.' });
        }

        if (!habitacion) {
          return res.status(404).json({ error: 'La habitación seleccionada no existe.' });
        }

        const estadoAnfitrion = String(habitacion.estado_anfitrion || 'activo').toLowerCase();
        const suspensionHasta = habitacion.suspension_anfitrion_hasta ? new Date(habitacion.suspension_anfitrion_hasta) : null;
        const suspensionVigente = estadoAnfitrion === 'suspendido' && (!suspensionHasta || suspensionHasta > new Date());
        if (suspensionVigente) {
          return res.status(403).json({
            error: 'El anfitrión de este alojamiento está suspendido temporalmente y no puede recibir reservas.'
          });
        }

        if (String(habitacion.estado_manual || 'disponible').toLowerCase() === 'mantenimiento') {
          return res.status(409).json({ error: 'La habitación no está disponible temporalmente (mantenimiento).' });
        }

        if (cantidadPersonas > Number(habitacion.capacidad || 0)) {
          return res.status(400).json({ error: 'La cantidad de personas supera la capacidad de la habitación.' });
        }

        db.run(
          `UPDATE reservas
           SET estado = 'cancelada'
           WHERE estado = 'pendiente'
             AND creado_en <= datetime('now', '-30 minutes')`,
          [],
          (cleanupErr) => {
            if (cleanupErr) {
              console.error(cleanupErr);
            }

            db.get(
              `SELECT r.id, r.estado, r.titular_correo, r.titular_documento_numero, r.precio_total,
                      r.subtotal_hospedaje, r.subtotal_servicios, r.noches, r.referencia_pago,
                      p.estado AS pago_estado
               FROM reservas r
               LEFT JOIN pagos p ON p.id_reserva = r.id
               WHERE r.id_habitacion = ?
                 AND r.estado IN ('pendiente','confirmada','en_curso')
                 AND r.fecha_entrada <= ?
                 AND r.fecha_salida >= ?
               ORDER BY r.id DESC
               LIMIT 1`,
              [id_habitacion, fecha_salida, fecha_entrada],
              async (conflictErr, conflicto) => {
                if (conflictErr) {
                  console.error(conflictErr);
                  return res.status(500).json({ error: 'Error validando disponibilidad de la habitación.' });
                }

                if (conflicto) {
                  const mismoTitular = conflicto.estado === 'pendiente'
                    && String(conflicto.titular_correo || '').toLowerCase() === titularCorreo
                    && String(conflicto.titular_documento_numero || '') === titularDocumentoNumero;

                  if (!mismoTitular) {
                    return res.status(409).json({ error: 'La habitación ya está reservada para ese rango de fechas.' });
                  }

                  // Generar siempre una referencia nueva para evitar que Wompi rechace
                  // una referencia que ya fue intentada (aunque no completada).
                  const nuevaReferencia = generarReferenciaPago();
                  db.run(
                    `UPDATE reservas SET referencia_pago = ? WHERE id = ?`,
                    [nuevaReferencia, conflicto.id],
                    (updateRefErr) => {
                      if (updateRefErr) {
                        console.error('Error actualizando referencia de reserva:', updateRefErr);
                        return res.status(500).json({ error: 'No se pudo refrescar la referencia de pago.' });
                      }

                      db.run(
                        `UPDATE pagos SET referencia_pago = ? WHERE id_reserva = ?`,
                        [nuevaReferencia, conflicto.id],
                        (updatePagoRefErr) => {
                          if (updatePagoRefErr) {
                            console.error('Error actualizando referencia de pago:', updatePagoRefErr);
                            return res.status(500).json({ error: 'No se pudo refrescar la referencia del pago pendiente.' });
                          }

                          return responderCheckout({
                            reservaId: conflicto.id,
                            referenciaPago: nuevaReferencia,
                            subtotalHospedaje: Number(conflicto.subtotal_hospedaje || 0),
                            subtotalServicios: Number(conflicto.subtotal_servicios || 0),
                            total: Number(conflicto.precio_total || 0),
                            nochesReserva: Number(conflicto.noches || noches),
                            alojamientoNombre: habitacion.titulo,
                            habitacionNombre: habitacion.nombre,
                            statusCode: 200,
                            mensaje: 'Retomamos tu intento de pago pendiente para que continúes con la pasarela.'
                          });
                        }
                      );
                    }
                  );
                  return;
                }

                const serviciosSeleccionados = Array.isArray(servicios) ? servicios : [];
                const servicioIds = serviciosSeleccionados
                  .map((item) => Number(item.id))
                  .filter((value) => Number.isFinite(value) && value > 0);

                const placeholders = servicioIds.map(() => '?').join(',');
                const queryServicios = servicioIds.length
                  ? `SELECT s.id, s.nombre, COALESCE(a_s.valor_adicional, 0) AS valor
                       FROM alojamiento_servicios a_s
                       JOIN servicios s ON s.id = a_s.id_servicio
                      WHERE a_s.id_alojamiento = ?
                        AND COALESCE(a_s.es_adicional, 0) = 1
                        AND s.id IN (${placeholders})`
                  : null;

                const manejarInsercionReserva = async (serviciosValidados) => {
                  const subtotalHospedaje = Number(habitacion.precio || 0) * noches;
                  const subtotalServicios = serviciosValidados.reduce((acc, item) => acc + Number(item.valor || 0), 0);
                  const precioTotal = subtotalHospedaje + subtotalServicios;
                  const referenciaPago = generarReferenciaPago();

                  let usuarioReserva;
                  try {
                    usuarioReserva = await obtenerOcrearVisitante({
                      nombre: titularNombre,
                      correo: titularCorreo,
                      telefono: titularTelefono,
                      tipoDocumento: titularDocumentoTipo,
                      numeroDocumento: titularDocumentoNumero,
                      loginUrl: `${construirBaseUrl(req)}/login/login.html`
                    });
                  } catch (userErr) {
                    console.error(userErr);
                    return res.status(500).json({ error: 'No se pudo preparar el usuario asociado a la reserva.' });
                  }

                  db.run(
                    `INSERT INTO reservas (
                      id_usuario,
                      id_habitacion,
                      fecha_entrada,
                      fecha_salida,
                      personas,
                      precio_total,
                      estado,
                      titular_nombre,
                      titular_documento_tipo,
                      titular_documento_numero,
                      titular_correo,
                      titular_telefono,
                      detalle_servicios_json,
                      subtotal_hospedaje,
                      subtotal_servicios,
                      noches,
                      referencia_pago
                    )
                     VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      usuarioReserva.id,
                      id_habitacion,
                      fecha_entrada,
                      fecha_salida,
                      cantidadPersonas,
                      precioTotal,
                      titularNombre,
                      titularDocumentoTipo,
                      titularDocumentoNumero,
                      titularCorreo,
                      titularTelefono,
                      JSON.stringify(serviciosValidados),
                      subtotalHospedaje,
                      subtotalServicios,
                      noches,
                      referenciaPago
                    ],
                    function(insertReservaErr) {
                      if (insertReservaErr) {
                        console.error(insertReservaErr);
                        return res.status(500).json({ error: 'No se pudo crear la reserva.' });
                      }

                      const reservaId = this.lastID;

                      db.run(
                        `INSERT INTO pagos (
                          id_reserva, monto, metodo_pago, estado, referencia_pago, pasarela
                        ) VALUES (?, ?, ?, 'pendiente', ?, 'wompi')`,
                        [reservaId, precioTotal, 'pse', referenciaPago],
                        (insertPagoErr) => {
                          if (insertPagoErr) {
                            console.error(insertPagoErr);
                            return res.status(500).json({ error: 'No se pudo registrar el pago pendiente.' });
                          }

                          if (usuarioReserva?.autoCreado && usuarioReserva?.passwordTemporal) {
                            const msgAcceso = `Creamos tu usuario en Tu Refugio. Usuario: ${titularCorreo}. Contrasena inicial: ${usuarioReserva.passwordTemporal}. Ingresa y cambiala en ${usuarioReserva.loginUrl}`;
                            db.run(
                              `INSERT INTO notificaciones (id_reserva, canal, destinatario, mensaje, estado)
                               VALUES (?, 'email', ?, ?, 'pendiente_integracion')`,
                              [reservaId, titularCorreo, msgAcceso],
                              () => {}
                            );
                            if (titularTelefono) {
                              db.run(
                                `INSERT INTO notificaciones (id_reserva, canal, destinatario, mensaje, estado)
                                 VALUES (?, 'whatsapp', ?, ?, 'pendiente_integracion')`,
                                [reservaId, titularTelefono, msgAcceso],
                                () => {}
                              );
                            }
                          }

                          return responderCheckout({
                            reservaId,
                            referenciaPago,
                            subtotalHospedaje,
                            subtotalServicios,
                            total: precioTotal,
                            nochesReserva: noches,
                            alojamientoNombre: habitacion.titulo,
                            habitacionNombre: habitacion.nombre,
                            statusCode: 201,
                            mensaje: 'Reserva preparada. Continúa con el pago.'
                          });
                        }
                      );
                    }
                  );
                };

                if (!queryServicios) {
                  return manejarInsercionReserva([]);
                }

                db.all(
                  queryServicios,
                  [habitacion.id_alojamiento, ...servicioIds],
                  (servicesErr, serviciosValidos) => {
                    if (servicesErr) {
                      console.error(servicesErr);
                      return res.status(500).json({ error: 'Error validando los servicios adicionales.' });
                    }

                    manejarInsercionReserva(serviciosValidos || []);
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo iniciar el checkout de la reserva.' });
  }
});


// ======================================================
// VER MIS RESERVAS
// ======================================================
router.get('/mis-reservas', verificarToken, (req, res) => {

  db.all(
    `SELECT r.*, h.nombre AS habitacion
     FROM reservas r
     JOIN habitaciones h ON r.id_habitacion = h.id
     WHERE r.id_usuario = ?`,
    [req.user.id],
    (err, rows) => {

      if (err) return res.status(500).json({ error: 'Error obteniendo reservas.' });

      res.json(rows);
    }
  );

});


// ======================================================
// CANCELAR RESERVA
// ======================================================
router.put('/cancelar/:id', verificarToken, (req, res) => {

  db.run(
    `UPDATE reservas
     SET estado='cancelada'
     WHERE id=? AND id_usuario=?`,
    [req.params.id, req.user.id],
    function (err) {

      if (err) return res.status(500).json({ error: 'Error cancelando reserva.' });

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Reserva no encontrada.' });
      }

      res.json({ mensaje: 'Reserva cancelada correctamente.' });
    }
  );

});

router.get('/alojamiento/:idAlojamiento', verificarToken, (req, res) => {
  const { idAlojamiento } = req.params;

  db.get(`SELECT id_anfitrion FROM alojamientos WHERE id = ?`, [idAlojamiento], (err, aloj) => {
    if (err) return res.status(500).json({ error: 'Error verificando alojamiento.' });
    if (!aloj) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

    if (req.user.rol !== 'admin' && Number(aloj.id_anfitrion) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'No tienes permiso para ver estas reservas.' });
    }

    db.all(
      `SELECT r.id, r.id_habitacion, h.nombre AS habitacion, r.fecha_entrada, r.fecha_salida,
              r.precio_total, r.estado, r.titular_nombre, r.titular_correo, r.titular_telefono,
              r.titular_documento_tipo, r.titular_documento_numero, r.cancelacion_motivo,
              r.cancelacion_porcentaje_reembolso, r.creado_en,
              r.subtotal_hospedaje, r.subtotal_servicios, r.noches,
              r.detalle_servicios_json, r.referencia_pago
       FROM reservas r
       JOIN habitaciones h ON h.id = r.id_habitacion
       WHERE h.id_alojamiento = ?
       ORDER BY r.id DESC`,
      [idAlojamiento],
      (listErr, rows) => {
        if (listErr) return res.status(500).json({ error: 'Error obteniendo reservas del alojamiento.' });
        res.json(rows || []);
      }
    );
  });
});

router.put('/:id/cancelar-anfitrion', verificarToken, (req, res) => {
  const { id } = req.params;
  const motivo = String(req.body?.motivo || '').trim();
  const porcentaje = Number(req.body?.porcentajeReembolso ?? 0);

  if (!motivo) {
    return res.status(400).json({ error: 'Debes indicar el motivo de la cancelación.' });
  }

  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return res.status(400).json({ error: 'El porcentaje de reembolso debe estar entre 0 y 100.' });
  }

  db.get(
    `SELECT r.id, r.estado, r.titular_correo, r.titular_telefono, h.id_alojamiento, a.id_anfitrion
     FROM reservas r
     JOIN habitaciones h ON h.id = r.id_habitacion
     JOIN alojamientos a ON a.id = h.id_alojamiento
     WHERE r.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error verificando reserva.' });
      if (!row) return res.status(404).json({ error: 'Reserva no encontrada.' });

      if (req.user.rol !== 'admin' && Number(row.id_anfitrion) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'No tienes permiso para cancelar esta reserva.' });
      }

      db.run(
        `UPDATE reservas
         SET estado = 'cancelada',
             cancelacion_motivo = ?,
             cancelacion_porcentaje_reembolso = ?,
             cancelada_por = ?
         WHERE id = ?`,
        [motivo, porcentaje, req.user.rol === 'admin' ? 'admin' : 'anfitrion', id],
        function(updateErr) {
          if (updateErr) return res.status(500).json({ error: 'Error cancelando la reserva.' });

          const msg = `Tu reserva #${id} fue cancelada por el anfitrión. Motivo: ${motivo}. Reembolso: ${porcentaje}%.`;
          if (row.titular_correo) {
            db.run(
              `INSERT INTO notificaciones (id_reserva, canal, destinatario, mensaje, estado)
               VALUES (?, 'email', ?, ?, 'pendiente_integracion')`,
              [id, row.titular_correo, msg],
              () => {}
            );
          }
          if (row.titular_telefono) {
            db.run(
              `INSERT INTO notificaciones (id_reserva, canal, destinatario, mensaje, estado)
               VALUES (?, 'whatsapp', ?, ?, 'pendiente_integracion')`,
              [id, row.titular_telefono, msg],
              () => {}
            );
          }

          res.json({ mensaje: 'Reserva cancelada y liberada correctamente.', reembolso: porcentaje, motivo });
        }
      );
    }
  );
});


// ======================================================
// VER TODAS LAS RESERVAS (ADMIN)
// ======================================================
router.get(
  '/admin/todas',
  verificarToken,
  soloRoles('admin'),
  (req, res) => {

    db.all(
      `SELECT r.*,u.nombre AS usuario,h.nombre AS habitacion
       FROM reservas r
       JOIN usuarios u ON r.id_usuario=u.id
       JOIN habitaciones h ON r.id_habitacion=h.id`,
      [],
      (err, rows) => {

        if (err) return res.status(500).json({ error: 'Error obteniendo reservas.' });

        res.json(rows);
      }
    );

  }
);


// ======================================================
// CONFIRMAR RESERVA (ADMIN O ANFITRIÓN)
// ======================================================
router.put('/confirmar/:id', verificarToken, (req, res) => {

  db.get(
    `SELECT r.*,a.id_anfitrion
     FROM reservas r
     JOIN habitaciones h ON r.id_habitacion=h.id
     JOIN alojamientos a ON h.id_alojamiento=a.id
     WHERE r.id=?`,
    [req.params.id],
    (err,reserva)=>{

      if(err) return res.status(500).json({error:'Error buscando reserva'});
      if(!reserva) return res.status(404).json({error:'Reserva no encontrada'});

      if(req.user.rol!=='admin' && reserva.id_anfitrion!==req.user.id){
        return res.status(403).json({error:'No tienes permiso para confirmar esta reserva'});
      }

      db.run(
        `UPDATE reservas SET estado='confirmada' WHERE id=?`,
        [req.params.id],
        function(err){

          if(err) return res.status(500).json({error:'Error confirmando reserva'});

          res.json({mensaje:'Reserva confirmada correctamente'});
        }
      );
    }
  );

});


// ======================================================
// FINALIZAR RESERVA MANUALMENTE
// ======================================================
router.put(
  '/finalizar/:id',
  verificarToken,
  soloRoles('admin'),
  (req,res)=>{

    db.run(
      `UPDATE reservas
       SET estado='finalizada'
       WHERE id=?`,
      [req.params.id],
      function(err){

        if(err) return res.status(500).json({error:'Error finalizando reserva'});

        if(this.changes===0){
          return res.status(404).json({error:'Reserva no encontrada'});
        }

        res.json({
          mensaje:'Reserva finalizada correctamente'
        });

      }
    );

  }
);


// ======================================================
// FINALIZAR RESERVAS AUTOMÁTICAMENTE
// ======================================================
router.put(
  '/actualizar-estados',
  verificarToken,
  soloRoles('admin'),
  (req,res)=>{

    db.run(
      `UPDATE reservas
       SET estado='finalizada',
           puede_resenar = 1
       WHERE date(fecha_salida) < date('now')
       AND estado IN ('confirmada','en_curso')`,
      function(err){

        if(err) return res.status(500).json({error:'Error actualizando reservas'});

        res.json({
          mensaje:'Estados actualizados',
          reservas_actualizadas:this.changes
        });

      }
    );

  }
);

router.get('/estadisticas/ocupacion-semanal/:idAlojamiento', verificarToken, (req, res) => {
  const idAlojamiento = Number(req.params.idAlojamiento || 0);
  if (!idAlojamiento) {
    return res.status(400).json({ error: 'idAlojamiento inválido.' });
  }

  db.get(`SELECT id_anfitrion FROM alojamientos WHERE id = ?`, [idAlojamiento], (err, aloj) => {
    if (err) return res.status(500).json({ error: 'Error verificando alojamiento.' });
    if (!aloj) return res.status(404).json({ error: 'Alojamiento no encontrado.' });
    if (req.user.rol !== 'admin' && Number(aloj.id_anfitrion) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'No tienes permiso para ver estas estadísticas.' });
    }

    db.get(
      `SELECT COUNT(*) AS total FROM habitaciones WHERE id_alojamiento = ?`,
      [idAlojamiento],
      (roomErr, roomRow) => {
        if (roomErr) return res.status(500).json({ error: 'Error contando habitaciones.' });
        const totalHabitaciones = Number(roomRow?.total || 0);
        if (!totalHabitaciones) {
          return res.json({ labels: [], ocupacion: [] });
        }

        const labels = [];
        const valores = [];
        const dias = [6, 5, 4, 3, 2, 1, 0];

        const consultarDia = (index) => {
          if (index >= dias.length) {
            return res.json({ labels, ocupacion: valores });
          }

          const offset = dias[index];
          const fechaObj = new Date();
          fechaObj.setDate(fechaObj.getDate() - offset);
          const yyyy = fechaObj.getFullYear();
          const mm = String(fechaObj.getMonth() + 1).padStart(2, '0');
          const dd = String(fechaObj.getDate()).padStart(2, '0');
          const fecha = `${yyyy}-${mm}-${dd}`;

          labels.push(fecha.substring(5));

          db.get(
            `SELECT COUNT(DISTINCT r.id_habitacion) AS ocupadas
             FROM reservas r
             JOIN habitaciones h ON h.id = r.id_habitacion
             WHERE h.id_alojamiento = ?
               AND r.estado IN ('pendiente','confirmada','en_curso','finalizada')
               AND date(r.fecha_entrada) <= date(?)
               AND date(r.fecha_salida) > date(?)`,
            [idAlojamiento, fecha, fecha],
            (occErr, occRow) => {
              if (occErr) return res.status(500).json({ error: 'Error calculando ocupación semanal.' });
              const ocupadas = Number(occRow?.ocupadas || 0);
              const porcentaje = Number(((ocupadas / totalHabitaciones) * 100).toFixed(2));
              valores.push(porcentaje);
              consultarDia(index + 1);
            }
          );
        };

        consultarDia(0);
      }
    );
  });
});

/**
 * POST /api/reservas/por-email
 * Buscar reservas por email del turista (sin autenticación)
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

  // Buscar el usuario por email
  db.get(
    'SELECT id FROM usuarios WHERE correo = ?',
    [email],
    (err, usuario) => {
      if (err) {
        console.error('Error en BD:', err);
        return res.status(500).json({
          status: 'error',
          mensaje: 'Error al buscar usuario'
        });
      }

      if (!usuario) {
        return res.status(200).json({
          status: 'success',
          reservas: [],
          mensaje: 'No se encontraron reservas asociadas a este correo.'
        });
      }

      // Buscar reservas del usuario con el esquema actual
      db.all(
        `SELECT 
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
        WHERE r.id_usuario = ? AND r.estado IN ('pendiente', 'confirmada', 'en_curso')
        ORDER BY r.fecha_entrada DESC`,
        [usuario.id],
        (err, reservas) => {
          if (err) {
            console.error('Error en BD:', err);
            return res.status(500).json({
              status: 'error',
              mensaje: 'Error al buscar reservas'
            });
          }

          if (reservas.length === 0) {
            return res.status(200).json({
              status: 'success',
              reservas: [],
              mensaje: 'No hay reservas activas para este correo.'
            });
          }

          res.status(200).json({ status: 'success', reservas: reservas });
        }
      );
    }
  );
});

module.exports = router;