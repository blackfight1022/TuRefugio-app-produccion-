const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('../middlewares/auth.middleware');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes || 0, lastID: this.lastID || 0 });
    });
  });
}

function normalizarRol(valor) {
  return String(valor || '').trim().toLowerCase();
}

function canalValido(canal) {
  return canal === 'gestion' || canal === 'soporte';
}

async function obtenerUsuarioBasico(userId) {
  return dbGet(
    `SELECT u.id,
            u.nombre,
            u.correo,
            COALESCE(u.es_superadmin, 0) AS es_superadmin,
            COALESCE(r.nombre, '') AS rol
     FROM usuarios u
     LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ?`,
    [userId]
  );
}

async function obtenerAdminsSuper() {
  return dbAll(
    `SELECT u.id, u.nombre, u.correo
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE LOWER(r.nombre) = 'admin'
       AND COALESCE(u.es_superadmin, 0) = 1
     ORDER BY u.nombre ASC`,
    []
  );
}

async function construirContactos(userId) {
  const yo = await obtenerUsuarioBasico(userId);
  if (!yo) return { yo: null, contactos: [] };

  const rol = normalizarRol(yo.rol);
  const esSuper = Number(yo.es_superadmin || 0) === 1;
  const contactoMap = new Map();

  const agregarContacto = (row, canal, etiquetaCanal) => {
    const id = Number(row?.id || 0);
    if (!id || id === Number(userId || 0)) return;

    const key = `${id}`;
    if (!contactoMap.has(key)) {
      contactoMap.set(key, {
        id,
        nombre: row.nombre || 'Sin nombre',
        correo: row.correo || '',
        rol: normalizarRol(row.rol || row.rol_nombre || ''),
        canales: []
      });
    }

    const item = contactoMap.get(key);
    if (!item.canales.some((c) => c.codigo === canal)) {
      item.canales.push({ codigo: canal, etiqueta: etiquetaCanal });
    }
  };

  if (rol === 'anfitrion') {
    const adminsAsignados = await dbAll(
      `SELECT DISTINCT u.id, u.nombre, u.correo, r.nombre AS rol_nombre
       FROM admin_anfitriones aa
       JOIN usuarios u ON u.id = aa.admin_id
       JOIN roles r ON r.id = u.rol_id
       WHERE aa.anfitrion_id = ?
       ORDER BY u.nombre ASC`,
      [userId]
    );

    adminsAsignados.forEach((row) => agregarContacto(row, 'gestion', 'Administrador asignado'));
  }

  if (rol === 'admin' && !esSuper) {
    const anfitrionesAsignados = await dbAll(
      `SELECT DISTINCT u.id, u.nombre, u.correo, r.nombre AS rol_nombre
       FROM admin_anfitriones aa
       JOIN usuarios u ON u.id = aa.anfitrion_id
       JOIN roles r ON r.id = u.rol_id
       WHERE aa.admin_id = ?
       ORDER BY u.nombre ASC`,
      [userId]
    );

    anfitrionesAsignados.forEach((row) => agregarContacto(row, 'gestion', 'Anfitrión asignado'));
  }

  // Canal de soporte con administrador de plataforma.
  if ((rol === 'anfitrion') || (rol === 'admin' && !esSuper)) {
    const adminsSuper = await obtenerAdminsSuper();
    adminsSuper.forEach((row) => agregarContacto(row, 'soporte', 'Soporte plataforma'));
  }

  // El admin de plataforma atiende soporte de anfitriones y admins de alojamiento.
  if (rol === 'admin' && esSuper) {
    const remitentesSoporte = await dbAll(
      `SELECT DISTINCT u.id, u.nombre, u.correo, r.nombre AS rol_nombre
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE LOWER(r.nombre) IN ('admin', 'anfitrion')
         AND u.id != ?
         AND (
           LOWER(r.nombre) = 'anfitrion'
           OR (LOWER(r.nombre) = 'admin' AND COALESCE(u.es_superadmin, 0) = 0)
         )
       ORDER BY u.nombre ASC`,
      [userId]
    );

    remitentesSoporte.forEach((row) => agregarContacto(row, 'soporte', 'Canal de soporte'));
  }

  const contactos = Array.from(contactoMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { yo, contactos };
}

async function validarPermisoConversacion(userId, contactoId, canal) {
  const { yo, contactos } = await construirContactos(userId);
  if (!yo) return { ok: false, motivo: 'Usuario no encontrado.' };
  if (!canalValido(canal)) return { ok: false, motivo: 'Canal de chat no válido.' };

  const contacto = contactos.find((c) => Number(c.id) === Number(contactoId));
  if (!contacto) return { ok: false, motivo: 'No tienes permiso para conversar con este usuario.' };

  const canalPermitido = contacto.canales.some((c) => c.codigo === canal);
  if (!canalPermitido) return { ok: false, motivo: 'Canal no permitido para este contacto.' };

  return { ok: true, yo, contacto };
}

router.get('/contactos', verificarToken, async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'No autenticado.' });

    const { yo, contactos } = await construirContactos(userId);
    if (!yo) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const pendientes = await dbAll(
      `SELECT emisor_id, canal, COUNT(*) AS total
       FROM panel_chat_mensajes
       WHERE receptor_id = ? AND leido = 0
       GROUP BY emisor_id, canal`,
      [userId]
    );

    const conteoMap = new Map();
    pendientes.forEach((p) => {
      const key = `${Number(p.emisor_id || 0)}:${String(p.canal || '')}`;
      conteoMap.set(key, Number(p.total || 0));
    });

    const contactosConPendientes = contactos.map((c) => ({
      ...c,
      canales: c.canales.map((canal) => ({
        ...canal,
        pendientes: conteoMap.get(`${c.id}:${canal.codigo}`) || 0
      }))
    }));

    return res.json({
      yo: {
        id: yo.id,
        nombre: yo.nombre,
        rol: normalizarRol(yo.rol),
        es_superadmin: Number(yo.es_superadmin || 0) === 1 ? 1 : 0
      },
      contactos: contactosConPendientes
    });
  } catch (error) {
    console.error('[panel-chat] contactos:', error);
    return res.status(500).json({ error: 'No fue posible obtener contactos de chat.' });
  }
});

router.get('/mensajes', verificarToken, async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const contactoId = Number(req.query?.contacto_id || 0);
    const canal = String(req.query?.canal || '').trim().toLowerCase();

    if (!userId) return res.status(401).json({ error: 'No autenticado.' });
    if (!contactoId) return res.status(400).json({ error: 'Debes indicar el contacto.' });

    const permiso = await validarPermisoConversacion(userId, contactoId, canal);
    if (!permiso.ok) return res.status(403).json({ error: permiso.motivo });

    const mensajes = await dbAll(
      `SELECT m.id,
              m.emisor_id,
              m.receptor_id,
              m.canal,
              m.contenido,
              m.leido,
              m.creado_en,
              ue.nombre AS emisor_nombre
       FROM panel_chat_mensajes m
       JOIN usuarios ue ON ue.id = m.emisor_id
       WHERE m.canal = ?
         AND ((m.emisor_id = ? AND m.receptor_id = ?) OR (m.emisor_id = ? AND m.receptor_id = ?))
       ORDER BY m.creado_en ASC, m.id ASC`,
      [canal, userId, contactoId, contactoId, userId]
    );

    await dbRun(
      `UPDATE panel_chat_mensajes
       SET leido = 1
       WHERE canal = ?
         AND emisor_id = ?
         AND receptor_id = ?
         AND leido = 0`,
      [canal, contactoId, userId]
    );

    return res.json({ mensajes });
  } catch (error) {
    console.error('[panel-chat] mensajes:', error);
    return res.status(500).json({ error: 'No fue posible cargar los mensajes.' });
  }
});

router.post('/mensajes', verificarToken, async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    const contactoId = Number(req.body?.contacto_id || 0);
    const canal = String(req.body?.canal || '').trim().toLowerCase();
    const contenido = String(req.body?.contenido || '').trim();

    if (!userId) return res.status(401).json({ error: 'No autenticado.' });
    if (!contactoId) return res.status(400).json({ error: 'Debes seleccionar un contacto.' });
    if (!contenido) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    if (contenido.length > 1200) {
      return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 1200 caracteres).' });
    }

    const permiso = await validarPermisoConversacion(userId, contactoId, canal);
    if (!permiso.ok) return res.status(403).json({ error: permiso.motivo });

    await dbRun(
      `INSERT INTO panel_chat_mensajes (emisor_id, receptor_id, canal, contenido)
       VALUES (?, ?, ?, ?)`,
      [userId, contactoId, canal, contenido]
    );

    return res.status(201).json({ mensaje: 'Mensaje enviado.' });
  } catch (error) {
    console.error('[panel-chat] enviar:', error);
    return res.status(500).json({ error: 'No fue posible enviar el mensaje.' });
  }
});

module.exports = router;
