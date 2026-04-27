import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api';
import { buildImageUrl } from '../lib/images';

function formatCOP(value) {
  return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function statusClass(status) {
  const value = String(status || 'disponible').toLowerCase();
  if (value === 'ocupada') return 'tag warn';
  if (value === 'mantenimiento') return 'tag danger';
  if (value === 'limpieza') return 'tag soft';
  return 'tag ok';
}

export default function DetailPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [alojamiento, setAlojamiento] = useState(null);
  const [imagenes, setImagenes] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [habitacionId, setHabitacionId] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [aRes, iRes, hRes] = await Promise.all([
          fetch(`${getApiBaseUrl()}/alojamientos/${id}`),
          fetch(`${getApiBaseUrl()}/alojamientos/${id}/imagenes`),
          fetch(`${getApiBaseUrl()}/habitaciones/alojamiento/${id}`)
        ]);

        const [aData, iData, hData] = await Promise.all([
          aRes.ok ? aRes.json() : null,
          iRes.ok ? iRes.json() : [],
          hRes.ok ? hRes.json() : []
        ]);

        if (cancelled) return;

        setAlojamiento(aData || null);
        setImagenes(Array.isArray(iData) ? iData : []);
        setHabitaciones(Array.isArray(hData) ? hData : []);
      } catch (error) {
        if (!cancelled) {
          setAlojamiento(null);
          setImagenes([]);
          setHabitaciones([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const habitacionSeleccionada = useMemo(() => {
    return habitaciones.find((h) => Number(h.id) === Number(habitacionId)) || null;
  }, [habitaciones, habitacionId]);

  const puedeReservar = useMemo(() => {
    if (!habitacionSeleccionada) return false;
    const estado = String(habitacionSeleccionada.estado || 'disponible').toLowerCase();
    return estado === 'disponible';
  }, [habitacionSeleccionada]);

  function irAReserva() {
    if (!habitacionSeleccionada || !puedeReservar) return;
    window.location.href = `/app/reservar?alojamiento=${id}&habitacion=${habitacionSeleccionada.id}`;
  }

  if (loading) {
    return <main className="container"><section className="card">Cargando detalle...</section></main>;
  }

  if (!alojamiento) {
    return (
      <main className="container">
        <section className="card">
          <h1>No encontrado</h1>
          <p>El alojamiento no existe o no esta disponible.</p>
          <Link className="btn" to="/explorar">Volver a explorar</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="card">
        <h1>{alojamiento.titulo}</h1>
        <p>{alojamiento.ubicacion || 'Ubicacion no disponible'}</p>
        <p className="detail-price">Desde {formatCOP(alojamiento.precio)}</p>

        <div className="actions">
          <Link className="btn" to="/explorar">Volver a explorar</Link>
          <a className="btn" href={`/detalle/${id}`}>Ver pagina legacy</a>
        </div>
      </section>

      <section className="card gallery-grid">
        {(imagenes.length ? imagenes : [{ ruta: alojamiento.imagen_principal || alojamiento.imagen }]).map((img, index) => (
          <img
            key={`${img.ruta || 'img'}-${index}`}
            src={buildImageUrl(img.ruta)}
            alt={`Imagen ${index + 1} de ${alojamiento.titulo}`}
            loading="lazy"
          />
        ))}
      </section>

      <section className="card">
        <h2>Habitaciones</h2>
        {!habitaciones.length ? <p>No hay habitaciones disponibles.</p> : null}

        <div className="room-list">
          {habitaciones.map((h) => (
            <label key={h.id} className="room-item">
              <input
                type="radio"
                name="habitacion"
                checked={Number(habitacionId) === Number(h.id)}
                onChange={() => setHabitacionId(h.id)}
              />
              <span>{h.nombre} - {formatCOP(h.precio)} - capacidad {h.capacidad}</span>
              <span className={statusClass(h.estado)}>{h.estado || 'disponible'}</span>
            </label>
          ))}
        </div>

        <button className="btn primary" disabled={!puedeReservar} onClick={irAReserva}>
          {puedeReservar ? 'Continuar reserva' : 'Selecciona una habitacion disponible'}
        </button>
      </section>
    </main>
  );
}
