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

// Variable global para almacenar los alojamientos originales
let alojamientosGlobales = [];
let firmaAlojamientosActual = "";
let intervaloRefrescoAlojamientos = null;
const INTERVALO_REFRESCO_ALOJAMIENTOS_MS = 10000;
const FORMATEADOR_PRECIO = new Intl.NumberFormat("es-CO");
const CACHE_TTL_MS = 60 * 1000;
const CONCURRENCIA_DETALLES = 6;
let cargandoAlojamientos = false;

const cacheDatos = {
  servicios: new Map(),
  imagenes: new Map(),
  resenas: new Map()
};
const peticionesPendientes = new Map();

function obtenerCache(cacheMap, key) {
  const entry = cacheMap.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cacheMap.delete(key);
    return null;
  }
  return entry.data;
}

function guardarCache(cacheMap, key, data) {
  cacheMap.set(key, { ts: Date.now(), data });
}

async function fetchJsonConCache(cacheKey, url, cacheMap) {
  const cacheHit = obtenerCache(cacheMap, cacheKey);
  if (cacheHit !== null) return cacheHit;

  if (peticionesPendientes.has(cacheKey)) {
    return peticionesPendientes.get(cacheKey);
  }

  const promesa = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    guardarCache(cacheMap, cacheKey, data);
    return data;
  })().finally(() => {
    peticionesPendientes.delete(cacheKey);
  });

  peticionesPendientes.set(cacheKey, promesa);
  return promesa;
}

async function ejecutarEnLotes(tareas, concurrencia = CONCURRENCIA_DETALLES) {
  for (let i = 0; i < tareas.length; i += concurrencia) {
    const lote = tareas.slice(i, i + concurrencia).map((t) => t());
    await Promise.allSettled(lote);
  }
}

function extraerNumeroPrecio(valor) {
  const limpio = String(valor || "").replace(/[^\d]/g, "");
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

function formatearInputPrecio(input) {
  if (!input) return;
  const numero = extraerNumeroPrecio(input.value);
  input.value = numero === null ? "" : FORMATEADOR_PRECIO.format(numero);
}

function configurarInputsPrecio() {
  const ids = ["filtro-precio-min", "filtro-precio-max"];
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("input", () => {
      formatearInputPrecio(input);
    });

    input.addEventListener("blur", () => {
      formatearInputPrecio(input);
    });
  });
}

function hayFiltrosActivos() {
  const ids = [
    "filtro-precio-min",
    "filtro-precio-max",
    "filtro-servicios",
    "filtro-ubicacion",
    "filtro-zona",
    "filtro-cercania",
    "filtro-vistas",
    "filtro-calificacion"
  ];

  return ids.some((id) => {
    const input = document.getElementById(id);
    return input && String(input.value || "").trim() !== "";
  });
}

function construirFirmaAlojamientos(alojamientos) {
  if (!Array.isArray(alojamientos)) return "";
  return alojamientos
    .map((a) => `${a.id}|${a.id_anfitrion || ""}|${a.precio || 0}|${a.calificacion_promedio || 0}`)
    .join(";");
}

function formatearUbicacionCorta(ubicacion) {
  if (!ubicacion) return "No especificada";

  const esTokenCoordenada = (token) => {
    const limpio = String(token || "").trim();
    if (!/^[-+]?\d{1,3}\.\d+$/.test(limpio)) return false;
    const numero = Number(limpio);
    return Number.isFinite(numero) && Math.abs(numero) <= 180;
  };

  const partes = String(ubicacion)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^https?:\/\//i.test(p))
    .filter((p) => !/^lat\s*:/i.test(p))
    .filter((p) => !/^lng\s*:/i.test(p))
    .filter((p) => !esTokenCoordenada(p));

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

function textoPlano(valor) {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

function resumirTextoResena(texto, max = 110) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max).trimEnd()}...`;
}

function construirResumenResena(texto, max = 110) {
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

function mostrarModalResenaCompleta(resenaCompleta) {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1200';
  modal.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = 'white';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.maxWidth = '560px';
  modalContent.style.width = '92%';
  modalContent.style.maxHeight = '78%';
  modalContent.style.overflowY = 'auto';
  const titulo = document.createElement('h3');
  titulo.style.margin = '0 0 10px 0';
  titulo.textContent = 'Reseña completa';

  const cuerpo = document.createElement('p');
  cuerpo.style.margin = '0';
  cuerpo.style.lineHeight = '1.6';
  cuerpo.style.whiteSpace = 'pre-wrap';
  cuerpo.textContent = String(resenaCompleta || 'Sin comentarios');

  modalContent.appendChild(titulo);
  modalContent.appendChild(cuerpo);
  modalContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

function compactarTotalResenas(total) {
  const n = Number(total || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n > 99 ? "99+" : String(n);
}

// Cargar alojamientos y sus imágenes para visitantes
async function cargarAlojamientosVisitante() {
  const contenedor = document.getElementById("cardsExplorar");
  if (!contenedor) return;
  if (cargandoAlojamientos) return;

  cargandoAlojamientos = true;

  try {
    const res = await fetch(`${API_URL}/alojamientos`, { cache: "no-store" }); // Endpoint público
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const alojamientos = await res.json();
    const nuevaFirma = construirFirmaAlojamientos(alojamientos);
    const filtrosActivos = hayFiltrosActivos();
    
    // Guardar alojamientos globales para filtrado
    alojamientosGlobales = alojamientos;

    if (firmaAlojamientosActual === nuevaFirma && !filtrosActivos) {
      return;
    }
    firmaAlojamientosActual = nuevaFirma;

    contenedor.innerHTML = ""; // Limpiar antes de renderizar

    if (!Array.isArray(alojamientos) || alojamientos.length === 0) {
      contenedor.innerHTML = "<p>No hay alojamientos disponibles</p>";
      return;
    }

    if (filtrosActivos) {
      await aplicarFiltros();
      return;
    }

    renderizarAlojamientos(alojamientos, contenedor);

  } catch (error) {
    console.error("Error cargando alojamientos visitantes:", error);
    contenedor.innerHTML = "<p>Error al cargar alojamientos</p>";
  } finally {
    cargandoAlojamientos = false;
  }
}

function iniciarRefrescoAutomaticoAlojamientos() {
  if (intervaloRefrescoAlojamientos) {
    clearInterval(intervaloRefrescoAlojamientos);
  }

  intervaloRefrescoAlojamientos = setInterval(() => {
    if (document.hidden) return;
    cargarAlojamientosVisitante();
  }, INTERVALO_REFRESCO_ALOJAMIENTOS_MS);
}

// Función para renderizar alojamientos
async function renderizarAlojamientos(alojamientos, contenedor) {
  contenedor.innerHTML = "";
  
  if (alojamientos.length === 0) {
    contenedor.innerHTML = "<p>No se encontraron alojamientos con esos filtros</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const aloj of alojamientos) {
    const card = document.createElement("div");
    card.classList.add("card");

    // Mapear valores a textos legibles
    const zonaTexto = {
      "rural": "Rural",
      "residencial": "Residencial",
      "urbana": "Urbana",
      "comercial": "Comercial",
      "industrial": "Industrial"
    }[aloj.zona] || (aloj.zona ? aloj.zona : "No especificada");

    const vistasTexto = {
      "mar": "Mar",
      "montaña": "Montaña",
      "ciudad": "Ciudad",
      "jardín": "Jardín",
      "ninguna": "Sin vistas especiales"
    }[aloj.vistas] || (aloj.vistas ? aloj.vistas : "No especificada");

    // Imagen principal
    let imgSrc = aloj.imagen_principal
      ? construirUrlImagen(aloj.imagen_principal)
      : `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/uploads/default.jpg`;

    const estrellas = construirTextoEstrellas(aloj.calificacion_promedio);
    const bloqueCalificacion = estrellas
      ? `<p class="calificacion">Calificación: ${estrellas}</p>`
      : "";

    const descripcionCompleta = textoPlano(aloj.descripcion || "Sin descripción disponible.");

    card.innerHTML = `
  <div class="card-portada">
    <img src="${imgSrc}" alt="Imagen principal de ${textoPlano(aloj.titulo)}" loading="lazy">
  </div>
  <div class="card-contenido">
    <h2>${aloj.titulo}</h2>
    <p class="ubicacion">Ubicación: ${formatearUbicacionCorta(aloj.ubicacion)}</p>
    <p class="precio">Desde: $${aloj.precio} COP/noche</p>
    ${bloqueCalificacion}

    <div class="descripcion-wrap">
      <p class="descripcion descripcion-collapsable" id="desc-visitante-${aloj.id}"><span class="descripcion-label">Descripción:</span> ${descripcionCompleta}</p>
      <button type="button" class="btn-descripcion-toggle" data-target="desc-visitante-${aloj.id}" aria-expanded="false">Leer más</button>
    </div>

    <p class="zona">Zona: ${zonaTexto}</p>
    <p class="cercania">Cercanía: ${aloj.cercania ? aloj.cercania : "No especificada"}</p>
    <p class="vistas">Vistas: ${vistasTexto}</p>

    <div class="servicios" id="servicios-visitante-${aloj.id}">
      <p>Servicios: Cargando...</p>
    </div>
    <div class="resenas" id="resenas-visitante-${aloj.id}">
      <p>Reseñas: Cargando...</p>
    </div>
    <div class="galeria" id="galeria-visitante-${aloj.id}">
      <p>Cargando imágenes...</p>
    </div>

    <div class="card-acciones">
      <button type="button" class="btn-ver-detalles" data-alojamiento-id="${aloj.id}">Ver detalles</button>
      <a href="#" class="politicas-link" data-alojamiento-id="${aloj.id}">Políticas de reserva y cancelación</a>
    </div>
  </div>
`;

    fragment.appendChild(card);

    // Agregar event listener para el enlace de políticas
    const politicasLink = card.querySelector('.politicas-link');
    politicasLink.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarPoliticasModal(aloj.politicas || "No especificadas");
    });
  }

  contenedor.appendChild(fragment);

  const tareasDetalles = alojamientos.map((aloj) => async () => {
    await Promise.allSettled([
      cargarServiciosVisitante(aloj.id),
      cargarResumenResenasVisitante(aloj.id),
      cargarGaleriaVisitante(aloj.id)
    ]);
  });

  await ejecutarEnLotes(tareasDetalles);
}

// Función para aplicar filtros
async function aplicarFiltros() {
  const precioMinRaw = document.getElementById("filtro-precio-min").value;
  const precioMaxRaw = document.getElementById("filtro-precio-max").value;
  let precioMin = extraerNumeroPrecio(precioMinRaw);
  let precioMax = extraerNumeroPrecio(precioMaxRaw);
  const servicios = document.getElementById("filtro-servicios").value.toLowerCase();
  const ubicacion = document.getElementById("filtro-ubicacion").value.toLowerCase();
  const zona = document.getElementById("filtro-zona").value.toLowerCase();
  const cercania = document.getElementById("filtro-cercania").value.toLowerCase();
  const vistas = document.getElementById("filtro-vistas").value.toLowerCase();
  const calificacion = Number(document.getElementById("filtro-calificacion").value || 0);

  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    const aux = precioMin;
    precioMin = precioMax;
    precioMax = aux;
    const inputMin = document.getElementById("filtro-precio-min");
    const inputMax = document.getElementById("filtro-precio-max");
    if (inputMin) inputMin.value = FORMATEADOR_PRECIO.format(precioMin);
    if (inputMax) inputMax.value = FORMATEADOR_PRECIO.format(precioMax);
  }

  let alojamientosFiltrados = alojamientosGlobales.filter(aloj => {
    // Filtro por precio
    if (precioMin !== null && aloj.precio < precioMin) {
      return false;
    }
    if (precioMax !== null && aloj.precio > precioMax) {
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

    // Filtro por calificación mínima según estrellas seleccionadas
    const calificacionAlojamiento = Number(aloj.calificacion_promedio ?? aloj.calificacion ?? 0);
    if (calificacion > 0 && (!Number.isFinite(calificacionAlojamiento) || calificacionAlojamiento < calificacion)) {
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
  const termino = String(serviciosBuscados || "").toLowerCase().trim();
  if (!termino) return alojamientos;

  const resultados = await Promise.allSettled(
    alojamientos.map(async (aloj) => {
      const servicios = await fetchJsonConCache(
        `servicios:${aloj.id}`,
        `${API_URL}/alojamientos/${aloj.id}/servicios`,
        cacheDatos.servicios
      );

      const coincide = Array.isArray(servicios)
        && servicios.some((s) => String(s?.nombre || "").toLowerCase().includes(termino));

      return coincide ? aloj : null;
    })
  );

  return resultados
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
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
    const imagenes = await fetchJsonConCache(
      `imagenes:${alojamientoId}`,
      `${API_URL}/alojamientos/${alojamientoId}/imagenes`,
      cacheDatos.imagenes
    );

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
      <img src="${url}" class="img-lightbox-trigger" data-lightbox-src="${url}" style="cursor:pointer;">
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
    const servicios = await fetchJsonConCache(
      `servicios:${alojamientoId}`,
      `${API_URL}/alojamientos/${alojamientoId}/servicios`,
      cacheDatos.servicios
    );

    contenedor.innerHTML = "";
    if (!Array.isArray(servicios) || servicios.length === 0) {
      contenedor.innerHTML = `<p>Servicios: No especificados</p>`;
      return;
    }

    const serviciosTexto = servicios.map(s => s.nombre).join(", ");
    contenedor.innerHTML = `<p>Servicios: ${serviciosTexto}</p>`;
  } catch (error) {
    console.error("Error cargando servicios visitante", error);
    contenedor.innerHTML = "<p>Servicios: Error cargando</p>";
  }
}



// Refresco automático cada 5 segundos para ver cambios en tiempo real
/*setInterval(() => {
  cargarAlojamientosVisitante();
}, 5000);
*/

document.addEventListener("DOMContentLoaded", () => {
  cargarAlojamientosVisitante();
  iniciarRefrescoAutomaticoAlojamientos();
  configurarInputsPrecio();

  // Estrellas interactivas
  const estrellasContainer = document.getElementById("filtroEstrellas");
  const inputCalificacion = document.getElementById("filtro-calificacion");
  const labelEstrellas = document.getElementById("filtroEstrellasLabel");

  if (estrellasContainer) {
    const estrellas = estrellasContainer.querySelectorAll(".estrella");

    function pintarEstrellas(valor) {
      estrellas.forEach(e => {
        e.classList.toggle("activa", Number(e.dataset.val) <= valor);
      });
    }

    estrellasContainer.addEventListener("mouseover", e => {
      const btn = e.target.closest(".estrella");
      if (btn) pintarEstrellas(Number(btn.dataset.val));
    });

    estrellasContainer.addEventListener("mouseleave", () => {
      pintarEstrellas(Number(inputCalificacion?.value || 0));
    });

    estrellasContainer.addEventListener("click", e => {
      const btn = e.target.closest(".estrella");
      if (!btn) return;
      const val = Number(btn.dataset.val);
      const actual = Number(inputCalificacion?.value || 0);
      // clic sobre la misma estrella → deseleccionar
      const nuevo = actual === val ? 0 : val;
      if (inputCalificacion) inputCalificacion.value = nuevo || "";
      pintarEstrellas(nuevo);
      if (labelEstrellas) labelEstrellas.textContent = nuevo ? `${nuevo} estrella${nuevo !== 1 ? "s" : ""}` : "Cualquiera";
      aplicarFiltros();
    });
  }

  // Agregar listeners a los botones de filtros
  const btnFiltrar = document.getElementById("btnFiltrar");
  const btnLimpiar = document.getElementById("btnLimpiar");

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", aplicarFiltros);
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      // Resetear estrellas al limpiar
      if (inputCalificacion) inputCalificacion.value = "";
      if (estrellasContainer) estrellasContainer.querySelectorAll(".estrella").forEach(e => e.classList.remove("activa"));
      if (labelEstrellas) labelEstrellas.textContent = "Cualquiera";
      limpiarFiltros();
    });
  }

  // Opcional: Aplicar filtros cuando se presiona Enter en los inputs
  const inputs = document.querySelectorAll(".filtro-item input, .filtro-item select, .filtro-precio-campo input");
  inputs.forEach(input => {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        aplicarFiltros();
      }
    });
  });

  document.addEventListener("click", (e) => {
    const boton = e.target.closest(".btn-descripcion-toggle");
    if (!boton) return;

    const objetivoId = boton.dataset.target;
    const descripcion = document.getElementById(objetivoId);
    if (!descripcion) return;

    const expandida = descripcion.classList.toggle("expandida");
    boton.textContent = expandida ? "Leer menos" : "Leer más";
    boton.setAttribute("aria-expanded", String(expandida));
  });

  document.addEventListener("click", (e) => {
    const botonDetalle = e.target.closest(".btn-ver-detalles");
    if (botonDetalle) {
      const id = Number(botonDetalle.dataset.alojamientoId);
      if (Number.isFinite(id) && id > 0) {
        verDetalles(id);
      }
      return;
    }

    const imagenLightbox = e.target.closest(".img-lightbox-trigger");
    if (imagenLightbox) {
      const src = imagenLightbox.dataset.lightboxSrc;
      if (src) {
        abrirLightbox(src);
      }
      return;
    }

    const botonResena = e.target.closest(".btn-ver-resena-completa");
    if (botonResena) {
      const encoded = botonResena.getAttribute("data-resena-completa") || "";
      const texto = encoded ? decodeURIComponent(encoded) : "Sin comentarios";
      mostrarModalResenaCompleta(texto);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      cargarAlojamientosVisitante();
    }
  });
});

window.addEventListener("beforeunload", () => {
  if (intervaloRefrescoAlojamientos) {
    clearInterval(intervaloRefrescoAlojamientos);
  }
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
        : `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/uploads/default.jpg`;

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
  window.location.href = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/detalles_alojamiento/detalles.html?id=${id}`;
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
    const data = await fetchJsonConCache(
      `resenas:${alojamientoId}`,
      `${API_URL}/resenas/alojamiento/${alojamientoId}`,
      cacheDatos.resenas
    );

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

    const conComentario = reseñasValidas.filter((item) => String(item?.comentario || "").trim().length > 0);
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
    const totalResenasMostrar = usuariosUnicos.size > 0 ? usuariosUnicos.size : conComentario.length;
    const totalResenasTexto = compactarTotalResenas(totalResenasMostrar);
    const etiquetaResena = totalResenasMostrar === 1 ? "reseña" : "reseñas";

    const ultimaConComentario = reseñasValidas.find((item) => String(item?.comentario || "").trim().length > 0);
    const encabezado = promedio
      ? `<p>${totalResenasTexto} ${etiquetaResena} | Promedio: ${promedio}/5</p>`
      : `<p>${totalResenasTexto} ${etiquetaResena}</p>`;
    const resumenComentario = ultimaConComentario
      ? construirResumenResena(ultimaConComentario.comentario, 110)
      : { resumen: "", completo: "", truncado: false };
    const comentario = ultimaConComentario
      ? `<p>“${resumenComentario.resumen || resumirTextoResena(ultimaConComentario.comentario, 110)}”</p>
         ${resumenComentario.truncado
           ? `<button type="button" class="btn-ver-resena-completa" data-resena-completa="${encodeURIComponent(resumenComentario.completo)}">Ver más</button>`
           : ""
         }`
      : "";

    contenedor.innerHTML = `${encabezado}${comentario}`;
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "";
  }
}