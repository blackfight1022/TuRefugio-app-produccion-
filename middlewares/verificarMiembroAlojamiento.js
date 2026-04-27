/**
 * verificarMiembroAlojamiento.js
 *
 * Middleware que valida que el usuario autenticado pertenece al alojamiento
 * indicado en req.params.alojamientoId (sea como propietario o como miembro
 * activo del equipo).
 *
 * Los admins del sistema (rol === 'admin') tienen acceso a todos los alojamientos.
 */

const db = require('../database');

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
}

async function verificarMiembroAlojamiento(req, res, next) {
  const alojamientoId = req.params.alojamientoId || req.params.id;
  const usuarioId = req.user && req.user.id;

  if (!alojamientoId || !usuarioId) {
    return res.status(400).json({ error: 'Parámetros de alojamiento o usuario faltantes.' });
  }

  try {
    const alojamiento = await dbGet(
      `SELECT id, id_anfitrion FROM alojamientos WHERE id = ?`,
      [alojamientoId]
    );

    if (!alojamiento) {
      return res.status(404).json({ error: 'Alojamiento no encontrado.' });
    }

    const rolUsuario = String(req.user?.rol || '').toLowerCase();

    // 1. Admin de plataforma (superadmin) puede acceder sin restricción
    if (rolUsuario === 'admin') {
      const admin = await dbGet(
        `SELECT COALESCE(es_superadmin, 0) AS es_superadmin
         FROM usuarios
         WHERE id = ?`,
        [usuarioId]
      );

      const esSuperadmin = Number(admin?.es_superadmin || 0) === 1;
      if (esSuperadmin) return next();

      // 2. Admin de alojamiento: solo si está asignado al anfitrión dueño o es miembro activo de equipo.
      const adminAsignado = await dbGet(
        `SELECT id
         FROM admin_anfitriones
         WHERE admin_id = ? AND anfitrion_id = ?`,
        [usuarioId, Number(alojamiento.id_anfitrion)]
      );
      if (adminAsignado) return next();

      const esMiembroAdmin = await dbGet(
        `SELECT id
         FROM equipo_alojamiento
         WHERE id_alojamiento = ?
           AND id_usuario = ?
           AND COALESCE(estado, '') = 'activo'`,
        [alojamientoId, usuarioId]
      );
      if (esMiembroAdmin) return next();

      return res.status(403).json({
        error: 'No tienes permiso para acceder a este alojamiento.'
      });
    }

    // 3. ¿Es el propietario del alojamiento?
    const esOwner = await dbGet(
      `SELECT id FROM alojamientos WHERE id = ? AND id_anfitrion = ?`,
      [alojamientoId, usuarioId]
    );
    if (esOwner) return next();

    // 4. ¿Es miembro activo del equipo?
    const esMiembro = await dbGet(
      `SELECT id FROM equipo_alojamiento
       WHERE id_alojamiento = ? AND id_usuario = ? AND estado = 'activo'`,
      [alojamientoId, usuarioId]
    );
    if (esMiembro) return next();

    return res.status(403).json({
      error: 'No tienes permiso para acceder a este alojamiento.'
    });
  } catch (err) {
    console.error('[verificarMiembroAlojamiento]', err);
    return res.status(500).json({ error: 'Error al verificar pertenencia al alojamiento.' });
  }
}

module.exports = { verificarMiembroAlojamiento };
