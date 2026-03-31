// ======================================
// CONFIG
// ======================================
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
function construirUrlImagen(rutaOriginal) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/${normalizarRutaImagen(rutaOriginal)}`;
}
}

// Obtener ID desde URL
const params = new URLSearchParams(window.location.search);
const alojamientoId = params.get("id");

// ======================================
// INIT
// ======================================
document.addEventListener("DOMContentLoaded", () => {
  if (!alojamientoId) {
    alert("No se encontró el alojamiento");
    return;
  }

  cargarDetalleAlojamiento();
  cargarHabitaciones();
});

// ======================================
// CARGAR DETALLE ALOJAMIENTO
// ======================================
async function cargarDetalleAlojamiento() {
  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}`);
    const alojamiento = await res.json();

    const contenedor = document.getElementById("detalleAlojamiento");

    contenedor.innerHTML = `
      <div class="card-detalle">
        <h2>${alojamiento.titulo}</h2>
        <p>📍 ${alojamiento.ubicacion || "Sin ubicación"}</p>
        <p>💰 $${alojamiento.precio} / noche</p>
        <p>👥 Capacidad: ${alojamiento.capacidad_personas || "N/A"}</p>

        <div id="galeriaDetalle" class="galeria-detalle"></div>
      </div>
    `;

    cargarImagenesAlojamiento();
    cargarMapa(alojamiento.ubicacion);

  } catch (error) {
    console.error(error);
    alert("Error cargando alojamiento");
  }
}

// ======================================
// CARGAR IMÁGENES ALOJAMIENTO
// ======================================
async function cargarImagenesAlojamiento() {
  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/imagenes`);
    const imagenes = await res.json();

    const galeria = document.getElementById("galeriaDetalle");
    galeria.innerHTML = "";

    if (!imagenes.length) {
      galeria.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    imagenes.forEach(img => {
      const url = construirUrlImagen(img.ruta);

      const image = document.createElement("img");
      image.src = url;
      image.onclick = () => abrirLightbox(url);

      galeria.appendChild(image);
    });

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// CARGAR HABITACIONES
// ======================================
async function cargarHabitaciones() {
  try {
    const res = await fetch(`${API_URL}/habitaciones/alojamiento/${alojamientoId}`);
    const habitaciones = await res.json();

    const contenedor = document.getElementById("listaHabitaciones");
    contenedor.innerHTML = "";

    if (!habitaciones.length) {
      contenedor.innerHTML = "<p>No hay habitaciones</p>";
      return;
    }

    const visibles = habitaciones.filter(h => h.estado === "disponible" || !h.estado);
    if (!visibles.length) {
      contenedor.innerHTML = "<p>Por ahora no hay habitaciones disponibles en este alojamiento.</p>";
      return;
    }

    visibles.forEach(async hab => {
      const div = document.createElement("div");
      div.classList.add("card-habitacion");

      const imagen = await obtenerImagenHabitacion(hab.id);

      div.innerHTML = `
        <img src="${imagen}" onclick="abrirLightbox('${imagen}')">
        <h4>${hab.nombre}</h4>
        <p>👥 ${hab.capacidad} personas</p>
        <p>💰 $${hab.precio}</p>
        <p id="servicios-${hab.id}">Cargando servicios...</p>
        <button class="btn-reservar" onclick="irAReserva(${hab.id})">
          Reservar
        </button>
      `;

      contenedor.appendChild(div);

      cargarServiciosHabitacion(hab.id);
    });

  } catch (error) {
    console.error(error);
    alert("Error cargando habitaciones");
  }
}

// ======================================
// IMAGEN HABITACIÓN
// ======================================
async function obtenerImagenHabitacion(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/imagenes`);
    const imagenes = await res.json();

    if (!imagenes.length) {
      return "https://via.placeholder.com/300x200?text=Sin+imagen";
    }

    let principal = imagenes.find(img => img.principal === 1) || imagenes[0];

    return construirUrlImagen(principal.ruta);

  } catch (error) {
    return "https://via.placeholder.com/300x200?text=Error";
  }
}

// ======================================
// SERVICIOS HABITACIÓN
// ======================================
async function cargarServiciosHabitacion(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`);
    const servicios = await res.json();

    const contenedor = document.getElementById(`servicios-${habitacionId}`);

    if (!servicios.length) {
      contenedor.innerHTML = "❌ Sin servicios";
      return;
    }

    contenedor.innerHTML = servicios.map(s => `✔ ${s.nombre}`).join("<br>");

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// FILTRO POR CAPACIDAD
// ======================================
function filtrarHabitaciones() {
  const valor = document.getElementById("filtroCapacidad").value;
  const cards = document.querySelectorAll(".card-habitacion");

  cards.forEach(card => {
    const texto = card.innerText;
    const capacidad = parseInt(texto.match(/\d+/));

    if (!valor || capacidad >= valor) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

// ======================================
// LIGHTBOX
// ======================================
function abrirLightbox(src) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img");

  img.src = src;
  lightbox.style.display = "flex";
}

function cerrarLightbox() {
  document.getElementById("lightbox").style.display = "none";
}

// ======================================
// MAPA GOOGLE
// ======================================
function cargarMapa(ubicacion) {
  const mapa = document.getElementById("mapa");

  const url = `https://www.google.com/maps?q=${encodeURIComponent(ubicacion)}&output=embed`;

  mapa.innerHTML = `
    <iframe src="${url}" allowfullscreen loading="lazy"></iframe>
  `;
}

// ======================================
// RESERVA
// ======================================
function irAReserva(habitacionId) {
  window.location.href = `../reservas/reserva.html?habitacion=${habitacionId}&alojamiento=${alojamientoId}`;
}


// ======================================
// OBTENER ID DESDE URL
// ======================================
function obtenerId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// ======================================
// CARGAR DETALLES DEL ALOJAMIENTO
// ======================================
async function cargarDetalles() {
  const id = obtenerId();

  if (!id) {
    alert("Alojamiento no encontrado");
    return;
  }

  try {
    // 🔥 ALOJAMIENTO
    const res = await fetch(`${API_URL}/alojamientos/${id}`);
    const alojamiento = await res.json();

    // 🔥 IMÁGENES
    const resImg = await fetch(`${API_URL}/alojamientos/${id}/imagenes`);
    const imagenes = await resImg.json();

    mostrarAlojamiento(alojamiento, imagenes);

    // 🔥 HABITACIONES
    cargarHabitaciones(id);

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// MOSTRAR ALOJAMIENTO
// ======================================
function mostrarAlojamiento(alojamiento, imagenes) {

  const contenedor = document.getElementById("detalle-alojamiento");

  let imagenPrincipal = "";

  if (imagenes.length > 0) {
    let img = imagenes.find(i => i.principal === 1) || imagenes[0];

    imagenPrincipal = construirUrlImagen(img.ruta);
  }

  contenedor.innerHTML = `
    <div class="detalle-card">

      <img src="${imagenPrincipal}" class="detalle-img"
           onclick="abrirLightbox('${imagenPrincipal}')">

      <div class="detalle-info">
        <h2>${alojamiento.titulo}</h2>
        <p>📍 ${alojamiento.ubicacion || "Sin ubicación"}</p>
        <p>💰 $${alojamiento.precio} / noche</p>

        <p>📞 +57 300 000 0000</p>
        <p>📧 contacto@turefugio.com</p>

        <button onclick="reservar()">Reservar</button>
      </div>

    </div>
  `;

  // 🔥 MAPA
  cargarMapa(alojamiento.ubicacion);
}

// ======================================
// CARGAR HABITACIONES
// ======================================
async function cargarHabitaciones(alojamientoId) {

  try {
    const res = await fetch(`${API_URL}/habitaciones/alojamiento/${alojamientoId}`);
    const habitaciones = await res.json();

    const contenedor = document.getElementById("habitaciones-lista");
    contenedor.innerHTML = "";

    if (!habitaciones.length) {
      contenedor.innerHTML = "<p>No hay habitaciones disponibles</p>";
      return;
    }

    habitaciones.forEach(hab => {

      const card = document.createElement("div");
      card.className = "card-habitacion";

      card.innerHTML = `
        <h3>${hab.nombre}</h3>
        <p>👥 ${hab.capacidad} personas</p>
        <p>💰 $${hab.precio}</p>

        <div id="galeria-hab-${hab.id}" class="galeria"></div>
      `;

      contenedor.appendChild(card);

      cargarImagenesHabitacion(hab.id);
    });

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// IMÁGENES HABITACIÓN
// ======================================
async function cargarImagenesHabitacion(habitacionId) {

  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/imagenes`);
    const imagenes = await res.json();

    const contenedor = document.getElementById(`galeria-hab-${habitacionId}`);

    if (!contenedor) return;

    contenedor.innerHTML = "";

    imagenes.forEach(img => {

      const url = construirUrlImagen(img.ruta);

      const imagen = document.createElement("img");
      imagen.src = url;

      imagen.onclick = () => abrirLightbox(url);

      contenedor.appendChild(imagen);
    });

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// FILTRO POR CAPACIDAD
// ======================================
function filtrarHabitaciones() {

  const valor = document.getElementById("filtroCapacidad").value;

  const cards = document.querySelectorAll(".card-habitacion");

  cards.forEach(card => {

    const texto = card.innerText;

    if (!valor || texto.includes(valor)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }

  });
}

// ======================================
// MAPA GOOGLE
// ======================================
function cargarMapa(ubicacion) {

  const iframe = document.getElementById("mapa");

  if (!ubicacion) return;

  const url = `https://www.google.com/maps?q=${encodeURIComponent(ubicacion)}&output=embed`;

  iframe.src = url;
}

// ======================================
// LIGHTBOX
// ======================================
function abrirLightbox(src) {

  let lightbox = document.getElementById("lightbox");

  if (!lightbox) {

    lightbox = document.createElement("div");
    lightbox.id = "lightbox";

    Object.assign(lightbox.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.9)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "9999"
    });

    const img = document.createElement("img");

    Object.assign(img.style, {
      maxWidth: "90%",
      maxHeight: "90%",
      borderRadius: "10px"
    });

    lightbox.appendChild(img);

    lightbox.onclick = () => lightbox.style.display = "none";

    document.body.appendChild(lightbox);
  }

  lightbox.querySelector("img").src = src;
  lightbox.style.display = "flex";
}

// ======================================
// RESERVAR
// ======================================
function reservar() {

  const id = obtenerId();

  window.location.href = `reserva.html?id=${id}`;
}

// ======================================
// INIT
// ======================================
document.addEventListener("DOMContentLoaded", cargarDetalles);