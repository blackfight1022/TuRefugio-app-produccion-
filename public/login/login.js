window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const rol = localStorage.getItem('rol');
  const panelDestino = localStorage.getItem('panel_destino');
  const esSuperadmin = String(localStorage.getItem('es_superadmin') || '0') === '1';

  if (token && rol) {
    Swal.fire({
      icon: 'info',
      title: 'Sesión activa',
      text: 'Ya tienes una sesión iniciada. Redirigiendo...',
      timer: 1800,
      showConfirmButton: false
    });

    setTimeout(() => {
      if (panelDestino) {
        window.location.href = panelDestino;
      } else if (rol === 'admin') {
        window.location.href = esSuperadmin ? '../bienvenido_admin/b_admin.html' : '../bienvenido_admin/admin_alojamientos.html';
      } else if (rol === 'anfitrion') {
        window.location.href = '../anfitrion/anfitrion.html';
      } else if (rol === 'visitante') {
        window.location.href = '../turista/turista.html';
      }
    }, 1900);
  }
});

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const correo = document.getElementById('email').value.trim();
  const correoNormalizado = correo.toLowerCase();
  const contraseña = document.getElementById('password').value.trim();
  const correoAdminBloqueado = 'cuervomiguel737@gmail.com';

  if (!correo || !contraseña) {
    Swal.fire({
      icon: 'warning',
      title: 'Campos obligatorios',
      text: 'Debes ingresar correo y contraseña'
    });
    return;
  }

  if (correoNormalizado === correoAdminBloqueado) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Usuario no encontrado.'
    });
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo, contraseña })
    });

    const result = await response.json();

    if (!response.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.error || 'Credenciales inválidas'
      });
      return;
    }

    const token = result.token;
    const rol = String(result.usuario.rol || '').toLowerCase().trim();
    const panelDestino = String(result.panel_destino || result.usuario.panel_destino || '').trim();
    const esSuperadmin = Number(result.usuario.es_superadmin || 0) === 1 ? '1' : '0';

    localStorage.setItem('token', token);
    localStorage.setItem('rol', rol);
    localStorage.setItem('es_superadmin', esSuperadmin);
    if (panelDestino) {
      localStorage.setItem('panel_destino', panelDestino);
    } else {
      localStorage.removeItem('panel_destino');
    }

    Swal.fire({
      icon: 'success',
      title: 'Bienvenido',
      text: 'Inicio de sesión exitoso.',
      timer: 1500,
      showConfirmButton: false
    });

    setTimeout(() => {
      if (panelDestino) {
        window.location.href = panelDestino;
      } else if (rol === 'admin') {
        window.location.href = esSuperadmin === '1' ? '../bienvenido_admin/b_admin.html' : '../bienvenido_admin/admin_alojamientos.html';
      } else if (rol === 'anfitrion') {
        window.location.href = '../anfitrion/anfitrion.html';
      } else if (rol === 'visitante') {
        window.location.href = '../turista/turista.html';
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Rol no reconocido',
          text: 'Rol recibido: ' + rol
        });
      }
    }, 1600);
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: 'error',
      title: 'Error de red',
      text: 'No se pudo conectar con el servidor.'
    });
  }
});