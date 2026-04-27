import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getApiBaseUrl } from '../lib/api';
import { getAuthHeaders, getRole, fetchJson, logoutTo } from '../lib/auth';

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-CO')}`;
}

export default function HostPanelPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [alojamientos, setAlojamientos] = useState([]);
  const [alojamientoId, setAlojamientoId] = useState(0);
  const [habitaciones, setHabitaciones] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [imagenesAloj, setImagenesAloj] = useState([]);

  const [chatContactos, setChatContactos] = useState([]);
  const [chatContactoId, setChatContactoId] = useState(0);
  const [chatCanal, setChatCanal] = useState('gestion');
  const [chatMensajes, setChatMensajes] = useState([]);
  const [chatTexto, setChatTexto] = useState('');

  const [formAloj, setFormAloj] = useState({
    titulo: '',
    descripcion: '',
    ubicacion: '',
    precio: '',
    capacidad_personas: ''
  });
  const [imagenesAlojFile, setImagenesAlojFile] = useState(null);

  const [formHab, setFormHab] = useState({
    nombre: '',
    capacidad: '',
    precio: ''
  });
  const [habitacionImagenTargetId, setHabitacionImagenTargetId] = useState(0);
  const [habitacionImagenFile, setHabitacionImagenFile] = useState(null);

  async function recargarAlojamientos() {
    const alojData = await fetchJson(`${getApiBaseUrl()}/anfitrion/alojamientos`, { headers: getAuthHeaders() });
    const list = Array.isArray(alojData) ? alojData : [];
    setAlojamientos(list);
    if (!alojamientoId && list.length) setAlojamientoId(Number(list[0].id));
    return list;
  }

  useEffect(() => {
    const role = getRole();
    if (role && role !== 'anfitrion' && role !== 'admin') {
      Swal.fire({ icon: 'warning', title: 'Acceso restringido', text: 'Este panel es para anfitrión.' })
        .then(() => {
          window.location.href = '/app';
        });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [meData, alojData, contactosData] = await Promise.all([
          fetchJson(`${getApiBaseUrl()}/auth/me`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/anfitrion/alojamientos`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/panel-chat/contactos`, { headers: getAuthHeaders() })
        ]);

        if (cancelled) return;
        const list = Array.isArray(alojData) ? alojData : [];
        setMe(meData || null);
        setAlojamientos(list);
        if (list.length) setAlojamientoId(Number(list[0].id));

        const contactos = Array.isArray(contactosData?.contactos) ? contactosData.contactos : [];
        setChatContactos(contactos);
        if (contactos.length) {
          const c = contactos[0];
          setChatContactoId(Number(c.id));
          setChatCanal(String(c.canales?.[0]?.codigo || 'gestion'));
        }
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
    if (!alojamientoId) return;

    let cancelled = false;

    async function loadDetail() {
      try {
        const [habsData, reservasData, imgsData] = await Promise.all([
          fetchJson(`${getApiBaseUrl()}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/reservas/alojamiento/${alojamientoId}`, { headers: getAuthHeaders() }),
          fetchJson(`${getApiBaseUrl()}/alojamientos/${alojamientoId}/imagenes`)
        ]);

        if (cancelled) return;
        setHabitaciones(Array.isArray(habsData) ? habsData : []);
        setReservas(Array.isArray(reservasData) ? reservasData : []);
        setImagenesAloj(Array.isArray(imgsData) ? imgsData : []);

        const alojActual = alojamientos.find((a) => Number(a.id) === Number(alojamientoId));
        if (alojActual) {
          setFormAloj({
            titulo: String(alojActual.titulo || ''),
            descripcion: String(alojActual.descripcion || ''),
            ubicacion: String(alojActual.ubicacion || ''),
            precio: String(alojActual.precio || ''),
            capacidad_personas: String(alojActual.capacidad_personas || '')
          });
        }

        if (Array.isArray(habsData) && habsData.length && !habitacionImagenTargetId) {
          setHabitacionImagenTargetId(Number(habsData[0].id));
        }
      } catch (error) {
        if (!cancelled) {
          setHabitaciones([]);
          setReservas([]);
          setImagenesAloj([]);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [alojamientoId]);

  useEffect(() => {
    if (!chatContactoId || !chatCanal) return;

    let cancelled = false;

    async function loadChat() {
      try {
        const query = new URLSearchParams({
          contacto_id: String(chatContactoId),
          canal: String(chatCanal)
        });
        const data = await fetchJson(`${getApiBaseUrl()}/panel-chat/mensajes?${query.toString()}`, {
          headers: getAuthHeaders()
        });
        if (!cancelled) {
          setChatMensajes(Array.isArray(data?.mensajes) ? data.mensajes : []);
        }
      } catch (error) {
        if (!cancelled) setChatMensajes([]);
      }
    }

    loadChat();
    const timer = setInterval(loadChat, 12000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [chatContactoId, chatCanal]);

  const resumen = useMemo(() => {
    const totalReservas = reservas.length;
    const activas = reservas.filter((r) => {
      const e = String(r.estado || '').toLowerCase();
      return e === 'pendiente' || e === 'confirmada' || e === 'en_curso';
    }).length;
    const ingresos = reservas
      .filter((r) => String(r.estado || '').toLowerCase() !== 'cancelada')
      .reduce((acc, r) => acc + Number(r.precio_total || 0), 0);

    return { totalReservas, activas, ingresos };
  }, [reservas]);

  async function cancelarComoAnfitrion(idReserva) {
    const motivoResult = await Swal.fire({
      title: 'Motivo de cancelacion',
      input: 'text',
      inputPlaceholder: 'Ej: mantenimiento no programado',
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar'
    });

    if (!motivoResult.isConfirmed || !String(motivoResult.value || '').trim()) return;

    const porcentajeResult = await Swal.fire({
      title: 'Porcentaje de reembolso',
      input: 'number',
      inputValue: '100',
      inputAttributes: { min: '0', max: '100' },
      showCancelButton: true,
      confirmButtonText: 'Cancelar reserva',
      cancelButtonText: 'Volver'
    });

    if (!porcentajeResult.isConfirmed) return;

    const porcentaje = Number(porcentajeResult.value || 0);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      await Swal.fire({ icon: 'warning', title: 'Porcentaje invalido' });
      return;
    }

    try {
      await fetchJson(`${getApiBaseUrl()}/reservas/${idReserva}/cancelar-anfitrion`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ motivo: String(motivoResult.value).trim(), porcentajeReembolso: porcentaje })
      });

      setReservas((prev) => prev.map((r) => (Number(r.id) === Number(idReserva)
        ? { ...r, estado: 'cancelada', cancelacion_motivo: motivoResult.value, cancelacion_porcentaje_reembolso: porcentaje }
        : r)));
      await Swal.fire({ icon: 'success', title: 'Reserva cancelada' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo cancelar.' });
    }
  }

  async function crearAlojamiento(event) {
    event.preventDefault();
    try {
      const payload = {
        titulo: formAloj.titulo.trim(),
        descripcion: formAloj.descripcion.trim(),
        ubicacion: formAloj.ubicacion.trim(),
        precio: Number(formAloj.precio || 0),
        capacidad_personas: Number(formAloj.capacidad_personas || 0)
      };

      await fetchJson(`${getApiBaseUrl()}/alojamientos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const list = await recargarAlojamientos();
      if (list.length) setAlojamientoId(Number(list[0].id));
      await Swal.fire({ icon: 'success', title: 'Alojamiento creado' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo crear alojamiento.' });
    }
  }

  async function actualizarAlojamiento(event) {
    event.preventDefault();
    if (!alojamientoId) return;

    try {
      const payload = {
        titulo: formAloj.titulo.trim(),
        descripcion: formAloj.descripcion.trim(),
        ubicacion: formAloj.ubicacion.trim(),
        precio: Number(formAloj.precio || 0),
        capacidad_personas: Number(formAloj.capacidad_personas || 0)
      };

      await fetchJson(`${getApiBaseUrl()}/alojamientos/${alojamientoId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      await recargarAlojamientos();
      await Swal.fire({ icon: 'success', title: 'Alojamiento actualizado' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo actualizar.' });
    }
  }

  async function subirImagenesAlojamiento(event) {
    event.preventDefault();
    if (!alojamientoId || !imagenesAlojFile?.length) return;

    try {
      const form = new FormData();
      Array.from(imagenesAlojFile).forEach((file) => form.append('imagenes', file));

      const res = await fetch(`${getApiBaseUrl()}/alojamientos/${alojamientoId}/imagenes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: form
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron subir las imagenes.');

      const imgsData = await fetchJson(`${getApiBaseUrl()}/alojamientos/${alojamientoId}/imagenes`);
      setImagenesAloj(Array.isArray(imgsData) ? imgsData : []);
      setImagenesAlojFile(null);
      await Swal.fire({ icon: 'success', title: 'Imagenes subidas' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo subir imagen.' });
    }
  }

  async function crearHabitacion(event) {
    event.preventDefault();
    if (!alojamientoId) return;
    try {
      await fetchJson(`${getApiBaseUrl()}/habitaciones/${alojamientoId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          nombre: formHab.nombre.trim(),
          capacidad: Number(formHab.capacidad || 0),
          precio: Number(formHab.precio || 0)
        })
      });

      const habsData = await fetchJson(`${getApiBaseUrl()}/habitaciones/mis-alojamiento/${alojamientoId}`, {
        headers: getAuthHeaders()
      });
      const list = Array.isArray(habsData) ? habsData : [];
      setHabitaciones(list);
      if (list.length) setHabitacionImagenTargetId(Number(list[0].id));
      setFormHab({ nombre: '', capacidad: '', precio: '' });
      await Swal.fire({ icon: 'success', title: 'Habitacion creada' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo crear habitacion.' });
    }
  }

  async function subirImagenHabitacion(event) {
    event.preventDefault();
    if (!habitacionImagenTargetId || !habitacionImagenFile?.length) return;

    try {
      const form = new FormData();
      Array.from(habitacionImagenFile).forEach((file) => form.append('imagenes', file));

      const res = await fetch(`${getApiBaseUrl()}/habitaciones/${habitacionImagenTargetId}/imagenes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: form
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen de habitacion.');
      setHabitacionImagenFile(null);
      await Swal.fire({ icon: 'success', title: 'Imagen de habitacion subida' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo subir imagen.' });
    }
  }

  async function enviarChat(event) {
    event.preventDefault();
    const contenido = String(chatTexto || '').trim();
    if (!chatContactoId || !chatCanal || !contenido) return;

    try {
      await fetchJson(`${getApiBaseUrl()}/panel-chat/mensajes`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          contacto_id: chatContactoId,
          canal: chatCanal,
          contenido
        })
      });

      setChatTexto('');
      const query = new URLSearchParams({ contacto_id: String(chatContactoId), canal: String(chatCanal) });
      const data = await fetchJson(`${getApiBaseUrl()}/panel-chat/mensajes?${query.toString()}`, {
        headers: getAuthHeaders()
      });
      setChatMensajes(Array.isArray(data?.mensajes) ? data.mensajes : []);
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error chat', text: error.message || 'No se pudo enviar mensaje.' });
    }
  }

  const canalesDisponibles = useMemo(() => {
    const contacto = chatContactos.find((c) => Number(c.id) === Number(chatContactoId));
    return Array.isArray(contacto?.canales) ? contacto.canales : [];
  }, [chatContactos, chatContactoId]);

  if (loading) return <main className="container"><section className="card">Cargando panel anfitrion...</section></main>;

  return (
    <main className="container">
      <section className="card">
        <h1>Panel anfitrion</h1>
        <p>{me?.nombre || 'Usuario'} - {me?.correo || ''}</p>
        <div className="actions">
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" type="button" onClick={() => logoutTo('/app/login')}>Cerrar sesion</button>
          <a className="btn" href="/anfitrion/anfitrion.html">Usar panel legacy</a>
        </div>
      </section>

      <section className="card">
        <h2>Mis alojamientos</h2>
        {!alojamientos.length ? <p>No tienes alojamientos.</p> : null}
        <select value={alojamientoId} onChange={(e) => setAlojamientoId(Number(e.target.value || 0))}>
          {alojamientos.map((a) => (
            <option key={a.id} value={a.id}>{a.titulo || `Alojamiento ${a.id}`}</option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2>Gestion de alojamiento (React)</h2>
        <form className="inline-form" onSubmit={crearAlojamiento}>
          <input placeholder="Titulo" value={formAloj.titulo} onChange={(e) => setFormAloj((p) => ({ ...p, titulo: e.target.value }))} required />
          <input placeholder="Ubicacion" value={formAloj.ubicacion} onChange={(e) => setFormAloj((p) => ({ ...p, ubicacion: e.target.value }))} required />
          <input placeholder="Precio" type="number" value={formAloj.precio} onChange={(e) => setFormAloj((p) => ({ ...p, precio: e.target.value }))} required />
          <input placeholder="Capacidad" type="number" value={formAloj.capacidad_personas} onChange={(e) => setFormAloj((p) => ({ ...p, capacidad_personas: e.target.value }))} required />
          <input placeholder="Descripcion" value={formAloj.descripcion} onChange={(e) => setFormAloj((p) => ({ ...p, descripcion: e.target.value }))} />
          <button className="btn" type="submit">Crear alojamiento</button>
          <button className="btn" type="button" onClick={actualizarAlojamiento} disabled={!alojamientoId}>Actualizar seleccionado</button>
        </form>

        <form className="inline-form" onSubmit={subirImagenesAlojamiento}>
          <input type="file" multiple accept="image/*" onChange={(e) => setImagenesAlojFile(e.target.files)} />
          <button className="btn" type="submit" disabled={!alojamientoId}>Subir imagenes de alojamiento</button>
        </form>
        <p className="hint">Imagenes actuales: {imagenesAloj.length}</p>
      </section>

      <section className="kpi-row">
        <article className="card"><h3>Reservas</h3><p>{resumen.totalReservas}</p></article>
        <article className="card"><h3>Activas</h3><p>{resumen.activas}</p></article>
        <article className="card"><h3>Ingresos</h3><p>{money(resumen.ingresos)}</p></article>
      </section>

      <section className="card">
        <h2>Habitaciones</h2>
        <form className="inline-form" onSubmit={crearHabitacion}>
          <input placeholder="Nombre" value={formHab.nombre} onChange={(e) => setFormHab((p) => ({ ...p, nombre: e.target.value }))} required />
          <input placeholder="Capacidad" type="number" value={formHab.capacidad} onChange={(e) => setFormHab((p) => ({ ...p, capacidad: e.target.value }))} required />
          <input placeholder="Precio" type="number" value={formHab.precio} onChange={(e) => setFormHab((p) => ({ ...p, precio: e.target.value }))} required />
          <button className="btn" type="submit" disabled={!alojamientoId}>Crear habitacion</button>
        </form>

        <form className="inline-form" onSubmit={subirImagenHabitacion}>
          <select value={habitacionImagenTargetId} onChange={(e) => setHabitacionImagenTargetId(Number(e.target.value || 0))}>
            {habitaciones.map((h) => (
              <option key={h.id} value={h.id}>{h.nombre || `Habitacion ${h.id}`}</option>
            ))}
          </select>
          <input type="file" multiple accept="image/*" onChange={(e) => setHabitacionImagenFile(e.target.files)} />
          <button className="btn" type="submit" disabled={!habitacionImagenTargetId}>Subir imagenes de habitacion</button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Capacidad</th>
                <th>Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {habitaciones.map((h) => (
                <tr key={h.id}>
                  <td>{h.id}</td>
                  <td>{h.nombre}</td>
                  <td>{h.capacidad}</td>
                  <td>{money(h.precio)}</td>
                  <td>{h.estado || h.estado_manual || 'disponible'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Reservas del alojamiento</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Huesped</th>
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
                  <td>{r.titular_nombre || r.usuario || '-'}</td>
                  <td>{r.fecha_entrada} - {r.fecha_salida}</td>
                  <td>{money(r.precio_total)}</td>
                  <td>{r.estado}</td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      disabled={String(r.estado || '').toLowerCase() === 'cancelada'}
                      onClick={() => cancelarComoAnfitrion(r.id)}
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
        <h2>Chat interno (gestion/soporte)</h2>
        {!chatContactos.length ? <p>No hay contactos habilitados para chat.</p> : null}
        <div className="inline-form">
          <select value={chatContactoId} onChange={(e) => setChatContactoId(Number(e.target.value || 0))}>
            {chatContactos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} ({c.correo})</option>
            ))}
          </select>
          <select value={chatCanal} onChange={(e) => setChatCanal(String(e.target.value || 'gestion'))}>
            {canalesDisponibles.map((c) => (
              <option key={c.codigo} value={c.codigo}>{c.etiqueta || c.codigo}</option>
            ))}
          </select>
        </div>

        <div className="message-list compact">
          {chatMensajes.map((m) => {
            const mio = Number(m.emisor_id) === Number(me?.id || 0);
            return (
              <article key={m.id} className={`message-item ${mio ? 'mine' : ''}`}>
                <p>{m.contenido}</p>
                <small>{m.emisor_nombre || '-'} - {m.creado_en || '-'}</small>
              </article>
            );
          })}
        </div>

        <form className="inline-form" onSubmit={enviarChat}>
          <input placeholder="Escribe mensaje" value={chatTexto} onChange={(e) => setChatTexto(e.target.value)} />
          <button className="btn" type="submit">Enviar</button>
        </form>
      </section>
    </main>
  );
}
