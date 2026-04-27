const nodemailer = require('nodemailer');
const db = require('../database');

let procesando = false;
let transporter = null;

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function normalizarTelefono(destinatario) {
  const limpio = String(destinatario || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!limpio) return '';
  if (limpio.startsWith('+')) return limpio;
  if (limpio.startsWith('57')) return `+${limpio}`;
  return `+57${limpio}`;
}

function normalizarRemitenteWhatsapp(from) {
  const raw = String(from || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('whatsapp:')) {
    return raw;
  }
  const tel = normalizarTelefono(raw);
  return tel ? `whatsapp:${tel}` : '';
}

function getMailer() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
    }
  });
  return transporter;
}

function parsearPayload(payloadJson) {
  if (!payloadJson) return {};
  try {
    return JSON.parse(payloadJson) || {};
  } catch (_) {
    return {};
  }
}

function humanizarErrorCampana(errorTexto) {
  const texto = String(errorTexto || '').trim();
  if (!texto) {
    return 'No se pudo entregar la campaña. Intenta nuevamente o revisa la configuración del correo.';
  }

  const normalizado = texto.toLowerCase();
  if (normalizado.includes('daily user sending limit exceeded') || normalizado.includes('550-5.4.5')) {
    return 'Gmail alcanzó el límite diario de envíos del correo configurado. Espera unas horas o usa otra cuenta SMTP para continuar enviando campañas.';
  }
  if (normalizado.includes('smtp no configurado')) {
    return 'El correo SMTP no está configurado correctamente. Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.';
  }
  if (normalizado.includes('authentication') || normalizado.includes('invalid login') || normalizado.includes('username and password not accepted')) {
    return 'La autenticación del correo SMTP falló. Verifica usuario, contraseña o clave de aplicación del correo configurado.';
  }
  if (normalizado.includes('no se encontraron correos destinatarios')) {
    return 'No se encontraron correos destinatarios para este alojamiento.';
  }

  return texto;
}

async function enviarEmail(destinatario, mensaje, subjectOverride = null) {
  const mailer = getMailer();
  if (!mailer) {
    throw new Error('SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = String(subjectOverride || process.env.NOTIFY_EMAIL_SUBJECT || 'Tu Refugio - Notificación');

  const info = await mailer.sendMail({
    from,
    to: destinatario,
    subject,
    text: mensaje
  });

  return { provider: 'smtp', messageId: info.messageId || null };
}

async function enviarTwilioMensaje(destinatario, mensaje, from, isWhatsApp) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || !from) {
    throw new Error('Twilio no configurado. Define TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y número remitente.');
  }

  const toNormalizado = normalizarTelefono(destinatario);
  if (!toNormalizado) {
    throw new Error('Destinatario telefónico inválido.');
  }

  let fromValue = '';
  let toValue = '';

  if (isWhatsApp) {
    fromValue = normalizarRemitenteWhatsapp(from);
    toValue = `whatsapp:${toNormalizado}`;
  } else {
    fromValue = String(from || '').trim();
    if (fromValue.toLowerCase().startsWith('whatsapp:')) {
      fromValue = fromValue.slice('whatsapp:'.length);
    }
    toValue = toNormalizado;
  }

  if (!fromValue) {
    throw new Error('Twilio no configurado. Define TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y número remitente.');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams();
  body.set('From', fromValue);
  body.set('To', toValue);
  body.set('Body', mensaje);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.message || `Error Twilio (${resp.status}).`);
  }

  return { provider: 'twilio', sid: data.sid || null };
}

async function enviarWhatsApp(destinatario, mensaje) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  return enviarTwilioMensaje(destinatario, mensaje, from, true);
}

async function enviarSms(destinatario, mensaje) {
  const from = process.env.TWILIO_SMS_FROM;
  return enviarTwilioMensaje(destinatario, mensaje, from, false);
}

async function marcarEnviado(notificacionId, infoEnvio) {
  await dbRun(
    `UPDATE notificaciones
     SET estado = 'enviado',
         payload_json = ?
     WHERE id = ?`,
    [JSON.stringify(infoEnvio || {}), notificacionId]
  );
}

async function marcarError(notificacionId, error) {
  const payload = {
    error: String(error?.message || error || 'Error desconocido'),
    at: new Date().toISOString()
  };

  await dbRun(
    `UPDATE notificaciones
     SET estado = 'error_integracion',
         payload_json = ?
     WHERE id = ?`,
    [JSON.stringify(payload), notificacionId]
  );
}

async function marcarOmitidoConfig(notificacionId, motivo) {
  const payload = {
    motivo: String(motivo || 'Canal omitido por configuración incompleta.'),
    at: new Date().toISOString()
  };

  await dbRun(
    `UPDATE notificaciones
     SET estado = 'omitido_config',
         payload_json = ?
     WHERE id = ?`,
    [JSON.stringify(payload), notificacionId]
  );
}

async function despachar(notificacion) {
  const canal = String(notificacion.canal || '').toLowerCase();
  const payload = parsearPayload(notificacion.payload_json);

  if (canal === 'email') {
    return enviarEmail(notificacion.destinatario, notificacion.mensaje, payload.subject || null);
  }
  if (canal === 'whatsapp') {
    return enviarWhatsApp(notificacion.destinatario, notificacion.mensaje);
  }
  if (canal === 'sms') {
    return enviarSms(notificacion.destinatario, notificacion.mensaje);
  }

  throw new Error(`Canal no soportado: ${canal}`);
}

async function procesarNotificacionesPendientes({ limit = 20, scope = 'all', referenciaId = null } = {}) {
  if (procesando) {
    return { skipped: true, reason: 'already_running' };
  }

  procesando = true;
  try {
    const esScopeCampanas = String(scope || 'all').toLowerCase() === 'campanas';

    const pendientesReserva = esScopeCampanas
      ? []
      : await dbAll(
        `SELECT id, id_reserva, canal, destinatario, mensaje, estado, payload_json, 'notificaciones' AS fuente
         FROM notificaciones
         WHERE estado = 'pendiente_integracion'
         ORDER BY id ASC
         LIMIT ?`,
        [Number(limit || 20)]
      );

    const whereGeneral = ["estado = 'pendiente_integracion'"];
    const paramsGeneral = [];

    if (esScopeCampanas) {
      whereGeneral.push("referencia_tipo = 'campana_alojamiento'");
    }

    if (referenciaId != null) {
      whereGeneral.push('referencia_id = ?');
      paramsGeneral.push(Number(referenciaId));
    }

    paramsGeneral.push(Number(limit || 20));

    const pendientesGeneral = await dbAll(
      `SELECT id, referencia_id AS id_reserva, canal, destinatario, mensaje, estado, payload_json, 'notificaciones_general' AS fuente
       FROM notificaciones_general
       WHERE ${whereGeneral.join(' AND ')}
       ORDER BY id ASC
       LIMIT ?`,
      paramsGeneral
    );

    const pendientes = [...pendientesReserva, ...pendientesGeneral];

    if (!pendientes.length) {
      return { total: 0, enviados: 0, errores: 0 };
    }

    let enviados = 0;
    let errores = 0;

    for (const noti of pendientes) {
      const tablaDestino = String(noti.fuente || 'notificaciones') === 'notificaciones_general'
        ? 'notificaciones_general'
        : 'notificaciones';
      try {
        const infoEnvio = await despachar(noti);
        await dbRun(
          `UPDATE ${tablaDestino}
           SET estado = 'enviado',
               payload_json = ?
           WHERE id = ?`,
          [JSON.stringify({
            ...infoEnvio,
            canal: noti.canal,
            destinatario: noti.destinatario,
            at: new Date().toISOString()
          }), noti.id]
        );
        enviados += 1;
      } catch (error) {
        const msg = String(error?.message || error || '');
        const msgLow = msg.toLowerCase();
        const esErrorConfig = msgLow.includes('no configurado')
          || msgLow.includes('trial accounts cannot send messages to unverified numbers')
          || msgLow.includes('is unverified');

        if (esErrorConfig) {
          await dbRun(
            `UPDATE ${tablaDestino}
             SET estado = 'omitido_config',
                 payload_json = ?
             WHERE id = ?`,
            [JSON.stringify({ motivo: msg, at: new Date().toISOString() }), noti.id]
          );
        } else {
          await dbRun(
            `UPDATE ${tablaDestino}
             SET estado = 'error_integracion',
                 payload_json = ?
             WHERE id = ?`,
            [JSON.stringify({
              error: String(error?.message || error || 'Error desconocido'),
              at: new Date().toISOString()
            }), noti.id]
          );
          errores += 1;
        }
      }
    }

    return { total: pendientes.length, enviados, errores };
  } finally {
    procesando = false;
  }
}

async function obtenerDestinatariosCampana(idAlojamiento) {
  const rows = await dbAll(
    `SELECT DISTINCT LOWER(TRIM(destinatario)) AS correo
     FROM (
       SELECT u.correo AS destinatario
       FROM reservas r
       JOIN habitaciones h ON h.id = r.id_habitacion
       JOIN usuarios u ON u.id = r.id_usuario
       WHERE h.id_alojamiento = ?

       UNION

       SELECT r.titular_correo AS destinatario
       FROM reservas r
       JOIN habitaciones h ON h.id = r.id_habitacion
       WHERE h.id_alojamiento = ?
     ) q
     WHERE destinatario IS NOT NULL
       AND TRIM(destinatario) <> ''`,
    [idAlojamiento, idAlojamiento]
  );
  return rows.map((r) => String(r.correo || '').trim()).filter(Boolean);
}

async function encolarCampana(campana, destinatarios) {
  for (const correo of destinatarios) {
    await dbRun(
      `INSERT INTO notificaciones_general (referencia_tipo, referencia_id, canal, destinatario, mensaje, estado, payload_json)
       VALUES ('campana_alojamiento', ?, 'email', ?, ?, 'pendiente_integracion', ?)`,
      [
        campana.id,
        correo,
        campana.mensaje_final,
        JSON.stringify({ subject: campana.asunto })
      ]
    );
  }
}

async function obtenerResumenEntregaCampana(campanaId) {
  const rows = await dbAll(
    `SELECT estado, COUNT(*) AS total
     FROM notificaciones_general
     WHERE referencia_tipo = 'campana_alojamiento'
       AND referencia_id = ?
     GROUP BY estado`,
    [campanaId]
  );

  let enviados = 0;
  let omitidos = 0;
  let errores = 0;
  let pendientes = 0;

  rows.forEach((row) => {
    const estado = String(row.estado || '').toLowerCase();
    const total = Number(row.total || 0);
    if (estado === 'enviado') enviados += total;
    else if (estado === 'omitido_config') omitidos += total;
    else if (estado === 'error_integracion') errores += total;
    else pendientes += total;
  });

  const detalleRow = await dbAll(
    `SELECT estado, payload_json
     FROM notificaciones_general
     WHERE referencia_tipo = 'campana_alojamiento'
       AND referencia_id = ?
       AND estado IN ('error_integracion', 'omitido_config')
     ORDER BY id DESC
     LIMIT 1`,
    [campanaId]
  );

  let detalleError = null;
  if (detalleRow[0]?.payload_json) {
    const payload = parsearPayload(detalleRow[0].payload_json);
    detalleError = String(payload.error || payload.motivo || '').trim() || null;
    detalleError = humanizarErrorCampana(String(payload.error || payload.motivo || '').trim() || null);
  }

  return {
    enviados,
    omitidos,
    errores,
    pendientes,
    detalleError,
    total: enviados + omitidos + errores + pendientes
  };
}

async function procesarCampanasProgramadas({ limit = 10 } = {}) {
  const pendientes = await dbAll(
    `SELECT id, id_alojamiento, asunto, mensaje_final
     FROM campanas_alojamiento
     WHERE estado = 'programada'
       AND fecha_programada IS NOT NULL
       AND datetime(fecha_programada) <= datetime('now', 'localtime')
     ORDER BY datetime(fecha_programada) ASC
     LIMIT ?`,
    [Number(limit || 10)]
  );

  if (!pendientes.length) {
    return { total: 0, encoladas: 0, errores: 0 };
  }

  let encoladas = 0;
  let errores = 0;

  for (const campana of pendientes) {
    try {
      const destinatarios = await obtenerDestinatariosCampana(Number(campana.id_alojamiento));
      if (!destinatarios.length) {
        await dbRun(
          `UPDATE campanas_alojamiento
           SET estado = 'error',
               error_detalle = ?,
               enviado_en = datetime('now', 'localtime')
           WHERE id = ?`,
          ['No se encontraron correos destinatarios para este alojamiento.', campana.id]
                  [humanizarErrorCampana('No se encontraron correos destinatarios para este alojamiento.'), campana.id]
        );
        errores += 1;
        continue;
      }

      await encolarCampana(campana, destinatarios);
      await procesarNotificacionesPendientes({
        limit: Math.max(20, destinatarios.length + 5),
        scope: 'campanas',
        referenciaId: campana.id
      });
      const resumen = await obtenerResumenEntregaCampana(campana.id);

      await dbRun(
        `UPDATE campanas_alojamiento
         SET estado = ?,
             destinatarios_total = ?,
             enviados_total = ?,
             error_detalle = ?,
             enviado_en = datetime('now', 'localtime')
         WHERE id = ?`,
        [
          resumen.enviados > 0 ? 'enviada' : 'error',
          destinatarios.length,
          resumen.enviados,
          resumen.enviados === 0
            ? humanizarErrorCampana(resumen.detalleError || 'La campaña no pudo entregarse correctamente.')
            : null,
          campana.id
        ]
      );

      encoladas += 1;
    } catch (error) {
      await dbRun(
        `UPDATE campanas_alojamiento
         SET estado = 'error',
             error_detalle = ?,
             enviado_en = datetime('now', 'localtime')
         WHERE id = ?`,
        [String(error?.message || error || 'Error desconocido'), campana.id]
        [humanizarErrorCampana(String(error?.message || error || 'Error desconocido')), campana.id]
      );
      errores += 1;
    }
  }

  return { total: pendientes.length, encoladas, errores };
}

module.exports = {
  procesarNotificacionesPendientes,
  procesarCampanasProgramadas,
  obtenerDestinatariosCampana,
  encolarCampana
};
