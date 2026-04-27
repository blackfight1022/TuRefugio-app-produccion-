import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getApiBaseUrl } from '../lib/api';
import { fetchJson } from '../lib/auth';

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-CO')}`;
}

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const start = new Date(`${a}T00:00:00`);
  const end = new Date(`${b}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  if (Number.isNaN(diff) || diff <= 0) return 0;
  return Math.ceil(diff / 86400000);
}

function buildWompiUrl(checkout) {
  const fields = checkout?.fields || {};
  const base = checkout?.action || 'https://checkout.wompi.co/p/';
  const query = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value).trim())}`)
    .join('&');
  return `${base}?${query}`;
}

export default function ReservePage() {
  const [search] = useSearchParams();
  const alojamientoId = Number(search.get('alojamiento') || 0);
  const habitacionId = Number(search.get('habitacion') || 0);

  const [loading, setLoading] = useState(true);
  const [habitacion, setHabitacion] = useState(null);
  const [alojamiento, setAlojamiento] = useState(null);
  const [reservaId, setReservaId] = useState(0);

  const [fechaEntrada, setFechaEntrada] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [personas, setPersonas] = useState(1);

  const [nombre, setNombre] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CC');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');

  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [aData, rooms] = await Promise.all([
          fetchJson(`${getApiBaseUrl()}/alojamientos/${alojamientoId}`),
          fetchJson(`${getApiBaseUrl()}/habitaciones/alojamiento/${alojamientoId}`)
        ]);

        const room = Array.isArray(rooms)
          ? rooms.find((item) => Number(item.id) === habitacionId) || null
          : null;

        if (!cancelled) {
          setAlojamiento(aData || null);
          setHabitacion(room);
          if (room?.capacidad) setPersonas(Math.max(1, Number(room.capacidad)));
        }
      } catch (error) {
        if (!cancelled) {
          setAlojamiento(null);
          setHabitacion(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (alojamientoId && habitacionId) load();
    else setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [alojamientoId, habitacionId]);

  useEffect(() => {
    if (!reservaId) return undefined;

    const timer = setInterval(async () => {
      try {
        const data = await fetchJson(`${getApiBaseUrl()}/payments/estado-reserva/${reservaId}`);
        const estadoReserva = String(data?.estado_reserva || '').toLowerCase();
        const estadoPago = String(data?.estado_pago || '').toLowerCase();
        if (estadoReserva === 'confirmada' || estadoPago === 'pagado') {
          clearInterval(timer);
          await Swal.fire({ icon: 'success', title: 'Pago confirmado', text: 'Tu reserva fue confirmada.' });
          window.location.href = '/app/panel/turista';
        }
      } catch (error) {
        // polling silencioso
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [reservaId]);

  const nights = useMemo(() => nightsBetween(fechaEntrada, fechaSalida), [fechaEntrada, fechaSalida]);
  const subtotalHospedaje = useMemo(() => {
    return nights > 0 ? Number(habitacion?.precio || 0) * nights : 0;
  }, [habitacion?.precio, nights]);

  const canPay = useMemo(() => {
    return Boolean(
      fechaEntrada &&
      fechaSalida &&
      nights > 0 &&
      nombre.trim() &&
      tipoDocumento.trim() &&
      numeroDocumento.trim() &&
      correo.trim() &&
      telefono.trim()
    );
  }, [fechaEntrada, fechaSalida, nights, nombre, tipoDocumento, numeroDocumento, correo, telefono]);

  async function preparePayment(event) {
    event.preventDefault();
    if (!canPay || paying || !habitacion?.id) return;

    setPaying(true);
    setCheckoutUrl('');

    try {
      const payload = {
        id_habitacion: habitacion.id,
        fecha_entrada: fechaEntrada,
        fecha_salida: fechaSalida,
        personas: Number(personas || 1),
        cliente: {
          nombre: nombre.trim(),
          tipoDocumento: tipoDocumento.trim(),
          numeroDocumento: numeroDocumento.trim(),
          correo: correo.trim(),
          telefono: telefono.trim()
        },
        servicios: []
      };

      const result = await fetchJson(`${getApiBaseUrl()}/reservas/checkout-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const checkout = result?.checkout || result?.wompi;
      if (!checkout?.enabled) {
        throw new Error(checkout?.message || 'Pago no disponible en este momento.');
      }

      const url = buildWompiUrl(checkout);
      if (!url.includes('public-key=') || !url.includes('signature:integrity=')) {
        throw new Error('Configuración de pago incompleta.');
      }

      setReservaId(Number(result?.reserva?.id || 0));
      setCheckoutUrl(url);

      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        await Swal.fire({ icon: 'info', title: 'Abrir pago', text: 'Tu navegador bloqueó la ventana. Usa el enlace manual.' });
      }
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'No se pudo iniciar el pago.' });
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <main className="container"><section className="card">Cargando checkout...</section></main>;
  }

  if (!alojamiento || !habitacion) {
    return (
      <main className="container">
        <section className="card">
          <h1>Reserva no disponible</h1>
          <p>Faltan datos de habitación o alojamiento.</p>
          <Link className="btn" to="/explorar">Volver a explorar</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <h1>Reservar</h1>
        <p><strong>{alojamiento.titulo}</strong> - {habitacion.nombre}</p>
        <p>Valor noche: {money(habitacion.precio)}</p>
      </section>

      <section className="card form-card large">
        <form onSubmit={preparePayment}>
          <label>Fecha entrada</label>
          <input type="date" value={fechaEntrada} onChange={(e) => setFechaEntrada(e.target.value)} required />

          <label>Fecha salida</label>
          <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} required />

          <label>Personas</label>
          <input type="number" min="1" max={Number(habitacion.capacidad || 1)} value={personas} onChange={(e) => setPersonas(e.target.value)} />

          <label>Nombre titular</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />

          <label>Tipo documento</label>
          <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
            <option value="CC">CC</option>
            <option value="CE">CE</option>
            <option value="PASAPORTE">PASAPORTE</option>
            <option value="NIT">NIT</option>
          </select>

          <label>Numero documento</label>
          <input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} required />

          <label>Correo</label>
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

          <label>Telefono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} required />

          <p className="hint">Noches: {nights || 0} | Total hospedaje: {money(subtotalHospedaje)}</p>

          <button className="btn primary" disabled={!canPay || paying} type="submit">
            {paying ? 'Preparando pago...' : 'Pagar con Wompi'}
          </button>
        </form>

        {checkoutUrl ? (
          <p className="hint">
            Si no se abrió el pago automáticamente, usa el enlace:
            {' '}
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">Abrir Wompi</a>
          </p>
        ) : null}

        <div className="row-links">
          <Link to={`/detalle/${alojamientoId}`}>Volver al detalle</Link>
          <a href={`/reservar/reservar.html?alojamiento=${alojamientoId}&habitacion=${habitacionId}`}>Usar checkout legacy</a>
        </div>
      </section>
    </main>
  );
}
