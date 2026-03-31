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

// Variable global para almacenar los alojamientos originales
let alojamientosGlobales = [];

function formatearUbicacionCorta(ubicacion) {
  if (!ubicacion) return "No especificada";

  const partes = String(ubicacion)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^https?:\/\//i.test(p))
    .filter((p) => !/^lat\s*:/i.test(p))
    .filter((p) => !/^lng\s*:/i.test(p));

  if (partes.length >= 2) {
    return `${partes[partes.length - 2]}, ${partes[partes.length - 1]}`;
  }

  return partes[0] || "No especificada";
}

function construirTextoEstrellas(calificacion) {
  const valor = Number(calificacion || 0);
  if (!Number.isFinite(valor) || valor <= 0) return "";
  const cantidad = Math.max(1, Math.min(5, Math.round(valor)));
  return "⭐".repeat(cantidad);
}

// Cargar alojamientos y sus imágenes para visitantes
async function cargarAlojamientosVisitante() {
  const contenedor = document.getElementById("cardsExplorar");
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos`); // Endpoint público
    const alojamientos = await res.json();
    
    // Guardar alojamientos globales para filtrado
    alojamientosGlobales = alojamientos;

    contenedor.innerHTML = ""; // Limpiar antes de renderizar

    if (!Array.isArray(alojamientos) || alojamientos.length === 0) {
      contenedor.innerHTML = "<p>No hay alojamientos disponibles</p>";
      return;
    }

    renderizarAlojamientos(alojamientos, contenedor);

  } catch (error) {
    console.error("Error cargando alojamientos visitantes:", error);
    contenedor.innerHTML = "<p>Error al cargar alojamientos</p>";
  }
}

// Función para renderizar alojamientos
async function renderizarAlojamientos(alojamientos, contenedor) {
  contenedor.innerHTML = "";
  
  if (alojamientos.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron alojamientos con esos filtros</p>";
    return;
  }

  for (const aloj of alojamientos) {
    const card = document.createElement("div");
    card.classList.add("card");

    // Mapear valores a textos con emoji
    const zonaTexto = {
      "rural": "🏞️ Rural",
      "residencial": "🏠 Residencial",
      "urbana": "🏙️ Urbana",
      "comercial": "🏪 Comercial",
      "industrial": "🏭 Industrial"
    }[aloj.zona] || (aloj.zona ? aloj.zona : "No especificada");

    const vistasTexto = {
      "mar": "🌊 Mar",
      "montaña": "⛰️ Montaña",
      "ciudad": "🏙️ Ciudad",
      "jardín": "🌳 Jardín",
      "ninguna": "Sin vistas especiales"
    }[aloj.vistas] || (aloj.vistas ? aloj.vistas : "No especificada");

    // Imagen principal
    let imgSrc = aloj.imagen_principal
      ? construirUrlImagen(aloj.imagen_principal)
      : "http://localhost:3000/uploads/default.jpg";

    const estrellas = construirTextoEstrellas(aloj.calificacion_promedio);
    const bloqueCalificacion = estrellas
      ? `<p class="calificacion">⭐ Calificación: ${estrellas}</p>`
      : "";

    card.innerHTML = `
  <h2>${aloj.titulo}</h2>
  <p class="ubicacion">📍 Ubicación: ${formatearUbicacionCorta(aloj.ubicacion)}</p>
  <p class="precio">💰 Precios a partir de: $${aloj.precio} COP/noche</p>
  ${bloqueCalificacion}
  <p class="descripcion"><span class="descripcion-label">📝 Descripción:</span> ${aloj.descripcion || ""}</p>
  <p class="zona">🏞️ Zona: ${zonaTexto}</p>
  <p class="cercania">🚶 Cercanía: ${aloj.cercania ? aloj.cercania : "No especificada"}</p>
  <p class="vistas">👀 Vistas: ${vistasTexto}</p>
  <div class="servicios" id="servicios-visitante-${aloj.id}">
    <p>🛎️ Servicios: Cargando...</p>
  </div>
  <div class="resenas" id="resenas-visitante-${aloj.id}">
    <p>💬 Reseñas: Cargando...</p>
  </div>
  <div class="galeria" id="galeria-visitante-${aloj.id}">
    <p>Cargando imágenes...</p>
  </div>
  <button onclick="verDetalles(${aloj.id})">🔎 Ver Detalles</button>
  <a href="#" class="politicas-link" style="color: blue; text-decoration: underline; display: block; margin-top: 10px;" data-alojamiento-id="${aloj.id}">📋 Políticas de Reserva y Cancelación</a>
`;

    contenedor.appendChild(card);
    await cargarServiciosVisitante(aloj.id);
    await cargarResumenResenasVisitante(aloj.id);
    await cargarGaleriaVisitante(aloj.id);

    // Agregar event listener para el enlace de políticas
    const politicasLink = card.querySelector('.politicas-link');
    politicasLink.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarPoliticasModal(aloj.politicas || "No especificadas");
    });
  }
}

// Función para aplicar filtros
async function aplicarFiltros() {
  const precioMin = document.getElementById("filtro-precio-min").value;
  const precioMax = document.getElementById("filtro-precio-max").value;
  const servicios = document.getElementById("filtro-servicios").value.toLowerCase();
  const ubicacion = document.getElementById("filtro-ubicacion").value.toLowerCase();
  const zona = document.getElementById("filtro-zona").value.toLowerCase();
  const cercania = document.getElementById("filtro-cercania").value.toLowerCase();
  const vistas = document.getElementById("filtro-vistas").value.toLowerCase();
  const calificacion = document.getElementById("filtro-calificacion").value;

  let alojamientosFiltrados = alojamientosGlobales.filter(aloj => {
    // Filtro por precio
    if (precioMin && aloj.precio < parseInt(precioMin)) {
      return false;
    }
    if (precioMax && aloj.precio > parseInt(precioMax)) {
      return false;
    }

    // Filtro por ubicación
    if (ubicacion && !aloj.ubicacion.toLowerCase().includes(ubicacion)) {
      return false;
    }

    // Filtro por zona (coincidencia en descripción o ubicación)
    if (zona && !aloj.descripcion.toLowerCase().includes(zona) && !aloj.ubicacion.toLowerCase().includes(zona)) {
      return false;
    }

    // Filtro por cercanía (coincidencia en descripción)
    if (cercania && !aloj.descripcion.toLowerCase().includes(cercania)) {
      return false;
    }

    // Filtro por vistas (coincidencia en descripción)
    if (vistas && !aloj.descripcion.toLowerCase().includes(vistas)) {
      return false;
    }

    // Filtro por calificación (si existe el campo)
    if (calificacion && aloj.calificacion && aloj.calificacion < parseFloat(calificacion)) {
      return false;
    }

    return true;
  });

  // Si hay filtro de servicios, hacer solicitud adicional
  if (servicios) {
    alojamientosFiltrados = await filtrarPorServicios(alojamientosFiltrados, servicios);
  }

  // Renderizar resultados filtrados
  const contenedor = document.getElementById("cardsExplorar");
  await renderizarAlojamientos(alojamientosFiltrados, contenedor);
}

// Función para filtrar por servicios
async function filtrarPorServicios(alojamientos, serviciosBuscados) {
  const alojamientosFiltrados = [];

  for (const aloj of alojamientos) {
    try {
      const res = await fetch(`${API_URL}/alojamientos/${aloj.id}/servicios`);
      const servicios = await res.json();
      
      if (servicios.some(s => s.nombre.toLowerCase().includes(serviciosBuscados))) {
        alojamientosFiltrados.push(aloj);
      }
    } catch (error) {
      console.error(`Error obteniendo servicios del alojamiento ${aloj.id}:`, error);
    }
  }

  return alojamientosFiltrados;
}

// Función para limpiar filtros
function limpiarFiltros() {
  document.getElementById("filtro-precio-min").value = "";
  document.getElementById("filtro-precio-max").value = "";
  document.getElementById("filtro-servicios").value = "";
  document.getElementById("filtro-ubicacion").value = "";
  document.getElementById("filtro-zona").value = "";
  document.getElementById("filtro-cercania").value = "";
  document.getElementById("filtro-vistas").value = "";
  document.getElementById("filtro-calificacion").value = "";

  // Recargar todos los alojamientos
  const contenedor = document.getElementById("cardsExplorar");
  renderizarAlojamientos(alojamientosGlobales, contenedor);
}

// Cargar galería de un alojamiento para visitantes
async function cargarGaleriaVisitante(alojamientoId) {
  const contenedor = document.getElementById(`galeria-visitante-${alojamientoId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/imagenes`); // endpoint público de imágenes
    const imagenes = await res.json();

    contenedor.innerHTML = "";
    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      contenedor.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    imagenes.forEach(img => {
      const url = construirUrlImagen(img.ruta);

      const div = document.createElement("div");
      div.classList.add("img-box");
      div.innerHTML = `
  <img src="${url}" 
       onclick="abrirLightbox('${url}')" 
       style="cursor:pointer;">
`;
      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error("Error cargando galería visitante", error);
    contenedor.innerHTML = "<p>Error cargando imágenes</p>";
  }
}

// Cargar servicios de un alojamiento para visitantes
async function cargarServiciosVisitante(alojamientoId) {
  const contenedor = document.getElementById(`servicios-visitante-${alojamientoId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/servicios`);
    const servicios = await res.json();

    contenedor.innerHTML = "";
    if (!Array.isArray(servicios) || servicios.length === 0) {
      contenedor.innerHTML = "<p>🛎️ Servicios: No especificados</p>";
      return;
    }

    const serviciosTexto = servicios.map(s => s.nombre).join(", ");
    contenedor.innerHTML = `<p>🛎️ Servicios: ${serviciosTexto}</p>`;
  } catch (error) {
    console.error("Error cargando servicios visitante", error);
    contenedor.innerHTML = "<p>🛎️ Servicios: Error cargando</p>";
  }
}



// Refresco automático cada 5 segundos para ver cambios en tiempo real
/*setInterval(() => {
  cargarAlojamientosVisitante();
}, 5000);
*/

document.addEventListener("DOMContentLoaded", () => {
  cargarAlojamientosVisitante();

  // Agregar listeners a los botones de filtros
  const btnFiltrar = document.getElementById("btnFiltrar");
  const btnLimpiar = document.getElementById("btnLimpiar");

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", aplicarFiltros);
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", limpiarFiltros);
  }

  // Opcional: Aplicar filtros cuando se presiona Enter en los inputs
  const inputs = document.querySelectorAll(".filtro-item input, .filtro-item select");
  inputs.forEach(input => {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        aplicarFiltros();
      }
    });
  });
});









async function cargarExplorarAlojamientos() {
  try {
    const res = await fetch(`${API_URL}/alojamientos`);
    const alojamientos = await res.json();

    const contenedor = document.getElementById("cardsExplorar");
    contenedor.innerHTML = "";

    if (!Array.isArray(alojamientos) || alojamientos.length === 0) {
      contenedor.innerHTML = "<p>No hay alojamientos disponibles</p>";
      return;
    }

    alojamientos.forEach(a => {
      const card = document.createElement("div");
      card.classList.add("card");

      const imgSrc = a.imagen_principal
        ? construirUrlImagen(a.imagen_principal)
        : "http://localhost:3000/uploads/default.jpg";

      card.innerHTML = `
        <div class="card-img-container">
          <img src="${imgSrc}" alt="${a.titulo}">
          <div class="badge">DESTACADO</div>
          <div class="precio-tag">$${a.precio} COP/noche</div>
        </div>

        <div class="card-body">
          <h2>${a.titulo}</h2>
          <p>📍 ${formatearUbicacionCorta(a.ubicacion)}</p>

          <a href="ficha-detalle.html?id=${a.id}">
            <button>Ver Detalles</button>
          </a>
        </div>
      `;

      contenedor.appendChild(card);
    });

  } catch (error) {
    console.error(error);
    document.getElementById("cardsExplorar").innerHTML = "<p>Error cargando alojamientos</p>";
  }
}

//document.addEventListener("DOMContentLoaded", cargarExplorarAlojamientos);


// 🔒 BLOQUE AISLADO PARA EVITAR ERROR
(function () {
  try {
    // Código original desactivado para evitar errores
    /*
    card.innerHTML = `
      <h2>${aloj.titulo}</h2>
      <p>Ubicación: ${aloj.ubicacion || "No especificada"}</p>
      <p>Precio: $${aloj.precio} COP/noche</p>

      <div class="galeria" id="galeria-visitante-${aloj.id}">
        <p>Cargando imágenes...</p>
      </div>

      <a href="ficha-detalle.html?id=${aloj.id}">
        <button>Ver Detalles</button>
      </a>
    `;
    */
  } catch (e) {
    console.warn("Bloque aislado para evitar error:", e);
  }
})();





// ======================================
// LIGHTBOX VISITANTE (AMPLIAR IMAGEN)
// ======================================
function abrirLightbox(src) {
  let lightbox = document.getElementById("lightbox");

  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.id = "lightbox";

    lightbox.style = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;

    const img = document.createElement("img");
    img.id = "lightbox-img";

    img.style = `
      max-width: 90%;
      max-height: 90%;
      border-radius: 10px;
      box-shadow: 0 0 20px #000;
    `;

    lightbox.appendChild(img);

    // Cerrar al hacer click
    lightbox.addEventListener("click", () => {
      lightbox.style.display = "none";
    });

    document.body.appendChild(lightbox);
  }

  document.getElementById("lightbox-img").src = src;
  lightbox.style.display = "flex";
}

function verDetalles(id) {
  window.location.href = `http://localhost:3000/detalles_alojamiento/detalles.html?id=${id}`;
}

// Función para mostrar modal de políticas
function mostrarPoliticasModal(politicas) {
  // Crear modal
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1000';
  modal.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = 'white';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.maxWidth = '500px';
  modalContent.style.width = '90%';
  modalContent.style.maxHeight = '80%';
  modalContent.style.overflowY = 'auto';
  modalContent.innerHTML = `
    <h3>📋 Políticas de Reserva y Cancelación</h3>
    <p style="text-align: justify; line-height: 1.6;">${politicas}</p>
  `;
  modalContent.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar cerrar al clic dentro
  });

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

async function cargarResumenResenasVisitante(alojamientoId) {
  const contenedor = document.getElementById(`resenas-visitante-${alojamientoId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/resenas/alojamiento/${alojamientoId}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "";
      return;
    }

    const reseñasValidas = data.filter((item) => {
      const calificacion = Number(item?.calificacion || 0);
      const comentario = String(item?.comentario || "").trim();
      return calificacion > 0 || comentario.length > 0;
    });

    if (reseñasValidas.length === 0) {
      contenedor.innerHTML = "";
      return;
    }

    const conCalificacion = reseñasValidas.filter((item) => Number(item?.calificacion || 0) > 0);
    const promedio = conCalificacion.length
      ? (conCalificacion.reduce((acc, item) => acc + Number(item.calificacion || 0), 0) / conCalificacion.length).toFixed(1)
      : null;

    const ultimaConComentario = reseñasValidas.find((item) => String(item?.comentario || "").trim().length > 0);
    const encabezado = promedio
      ? `<p>💬 ${reseñasValidas.length} reseña(s) | Promedio: ${promedio}/5</p>`
      : `<p>💬 ${reseñasValidas.length} reseña(s)</p>`;
    const comentario = ultimaConComentario
      ? `<p>“${ultimaConComentario.comentario}” - ${ultimaConComentario.usuario || 'Usuario'}</p>`
      : "";

    contenedor.innerHTML = `${encabezado}${comentario}`;
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "";
  }
}