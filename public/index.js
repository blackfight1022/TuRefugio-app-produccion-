const API_URL = "http://localhost:3000/api";

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
  return `http://localhost:3000/${normalizarRutaImagen(rutaOriginal)}`;
}

function monedaCOP(valor) {
  return `$${Number(valor || 0).toLocaleString("es-CO")}`;
}

function estrellas(promedio) {
  const p = Number(promedio || 0);
  if (p <= 0) return "";
  return `⭐ ${p.toFixed(1)}/5`;
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

    const promedioNumero = data.reduce((acc, item) => acc + Number(item.calificacion || 0), 0) / data.length;
    const promedio = promedioNumero.toFixed(1);
    const ultimoComentario = (data[0]?.comentario || "Sin comentarios").trim();

    return {
      calificacionTexto: `⭐ ${promedio}/5`,
      comentarioTexto: `“${ultimoComentario}”`,
      promedio: Number(promedio),
      total: data.length
    };
  } catch (error) {
    return {
      calificacionTexto: "",
      comentarioTexto: "",
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
      const bloqueResenas = resumenResenas.total > 0
        ? `<p>${resumenResenas.calificacionTexto}</p><p>${resumenResenas.comentarioTexto}</p>`
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

document.addEventListener("DOMContentLoaded", cargarTopAlojamientos);
