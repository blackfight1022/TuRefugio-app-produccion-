const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;
const id = new URLSearchParams(window.location.search).get("id");

let habitacionesGlobal = [];
let serviciosAlojamientoGlobal = [];
const cacheServiciosHabitacion = new Map();
let alojamientoActual = null;
let habitacionSeleccionada = null;
let serviciosSeleccionados = [];
let timerActualizacionDetalle = null;
let proximaActualizacionDetalleAt = null;
let streamHabitaciones = null;
let timerRefrescoSseHabitaciones = null;

function parsearFechaSistema(fechaTexto) {
  if (!fechaTexto) return null;
  const texto = String(fechaTexto).trim();
  const normalizada = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? `${texto}T12:00:00`
    : texto.replace(' ', 'T');
  const fecha = new Date(normalizada);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function programarActualizacionDetallePuntual() {
  if (timerActualizacionDetalle) {
    clearTimeout(timerActualizacionDetalle);
    timerActualizacionDetalle = null;
  }

  proximaActualizacionDetalleAt = null;
  const ahora = Date.now();
  let msMin = null;

  habitacionesGlobal.forEach((h) => {
    const estado = String(h?.estado || '').toLowerCase();
    const candidata =
      estado === 'ocupada'
        ? (h?.ocupada_hasta || h?.proxima_disponibilidad)
        : (estado === 'mantenimiento'
          ? (h?.mantenimiento_hasta || h?.proxima_disponibilidad)
          : (estado === 'limpieza'
            ? (h?.limpieza_hasta || h?.proxima_disponibilidad)
            : null));

    const fecha = parsearFechaSistema(candidata);
    if (!fecha) return;

    const delta = fecha.getTime() - ahora;
    if (delta <= 0) {
      msMin = 0;
      return;
    }
    if (msMin === null || delta < msMin) msMin = delta;
  });

  if (msMin === null) return;

  const espera = Math.max(1000, msMin + 1200);
  proximaActualizacionDetalleAt = ahora + espera;
  timerActualizacionDetalle = setTimeout(async () => {
    if (document.hidden) return;
    try {
      await cargarHabitaciones();
    } catch (error) {
      console.error("Error en actualización puntual de detalle:", error);
    }
  }, espera);
}

function hayFiltrosHabitacionesActivos() {
  const capacidad = String(document.getElementById("filtro-capacidad")?.value || "").trim();
  const precioMin = String(document.getElementById("filtro-precio-min")?.value || "").trim();
  const precioMax = String(document.getElementById("filtro-precio-max")?.value || "").trim();
  const servicios = String(document.getElementById("filtro-servicios")?.value || "").trim();
  return Boolean(capacidad || precioMin || precioMax || servicios);
}

async function refrescarHabitacionesPorEvento() {
  await cargarHabitaciones();
  if (hayFiltrosHabitacionesActivos()) {
    await aplicarFiltrosDetail();
  }
}

function conectarStreamHabitaciones() {
  if (typeof EventSource === "undefined") return;
  if (!id) return;

  if (streamHabitaciones) {
    streamHabitaciones.close();
    streamHabitaciones = null;
  }

  const streamUrl = `${API_URL}/habitaciones/stream/alojamiento/${id}`;
  streamHabitaciones = new EventSource(streamUrl);

  streamHabitaciones.addEventListener("habitaciones_actualizadas", () => {
    if (timerRefrescoSseHabitaciones) {
      clearTimeout(timerRefrescoSseHabitaciones);
    }

    timerRefrescoSseHabitaciones = setTimeout(() => {
      refrescarHabitacionesPorEvento().catch((error) => {
        console.error("Error refrescando habitaciones por SSE:", error);
      });
      timerRefrescoSseHabitaciones = null;
    }, 180);
  });

  streamHabitaciones.onerror = () => {};
}

const CATEGORIAS_SERVICIOS = [
  { nombre: "Conectividad y Tecnologia", keywords: ["wifi", "tv", "smart", "netflix", "streaming", "escritorio", "usb", "aire acondicionado", "calefaccion", "alexa", "google home", "cable"] },
  { nombre: "Cocina y Alimentacion", keywords: ["cocina", "nevera", "refrigerador", "microondas", "cafetera", "tetera", "vajilla", "utensilios", "minibar", "desayuno", "room service"] },
  { nombre: "Comodidad y Mobiliario", keywords: ["cama", "sofa", "armario", "closet", "blackout", "ropa de cama", "toallas", "almohadas", "balcon", "vista"] },
  { nombre: "Bano y Aseo", keywords: ["bano", "ducha", "banera", "secador", "aseo", "agua caliente", "papel higienico", "lavadora", "secadora"] },
  { nombre: "Bienestar y Relax", keywords: ["masaje", "spa", "jacuzzi", "sauna", "piscina", "gimnasio", "aromaterapia"] },
  { nombre: "Mascotas", keywords: ["mascota", "pet", "comedero", "cama para mascotas", "cuidado"] },
  { nombre: "Seguridad", keywords: ["cerradura", "caja fuerte", "camara", "detector de humo", "extintor", "recepcion"] },
  { nombre: "Transporte y Acceso", keywords: ["parqueadero", "check-in", "aeropuerto", "bicicleta", "discapacitados", "ascensor"] },
  { nombre: "Limpieza y Servicios Incluidos", keywords: ["limpieza", "sabanas", "lavanderia", "plancha"] },
  { nombre: "Entretenimiento", keywords: ["videojuego", "juegos", "libros", "bbq"] }
];

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectarCategoriaServicio(nombreServicio) {
  const nombre = normalizarTexto(nombreServicio);
  for (const categoria of CATEGORIAS_SERVICIOS) {
    if (categoria.keywords.some((kw) => nombre.includes(normalizarTexto(kw)))) {
      return categoria.nombre;
    }
  }
  return "General";
}

function obtenerValorServicio(servicio) {
  const valor = servicio?.valor_adicional ?? servicio?.valor ?? servicio?.precio ?? servicio?.costo ?? null;
  const num = Number(valor);
  return Number.isFinite(num) ? num : null;
}

function descomponerUbicacion(ubicacionRaw) {
  const raw = String(ubicacionRaw || "").trim();
  const linkMatch = raw.match(/https?:\/\/[^\s]+/i);
  const linkGPS = linkMatch ? linkMatch[0].replace(/,+$/, "") : "";

  const textoSinLink = linkMatch
    ? raw.replace(linkMatch[0], "").replace(/^[,\s]+|[,\s]+$/g, "")
    : raw;

  const textos = textoSinLink
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^lat\s*:/i.test(p) && !/^lng\s*:/i.test(p))
    .filter((p) => !/^-?\d+(\.\d+)?$/.test(p));

  const ciudad = textos[0] || "";
  const region = textos[1] || "";
  const direccion = textos.slice(2).join(", ");

  return {
    ciudad,
    region,
    direccion,
    linkGPS,
    ubicacionCorta: [ciudad, region].filter(Boolean).join(", ")
  };
}

function obtenerDestinoNavegacion(infoUbicacion) {
  if (infoUbicacion.linkGPS) {
    try {
      const url = new URL(infoUbicacion.linkGPS);
      const q = url.searchParams.get("q") || url.searchParams.get("query");
      if (q) return q;
    } catch (_) {
      const match = infoUbicacion.linkGPS.match(/q=([^&]+)/i);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
  }

  return [infoUbicacion.ciudad, infoUbicacion.region, infoUbicacion.direccion]
    .filter(Boolean)
    .join(", ");
}

function construirWhatsAppUrl(telefono) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return "";
  const numeroConPais = digitos.length === 10 ? `57${digitos}` : digitos;
  return `https://wa.me/${numeroConPais}`;
}

async function cargarDetalle() {
  const res = await fetch(API_URL + "/alojamientos");
  const data = await res.json();
  const a = data.find((x) => x.id == id);

  if (!a) return;
  alojamientoActual = a;

  const infoUbicacion = descomponerUbicacion(a.ubicacion);
  const destinoNavegacion = obtenerDestinoNavegacion(infoUbicacion);
  const linkComoLlegar = destinoNavegacion
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinoNavegacion)}&travelmode=driving`
    : "";

  document.getElementById("titulo").textContent = String(a.titulo || "").toUpperCase();
  document.getElementById("ubicacion").innerHTML = `
    📍 ${infoUbicacion.ubicacionCorta || "Ubicacion no especificada"}
    ${linkComoLlegar ? `<a href="${linkComoLlegar}" target="_blank" rel="noopener noreferrer" class="link-como-llegar">🧭 Como llegar</a>` : ""}
  `;

  const anfitrionRes = await fetch(API_URL + "/auth/usuarios/" + a.id_anfitrion);
  const anfitrion = await anfitrionRes.json();

  const direccionAlojamiento = infoUbicacion.direccion || anfitrion.direccion || "Direccion no especificada";
  const telefonoAnfitrion = anfitrion.telefono || "";
  const correoAnfitrion = anfitrion.correo || "Correo no especificado";
  const whatsappUrl = construirWhatsAppUrl(telefonoAnfitrion);

  document.getElementById("contacto").innerHTML = `
    📍 ${direccionAlojamiento} <br>
    📞 ${telefonoAnfitrion || "Telefono no especificado"}
    ${whatsappUrl ? `<a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="link-whatsapp" title="Escribir por WhatsApp">🟢 WhatsApp</a>` : ""}
    <br>
    ✉️ ${correoAnfitrion}
  `;

  document.getElementById("mapa").src = destinoNavegacion
    ? "https://www.google.com/maps?q=" + encodeURIComponent(destinoNavegacion) + "&output=embed"
    : "";

  await Promise.all([cargarGaleria(), cargarHabitaciones(), cargarServiciosAlojamiento()]);
}

async function cargarGaleria() {
  const res = await fetch(API_URL + "/alojamientos/" + id + "/imagenes");
  const imgs = await res.json();

  const cont = document.getElementById("galeria");
  cont.innerHTML = "";

  imgs.forEach((i) => {
    const ruta = i.ruta.replace(/^public[\\/]/, "").replace(/\\/g, "/");
    const url = `${window.location.protocol}//${window.location.host}/${ruta}`;

    const img = document.createElement("img");
    img.src = url;
    img.onclick = () => abrirLightbox(url);
    cont.appendChild(img);
  });
}

async function obtenerServiciosHabitacion(idHabitacion) {
  if (cacheServiciosHabitacion.has(idHabitacion)) {
    return cacheServiciosHabitacion.get(idHabitacion);
  }

  try {
    const res = await fetch(API_URL + "/habitaciones/" + idHabitacion + "/servicios");
    const servicios = res.ok ? await res.json() : [];
    const lista = Array.isArray(servicios) ? servicios : [];
    cacheServiciosHabitacion.set(idHabitacion, lista);
    return lista;
  } catch (_) {
    return [];
  }
}

async function cargarHabitaciones() {
  const res = await fetch(API_URL + "/habitaciones/alojamiento/" + id);
  const habs = await res.json();
  habitacionesGlobal = Array.isArray(habs) ? habs : [];
  await renderHabitaciones(habitacionesGlobal);
  programarActualizacionDetallePuntual();
}

function formatearFechaDisponibilidad(fechaTexto, incluirHora = false) {
  if (!fechaTexto) return "Por definir";
  const texto = String(fechaTexto).trim();
  const normalizada = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? `${texto}T12:00:00`
    : texto.replace(' ', 'T');
  const fecha = new Date(normalizada);
  if (Number.isNaN(fecha.getTime())) return String(fechaTexto);
  const opciones = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  };
  if (incluirHora) {
    opciones.hour = "2-digit";
    opciones.minute = "2-digit";
  }
  return fecha.toLocaleString("es-CO", opciones);
}

function obtenerPlaceholderCanal() {
  return 'ejemplo@correo.com';
}

function toggleChecklistNotificacionHabitacion(idHabitacion) {
  const menu = document.getElementById(`menu-alerta-hab-${idHabitacion}`);
  if (!menu) return;
  menu.classList.toggle('visible');
}

function onCambioCanalNotificacionHabitacion(idHabitacion) {
  const canal = document.getElementById(`canal-alerta-hab-${idHabitacion}`);
  const destino = document.getElementById(`destino-alerta-hab-${idHabitacion}`);
  if (!canal || !destino) return;
  destino.placeholder = obtenerPlaceholderCanal(canal.value);
  destino.value = '';
}

function mostrarFeedbackAlertaDisponibilidad(idHabitacion, mensaje, tipo = 'ok') {
  const feedback = document.getElementById(`feedback-alerta-hab-${idHabitacion}`);
  if (!feedback) return;
  feedback.className = `alerta-disponibilidad-feedback visible ${tipo === 'error' ? 'error' : 'ok'}`;
  feedback.textContent = mensaje;
}

async function registrarAlertaDisponibilidadHabitacion(idHabitacion, nombreHabitacion) {
  const canalEl = document.getElementById(`canal-alerta-hab-${idHabitacion}`);
  const destinoEl = document.getElementById(`destino-alerta-hab-${idHabitacion}`);
  if (!canalEl || !destinoEl) return;

  const canal = String(canalEl.value || '').trim().toLowerCase();
  const destinatario = String(destinoEl.value || '').trim();

  if (canal !== 'email') {
    mostrarFeedbackAlertaDisponibilidad(idHabitacion, 'Selecciona un canal válido de notificación.', 'error');
    return;
  }

  if (!destinatario) {
    mostrarFeedbackAlertaDisponibilidad(idHabitacion, 'Debes indicar el medio de contacto para la notificación.', 'error');
    return;
  }

  const res = await fetch(`${API_URL}/habitaciones/${idHabitacion}/alerta-disponibilidad`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ canal, destinatario })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    mostrarFeedbackAlertaDisponibilidad(idHabitacion, data.error || 'No se pudo registrar la alerta de disponibilidad.', 'error');
    return;
  }

  mostrarFeedbackAlertaDisponibilidad(idHabitacion, `Te notificaremos por correo electrónico cuando ${nombreHabitacion} esté disponible.`, 'ok');
  const menu = document.getElementById(`menu-alerta-hab-${idHabitacion}`);
  if (menu) menu.classList.remove('visible');
}

function construirDetalleEstadoHabitacion(h) {
  const estado = String(h.estado || "disponible").toLowerCase();
  const proxima = formatearFechaDisponibilidad(h.proxima_disponibilidad);

  if (estado === "ocupada") {
    return `🔒 Habitación reservada. Próxima disponibilidad: <strong>${proxima}</strong>.`;
  }

  if (estado === "mantenimiento") {
    const proximaMantenimiento = formatearFechaDisponibilidad(h.proxima_disponibilidad || h.mantenimiento_hasta, false);
    const estimado = Number(h.mantenimiento_estimado_horas || 0);
    const textoEstimado = estimado > 0
      ? ` Tiempo estimado de liberación: ${estimado.toFixed(1)} hora(s).`
      : "";
    return `🛠 Habitación en mantenimiento. Próxima disponibilidad: <strong>${proximaMantenimiento}</strong>.${textoEstimado}`;
  }

  if (estado === "limpieza") {
    return `🧹 Habitación en limpieza . Próxima disponibilidad: <strong>${proxima}</strong>.`;
  }

  return "✅ Habitación disponible para reservar.";
}

async function renderHabitaciones(habs) {
  const cont = document.getElementById("habitaciones");
  cont.innerHTML = "";

  if (habitacionSeleccionada) {
    const vigente = habitacionesGlobal.find((item) => Number(item.id) === Number(habitacionSeleccionada.id));
    const estadoVigente = String(vigente?.estado || "disponible").toLowerCase();
    if (vigente && (estadoVigente === "ocupada" || estadoVigente === "mantenimiento")) {
      habitacionSeleccionada = null;
      actualizarResumenReserva();
    }
  }

  for (const h of habs) {
    const serviciosHab = await obtenerServiciosHabitacion(h.id);
    const nombresServicios = serviciosHab.length
      ? serviciosHab.map((s) => s.nombre).join(", ")
      : "Sin servicios asignados";

    const estado = String(h.estado || "disponible").toLowerCase();
    const bloqueada = estado === "ocupada" || estado === "mantenimiento";
    const bloqueadaFinal = bloqueada || estado === "limpieza";
    const claseEstado = estado === "ocupada"
      ? "estado-ocupada"
      : (estado === "mantenimiento"
        ? "estado-mantenimiento"
        : (estado === "limpieza" ? "estado-limpieza" : "estado-disponible"));
    const claseCardBloqueo = estado === "ocupada"
      ? " reservada"
      : (estado === "mantenimiento" ? " mantenimiento" : (estado === "limpieza" ? " limpieza" : ""));
    const detalleEstado = construirDetalleEstadoHabitacion(h);
    const nombreData = encodeURIComponent(String(h.nombre || ''));
    const checklistNotificacion = bloqueadaFinal
      ? `
        <div class="alerta-disponibilidad-wrap">
          <button class="btn-alerta-disponibilidad" type="button" data-toggle-alerta-hab-id="${h.id}">☑️ ¿Deseas ser notificado cuando esta habitación esté disponible?</button>
          <div id="menu-alerta-hab-${h.id}" class="alerta-disponibilidad-menu">
            <label for="canal-alerta-hab-${h.id}">Medio de notificación</label>
            <select id="canal-alerta-hab-${h.id}" class="js-canal-alerta-hab" data-alerta-hab-id="${h.id}">
              <option value="email">Correo electrónico</option>
            </select>
            <label for="destino-alerta-hab-${h.id}">Destino</label>
            <input id="destino-alerta-hab-${h.id}" type="text" placeholder="ejemplo@correo.com" />
            <button class="btn-confirmar-alerta" type="button" data-registrar-alerta-hab-id="${h.id}" data-registrar-alerta-hab-nombre="${nombreData}">Guardar notificación</button>
            <div id="feedback-alerta-hab-${h.id}" class="alerta-disponibilidad-feedback"></div>
          </div>
        </div>`
      : '';

    const div = document.createElement("div");
    div.className = `card-hab${claseCardBloqueo}${habitacionSeleccionada && habitacionSeleccionada.id === h.id ? " seleccionada" : ""}`;
    div.innerHTML = `
      <h4>${h.nombre}</h4>
      <span class="estado-hab ${claseEstado}">${estado}</span>
      <p>👥 Capacidad: ${h.capacidad} personas</p>
      <p>💰 Valor por noche: $${Number(h.precio || 0).toLocaleString("es-CO")}</p>
      <p>🛎️ Servicios: ${nombresServicios}</p>
      <p class="estado-detalle ${estado === 'ocupada' ? 'ocupada' : (estado === 'mantenimiento' ? 'mantenimiento' : (estado === 'limpieza' ? 'limpieza' : ''))}">${detalleEstado}</p>
      <div id="hab-${h.id}" class="hab-imagenes"></div>
      <button class="btn-seleccionar-habitacion" type="button" ${bloqueadaFinal ? 'disabled' : ''} data-seleccionar-habitacion-id="${h.id}" data-seleccionar-habitacion-nombre="${nombreData}" data-seleccionar-habitacion-precio="${Number(h.precio || 0)}" data-seleccionar-habitacion-capacidad="${Number(h.capacidad || 0)}">
        ${bloqueadaFinal ? "No disponible en este momento" : (habitacionSeleccionada && habitacionSeleccionada.id === h.id ? "✅ Habitación seleccionada" : "Seleccionar habitación")}
      </button>
      ${checklistNotificacion}
    `;

    cont.appendChild(div);
    await cargarImgHab(h.id);
  }
}

async function cargarImgHab(idHab) {
  const res = await fetch(API_URL + "/habitaciones/" + idHab + "/imagenes");
  const imgs = await res.json();
  const cont = document.getElementById("hab-" + idHab);
  if (!cont) return;

  imgs.forEach((i) => {
    const ruta = i.ruta.replace(/^public[\\/]/, "").replace(/\\/g, "/");
    const url = `${window.location.protocol}//${window.location.host}/${ruta}`;

    const img = document.createElement("img");
    img.src = url;
    img.onclick = () => abrirLightbox(url);
    cont.appendChild(img);
  });
}

async function aplicarFiltrosDetail() {
  const capacidad = document.getElementById("filtro-capacidad").value;
  const precioMin = document.getElementById("filtro-precio-min").value;
  const precioMax = document.getElementById("filtro-precio-max").value;
  const servicios = document.getElementById("filtro-servicios").value.toLowerCase().trim();

  let filtradas = habitacionesGlobal.filter((hab) => {
    if (capacidad && hab.capacidad < parseInt(capacidad, 10)) return false;
    if (precioMin && hab.precio < parseInt(precioMin, 10)) return false;
    if (precioMax && hab.precio > parseInt(precioMax, 10)) return false;
    return true;
  });

  if (servicios) {
    const terminos = servicios.split(",").map((s) => s.trim()).filter(Boolean);
    const conServicios = [];

    for (const hab of filtradas) {
      const lista = await obtenerServiciosHabitacion(hab.id);
      const nombres = lista.map((s) => normalizarTexto(s.nombre));
      const coincide = terminos.some((t) => nombres.some((n) => n.includes(normalizarTexto(t))));
      if (coincide) conServicios.push(hab);
    }

    filtradas = conServicios;
  }

  await renderHabitaciones(filtradas);
}

async function limpiarFiltrosDetail() {
  document.getElementById("filtro-capacidad").value = "";
  document.getElementById("filtro-precio-min").value = "";
  document.getElementById("filtro-precio-max").value = "";
  document.getElementById("filtro-servicios").value = "";
  await renderHabitaciones(habitacionesGlobal);
}

function seleccionarHabitacion(idHabitacion, nombreHabitacion, precioHabitacion, capacidadHabitacion) {
  const habitacionActual = habitacionesGlobal.find((h) => Number(h.id) === Number(idHabitacion));
  const estado = String(habitacionActual?.estado || 'disponible').toLowerCase();
  if (estado === 'ocupada' || estado === 'mantenimiento' || estado === 'limpieza') {
    const disponibilidad = formatearFechaDisponibilidad(habitacionActual?.proxima_disponibilidad);
    alert(`⚠️ Esta habitación no se puede reservar por ahora. Estado: ${estado}. Próxima disponibilidad: ${disponibilidad}.`);
    return;
  }

  habitacionSeleccionada = {
    id: idHabitacion,
    nombre: nombreHabitacion,
    precio: Number(precioHabitacion || 0),
    capacidad: Number(capacidadHabitacion || 0)
  };
  renderHabitaciones(habitacionesGlobal);
  actualizarResumenReserva();
}

function inicializarFiltrosHabitaciones() {
  const btnFiltrar = document.getElementById("btnFiltrar");
  const btnLimpiar = document.getElementById("btnLimpiar");
  const inputs = [
    document.getElementById("filtro-capacidad"),
    document.getElementById("filtro-precio-min"),
    document.getElementById("filtro-precio-max"),
    document.getElementById("filtro-servicios")
  ];

  if (btnFiltrar) btnFiltrar.addEventListener("click", aplicarFiltrosDetail);
  if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFiltrosDetail);

  inputs.forEach((input) => {
    if (!input) return;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        aplicarFiltrosDetail();
      }
    });
  });
}

async function cargarServiciosAlojamiento() {
  try {
    const res = await fetch(API_URL + "/alojamientos/" + id + "/servicios-adicionales");
    const servicios = await res.json();

    serviciosAlojamientoGlobal = Array.isArray(servicios)
      ? servicios.map((s) => ({
          ...s,
          categoria: s.categoria || detectarCategoriaServicio(s.nombre),
          valorNumerico: obtenerValorServicio(s)
        }))
      : [];

    llenarOpcionesCategorias();
    renderServiciosAlojamiento(serviciosAlojamientoGlobal);
    actualizarResumenReserva();
  } catch (error) {
    console.error(error);
    document.getElementById("listaServiciosAlojamiento").innerHTML = "<p>No fue posible cargar servicios del alojamiento.</p>";
  }
}

function llenarOpcionesCategorias() {
  const select = document.getElementById("filtro-servicio-categoria");
  if (!select) return;

  const categorias = Array.from(new Set(serviciosAlojamientoGlobal.map((s) => s.categoria))).sort();
  select.innerHTML = '<option value="">Todas las categorias</option>';
  categorias.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function renderServiciosAlojamiento(servicios) {
  const cont = document.getElementById("listaServiciosAlojamiento");
  if (!cont) return;

  if (!servicios.length) {
    cont.innerHTML = "<p>No hay servicios disponibles para este alojamiento.</p>";
    return;
  }

  const grupos = servicios.reduce((acc, servicio) => {
    const clave = servicio.categoria || "General";
    if (!acc[clave]) acc[clave] = [];
    acc[clave].push(servicio);
    return acc;
  }, {});

  cont.innerHTML = Object.entries(grupos).map(([categoria, items]) => {
    const opciones = items.map((s) => {
      const valor = s.valorNumerico !== null ? s.valorNumerico : 0;
      const checked = serviciosSeleccionados.some((sel) => sel.id === s.id) ? "checked" : "";
      return `
        <div class="servicio-opcion">
          <label>
            <input type="checkbox" class="js-servicio-adicional-checkbox" data-servicio-id="${s.id}" ${checked}>
            <span>${s.nombre}</span>
          </label>
          <strong>$${Number(valor).toLocaleString("es-CO")}</strong>
        </div>
      `;
    }).join("");

    return `
      <div class="servicio-card">
        <h4>${categoria}</h4>
        ${opciones}
      </div>
    `;
  }).join("");
}

function toggleServicioAdicional(idServicio) {
  const servicio = serviciosAlojamientoGlobal.find((item) => item.id === idServicio);
  if (!servicio) return;

  const existente = serviciosSeleccionados.find((item) => item.id === idServicio);
  if (existente) {
    serviciosSeleccionados = serviciosSeleccionados.filter((item) => item.id !== idServicio);
  } else {
    serviciosSeleccionados.push(servicio);
  }

  actualizarResumenReserva();
}

function actualizarResumenReserva() {
  const resumen = document.getElementById("resumenReserva");
  if (!resumen) return;

  const totalServicios = serviciosSeleccionados.reduce((acc, item) => acc + (item.valorNumerico || 0), 0);
  const valorHabitacion = habitacionSeleccionada ? habitacionSeleccionada.precio : 0;
  const total = valorHabitacion + totalServicios;
  const serviciosTexto = serviciosSeleccionados.length
    ? serviciosSeleccionados.map((item) => item.nombre).join(", ")
    : "Ninguno";

  resumen.innerHTML = `
    <h3>📌 Resumen de selección</h3>
    <p>🛏️ Habitación: ${habitacionSeleccionada ? `${habitacionSeleccionada.nombre} ($${habitacionSeleccionada.precio.toLocaleString("es-CO")})` : "No seleccionada"}</p>
    <p>🧩 Servicios elegidos: ${serviciosTexto}</p>
    <p>💰 Total servicios: $${totalServicios.toLocaleString("es-CO")}</p>
    <p><strong>💵 Total acumulado: $${total.toLocaleString("es-CO")}</strong></p>
  `;
}

function aplicarFiltroServiciosAlojamiento() {
  const texto = (document.getElementById("filtro-servicio-texto")?.value || "").toLowerCase().trim();
  const categoria = document.getElementById("filtro-servicio-categoria")?.value || "";
  const min = document.getElementById("filtro-servicio-valor-min")?.value;
  const max = document.getElementById("filtro-servicio-valor-max")?.value;

  const minNum = min !== "" ? Number(min) : null;
  const maxNum = max !== "" ? Number(max) : null;

  const filtrados = serviciosAlojamientoGlobal.filter((s) => {
    if (texto && !(String(s.nombre || "").toLowerCase().includes(texto) || String(s.categoria || "").toLowerCase().includes(texto))) {
      return false;
    }
    if (categoria && s.categoria !== categoria) {
      return false;
    }
    if (minNum !== null && (s.valorNumerico === null || s.valorNumerico < minNum)) {
      return false;
    }
    if (maxNum !== null && (s.valorNumerico === null || s.valorNumerico > maxNum)) {
      return false;
    }
    return true;
  });

  renderServiciosAlojamiento(filtrados);
}

function inicializarFiltrosServicios() {
  [
    document.getElementById("filtro-servicio-texto"),
    document.getElementById("filtro-servicio-categoria"),
    document.getElementById("filtro-servicio-valor-min"),
    document.getElementById("filtro-servicio-valor-max")
  ].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", aplicarFiltroServiciosAlojamiento);
    el.addEventListener("change", aplicarFiltroServiciosAlojamiento);
  });
}

function abrirLightbox(src) {
  const lb = document.createElement("div");
  lb.className = "lightbox";
  const img = document.createElement("img");
  img.src = src;
  lb.appendChild(img);
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}

function irReserva() {
  if (!habitacionSeleccionada) {
    alert("⚠️ Debes seleccionar una habitación antes de continuar a la reserva.");
    return;
  }

  const aceptoPoliticas = document.getElementById("aceptaPoliticasReserva")?.checked;
  if (!aceptoPoliticas) {
    alert("⚠️ Debes aceptar las politicas de reserva y cancelacion para continuar.");
    return;
  }

  const payload = {
    alojamientoId: id,
    alojamientoTitulo: alojamientoActual?.titulo || "",
    habitacion: habitacionSeleccionada,
    servicios: serviciosSeleccionados.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria || "General",
      valor: item.valorNumerico || 0
    }))
  };

  payload.totalServicios = payload.servicios.reduce((acc, item) => acc + item.valor, 0);
  payload.totalAcumulado = payload.habitacion.precio + payload.totalServicios;

  sessionStorage.setItem("resumenReservaTuRefugio", JSON.stringify(payload));
  window.location.href = `../reservar/reservar.html?alojamiento=${id}&habitacion=${habitacionSeleccionada.id}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  inicializarFiltrosHabitaciones();
  inicializarFiltrosServicios();

  const btnIrReserva = document.getElementById("btnIrReserva");
  if (btnIrReserva) {
    btnIrReserva.addEventListener("click", irReserva);
  }

  document.addEventListener("click", (e) => {
    const btnToggleAlerta = e.target.closest("[data-toggle-alerta-hab-id]");
    if (btnToggleAlerta) {
      const habitacionId = Number(btnToggleAlerta.dataset.toggleAlertaHabId);
      if (Number.isFinite(habitacionId)) {
        toggleChecklistNotificacionHabitacion(habitacionId);
      }
      return;
    }

    const btnRegistrarAlerta = e.target.closest("[data-registrar-alerta-hab-id]");
    if (btnRegistrarAlerta) {
      const habitacionId = Number(btnRegistrarAlerta.dataset.registrarAlertaHabId);
      const nombreHabitacion = decodeURIComponent(btnRegistrarAlerta.dataset.registrarAlertaHabNombre || "");
      if (Number.isFinite(habitacionId)) {
        registrarAlertaDisponibilidadHabitacion(habitacionId, nombreHabitacion);
      }
      return;
    }

    const btnSeleccionar = e.target.closest("[data-seleccionar-habitacion-id]");
    if (btnSeleccionar && !btnSeleccionar.disabled) {
      const idHabitacion = Number(btnSeleccionar.dataset.seleccionarHabitacionId);
      const nombreHabitacion = decodeURIComponent(btnSeleccionar.dataset.seleccionarHabitacionNombre || "");
      const precioHabitacion = Number(btnSeleccionar.dataset.seleccionarHabitacionPrecio || 0);
      const capacidadHabitacion = Number(btnSeleccionar.dataset.seleccionarHabitacionCapacidad || 0);
      if (Number.isFinite(idHabitacion)) {
        seleccionarHabitacion(idHabitacion, nombreHabitacion, precioHabitacion, capacidadHabitacion);
      }
    }
  });

  document.addEventListener("change", (e) => {
    const selectCanal = e.target.closest(".js-canal-alerta-hab");
    if (selectCanal) {
      const habitacionId = Number(selectCanal.dataset.alertaHabId);
      if (Number.isFinite(habitacionId)) {
        onCambioCanalNotificacionHabitacion(habitacionId);
      }
      return;
    }

    const checkboxServicio = e.target.closest(".js-servicio-adicional-checkbox");
    if (checkboxServicio) {
      const idServicio = Number(checkboxServicio.dataset.servicioId);
      if (Number.isFinite(idServicio)) {
        toggleServicioAdicional(idServicio);
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !proximaActualizacionDetalleAt) return;
    if (Date.now() < proximaActualizacionDetalleAt) return;
    cargarHabitaciones().catch((error) => console.error("Error actualizando detalle al volver a la pestaña:", error));
  });
  await cargarDetalle();
  conectarStreamHabitaciones();

  window.addEventListener("beforeunload", () => {
    if (streamHabitaciones) {
      streamHabitaciones.close();
      streamHabitaciones = null;
    }
    if (timerRefrescoSseHabitaciones) {
      clearTimeout(timerRefrescoSseHabitaciones);
      timerRefrescoSseHabitaciones = null;
    }
  });
});