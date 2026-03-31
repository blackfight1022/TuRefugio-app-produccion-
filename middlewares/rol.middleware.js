function verificarRol(...rolesPermitidos) {
  return (req, res, next) => {
    const rolUsuario = req.user.rol;

    if (!rolesPermitidos.includes(rolUsuario)) {
      return res.status(403).json({
        error: 'No tienes permisos para realizar esta acción.'
      });
    }

    next();
  };
}

module.exports = verificarRol;