const express = require('express');
const db = require('../database');

const router = express.Router();

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(Array.isArray(rows) ? rows : []);
    });
  });
}

function calcularTendencia(actual, anterior) {
  const a = Number(actual || 0);
  const b = Number(anterior || 0);
  if (b <= 0 && a <= 0) return 0;
  if (b <= 0) return 100;
  return ((a - b) / b) * 100;
}

function normalizarCiudad(ubicacion) {
  const texto = String(ubicacion || '').trim();
  if (!texto) return '';
  const partes = texto.split(',').map((p) => p.trim()).filter(Boolean);
  return (partes[0] || texto).replace(/\s+/g, ' ');
}

router.get('/home', async (req, res) => {
  try {
    const [
      usuariosActivos,
      usuariosMesActual,
      usuariosMesAnterior,
      totalAlojamientos,
      alojMesActual,
      alojMesAnterior,
      reservasHoy,
      reservasAyer,
      satisfaccion,
      satisfaccionAnterior,
      destinos,
      reservasMensualesRaw
    ] = await Promise.all([
      dbGet(`SELECT COUNT(*) AS total FROM usuarios WHERE COALESCE(estado_cuenta, 'activo') = 'activo'`),
      dbGet(`SELECT COUNT(*) AS total FROM usuarios WHERE strftime('%Y-%m', datetime(creado_en, 'localtime')) = strftime('%Y-%m', 'now', 'localtime')`),
      dbGet(`SELECT COUNT(*) AS total FROM usuarios WHERE strftime('%Y-%m', datetime(creado_en, 'localtime')) = strftime('%Y-%m', 'now', 'localtime', '-1 month')`),
      dbGet(`SELECT COUNT(*) AS total FROM alojamientos`),
      dbGet(`SELECT COUNT(*) AS total FROM alojamientos WHERE strftime('%Y-%m', datetime(creado_en, 'localtime')) = strftime('%Y-%m', 'now', 'localtime')`),
      dbGet(`SELECT COUNT(*) AS total FROM alojamientos WHERE strftime('%Y-%m', datetime(creado_en, 'localtime')) = strftime('%Y-%m', 'now', 'localtime', '-1 month')`),
      dbGet(`SELECT COUNT(*) AS total FROM reservas WHERE date(datetime(creado_en, 'localtime')) = date('now', 'localtime')`),
      dbGet(`SELECT COUNT(*) AS total FROM reservas WHERE date(datetime(creado_en, 'localtime')) = date('now', 'localtime', '-1 day')`),
      dbGet(`SELECT AVG(calificacion) AS promedio FROM reseñas`),
      dbGet(`
        SELECT AVG(calificacion) AS promedio
        FROM reseñas
        WHERE datetime(fecha, 'localtime') >= datetime('now', 'localtime', '-30 day')
          AND datetime(fecha, 'localtime') < datetime('now', 'localtime', '-60 day')
      `),
      dbAll(`
        SELECT a.ubicacion, COUNT(*) AS total
        FROM reservas r
        JOIN habitaciones h ON h.id = r.id_habitacion
        JOIN alojamientos a ON a.id = h.id_alojamiento
        WHERE COALESCE(r.estado, 'pendiente') <> 'cancelada'
          AND datetime(r.creado_en, 'localtime') >= datetime('now', 'localtime', '-30 day')
        GROUP BY a.ubicacion
        ORDER BY total DESC
        LIMIT 20
      `),
      dbAll(`
        SELECT strftime('%Y-%m', datetime(creado_en, 'localtime')) AS ym, COUNT(*) AS total
        FROM reservas
        WHERE date(datetime(creado_en, 'localtime')) >= date('now', 'localtime', 'start of month', '-4 months')
        GROUP BY ym
        ORDER BY ym ASC
      `)
    ]);

    const ahora = new Date();
    const meses = [];
    for (let i = 4; i >= 0; i -= 1) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const etiqueta = d.toLocaleString('es-CO', { month: 'short' }).replace('.', '');
      meses.push({ ym, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) });
    }

    const mapaMensual = new Map(
      reservasMensualesRaw.map((r) => [String(r.ym || ''), Number(r.total || 0)])
    );

    const labels = meses.map((m) => m.etiqueta);
    const values = meses.map((m) => mapaMensual.get(m.ym) || 0);

    const mapaDestinos = new Map();
    for (const item of destinos) {
      const ciudad = normalizarCiudad(item.ubicacion);
      if (!ciudad) continue;
      mapaDestinos.set(ciudad, (mapaDestinos.get(ciudad) || 0) + Number(item.total || 0));
    }

    const destinosPopulares = Array.from(mapaDestinos.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([nombre]) => nombre);

    res.json({
      kpis: {
        usuariosActivos: {
          valor: Number(usuariosActivos?.total || 0),
          tendencia: calcularTendencia(usuariosMesActual?.total, usuariosMesAnterior?.total)
        },
        alojamientos: {
          valor: Number(totalAlojamientos?.total || 0),
          tendencia: calcularTendencia(alojMesActual?.total, alojMesAnterior?.total)
        },
        reservasHoy: {
          valor: Number(reservasHoy?.total || 0),
          tendencia: calcularTendencia(reservasHoy?.total, reservasAyer?.total)
        },
        satisfaccion: {
          valor: Number(satisfaccion?.promedio || 0),
          tendencia: calcularTendencia(satisfaccion?.promedio, satisfaccionAnterior?.promedio)
        }
      },
      destinosPopulares,
      reservasMensuales: {
        labels,
        values
      }
    });
  } catch (error) {
    console.error('[estadisticas/home]', error.message);
    res.status(500).json({ error: 'No fue posible calcular las estadísticas del home.' });
  }
});

module.exports = router;
