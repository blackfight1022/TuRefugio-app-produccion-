// Hacer la URL de API dinámicamente para funcionar en cualquier dispositivo
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;

function normalizarRutaImagen(rutaOriginal) {
  const limpio = String(rutaOriginal || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^public\//i, "")
    .replace(/^\/+/, "");

  if (!limpio) return "uploads/default.jpg";
  return limpio.startsWith("uploads/") ? limpio : `uploads/${limpio.split("uploads/").pop()}`;
}

function construirUrlImagen(rutaOriginal) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/${normalizarRutaImagen(rutaOriginal)}`;
}

function monedaCOP(valor) {
  return `$${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatearEntero(valor) {
  return Number(valor || 0).toLocaleString('es-CO');
}

function formatearTendencia(valor, decimales = 1) {
  const n = Number(valor || 0);
  const signo = n >= 0 ? '+' : '';
  return `${signo}${n.toFixed(decimales)}%`;
}

function animarNumero(el, destino, opciones = {}) {
  if (!el) return;

  const {
    duracion = 700,
    decimales = 0,
    formato = (n) => String(n)
  } = opciones;

  const objetivo = Number(destino || 0);
  const actualRaw = Number(el.dataset.valorActual || 0);
  const inicio = Number.isFinite(actualRaw) ? actualRaw : 0;

  if (!Number.isFinite(objetivo)) {
    el.textContent = formato(0);
    el.dataset.valorActual = '0';
    return;
  }

  if (Math.abs(objetivo - inicio) < 0.0001) {
    el.textContent = formato(Number(objetivo.toFixed(decimales)));
    el.dataset.valorActual = String(objetivo);
    return;
  }

  const inicioMs = performance.now();

  function paso(tiempoMs) {
    const progreso = Math.min(1, (tiempoMs - inicioMs) / duracion);
    const easing = 1 - Math.pow(1 - progreso, 3);
    const valor = inicio + (objetivo - inicio) * easing;
    const redondeado = Number(valor.toFixed(decimales));

    el.textContent = formato(redondeado);

    if (progreso < 1) {
      requestAnimationFrame(paso);
    } else {
      el.dataset.valorActual = String(objetivo);
      el.textContent = formato(Number(objetivo.toFixed(decimales)));
    }
  }

  requestAnimationFrame(paso);
}

function estrellas(promedio) {
  const p = Number(promedio || 0);
  if (p <= 0) return "";
  const cantidad = Math.max(1, Math.min(5, Math.round(p)));
  return "⭐".repeat(cantidad);
}

function obtenerInicialResena(correo, nombre) {
  const correoLimpio = String(correo || "").trim();
  const nombreLimpio = String(nombre || "").trim();
  const base = correoLimpio ? correoLimpio.split("@")[0] : nombreLimpio;
  const inicial = String(base || "").charAt(0).toUpperCase();
  return inicial || "?";
}

function resumirTextoResena(texto, max = 120) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return "Sin comentarios";
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max).trimEnd()}...`;
}

function construirResumenResena(texto, max = 120) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) {
    return { resumen: "", completo: "", truncado: false };
  }
  if (limpio.length <= max) {
    return { resumen: limpio, completo: limpio, truncado: false };
  }
  return {
    resumen: `${limpio.slice(0, max).trimEnd()}...`,
    completo: limpio,
    truncado: true
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mostrarModalResenaCompleta(resenaCompleta) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "2000";

  const panel = document.createElement("div");
  panel.style.background = "#fff";
  panel.style.borderRadius = "10px";
  panel.style.maxWidth = "560px";
  panel.style.width = "92%";
  panel.style.maxHeight = "78vh";
  panel.style.overflowY = "auto";
  panel.style.padding = "18px";
  const titulo = document.createElement("h3");
  titulo.style.margin = "0 0 10px 0";
  titulo.textContent = "Reseña completa";

  const cuerpo = document.createElement("p");
  cuerpo.style.margin = "0";
  cuerpo.style.lineHeight = "1.6";
  cuerpo.style.whiteSpace = "pre-wrap";
  cuerpo.textContent = String(resenaCompleta || "Sin comentarios");

  panel.appendChild(titulo);
  panel.appendChild(cuerpo);

  panel.addEventListener("click", (event) => event.stopPropagation());
  overlay.addEventListener("click", () => document.body.removeChild(overlay));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

async function obtenerResumenResenas(idAlojamiento, promedioFallback) {
  try {
    const res = await fetch(`${API_URL}/resenas/alojamiento/${idAlojamiento}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      return {
        calificacionTexto: "",
        comentarioTexto: "",
        promedio: Number(promedioFallback || 0),
        total: 0
      };
    }

    const reseñasValidas = data.filter((item) => {
      const calificacion = Number(item?.calificacion || 0);
      const comentario = String(item?.comentario || "").trim();
      return calificacion > 0 || comentario.length > 0;
    });

    if (!reseñasValidas.length) {
      return {
        calificacionTexto: "",
        comentarioTexto: "",
        promedio: Number(promedioFallback || 0),
        total: 0
      };
    }

    const conCalificacion = reseñasValidas.filter((item) => Number(item?.calificacion || 0) > 0);
    const promedioNumero = conCalificacion.length
      ? conCalificacion.reduce((acc, item) => acc + Number(item.calificacion || 0), 0) / conCalificacion.length
      : Number(promedioFallback || 0);
    const promedio = promedioNumero.toFixed(1);

    const usuariosUnicos = new Set(
      reseñasValidas.map((item) => {
        const correo = String(item?.correo_usuario || "").trim().toLowerCase();
        if (correo) return `correo:${correo}`;

        const usuario = String(item?.usuario || "").trim().toLowerCase();
        if (usuario) return `usuario:${usuario}`;

        const comentario = String(item?.comentario || "").trim().toLowerCase();
        return `comentario:${comentario}`;
      })
    );

    const reseñaConComentario = reseñasValidas.find((item) => String(item?.comentario || "").trim().length > 0) || null;
    const reseñaBase = reseñaConComentario || reseñasValidas[0] || {};
    const comentarioCrudo = String(reseñaConComentario?.comentario || "").trim();
    const inicialResena = obtenerInicialResena(reseñaBase.correo_usuario, reseñaBase.usuario);

    return {
      calificacionTexto: estrellas(promedio),
      comentarioTexto: comentarioCrudo ? `“${resumirTextoResena(comentarioCrudo, 120)}”` : "",
      comentario: comentarioCrudo,
      inicialResena,
      promedio: Number(promedio),
      total: usuariosUnicos.size
    };
  } catch (error) {
    return {
      calificacionTexto: "",
      comentarioTexto: "",
      inicialResena: "?",
      promedio: Number(promedioFallback || 0),
      total: 0
    };
  }
}

async function obtenerRutaImagenAlojamiento(alojamiento) {
  if (alojamiento?.imagen_principal) {
    return String(alojamiento.imagen_principal);
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamiento.id}/imagenes`);
    if (!res.ok) return "";

    const imagenes = await res.json();
    if (!Array.isArray(imagenes) || imagenes.length === 0) return "";

    const principal = imagenes.find((img) => Number(img?.principal || 0) === 1);
    if (principal?.ruta) return String(principal.ruta);

    const primera = imagenes[0];
    return primera?.ruta ? String(primera.ruta) : "";
  } catch (error) {
    return "";
  }
}

async function cargarTopAlojamientos() {
  const contenedor = document.getElementById("topAlojamientosCards");
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos`);
    const alojamientos = await res.json();

    contenedor.innerHTML = "";

    if (!Array.isArray(alojamientos) || alojamientos.length === 0) {
      contenedor.innerHTML = "<p>No hay alojamientos disponibles en este momento.</p>";
      return;
    }

    const enriquecidos = [];

    for (const a of alojamientos) {
      const resumenResenas = await obtenerResumenResenas(a.id, a.calificacion_promedio);
      enriquecidos.push({ ...a, resumenResenas });
    }

    enriquecidos.sort((a, b) => {
      if (b.resumenResenas.promedio !== a.resumenResenas.promedio) {
        return b.resumenResenas.promedio - a.resumenResenas.promedio;
      }
      if (b.resumenResenas.total !== a.resumenResenas.total) {
        return b.resumenResenas.total - a.resumenResenas.total;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });

    const top = enriquecidos.slice(0, 20);

    for (const a of top) {
      const rutaImagen = await obtenerRutaImagenAlojamiento(a);
      const tieneImagen = Boolean(rutaImagen);
      const rutaBase = tieneImagen ? construirUrlImagen(rutaImagen) : "";
      const ruta = tieneImagen ? `${rutaBase}?v=${encodeURIComponent(rutaImagen)}` : "";
      const bloqueImagen = tieneImagen
        ? `<img src="${ruta}" alt="${a.titulo}">`
        : "";

      const resumenResenas = a.resumenResenas;
      const resumenTexto = construirResumenResena(resumenResenas.comentario || "", 120);
      const bloqueResenas = resumenResenas.total > 0
        ? `<p>${resumenResenas.calificacionTexto}</p>
           ${resumenTexto.resumen
             ? `<div class="resena-preview">
                  <span class="resena-avatar" aria-hidden="true">${resumenResenas.inicialResena || "?"}</span>
                  <p class="resena-comentario">${resumenTexto.resumen}</p>
                </div>`
             : ""
           }
           ${resumenTexto.truncado
             ? `<button type="button" class="btn-ver-resena-completa" data-resena-completa="${escapeHtml(resumenTexto.completo)}">Ver más</button>`
             : ""
           }`
        : "";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        ${bloqueImagen}
        <div class="card-body">
          <h3>${a.titulo}</h3>
          <p>Desde ${monedaCOP(a.precio)} / noche</p>
          ${bloqueResenas}
          <a href="detalles_alojamiento/detalles.html?id=${a.id}" class="btn-detalles-link">
            <button type="button" class="btn-detalles">Ver detalles</button>
          </a>
        </div>
      `;
      contenedor.appendChild(card);
    }
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>No se pudo cargar el ranking de alojamientos.</p>";
  }
}

async function cargarIndicadoresInformativos() {
  const totalEl = document.getElementById("alert-total-alojamientos");
  const rangoEl = document.getElementById("alert-rango-precios");
  const califEl = document.getElementById("alert-calificacion-promedio");

  if (!totalEl || !rangoEl || !califEl) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos`);
    const alojamientos = await res.json();

    if (!Array.isArray(alojamientos) || !alojamientos.length) {
      totalEl.textContent = "No hay alojamientos publicados en este momento.";
      rangoEl.textContent = "Sin datos de precios disponibles.";
      califEl.textContent = "Sin datos de calificación disponibles.";
      return;
    }

    const precios = alojamientos
      .map((a) => Number(a.precio || 0))
      .filter((p) => Number.isFinite(p) && p > 0);

    const calificaciones = alojamientos
      .map((a) => Number(a.calificacion_promedio || 0))
      .filter((c) => Number.isFinite(c) && c > 0);

    const minPrecio = precios.length ? Math.min(...precios) : 0;
    const maxPrecio = precios.length ? Math.max(...precios) : 0;
    const promedioCalif = calificaciones.length
      ? (calificaciones.reduce((acc, val) => acc + val, 0) / calificaciones.length).toFixed(1)
      : "N/A";

    totalEl.textContent = `${alojamientos.length.toLocaleString("es-CO")} alojamientos activos y visibles para búsqueda.`;
    rangoEl.textContent = precios.length
      ? `Rango actual entre ${monedaCOP(minPrecio)} y ${monedaCOP(maxPrecio)} por noche.`
      : "No se detectaron precios válidos en este momento.";
    califEl.textContent = calificaciones.length
      ? `Promedio actual de ${promedioCalif} ⭐ basado en valoraciones registradas.`
      : "Aún no hay suficientes valoraciones para estimar promedio.";
  } catch (error) {
    totalEl.textContent = "No fue posible cargar los indicadores de plataforma.";
    rangoEl.textContent = "No fue posible calcular el rango de precios.";
    califEl.textContent = "No fue posible calcular la calificación promedio.";
  }
}

function renderGraficaReservas(labels, values) {
  const polyline = document.getElementById('mini-chart-polyline');
  const pointsGroup = document.getElementById('mini-chart-points');
  if (!polyline || !pointsGroup) return;

  const datos = Array.isArray(values) ? values.slice(0, 5) : [];
  while (datos.length < 5) datos.push(0);

  const maxVal = Math.max(...datos, 1);
  const minVal = Math.min(...datos, 0);
  const rango = Math.max(1, maxVal - minVal);

  const xCoords = [16, 86, 156, 226, 296];
  const yTop = 26;
  const yBottom = 112;

  const puntos = datos.map((v, i) => {
    const ratio = (Number(v || 0) - minVal) / rango;
    const y = yBottom - ratio * (yBottom - yTop);
    return { x: xCoords[i], y: Number(y.toFixed(2)) };
  });

  polyline.setAttribute('points', puntos.map((p) => `${p.x},${p.y}`).join(' '));
  pointsGroup.innerHTML = puntos.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4"></circle>`).join('');

  const labelsSafe = Array.isArray(labels) ? labels.slice(0, 5) : [];
  for (let i = 0; i < 5; i += 1) {
    const el = document.getElementById(`mini-chart-label-${i}`);
    if (el) el.textContent = labelsSafe[i] || '';
  }
}

async function cargarEstadisticasHome() {
  const usuariosTrend = document.getElementById('kpi-trend-usuarios');
  const usuariosValor = document.getElementById('kpi-valor-usuarios');
  const alojTrend = document.getElementById('kpi-trend-alojamientos');
  const alojValor = document.getElementById('kpi-valor-alojamientos');
  const reservasTrend = document.getElementById('kpi-trend-reservas');
  const reservasValor = document.getElementById('kpi-valor-reservas');
  const satisfTrend = document.getElementById('kpi-trend-satisfaccion');
  const satisfValor = document.getElementById('kpi-valor-satisfaccion');
  const destinosEl = document.getElementById('destinos-populares-home');

  if (!usuariosTrend || !usuariosValor || !alojTrend || !alojValor || !reservasTrend || !reservasValor || !satisfTrend || !satisfValor || !destinosEl) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/estadisticas/home`);
    if (!res.ok) throw new Error('No fue posible cargar estadísticas del home.');

    const data = await res.json();
    const kpis = data?.kpis || {};

    animarNumero(usuariosValor, kpis.usuariosActivos?.valor || 0, {
      decimales: 0,
      formato: formatearEntero
    });
    animarNumero(usuariosTrend, kpis.usuariosActivos?.tendencia || 0, {
      decimales: 1,
      formato: (n) => formatearTendencia(n, 1)
    });

    animarNumero(alojValor, kpis.alojamientos?.valor || 0, {
      decimales: 0,
      formato: formatearEntero
    });
    animarNumero(alojTrend, kpis.alojamientos?.tendencia || 0, {
      decimales: 1,
      formato: (n) => formatearTendencia(n, 1)
    });

    animarNumero(reservasValor, kpis.reservasHoy?.valor || 0, {
      decimales: 0,
      formato: formatearEntero
    });
    animarNumero(reservasTrend, kpis.reservasHoy?.tendencia || 0, {
      decimales: 1,
      formato: (n) => formatearTendencia(n, 1)
    });

    const satisf = Number(kpis.satisfaccion?.valor || 0);
    animarNumero(satisfValor, satisf, {
      decimales: 1,
      formato: (n) => `${Number(n || 0).toFixed(1)} ⭐`
    });
    animarNumero(satisfTrend, kpis.satisfaccion?.tendencia || 0, {
      decimales: 1,
      formato: (n) => formatearTendencia(n, 1)
    });

    const destinos = Array.isArray(data?.destinosPopulares) ? data.destinosPopulares : [];
    destinosEl.textContent = destinos.length ? destinos.join(', ') : 'Sin datos recientes';

    renderGraficaReservas(data?.reservasMensuales?.labels, data?.reservasMensuales?.values);
  } catch (error) {
    console.error('[home/estadisticas]', error);
  }
}

function inicializarCentroAyudaInteractivo() {
  const botones = Array.from(document.querySelectorAll(".info-help-toggle"));
  const paneles = Array.from(document.querySelectorAll(".info-help-panel"));
  if (!botones.length || !paneles.length) return;

  botones.forEach((boton) => {
    boton.addEventListener("click", () => {
      const targetId = boton.getAttribute("data-help-target");
      if (!targetId) return;

      const panel = document.getElementById(targetId);
      if (!panel) return;

      const estabaAbierto = !panel.hidden;

      paneles.forEach((p) => {
        p.hidden = true;
      });
      botones.forEach((b) => b.classList.remove("activo"));

      if (!estabaAbierto) {
        panel.hidden = false;
        boton.classList.add("activo");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".btn-ver-resena-completa");
    if (!btn) return;
    const textoCompleto = btn.getAttribute("data-resena-completa") || "Sin comentarios";
    mostrarModalResenaCompleta(textoCompleto);
  });

  cargarTopAlojamientos();
  cargarIndicadoresInformativos();
  cargarEstadisticasHome();
  inicializarCentroAyudaInteractivo();

  setInterval(() => {
    cargarIndicadoresInformativos();
    cargarEstadisticasHome();
  }, 60000);
});
