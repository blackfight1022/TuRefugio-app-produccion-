import { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api';

function evaluarContrasena(value) {
  const checks = [
    { ok: value.length >= 8, label: 'Minimo 8 caracteres' },
    { ok: /[A-Z]/.test(value), label: 'Una mayuscula' },
    { ok: /[a-z]/.test(value), label: 'Una minuscula' },
    { ok: /[0-9]/.test(value), label: 'Un numero' },
    { ok: /[^A-Za-z0-9]/.test(value), label: 'Un simbolo' }
  ];

  const score = checks.filter((c) => c.ok).length;
  return {
    score,
    checks,
    strong: score >= 5
  };
}

export default function RegisterVisitantePage() {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordStatus = useMemo(() => evaluarContrasena(contrasena), [contrasena]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!passwordStatus.strong) {
      await Swal.fire({
        icon: 'warning',
        title: 'Contrasena insegura',
        text: 'La contrasena debe incluir minimo 8 caracteres, mayuscula, minuscula, numero y simbolo.'
      });
      return;
    }

    const data = {
      nombre: nombre.trim(),
      correo: correo.trim(),
      'contrase\u00f1a': contrasena,
      telefono: telefono.trim(),
      rol: 'visitante'
    };

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (response.ok) {
        await Swal.fire({
          icon: 'success',
          title: 'Registro exitoso',
          text: 'Ya puedes iniciar sesion'
        });
        window.location.href = '/app/login';
      } else {
        await Swal.fire({
          icon: 'error',
          title: 'Error',
          text: result.error || 'No se pudo registrar el usuario.'
        });
      }
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
        <h1>Registro de turista</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />

          <label htmlFor="correo">Correo</label>
          <input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

          <label htmlFor="contrasena">Contrasena</label>
          <input
            id="contrasena"
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />

          <p className="hint">Seguridad: {passwordStatus.score}/5</p>
          <ul className="checks">
            {passwordStatus.checks.map((item) => (
              <li key={item.label} className={item.ok ? 'ok' : 'no'}>
                {item.ok ? 'OK' : 'NO'} - {item.label}
              </li>
            ))}
          </ul>

          <label htmlFor="telefono">Telefono</label>
          <input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />

          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Registrando...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="row-links">
          <Link to="/">Volver al inicio</Link>
          <a href="/registro_turista/turista.html">Usar registro legacy</a>
        </div>
      </section>
    </main>
  );
}
