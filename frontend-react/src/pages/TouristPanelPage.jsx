import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getApiBaseUrl } from '../lib/api';
import { getAuthHeaders, getRole, logoutTo, fetchJson } from '../lib/auth';

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-CO')}`;
}

export default function TouristPanelPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [favoritos, setFavoritos] = useState([]);
  const [mensajes, setMensajes] = useState([]);

  useEffect(() => {
    const role = getRole();
    if (role && role !== 'visitante') {
      Swal.fire({ icon: 'warning', title: 'Acceso restringido', text: 'Este panel es solo para turistas.' })
        .then(() => {
          window.location.href = '/app';
        });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [meData, reservasData, favData, mensajesData] = await Promise.all([
          fetchJson(`${getApiBaseUrl()}/auth/me`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/reservas/mis-reservas`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/favoritos`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/mensajes/turista`, { headers: getAuthHeaders() })
        ]);

        if (cancelled) return;
        setMe(meData || null);
        setReservas(Array.isArray(reservasData) ? reservasData : []);
        setFavoritos(Array.isArray(favData?.alojamientos) ? favData.alojamientos : []);
        setMensajes(Array.isArray(mensajesData?.mensajes) ? mensajesData.mensajes : []);
      } catch (error) {
        if (!cancelled) {
          await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo cargar el panel.' });
          logoutTo('/app/login');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMensajes() {
      try {
        const data = await fetchJson(`${getApiBaseUrl()}/mensajes/turista`, { headers: getAuthHeaders() });
        if (!cancelled) {
          setMensajes(Array.isArray(data?.mensajes) ? data.mensajes : []);
        }
      } catch (error) {
        if (!cancelled) setMensajes([]);
      }
    }

    loadMensajes();
    return () => {
      cancelled = true;
    };
  }, []);

  async function cancelarReserva(id) {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Cancelar reserva',
      text: 'Esta acción cancela tu reserva.',
      showCancelButton: true,
      confirmButtonText: 'Si, cancelar',
      cancelButtonText: 'No'
    });

    if (!confirm.isConfirmed) return;

    try {
      await fetchJson(`${getApiBaseUrl()}/reservas/cancelar/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders()
      });
      setReservas((prev) => prev.map((r) => (Number(r.id) === Number(id) ? { ...r, estado: 'cancelada' } : r)));
      await Swal.fire({ icon: 'success', title: 'Reserva cancelada' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo cancelar.' });
    }
  }

  async function marcarLeido(id) {
    try {
      await fetchJson(`${getApiBaseUrl()}/mensajes/${id}/leido`, {
        method: 'PUT',
        headers: getAuthHeaders()
      });
      setMensajes((prev) => prev.map((m) => (Number(m.id) === Number(id) ? { ...m, leido: 1 } : m)));
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo marcar el mensaje.' });
    }
  }

  async function eliminarMensaje(id) {
    try {
      await fetchJson(`${getApiBaseUrl()}/mensajes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      setMensajes((prev) => prev.filter((m) => Number(m.id) !== Number(id)));
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo eliminar el mensaje.' });
    }
  }

  if (loading) return <main className="container"><section className="card">Cargando panel turista...</section></main>;

  return (
    <main className="container">
      <section className="card">
        <h1>Panel turista</h1>
        <p>{me?.nombre || 'Usuario'} - {me?.correo || ''}</p>
        <div className="actions">
          <Link className="btn" to="/explorar">Explorar</Link>
          <button className="btn" type="button" onClick={() => logoutTo('/app/login')}>Cerrar sesion</button>
          <a className="btn" href="/turista/turista.html">Usar panel legacy</a>
        </div>
      </section>

      <section className="card">
        <h2>Mis reservas</h2>
        {!reservas.length ? <p>No tienes reservas registradas.</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Alojamiento</th>
                <th>Fechas</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.alojamiento || r.alojamiento_nombre || '-'}</td>
                  <td>{r.fecha_entrada} - {r.fecha_salida}</td>
                  <td>{money(r.precio_total || r.total)}</td>
                  <td>{r.estado || '-'}</td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      disabled={String(r.estado || '').toLowerCase() === 'cancelada'}
                      onClick={() => cancelarReserva(r.id)}
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Favoritos</h2>
        {!favoritos.length ? <p>No tienes alojamientos favoritos.</p> : null}
        <div className="fav-list">
          {favoritos.map((f) => (
            <Link key={f.id} className="btn" to={`/detalle/${f.id}`}>{f.titulo || `Alojamiento ${f.id}`}</Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Mensajes y notificaciones</h2>
        {!mensajes.length ? <p>No tienes mensajes.</p> : null}
        <div className="message-list">
          {mensajes.map((m) => (
            <article key={m.id} className={`message-item ${Number(m.leido || 0) ? 'read' : 'unread'}`}>
              <h4>{m.asunto || 'Mensaje'}</h4>
              <p>{m.contenido || '-'}</p>
              <small>Tipo: {m.tipo || '-'} | Fecha: {m.fecha_creacion || '-'}</small>
              <div className="actions">
                <button className="btn" type="button" disabled={Number(m.leido || 0) === 1} onClick={() => marcarLeido(m.id)}>
                  Marcar leido
                </button>
                <button className="btn" type="button" onClick={() => eliminarMensaje(m.id)}>
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
