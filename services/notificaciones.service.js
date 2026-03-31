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

async function enviarEmail(destinatario, mensaje) {
  const mailer = getMailer();
  if (!mailer) {
    throw new Error('SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = process.env.NOTIFY_EMAIL_SUBJECT || 'Tu Refugio - Notificación';

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

  const fromValue = isWhatsApp ? `whatsapp:${from}` : from;
  const toValue = isWhatsApp ? `whatsapp:${toNormalizado}` : toNormalizado;

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

  if (canal === 'email') {
    return enviarEmail(notificacion.destinatario, notificacion.mensaje);
  }
  if (canal === 'whatsapp') {
    return enviarWhatsApp(notificacion.destinatario, notificacion.mensaje);
  }
  if (canal === 'sms') {
    return enviarSms(notificacion.destinatario, notificacion.mensaje);
  }

  throw new Error(`Canal no soportado: ${canal}`);
}

async function procesarNotificacionesPendientes({ limit = 20 } = {}) {
  if (procesando) {
    return { skipped: true, reason: 'already_running' };
  }

  procesando = true;
  try {
    const pendientes = await dbAll(
      `SELECT id, id_reserva, canal, destinatario, mensaje, estado
       FROM notificaciones
       WHERE estado IN ('pendiente_integracion', 'error_integracion')
       ORDER BY id ASC
       LIMIT ?`,
      [Number(limit || 20)]
    );

    if (!pendientes.length) {
      return { total: 0, enviados: 0, errores: 0 };
    }

    let enviados = 0;
    let errores = 0;

    for (const noti of pendientes) {
      try {
        const infoEnvio = await despachar(noti);
        await marcarEnviado(noti.id, {
          ...infoEnvio,
          canal: noti.canal,
          destinatario: noti.destinatario,
          at: new Date().toISOString()
        });
        enviados += 1;
      } catch (error) {
        const msg = String(error?.message || error || '');
        if (msg.toLowerCase().includes('no configurado')) {
          await marcarOmitidoConfig(noti.id, msg);
        } else {
          await marcarError(noti.id, error);
          errores += 1;
        }
      }
    }

    return { total: pendientes.length, enviados, errores };
  } finally {
    procesando = false;
  }
}

module.exports = {
  procesarNotificacionesPendientes
};
