const jwt = require('jsonwebtoken');
const SECRET = 'clave_super_segura';

function verificarToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = decoded;
    next();
  });
}

function soloRol(rol) {
  return (req, res, next) => {
    if (req.user.rol !== rol) {
      return res.status(403).json({ error: 'Acceso denegado para este rol' });
    }
    next();
  };
}

module.exports = { verificarToken, soloRol };
