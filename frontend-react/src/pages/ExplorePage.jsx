import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api';
import { buildImageUrl } from '../lib/images';

function formatCOP(value) {
  return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

export default function ExplorePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const topRes = await fetch(`${getApiBaseUrl()}/alojamientos/top/reservas-diarias`);
        const topData = topRes.ok ? await topRes.json() : [];

        if (Array.isArray(topData) && topData.length) {
          if (!cancelled) setItems(topData);
          return;
        }

        const allRes = await fetch(`${getApiBaseUrl()}/alojamientos`);
        const allData = allRes.ok ? await allRes.json() : [];
        if (!cancelled) setItems(Array.isArray(allData) ? allData : []);
      } catch (error) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const location = String(item.ubicacion || '').toLowerCase();
      const cityQuery = city.trim().toLowerCase();
      if (cityQuery && !location.includes(cityQuery)) return false;

      const max = Number(maxPrice || 0);
      if (max > 0 && Number(item.precio || 0) > max) return false;

      return true;
    });
  }, [items, city, maxPrice]);

  return (
    <main className="container">
      <section className="card">
        <h1>Explorar alojamientos</h1>
        <p>Vista React conectada al mismo backend existente.</p>

        <div className="filters">
          <input
            placeholder="Filtrar por ciudad"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <input
            placeholder="Precio maximo"
            type="number"
            min="0"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
          <Link className="btn" to="/">Volver</Link>
        </div>
      </section>

      {loading ? <section className="card">Cargando alojamientos...</section> : null}

      {!loading && !filtered.length ? (
        <section className="card">No hay resultados para ese filtro.</section>
      ) : null}

      <section className="grid-list">
        {filtered.map((item) => (
          <article key={item.id} className="card property-card">
            <img
              src={buildImageUrl(item.imagen_principal || item.imagen)}
              alt={item.titulo || 'Alojamiento'}
              loading="lazy"
            />
            <h3>{item.titulo || 'Alojamiento'}</h3>
            <p>{item.ubicacion || 'Ubicacion no disponible'}</p>
            <p className="price">{formatCOP(item.precio)}</p>
            <Link className="btn primary" to={`/detalle/${item.id}`}>Ver detalle</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
