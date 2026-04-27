import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api';

const ADMIN_BLOQUEADO = 'cuervomiguel737@gmail.com';

function redirectByRole(rol, esSuperadmin, panelDestino) {
  if (panelDestino) {
    window.location.href = panelDestino;
    return;
  }

  if (rol === 'admin') {
    window.location.href = esSuperadmin ? '/bienvenido_admin/b_admin.html' : '/bienvenido_admin/admin_alojamientos.html';
  } else if (rol === 'anfitrion') {
    window.location.href = '/anfitrion/anfitrion.html';
  } else if (rol === 'visitante') {
    window.location.href = '/turista/turista.html';
  }
}

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const rol = localStorage.getItem('rol');
    const panelDestino = localStorage.getItem('panel_destino');
    const esSuperadmin = String(localStorage.getItem('es_superadmin') || '0') === '1';

    if (token && rol) {
      Swal.fire({
        icon: 'info',
        title: 'Sesion activa',
        text: 'Ya tienes una sesion iniciada. Redirigiendo...',
        timer: 1800,
        showConfirmButton: false
      });

      setTimeout(() => {
        redirectByRole(rol, esSuperadmin, panelDestino);
      }, 1900);
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    const correoTrim = correo.trim();
    const correoNormalizado = correoTrim.toLowerCase();
    const contrasenaTrim = contrasena.trim();

    if (!correoTrim || !contrasenaTrim) {
      await Swal.fire({
        icon: 'warning',
        title: 'Campos obligatorios',
        text: 'Debes ingresar correo y contrasena'
      });
      return;
    }

    if (correoNormalizado === ADMIN_BLOQUEADO) {
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Usuario no encontrado.'
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: correoTrim, 'contrase\u00f1a': contrasenaTrim })
      });

      const result = await response.json();

      if (!response.ok) {
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: result.error || 'Credenciales invalidas'
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

      await Swal.fire({
        icon: 'success',
        title: 'Bienvenido',
        text: 'Inicio de sesion exitoso.',
        timer: 1500,
        showConfirmButton: false
      });

      redirectByRole(rol, esSuperadmin === '1', panelDestino);
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'Error de red',
        text: 'No se pudo conectar con el servidor.'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <section className="card form-card">
        <h1>Iniciar sesion</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="correo">Correo</label>
          <input
            id="correo"
            type="email"
            value={correo}
            onChange={(event) => setCorreo(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="contrasena">Contrasena</label>
          <input
            id="contrasena"
            type="password"
            value={contrasena}
            onChange={(event) => setContrasena(event.target.value)}
            autoComplete="current-password"
            required
          />

          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Entrar'}
          </button>
        </form>

        <div className="row-links">
          <Link to="/">Volver al inicio</Link>
          <a href="/login/login.html">Usar login legacy</a>
        </div>
      </section>
    </main>
  );
}
