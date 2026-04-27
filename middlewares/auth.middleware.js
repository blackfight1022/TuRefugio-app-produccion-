const jwt = require('jsonwebtoken');
const db = require('../database');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('[SEGURIDAD] JWT_SECRET no está definido en las variables de entorno. No se puede iniciar el servidor de forma segura.');
}

// ===============================
// VERIFICAR TOKEN
// ===============================
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido (Bearer token).' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }

    db.get(
      `SELECT u.id,
              COALESCE(r.nombre, '') AS rol,
              COALESCE(u.estado_cuenta, 'activo') AS estado_cuenta,
              u.suspension_hasta
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ?`,
      [decoded.id],
      (dbErr, row) => {
        if (dbErr) {
          return res.status(500).json({ error: 'Error verificando estado del usuario.' });
        }

        if (!row) {
          return res.status(401).json({ error: 'Usuario no encontrado.' });
        }

        const rol = String(row.rol || '').toLowerCase();
        const estadoCuenta = String(row.estado_cuenta || 'activo').toLowerCase();
        const suspensionHasta = row.suspension_hasta ? new Date(row.suspension_hasta) : null;
        const suspensionVigente = estadoCuenta === 'suspendido' && (!suspensionHasta || suspensionHasta > new Date());

        // Regla de negocio: visitante suspendido no puede entrar a paneles/rutas protegidas.
        // El anfitrión suspendido sí puede entrar a su panel para gestionar su cuenta.
        if (suspensionVigente && rol === 'visitante') {
          return res.status(403).json({
            error: 'Tu cuenta está suspendida temporalmente. Contacta a soporte o espera la reactivación.'
          });
        }

        // decoded contiene: { id, rol_id, rol }
        req.user = {
          ...decoded,
          rol: decoded.rol || rol
        };

        next();
      }
    );
  });
}

// ===============================
// VERIFICAR UNO O VARIOS ROLES
// ===============================
function soloRoles(...rolesPermitidos) {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    // ✅ Si el rol viene en el token lo usamos directamente (más eficiente)
    if (req.user.rol) {
      if (!rolesPermitidos.includes(req.user.rol)) {
        return res.status(403).json({ error: 'Acceso denegado para este rol.' });
      }
      return next();
    }

    // 🔎 Si no viene el rol en el token, lo consultamos en BD
    db.get(
      `SELECT r.nombre 
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ?`,
      [req.user.id],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Error verificando rol.' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        if (!rolesPermitidos.includes(row.nombre)) {
          return res.status(403).json({ error: 'Acceso denegado para este rol.' });
        }

        next();
      }
    );
  };
}

module.exports = {
  verificarToken,
  soloRoles
};