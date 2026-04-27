const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const { verificarMiembroAlojamiento } = require('../middlewares/verificarMiembroAlojamiento');
const db = require('../database');

const router = express.Router();
const sseClientsPorAlojamiento = new Map();

function enviarEventoSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function emitirActualizacionEquipo(alojamientoId, payload = {}) {
  const key = String(alojamientoId);
  const clientes = sseClientsPorAlojamiento.get(key);
  if (!clientes || !clientes.size) return;

  for (const cliente of clientes) {
    try {
      enviarEventoSSE(cliente, 'equipo_actualizado', {
        alojamientoId: Number(alojamientoId),
        ts: Date.now(),
        ...payload
      });
    } catch (err) {
      clientes.delete(cliente);
    }
  }

  if (!clientes.size) {
    sseClientsPorAlojamiento.delete(key);
  }
}

function verificarTokenDesdeQuery(req, res, next) {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Token requerido para stream SSE.' });
  }

  req.headers.authorization = `Bearer ${token}`;
  return verificarToken(req, res, next);
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  );
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function cb(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    })
  );
}

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
  });
}

async function enviarCorreoInvitacion(correo, token, alojamientoTitulo) {
  const mailer = getMailer();
  if (!mailer) { console.warn('[equipo] SMTP no configurado.'); return; }
  const baseUrl = process.env.APP_BASE_URL || process.env.PAYMENT_REDIRECT_BASE_URL || 'http://localhost:3000';
  const enlace = `${baseUrl}/aceptar-invitacion.html?token=${token}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await mailer.sendMail({
    from, to: correo,
    subject: `Tu Refugio - Invitacion al alojamiento "${alojamientoTitulo}"`,
    html: `<p>Hola,</p><p>Has sido invitado a administrar <strong>${alojamientoTitulo}</strong> en Tu Refugio.</p><p><a href="${enlace}">${enlace}</a></p><p>Valido por 24 horas.</p>`
  });
}

// RUTAS ESTATICAS PRIMERO (antes de /:alojamientoId)

router.get('/aceptar/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const inv = await dbGet(
      `SELECT ea.*, a.titulo AS alojamiento_titulo FROM equipo_alojamiento ea JOIN alojamientos a ON a.id = ea.id_alojamiento WHERE ea.token_invitacion = ?`,
      [token]
    );
    if (!inv) return res.status(404).json({ error: 'Invitacion no encontrada o ya fue usada.' });
    if (inv.estado === 'activo') return res.status(409).json({ error: 'Esta invitacion ya fue aceptada.' });
    if (new Date(inv.token_expira_en) < new Date()) return res.status(410).json({ error: 'El enlace de invitacion ha expirado.' });
    res.json({ correo: inv.correo, rol: inv.rol, alojamiento: inv.alojamiento_titulo, alojamientoId: inv.id_alojamiento });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al verificar la invitacion.' }); }
});

router.post('/aceptar/:token', async (req, res) => {
  const { token } = req.params;
  const { nombre, contrasena } = req.body;
  if (!nombre || !contrasena) return res.status(400).json({ error: 'Nombre y contrasena son obligatorios.' });
  if (contrasena.length < 8) return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
  try {
    const inv = await dbGet(`SELECT * FROM equipo_alojamiento WHERE token_invitacion = ?`, [token]);
    if (!inv) return res.status(404).json({ error: 'Invitacion no encontrada o ya fue usada.' });
    if (inv.estado === 'activo') return res.status(409).json({ error: 'Esta invitacion ya fue aceptada.' });
    if (new Date(inv.token_expira_en) < new Date()) return res.status(410).json({ error: 'El enlace de invitacion ha expirado.' });
    const alojamiento = await dbGet(`SELECT id_anfitrion FROM alojamientos WHERE id = ?`, [inv.id_alojamiento]);
    const esAdministradorAlojamiento = String(inv.rol || '').toLowerCase() === 'administrador';
    const nombreRolDestino = esAdministradorAlojamiento ? 'admin' : 'anfitrion';
    const rolDestino = await dbGet(`SELECT id FROM roles WHERE nombre = ?`, [nombreRolDestino]);
    if (!rolDestino) return res.status(500).json({ error: `Rol ${nombreRolDestino} no encontrado.` });

    let usuario = await dbGet(`SELECT id FROM usuarios WHERE correo = ?`, [inv.correo]);
    const hash = await bcrypt.hash(contrasena, 12);
    if (!usuario) {
      const result = await dbRun(`INSERT INTO usuarios (nombre, correo, contraseña, rol_id) VALUES (?, ?, ?, ?)`, [nombre.trim(), inv.correo, hash, rolDestino.id]);
      usuario = { id: result.lastID };
    } else {
      // Si el correo ya existia, actualizamos credenciales con lo ingresado en la invitacion.
      await dbRun(
        `UPDATE usuarios SET nombre = ?, contraseña = ?, rol_id = ? WHERE id = ?`,
        [nombre.trim(), hash, rolDestino.id, usuario.id]
      );
    }

    if (esAdministradorAlojamiento && alojamiento?.id_anfitrion) {
      await dbRun(
        `INSERT OR IGNORE INTO admin_anfitriones (admin_id, anfitrion_id, asignado_por)
         VALUES (?, ?, ?)`,
        [usuario.id, Number(alojamiento.id_anfitrion), usuario.id]
      );
    }

    await dbRun(`UPDATE equipo_alojamiento SET estado = 'activo', id_usuario = ?, token_invitacion = NULL, token_expira_en = NULL WHERE id = ?`, [usuario.id, inv.id]);
    emitirActualizacionEquipo(inv.id_alojamiento, { accion: 'invitacion_aceptada', miembroId: inv.id, usuarioId: usuario.id });
    res.json({ ok: true, mensaje: 'Invitacion aceptada. Ya puedes iniciar sesion.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al aceptar la invitacion.' }); }
});

// RUTAS DINAMICAS

router.get('/:alojamientoId/stream', verificarTokenDesdeQuery, soloRoles('anfitrion', 'admin'), verificarMiembroAlojamiento, (req, res) => {
  const { alojamientoId } = req.params;
  const key = String(alojamientoId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  if (!sseClientsPorAlojamiento.has(key)) {
    sseClientsPorAlojamiento.set(key, new Set());
  }
  const clientes = sseClientsPorAlojamiento.get(key);
  clientes.add(res);

  enviarEventoSSE(res, 'stream_conectado', { ok: true, alojamientoId: Number(alojamientoId), ts: Date.now() });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const lista = sseClientsPorAlojamiento.get(key);
    if (!lista) return;
    lista.delete(res);
    if (!lista.size) {
      sseClientsPorAlojamiento.delete(key);
    }
  });
});

router.get('/:alojamientoId', verificarToken, soloRoles('anfitrion', 'admin'), verificarMiembroAlojamiento, async (req, res) => {
  const { alojamientoId } = req.params;
  try {
    const rows = await dbAll(
      `SELECT ea.id,
              ea.correo,
              ea.rol,
              ea.estado,
              ea.creado_en,
              ea.id_usuario,
              COALESCE(u.nombre, '') AS nombre,
              1 AS puedeEliminar,
              'equipo' AS origen
       FROM equipo_alojamiento ea
       LEFT JOIN usuarios u ON u.id = ea.id_usuario
       WHERE ea.id_alojamiento = ?
       ORDER BY ea.creado_en ASC`,
      [alojamientoId]
    );

    const adminAsignado = await dbGet(
      `SELECT aa.admin_id,
              aa.asignado_en,
              COALESCE(adm.nombre, '') AS nombre,
              COALESCE(adm.correo, '') AS correo
       FROM alojamientos a
       JOIN admin_anfitriones aa ON aa.anfitrion_id = a.id_anfitrion
       LEFT JOIN usuarios adm ON adm.id = aa.admin_id
       WHERE a.id = ?
       LIMIT 1`,
      [alojamientoId]
    );

    if (adminAsignado && Number(adminAsignado.admin_id || 0) > 0) {
      const yaIncluido = rows.some((row) => Number(row.id_usuario || 0) === Number(adminAsignado.admin_id));
      if (!yaIncluido) {
        rows.unshift({
          id: null,
          correo: adminAsignado.correo || '',
          rol: 'administrador',
          estado: 'activo',
          creado_en: adminAsignado.asignado_en,
          id_usuario: Number(adminAsignado.admin_id),
          nombre: adminAsignado.nombre || '(sin nombre)',
          puedeEliminar: 0,
          origen: 'admin_anfitriones'
        });
      }
    }

    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al listar miembros del equipo.' }); }
});

router.post('/:alojamientoId/invitar', verificarToken, soloRoles('anfitrion', 'admin'), verificarMiembroAlojamiento, async (req, res) => {
  const { alojamientoId } = req.params;
  const { correo, rol = 'administrador' } = req.body;
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return res.status(400).json({ error: 'Correo electronico invalido.' });
  try {
    const correoNormalizado = String(correo).trim().toLowerCase();
    const alojamiento = await dbGet(`SELECT id, titulo FROM alojamientos WHERE id = ?`, [alojamientoId]);
    if (!alojamiento) return res.status(404).json({ error: 'Alojamiento no encontrado.' });

    // Regla: no invitar correos ya registrados en el sistema, sin importar el rol.
    const usuarioExistente = await dbGet(`SELECT id FROM usuarios WHERE correo = ?`, [correoNormalizado]);
    if (usuarioExistente) {
      return res.status(409).json({
        error: 'Este correo ya esta registrado en la plataforma. Usa otro correo para la invitacion.'
      });
    }

    const existente = await dbGet(`SELECT id, estado FROM equipo_alojamiento WHERE id_alojamiento = ? AND correo = ?`, [alojamientoId, correoNormalizado]);
    if (existente && existente.estado === 'activo') return res.status(409).json({ error: 'Este correo ya pertenece activamente al equipo.' });
    const tokenInv = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    if (existente) {
      await dbRun(`UPDATE equipo_alojamiento SET token_invitacion = ?, token_expira_en = ?, rol = ?, estado = 'pendiente', invitado_por = ? WHERE id = ?`, [tokenInv, expira, rol, req.user.id, existente.id]);
    } else {
      await dbRun(`INSERT INTO equipo_alojamiento (id_alojamiento, correo, rol, estado, token_invitacion, token_expira_en, invitado_por) VALUES (?, ?, ?, 'pendiente', ?, ?, ?)`, [alojamientoId, correoNormalizado, rol, tokenInv, expira, req.user.id]);
    }
    emitirActualizacionEquipo(alojamientoId, { accion: 'invitacion_creada' });
    // Responder de inmediato y enviar correo en segundo plano para evitar demoras en UI.
    res.json({ ok: true, mensaje: 'Invitacion enviada correctamente.' });
    setImmediate(() => {
      enviarCorreoInvitacion(correoNormalizado, tokenInv, alojamiento.titulo)
        .catch((mailErr) => {
          console.error('[equipo] Error enviando correo de invitacion:', mailErr.message || mailErr);
        });
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al enviar la invitacion.' }); }
});

router.delete('/:alojamientoId/miembro/:miembroId', verificarToken, soloRoles('anfitrion', 'admin'), verificarMiembroAlojamiento, async (req, res) => {
  const { alojamientoId, miembroId } = req.params;
  try {
    const { changes } = await dbRun(`DELETE FROM equipo_alojamiento WHERE id = ? AND id_alojamiento = ?`, [miembroId, alojamientoId]);
    if (!changes) return res.status(404).json({ error: 'Miembro no encontrado.' });
    emitirActualizacionEquipo(alojamientoId, { accion: 'miembro_eliminado', miembroId: Number(miembroId) });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error al eliminar miembro.' }); }
});

module.exports = router;
