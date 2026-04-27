let imagenesTemp = [];



// ======================================
// CONFIGURACIÓN BASE
// ======================================
// Hacer la URL de API dinámicamente para funcionar en cualquier dispositivo
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;
const token = localStorage.getItem("token");

// ======================================
// VALIDAR SESIÓN
// ======================================
if (!token) {
  alert("⚠️ Debes iniciar sesión");
  window.location.href = "../login/login.html";
}

// ======================================
// HEADERS
// ======================================
const headers = {
  "Content-Type": "application/json",
  "Authorization": "Bearer " + token
};

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

let graficaOcupacionRef = null;
const misAlojamientosIds = new Set();
const habitacionesEstadoCache = new Map();
let mantenimientoHabitacionSeleccionada = null;
let timerActualizacionHabitaciones = null;
let proximaActualizacionHabitacionesAt = null;
let intervaloCronometrosHabitaciones = null;
const CRONOMETRO_ESTADOS_KEY = 'cronometro_estados_habitaciones';
const CACHE_ALOJAMIENTOS_TTL_MS = 10000;
let cacheAlojamientosAnfitrion = {
  data: null,
  ts: 0,
  inFlight: null
};

function invalidarCacheAlojamientosAnfitrion() {
  cacheAlojamientosAnfitrion.data = null;
  cacheAlojamientosAnfitrion.ts = 0;
}

async function obtenerAlojamientosAnfitrion(force = false) {
  const ahora = Date.now();
  if (!force && Array.isArray(cacheAlojamientosAnfitrion.data)
    && (ahora - cacheAlojamientosAnfitrion.ts) < CACHE_ALOJAMIENTOS_TTL_MS) {
    return cacheAlojamientosAnfitrion.data;
  }

  if (cacheAlojamientosAnfitrion.inFlight) {
    return cacheAlojamientosAnfitrion.inFlight;
  }

  const promesa = (async () => {
    const res = await fetch(`${API_URL}/anfitrion/alojamientos`, { headers });
    if (manejarSesionExpirada(res)) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudieron cargar alojamientos.');
    }
    const lista = Array.isArray(data) ? data : [];
    cacheAlojamientosAnfitrion.data = lista;
    cacheAlojamientosAnfitrion.ts = Date.now();
    return lista;
  })().finally(() => {
    cacheAlojamientosAnfitrion.inFlight = null;
  });

  cacheAlojamientosAnfitrion.inFlight = promesa;
  return promesa;
}

function parsearFechaSistema(fechaTexto) {
  if (!fechaTexto) return null;
  const texto = String(fechaTexto).trim();
  const normalizada = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? `${texto}T12:00:00`
    : texto.replace(' ', 'T');
  const fecha = new Date(normalizada);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function formatearFechaHoraInputLocal(fechaTexto) {
  const base = parsearFechaSistema(fechaTexto) || new Date();

  if (!fechaTexto) {
    base.setHours(base.getHours() + 4);
    base.setMinutes(0, 0, 0);
  }

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  const hh = String(base.getHours()).padStart(2, '0');
  const mi = String(base.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function leerCronometrosEstado() {
  try {
    return JSON.parse(localStorage.getItem(CRONOMETRO_ESTADOS_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function guardarCronometrosEstado(data) {
  localStorage.setItem(CRONOMETRO_ESTADOS_KEY, JSON.stringify(data || {}));
}

function estadoConCronometro(estado) {
  const e = String(estado || '').toLowerCase();
  return e === 'mantenimiento' || e === 'limpieza';
}

function registrarInicioCronometro(habitacionId, estado) {
  const id = String(habitacionId || '').trim();
  if (!id) return;

  const data = leerCronometrosEstado();
  data[id] = {
    estado: String(estado || '').toLowerCase(),
    inicio: new Date().toISOString()
  };
  guardarCronometrosEstado(data);
}

function limpiarCronometro(habitacionId) {
  const id = String(habitacionId || '').trim();
  if (!id) return;
  const data = leerCronometrosEstado();
  if (!data[id]) return;
  delete data[id];
  guardarCronometrosEstado(data);
}

function asegurarCronometroSegunEstado(hab) {
  const id = String(hab?.id || '').trim();
  if (!id) return;

  const estado = String(hab?.estado || '').toLowerCase();
  const data = leerCronometrosEstado();
  const actual = data[id];

  if (!estadoConCronometro(estado)) {
    if (actual) {
      delete data[id];
      guardarCronometrosEstado(data);
    }
    return;
  }

  if (!actual || actual.estado !== estado || !actual.inicio) {
    data[id] = {
      estado,
      inicio: new Date().toISOString()
    };
    guardarCronometrosEstado(data);
  }
}

function formatearDuracionCronometro(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;

  const hh = String(horas).padStart(2, '0');
  const mm = String(minutos).padStart(2, '0');
  const ss = String(segundos).padStart(2, '0');
  return dias > 0 ? `${dias}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function construirCronometroTextoHabitacion(hab) {
  const id = String(hab?.id || '').trim();
  if (!id) return '';

  const data = leerCronometrosEstado();
  const info = data[id];
  if (!info || !info.inicio) return '';

  const inicio = new Date(info.inicio);
  if (Number.isNaN(inicio.getTime())) return '';

  const estado = String(hab?.estado || '').toLowerCase();
  const ahora = Date.now();
  const transcurrido = formatearDuracionCronometro(ahora - inicio.getTime());

  const fin = parsearFechaSistema(
    estado === 'mantenimiento'
      ? (hab?.mantenimiento_hasta || hab?.proxima_disponibilidad)
      : (hab?.limpieza_hasta || hab?.proxima_disponibilidad)
  );

  let restante = 'Sin hora definida';
  if (fin) {
    const delta = fin.getTime() - ahora;
    restante = delta > 0 ? formatearDuracionCronometro(delta) : '00:00:00';
  }

  return `⏱ Control de tiempo<br><small>Transcurrido: <strong>${transcurrido}</strong> | Restante: <strong>${restante}</strong></small>`;
}

function refrescarCronometrosHabitaciones() {
  habitacionesEstadoCache.forEach((hab, idNum) => {
    const id = Number(idNum);
    const estado = String(hab?.estado || '').toLowerCase();
    const nodo = document.getElementById(`cronometro-hab-${id}`);
    if (!nodo) return;

    if (!estadoConCronometro(estado)) {
      nodo.style.display = 'none';
      return;
    }

    nodo.style.display = 'block';
    nodo.innerHTML = construirCronometroTextoHabitacion(hab);
  });
}

function iniciarCronometrosHabitaciones() {
  if (intervaloCronometrosHabitaciones) return;
  intervaloCronometrosHabitaciones = setInterval(refrescarCronometrosHabitaciones, 1000);
}

function programarActualizacionHabitacionesPuntual(habitaciones = []) {
  if (timerActualizacionHabitaciones) {
    clearTimeout(timerActualizacionHabitaciones);
    timerActualizacionHabitaciones = null;
  }

  proximaActualizacionHabitacionesAt = null;
  const ahora = Date.now();
  let msMin = null;

  habitaciones.forEach((h) => {
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
  proximaActualizacionHabitacionesAt = ahora + espera;
  timerActualizacionHabitaciones = setTimeout(async () => {
    const alojamientoId = String(document.getElementById("buscarAlojamiento")?.value || "").trim();
    if (!alojamientoId) return;
    if (document.hidden) return;

    try {
      await cargarHabitaciones();
    } catch (error) {
      console.error("Error en actualización puntual de habitaciones:", error);
    }
  }, espera);
}

function formatearFechaDisponibilidad(fechaTexto) {
  if (!fechaTexto) return "Por definir";
  const texto = String(fechaTexto).trim();
  const normalizada = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? `${texto}T12:00:00`
    : texto.replace(' ', 'T');
  const fecha = new Date(normalizada);
  if (Number.isNaN(fecha.getTime())) return String(fechaTexto);
  return fecha.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function manejarSesionExpirada(respuesta) {
  if (respuesta.status === 401 || respuesta.status === 403) {
    alert("⚠️ Sesión expirada, vuelve a iniciar sesión");
    localStorage.clear();
    window.location.href = "../login/login.html";
    return true;
  }
  return false;
}

async function validarRolAnfitrion() {
  try {
    if (!token) return false;
    const res = await fetch(`${API_URL}/auth/me`, { headers });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    const rol = String(data?.rol || '').toLowerCase().trim();
    return rol === 'anfitrion' || rol === 'admin';
  } catch (_) {
    return false;
  }
}

function construirUrlDetalleAlojamiento(alojamientoId) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/detalles_alojamiento/detalles.html?id=${alojamientoId}`;
}
let fechaCampanaConfirmada = '';
let campanasHistorialActual = [];
let campanasAutoRefreshId = null;

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function humanizarErrorCampana(errorTexto) {
  const texto = String(errorTexto || '').trim();
  if (!texto) {
    return 'No se pudo entregar la campaña. Intenta nuevamente o revisa la configuración del correo.';
  }

  const normalizado = texto.toLowerCase();
  if (normalizado.includes('daily user sending limit exceeded') || normalizado.includes('550-5.4.5')) {
    return 'Gmail alcanzó el límite diario de envíos del correo configurado. Espera unas horas o usa otra cuenta SMTP para seguir enviando campañas.';
  }
  if (normalizado.includes('la campaña no pudo entregarse correctamente')) {
    return 'No se pudo entregar la campaña. Revisa la configuración del correo o intenta nuevamente más tarde.';
  }
  if (normalizado.includes('smtp no configurado')) {
    return 'El correo SMTP no está configurado correctamente. Revisa la configuración de envío.';
  }

  return texto;
}

function mostrarFeedbackCampana(mensaje, tipo = 'info') {
  const nodo = document.getElementById('campana_feedback');
  if (!nodo) return;
  nodo.className = `campana-feedback visible ${tipo}`;
  nodo.textContent = mensaje;
}

function limpiarFeedbackCampana() {
  const nodo = document.getElementById('campana_feedback');
  if (!nodo) return;
  nodo.className = 'campana-feedback';
  nodo.textContent = '';
}

function formatearFechaHoraCampana(fechaTexto) {
  const fecha = parsearFechaSistema(fechaTexto);
  if (!fecha) return 'No aplica';
  return fecha.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function actualizarEstadoFechaCampana(texto = '', color = '#0d47a1') {
  const nodo = document.getElementById('campana_fecha_estado');
  if (!nodo) return;
  nodo.innerHTML = `<small>${texto}</small>`;
  nodo.style.color = color;
}

function establecerFechaHoraCampana() {
  const fechaLocal = document.getElementById('campana_fecha_programada')?.value || '';

  if (!fechaLocal) {
    alert('⚠️ Primero selecciona una fecha y hora programada.');
    return;
  }

  const inicio = new Date(fechaLocal);
  if (Number.isNaN(inicio.getTime())) {
    alert('⚠️ Fecha y hora inválidas.');
    return;
  }

  fechaCampanaConfirmada = fechaLocal;
  actualizarEstadoFechaCampana(`Fecha y hora establecidas para: <strong>${inicio.toLocaleString('es-CO')}</strong>`, '#0b7285');
}

function actualizarCamposCampanaProgramada() {
  const tipo = document.querySelector('input[name="campana_tipo_envio"]:checked')?.value || 'inmediata';
  const grupoFecha = document.getElementById('campana_fecha_group');
  const inputFecha = document.getElementById('campana_fecha_programada');

  if (!grupoFecha || !inputFecha) return;

  if (tipo === 'programada') {
    grupoFecha.style.display = 'block';
    inputFecha.required = true;
    actualizarEstadoFechaCampana('Notificación: define la fecha exacta para lanzar la campaña y establece la fecha con el botón.', '#0d47a1');
  } else {
    grupoFecha.style.display = 'none';
    inputFecha.required = false;
    inputFecha.value = '';
    fechaCampanaConfirmada = '';
  }
}

function actualizarPreviewEnlaceCampana() {
  const select = document.getElementById('campana_alojamiento_id');
  const preview = document.getElementById('campana_link_preview');
  if (!select || !preview) return;

  const id = Number(select.value || 0);
  if (!id) {
    preview.textContent = 'Selecciona un alojamiento para generar el enlace del correo.';
    return;
  }

  preview.textContent = `Enlace que recibirá el turista: ${construirUrlDetalleAlojamiento(id)}`;
}

async function cargarOpcionesCampanaAlojamientos() {
  const select = document.getElementById('campana_alojamiento_id');
  if (!select) return;

  try {
    const alojamientos = await obtenerAlojamientosAnfitrion(true);
    if (!Array.isArray(alojamientos)) return;

    select.innerHTML = '<option value="">Selecciona un alojamiento</option>';
    alojamientos.forEach((a) => {
      const option = document.createElement('option');
      option.value = String(a.id);
      option.textContent = `#${a.id} - ${a.titulo}`;
      select.appendChild(option);
    });

    actualizarPreviewEnlaceCampana();
  } catch (error) {
    console.error('Error cargando alojamientos para campañas:', error);
  }
}

function estadoCampanaClase(estado) {
  const val = String(estado || '').toLowerCase();
  if (val === 'programada') return 'programada';
  if (val === 'procesando') return 'procesando';
  if (val === 'enviada') return 'enviada';
  return 'error';
}

function estadoCampanaTexto(estado) {
  const val = String(estado || '').toLowerCase();
  if (val === 'programada') return 'PROGRAMADA';
  if (val === 'procesando') return 'EN PROCESO';
  if (val === 'enviada') return 'ENVIADO';
  return 'ERROR';
}

function esMismoDia(fechaA, fechaB) {
  return fechaA.getFullYear() === fechaB.getFullYear()
    && fechaA.getMonth() === fechaB.getMonth()
    && fechaA.getDate() === fechaB.getDate();
}

function actualizarResumenCampanas(campanas = []) {
  const hoyEl = document.getElementById('campanas_hoy_val');
  const proximasEl = document.getElementById('campanas_proximas_val');
  const finalizadasEl = document.getElementById('campanas_finalizadas_val');
  if (!hoyEl || !proximasEl || !finalizadasEl) return;

  const ahora = new Date();
  let hoy = 0;
  let proximas = 0;
  let finalizadas = 0;

  campanas.forEach((campana) => {
    const estado = String(campana?.estado || '').toLowerCase();
    const fechaProgramada = campana?.fecha_programada ? parsearFechaSistema(campana.fecha_programada) : null;
    const fechaCreada = campana?.creado_en ? parsearFechaSistema(campana.creado_en) : null;
    const fechaBase = fechaProgramada || fechaCreada;

    if (estado === 'enviada' || estado === 'error') {
      finalizadas += 1;
      return;
    }

    if (fechaBase && esMismoDia(fechaBase, ahora)) {
      hoy += 1;
      return;
    }

    if (fechaBase && fechaBase.getTime() > ahora.getTime()) {
      proximas += 1;
      return;
    }

    if (estado === 'programada') {
      hoy += 1;
    }
  });

  hoyEl.textContent = String(hoy);
  proximasEl.textContent = String(proximas);
  finalizadasEl.textContent = String(finalizadas);
}

function renderizarHistorialCampanas(campanas = []) {
  const contenedor = document.getElementById('campanas_historial');
  if (!contenedor) return;

  if (!campanas.length) {
    contenedor.innerHTML = '<p>No hay campañas registradas para este alojamiento.</p>';
    return;
  }

  contenedor.innerHTML = campanas.map((c) => `
    <div class="card-item campana-card-item">
      <div class="campana-card-head">
        <h4>${escaparHtml(c.asunto)}</h4>
        <span class="campana-estado ${estadoCampanaClase(c.estado)}">${estadoCampanaTexto(c.estado)}</span>
      </div>
      <div class="campana-meta-grid">
        <p><strong>Tipo:</strong> ${c.tipo_envio === 'programada' ? 'programado' : 'inmediato'}</p>
        <p><strong>Creada:</strong> ${formatearFechaHoraCampana(c.creado_en)}</p>
        <p><strong>Programada:</strong> ${c.fecha_programada ? formatearFechaHoraCampana(c.fecha_programada) : 'No aplica'}</p>
        <p><strong>Enviados:</strong> ${Number(c.enviados_total || 0)}</p>
        <p><strong>Destinatarios:</strong> ${Number(c.destinatarios_total || 0)}</p>
        <p><strong>Estado:</strong> ${estadoCampanaTexto(c.estado)}</p>
      </div>
      ${c.error_detalle ? `<p style="color:#b42318;margin-top:.55rem;"><strong>Error:</strong> ${escaparHtml(humanizarErrorCampana(c.error_detalle))}</p>` : ''}
    </div>
  `).join('');
}

async function cargarCampanasAlojamiento() {
  const contenedor = document.getElementById('campanas_historial');
  const select = document.getElementById('campana_alojamiento_id');
  if (!contenedor || !select) return;

  const alojamientoId = Number(select.value || 0);
  if (!alojamientoId) {
    campanasHistorialActual = [];
    actualizarResumenCampanas([]);
    contenedor.innerHTML = '<p>Selecciona un alojamiento para ver campañas recientes.</p>';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/anfitrion/campanas?alojamiento_id=${alojamientoId}`, { headers });
    if (manejarSesionExpirada(res)) return;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.error || 'No se pudo cargar el historial de campañas.'}</p>`;
      return;
    }

    const campanas = Array.isArray(data.campanas) ? data.campanas : [];
    campanasHistorialActual = campanas;
    actualizarResumenCampanas(campanas);
    renderizarHistorialCampanas(campanas);
  } catch (error) {
    console.error('Error cargando campañas:', error);
    contenedor.innerHTML = '<p>Error de conexión cargando campañas.</p>';
  }
}

function programarRefrescosCampanaRapidos() {
  window.setTimeout(() => { cargarCampanasAlojamiento().catch(() => {}); }, 1200);
  window.setTimeout(() => { cargarCampanasAlojamiento().catch(() => {}); }, 3500);
}

function iniciarAutoRefreshCampanas() {
  if (campanasAutoRefreshId) return;
  campanasAutoRefreshId = setInterval(() => {
    if (document.hidden) return;
    const alojamientoId = Number(document.getElementById('campana_alojamiento_id')?.value || 0);
    if (!alojamientoId) return;
    cargarCampanasAlojamiento().catch(() => {});
  }, 20000);
}

function descargarHistorialCampanasPdf() {
  if (!Array.isArray(campanasHistorialActual) || !campanasHistorialActual.length) {
    mostrarFeedbackCampana('No hay campañas cargadas para exportar en PDF.', 'error');
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    mostrarFeedbackCampana('La librería de PDF no está disponible en este momento.', 'error');
    return;
  }

  const alojamientoTexto = document.getElementById('campana_alojamiento_id')?.selectedOptions?.[0]?.textContent || 'Alojamiento';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const fecha = new Date();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Historial de campañas para turistas', 40, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Alojamiento: ${alojamientoTexto}`, 40, 60);
  doc.text(`Generado: ${fecha.toLocaleString('es-CO')}`, 40, 76);

  doc.autoTable({
    startY: 96,
    head: [['Asunto', 'Tipo', 'Creada', 'Programada', 'Destinatarios', 'Enviados', 'Estado', 'Error']],
    body: campanasHistorialActual.map((campana) => [
      String(campana.asunto || ''),
      campana.tipo_envio === 'programada' ? 'Programado' : 'Inmediato',
      formatearFechaHoraCampana(campana.creado_en),
      campana.fecha_programada ? formatearFechaHoraCampana(campana.fecha_programada) : 'No aplica',
      Number(campana.destinatarios_total || 0),
      Number(campana.enviados_total || 0),
      estadoCampanaTexto(campana.estado),
      String(campana.error_detalle || '')
    ]),
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [14, 111, 123] }
  });

  doc.save(`campanas_${fecha.toISOString().slice(0, 10)}.pdf`);
  mostrarFeedbackCampana('Historial de campañas exportado en PDF.', 'ok');
}

async function lanzarCampanaAlojamiento() {
  const alojamientoId = Number(document.getElementById('campana_alojamiento_id')?.value || 0);
  const asunto = document.getElementById('campana_asunto')?.value.trim() || '';
  const contenido = document.getElementById('campana_contenido')?.value.trim() || '';
  const tipoEnvio = document.querySelector('input[name="campana_tipo_envio"]:checked')?.value || 'inmediata';
  const fechaProgramada = document.getElementById('campana_fecha_programada')?.value || '';
  const boton = document.querySelector('#formCampanaAlojamiento .btn-campana-enviar');

  if (!alojamientoId || !asunto || !contenido) {
    mostrarFeedbackCampana('Debes completar alojamiento, asunto y mensaje.', 'error');
    return;
  }

  if (tipoEnvio === 'programada' && !fechaProgramada) {
    mostrarFeedbackCampana('Debes indicar la fecha y hora programada.', 'error');
    return;
  }

  if (tipoEnvio === 'programada' && fechaProgramada !== fechaCampanaConfirmada) {
    mostrarFeedbackCampana('Debes establecer la fecha y hora con el botón correspondiente.', 'error');
    return;
  }

  limpiarFeedbackCampana();
  if (boton) {
    boton.disabled = true;
    boton.textContent = tipoEnvio === 'programada' ? '⏳ Programando campaña...' : '⏳ Lanzando campaña...';
  }
  mostrarFeedbackCampana(
    tipoEnvio === 'programada'
      ? 'Registrando campaña programada con la fecha y hora seleccionadas...'
      : 'Registrando campaña y preparando el envío inmediato...',
    'info'
  );

  try {
    const res = await fetch(`${API_URL}/anfitrion/campanas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id_alojamiento: alojamientoId,
        asunto,
        contenido,
        tipo_envio: tipoEnvio,
        fecha_programada: tipoEnvio === 'programada' ? fechaProgramada : null,
        fecha_confirmada: tipoEnvio === 'programada' ? 1 : 0
      })
    });

    if (manejarSesionExpirada(res)) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarFeedbackCampana(data.error || 'No se pudo lanzar la campaña.', 'error');
      return;
    }

    mostrarFeedbackCampana(
      data.mensaje || (tipoEnvio === 'programada'
        ? 'Campaña programada correctamente.'
        : 'Campaña aceptada y en proceso de entrega.'),
      'ok'
    );
    document.getElementById('campana_asunto').value = '';
    document.getElementById('campana_contenido').value = '';
    document.getElementById('campana_fecha_programada').value = '';
    fechaCampanaConfirmada = '';
    document.querySelector('input[name="campana_tipo_envio"][value="inmediata"]').checked = true;
    actualizarCamposCampanaProgramada();
    await cargarCampanasAlojamiento();
    programarRefrescosCampanaRapidos();
  } catch (error) {
    console.error('Error lanzando campaña:', error);
    mostrarFeedbackCampana('Error de conexión al lanzar la campaña.', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = '🚀 Lanzar campaña';
    }
  }
}

// ======================================
// CREAR ALOJAMIENTO
// ======================================
async function crearAlojamiento() {
  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const ciudad = document.getElementById("ciudad").value.trim();
  const region = document.getElementById("region").value.trim();
  const zona = document.getElementById("zona").value;
  const cercania = document.getElementById("cercania").value.trim();
  const direccion = document.getElementById("direccion").value.trim();
  const gpsUbicacion = (document.getElementById("gpsUbicacion") || {}).value || "";
  const vistas = document.getElementById("vistas").value;
  const precio = document.getElementById("precio").value;
  const capacidad = document.getElementById("capacidad").value;
  const politicas = document.getElementById("politicas").value.trim();

  if (!titulo || !precio || !capacidad) {
    alert("⚠️ Título, precio y capacidad son obligatorios");
    return;
  }

  // Construir ubicación: ciudad + región (texto visible)
  // + dirección exacta si la escribió + link GPS si lo obtuvo
  let ubicacion = "";
  if (ciudad) ubicacion += ciudad;
  if (region) ubicacion += (ubicacion ? ", " : "") + region;
  if (direccion) ubicacion += (ubicacion ? ", " : "") + direccion;
  if (gpsUbicacion) ubicacion += (ubicacion ? ", " : "") + gpsUbicacion;
  if (!ubicacion) ubicacion = "";

  try {
    const res = await fetch(`${API_URL}/alojamientos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        titulo, 
        descripcion, 
        ubicacion, 
        direccion,
        zona, 
        cercania, 
        vistas, 
        precio, 
        capacidad_personas: capacidad,
        politicas
      })
    });

    if (res.status === 401 || res.status === 403) {
      alert("⚠️ Sesión expirada, vuelve a iniciar sesión");
      localStorage.clear();
      window.location.href = "../login/login.html";
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ Error al crear alojamiento");
      return;
    }
    window.alojamientoActual = data.id;
    alert("✅ Alojamiento creado correctamente");
    document.getElementById("formAlojamiento").reset();
    const _fc = document.getElementById("formContainer");
    const _tb = document.getElementById("toggleCrear");
    if (_fc && _tb) colapsarSeccion(_tb, _fc);
    invalidarCacheAlojamientosAnfitrion();
    cargarAlojamientos();
    cargarOpcionesCampanaAlojamientos();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}





// ======================================
// LISTAR ALOJAMIENTOS
// ======================================
async function cargarAlojamientos() {
  try {
    const data = await obtenerAlojamientosAnfitrion();
    if (data === null) return;

    const contenedor = document.getElementById("listaAlojamientos");
    if (!contenedor) return;
    contenedor.innerHTML = "";
    misAlojamientosIds.clear();

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>No tienes alojamientos registrados</p>";
      const inputBuscar = document.getElementById("buscarAlojamiento");
      if (inputBuscar) inputBuscar.value = "";
      return;
    }

    data.forEach((a) => misAlojamientosIds.add(Number(a.id)));

    const inputBuscar = document.getElementById("buscarAlojamiento");
    const actual = Number(inputBuscar?.value || 0);
    if (inputBuscar && (!actual || !misAlojamientosIds.has(actual))) {
      inputBuscar.value = String(data[0].id);
    }

    const idSeleccionado = Number(document.getElementById("buscarAlojamiento")?.value || 0);
    const idParaGrafica = idSeleccionado || Number(data[0]?.id || 0);
    if (idParaGrafica) {
      actualizarGraficaOcupacion(idParaGrafica);
    }

    data.forEach(async (alojamiento) => {
  const card = document.createElement("div");
  card.classList.add("card-item");
  card.classList.add("host-card-item");
  card.dataset.id = alojamiento.id;

  const resumen = await obtenerResumenHabitaciones(alojamiento.id);

  const ubicacionLimpia = (alojamiento.ubicacion || "Sin ubicación").replace(/,\s*https:\/\/maps\.google\.com\/\?q=[^\s]*/g, '');
  card.innerHTML = `
    <div class="host-card-head">
      <h4>${escaparHtml(alojamiento.titulo || "Sin titulo")}</h4>
      <span class="host-card-id">ID ${alojamiento.id}</span>
    </div>

    <div class="host-card-meta">
      <p>📍 ${escaparHtml(ubicacionLimpia)}</p>
      <p>💰 $${Number(alojamiento.precio || 0).toLocaleString('es-CO')}</p>
      <p>🛏 ${resumen.total} habitaciones</p>
    </div>

    <div class="host-card-status-grid">
      <p class="host-status host-status-ok">✅ ${resumen.disponibles} disponibles</p>
      <p class="host-status host-status-busy">❌ ${resumen.ocupadas} ocupadas</p>
      <p class="host-status host-status-maint">🛠 ${resumen.mantenimiento} mantenimiento</p>
      <p class="host-status host-status-clean">🧹 ${resumen.limpieza} limpieza</p>
    </div>

    <div class="galeria" id="galeria-${alojamiento.id}"></div>

    <div class="host-actions-wrap">
      <div class="host-actions-group">
        <p class="host-actions-title">Fotos</p>
        <div class="host-actions-grid">
          <button type="button" data-host-action="seleccionar-imagen-aloj" data-alojamiento-id="${alojamiento.id}">📸 Agregar fotos</button>
          <button type="button" data-host-action="abrir-camara-pro" data-alojamiento-id="${alojamiento.id}">📷 Usar camara</button>
        </div>
      </div>

      <div class="host-actions-group">
        <p class="host-actions-title">Alojamiento</p>
        <div class="host-actions-grid">
          <button type="button" data-host-action="editar-alojamiento" data-alojamiento-id="${alojamiento.id}" data-alojamiento-titulo="${escaparHtml(alojamiento.titulo || '')}" data-alojamiento-precio="${Number(alojamiento.precio || 0)}" data-alojamiento-capacidad="${Number(alojamiento.capacidad_personas || 1)}" data-alojamiento-ubicacion="${escaparHtml(alojamiento.ubicacion || '')}" data-alojamiento-descripcion="${escaparHtml(alojamiento.descripcion || '')}">✏️ Editar alojamiento</button>
          <button type="button" data-host-action="eliminar-alojamiento" data-alojamiento-id="${alojamiento.id}">🗑️ Eliminar alojamiento</button>
        </div>
      </div>

      <div class="host-actions-group">
        <p class="host-actions-title">Servicios</p>
        <div class="host-actions-grid">
          <button type="button" data-host-action="crear-servicio" data-alojamiento-id="${alojamiento.id}">➕ Crear servicio</button>
          <button type="button" data-host-action="visualizar-servicios" data-alojamiento-id="${alojamiento.id}">👁️ Ver servicios</button>
          <button type="button" data-host-action="eliminar-servicio-global" data-alojamiento-id="${alojamiento.id}">❌ Eliminar servicio</button>
        </div>
      </div>

      <div class="host-actions-group">
        <p class="host-actions-title">Reservas</p>
        <div class="host-actions-grid">
          <button type="button" data-host-action="gestionar-reservas-aloj" data-alojamiento-id="${alojamiento.id}">📅 Gestionar reservas</button>
        </div>
      </div>
    </div>

  `;

  contenedor.appendChild(card);
  cargarGaleria(alojamiento.id);
});

 } catch (error) {
    console.error(error);
    const contenedor = document.getElementById("listaAlojamientos");
    if (contenedor) {
      contenedor.innerHTML = `<p>${error?.message || "No se pudieron cargar alojamientos."}</p>`;
    }
  }
}

async function actualizarGraficaOcupacion(idAlojamiento) {
  const canvas = document.getElementById("graficaOcupacion");
  const vacioBanner = document.getElementById("grafica-vacia");
  if (!canvas || typeof Chart === "undefined") return;

  try {
    const res = await fetch(`${API_URL}/reservas/estadisticas/ocupacion-semanal/${idAlojamiento}`, { headers });
    const data = await res.json();
    if (!res.ok) return;

    const labels = Array.isArray(data.labels) ? data.labels : [];
    const valores = Array.isArray(data.ocupacion) ? data.ocupacion : [];

    // Stats
    const sinDatos = valores.length === 0 || valores.every(v => v === 0);
    if (vacioBanner) vacioBanner.style.display = sinDatos ? 'flex' : 'none';
    canvas.style.display = sinDatos ? 'none' : 'block';

    const promedio = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;
    const maximo   = valores.length ? Math.max(...valores) : 0;
    const minimo   = valores.length ? Math.min(...valores) : 0;
    const tendencia = valores.length >= 2
      ? (valores[valores.length - 1] > valores[0] ? '↑ Subiendo' : valores[valores.length - 1] < valores[0] ? '↓ Bajando' : '→ Estable')
      : '—';

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('gstat-promedio-val', `${promedio}%`);
    setEl('gstat-maximo-val',   `${maximo}%`);
    setEl('gstat-minimo-val',   `${minimo}%`);
    setEl('gstat-tendencia-val', tendencia);

    const badge = document.getElementById('grafica-badge');
    if (badge) {
      badge.textContent = `Promedio: ${promedio}%`;
      badge.className = 'grafica-badge ' + (promedio >= 70 ? 'grafica-badge--alta' : promedio >= 40 ? 'grafica-badge--media' : 'grafica-badge--baja');
    }

    if (graficaOcupacionRef) { graficaOcupacionRef.destroy(); }
    if (sinDatos) return;

    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, 340);
    gradient.addColorStop(0, 'rgba(0,123,138,0.92)');
    gradient.addColorStop(1, 'rgba(0,155,172,0.28)');

    graficaOcupacionRef = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Ocupación',
            data: valores,
            backgroundColor: gradient,
            borderRadius: { topLeft: 8, topRight: 8 },
            borderSkipped: false,
            barPercentage: 0.6,
            order: 2
          },
          {
            type: 'line',
            label: 'Promedio',
            data: Array(labels.length).fill(promedio),
            borderColor: 'rgba(255,152,0,0.85)',
            borderWidth: 2,
            borderDash: [7, 4],
            pointRadius: 0,
            fill: false,
            tension: 0,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 650, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 12 },
              color: '#3B4F63',
              padding: 16
            }
          },
          tooltip: {
            backgroundColor: '#0F1E2D',
            titleColor: '#fff',
            bodyColor: 'rgba(255,255,255,0.78)',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (c) => c.datasetIndex === 1
                ? ` Promedio semana: ${c.parsed.y}%`
                : ` Ocupación: ${c.parsed.y}%`
            }
          },
          datalabels: {
            display: (c) => c.datasetIndex === 0 && c.dataset.data[c.dataIndex] > 0,
            anchor: 'end',
            align: 'end',
            offset: 4,
            formatter: (v) => `${v}%`,
            color: '#007B8A',
            font: { weight: '700', size: 11 }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#7A8EA3', font: { size: 12 } }
          },
          y: {
            beginAtZero: true,
            max: 100,
            border: { display: false },
            grid: { color: 'rgba(0,0,0,0.05)', drawTicks: false },
            ticks: {
              color: '#7A8EA3',
              font: { size: 11 },
              padding: 8,
              callback: (v) => `${v}%`
            }
          }
        }
      },
      plugins: typeof ChartDataLabels !== "undefined" ? [ChartDataLabels] : []
    });
  } catch (error) {
    console.error("Error cargando gráfica de ocupación", error);
  }
}

// ======================================
// ELIMINAR ALOJAMIENTO
// ======================================
async function eliminarAlojamiento(id) {
  if (!confirm("¿Seguro que deseas eliminar este alojamiento?")) return;
  try {
    const res = await fetch(`${API_URL}/alojamientos/${id}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ Error eliminando");
      return;
    }
    alert("🗑️ Alojamiento eliminado");
    invalidarCacheAlojamientosAnfitrion();

// 🔥 ACTUALIZAR TODO EN TIEMPO REAL
await cargarAlojamientos();
await cargarGaleriaAlojamientos();
await cargarOpcionesCampanaAlojamientos();
await cargarCampanasAlojamiento();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}

// ======================================
// INIT + INPUT IMÁGENES
// ======================================
document.addEventListener("DOMContentLoaded", () => {
  validarRolAnfitrion().then((permitido) => {
    if (!permitido) {
      alert('⚠️ Esta vista es solo para anfitriones o administradores.');
      localStorage.removeItem('token');
      localStorage.removeItem('rol');
      window.location.href = '../login/login.html';
      return;
    }

    cargarAlojamientos();
    cargarGaleriaAlojamientos();
    cargarSolicitudesCancelacionAnfitrion();
    iniciarCronometrosHabitaciones();
  });

  document.getElementById("btnCerrarSesionAnfitrion")?.addEventListener("click", (event) => {
    event.preventDefault();
    cerrarSesion();
  });
  document.getElementById("formAlojamiento")?.addEventListener("submit", (event) => {
    event.preventDefault();
    crearAlojamiento();
  });
  document.getElementById("btnObtenerUbicacionGPS")?.addEventListener("click", obtenerUbicacionGPS);
  document.getElementById("formCrearHabitacion")?.addEventListener("submit", (event) => {
    event.preventDefault();
    crearHabitacion();
  });
  document.getElementById("formServicioAdicional")?.addEventListener("submit", (event) => {
    event.preventDefault();
    guardarServicioAdicional();
  });
  document.getElementById("btnCargarServiciosAdicionales")?.addEventListener("click", () => cargarServiciosAdicionales());
  document.getElementById("sa_buscarAlojamiento")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      cargarServiciosAdicionales();
    }
  });
  document.getElementById("btnBuscarHabitaciones")?.addEventListener("click", cargarHabitaciones);
  document.getElementById("buscarAlojamiento")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      cargarHabitaciones();
    }
  });
  document.getElementById("btnActualizarCancelacionesAnfitrion")?.addEventListener("click", cargarSolicitudesCancelacionAnfitrion);
  document.getElementById("btnValidarCodigoReserva")?.addEventListener("click", validarCodigoConfirmacionReserva);
  document.getElementById("btnLimpiarCodigoReserva")?.addEventListener("click", limpiarResultadoCodigoReserva);
  document.getElementById("codigoReservaInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      validarCodigoConfirmacionReserva();
    }
  });
  document.getElementById("btnAbrirInvitar")?.addEventListener("click", abrirModalInvitar);
  document.getElementById("formCampanaAlojamiento")?.addEventListener("submit", (event) => {
    event.preventDefault();
    lanzarCampanaAlojamiento();
  });
  document.getElementById("campana_alojamiento_id")?.addEventListener("change", () => {
    actualizarPreviewEnlaceCampana();
    cargarCampanasAlojamiento();
  });
  document.getElementById("campana_fecha_programada")?.addEventListener("input", () => {
    fechaCampanaConfirmada = '';
    const tipo = document.querySelector('input[name="campana_tipo_envio"]:checked')?.value || 'inmediata';
    if (tipo === 'programada') {
      actualizarEstadoFechaCampana('Fecha modificada. Debes volver a establecer la fecha y hora con el botón.', '#9c4f00');
    }
  });
  document.querySelectorAll('input[name="campana_tipo_envio"]')?.forEach((radio) => {
    radio.addEventListener("change", actualizarCamposCampanaProgramada);
  });
  document.getElementById("btnRefrescarCampanas")?.addEventListener("click", cargarCampanasAlojamiento);
  document.getElementById("btnDescargarCampanasPdf")?.addEventListener("click", descargarHistorialCampanasPdf);
  document.getElementById("btnGuardarCalendarioCampana")?.addEventListener("click", establecerFechaHoraCampana);
  document.getElementById("btnTomarFotoCamara")?.addEventListener("click", tomarFoto);
  document.getElementById("btnCerrarCamara")?.addEventListener("click", cerrarCamara);
  document.getElementById("btnCerrarModalServicios")?.addEventListener("click", cerrarModalServicios);
  document.getElementById("btnCerrarModalEliminarServicios")?.addEventListener("click", cerrarModalEliminarServicios);
  document.getElementById("btnEnviarInvitacion")?.addEventListener("click", enviarInvitacion);
  document.getElementById("btnCerrarModalInvitar")?.addEventListener("click", cerrarModalInvitar);

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-host-action]");
    if (!actionEl || actionEl.disabled) return;

    const action = actionEl.dataset.hostAction;
    const alojamientoId = Number(actionEl.dataset.alojamientoId || 0);
    const habitacionId = Number(actionEl.dataset.habitacionId || 0);
    const imagenId = Number(actionEl.dataset.imagenId || 0);
    const cancelacionId = Number(actionEl.dataset.cancelacionId || 0);
    const miembroId = Number(actionEl.dataset.miembroId || 0);
    const estado = actionEl.dataset.estado || "";
    const lightboxUrl = decodeURIComponent(actionEl.dataset.lightboxUrl || "");

    if (action === "seleccionar-imagen-aloj" && alojamientoId > 0) seleccionarImagen(alojamientoId);
    else if (action === "editar-alojamiento" && alojamientoId > 0) editarAlojamientoDesdeDataset(actionEl);
    else if (action === "eliminar-alojamiento" && alojamientoId > 0) eliminarAlojamiento(alojamientoId);
    else if (action === "abrir-camara-pro" && alojamientoId > 0) abrirCamaraPro(alojamientoId);
    else if (action === "crear-servicio" && alojamientoId > 0) crearServicio(alojamientoId);
    else if (action === "visualizar-servicios" && alojamientoId > 0) visualizarServicios(alojamientoId);
    else if (action === "eliminar-servicio-global" && alojamientoId > 0) eliminarServicioGlobal(alojamientoId);
    else if (action === "gestionar-reservas-aloj" && alojamientoId > 0) gestionarReservasAlojamiento(alojamientoId);
    else if (action === "abrir-lightbox" && lightboxUrl) abrirLightbox(lightboxUrl);
    else if (action === "eliminar-imagen-aloj" && imagenId > 0 && alojamientoId > 0) eliminarImagen(imagenId, alojamientoId);
    else if (action === "hacer-principal-aloj" && imagenId > 0 && alojamientoId > 0) hacerPrincipal(imagenId, alojamientoId);
    else if (action === "programar-limpieza" && habitacionId > 0) programarLimpieza(habitacionId);
    else if (action === "confirmar-mantenimiento") confirmarMantenimientoProgramado();
    else if (action === "cerrar-modal-mantenimiento") cerrarModalMantenimiento();
    else if (action === "actualizar-estado-habitacion" && habitacionId > 0 && estado) actualizarEstadoHabitacion(habitacionId, estado);
    else if (action === "solicitar-mantenimiento" && habitacionId > 0) solicitarMantenimiento(habitacionId);
    else if (action === "activar-limpieza" && habitacionId > 0) activarLimpieza(habitacionId);
    else if (action === "toggle-resumen-reserva" && habitacionId > 0) toggleResumenReservaHabitacion(habitacionId);
    else if (action === "ver-servicios-habitacion" && habitacionId > 0) verServiciosHabitacion(habitacionId);
    else if (action === "asignar-servicio-habitacion" && habitacionId > 0 && alojamientoId > 0) asignarServicio(habitacionId, alojamientoId);
    else if (action === "eliminar-servicio-multiple" && habitacionId > 0) eliminarServicioMultiple(habitacionId);
    else if (action === "seleccionar-imagen-habitacion" && habitacionId > 0) seleccionarImagenHabitacion(habitacionId);
    else if (action === "abrir-camara-habitacion" && habitacionId > 0) abrirCamaraHabitacion(habitacionId);
    else if (action === "editar-habitacion" && habitacionId > 0) editarHabitacionDesdeDataset(actionEl);
    else if (action === "eliminar-habitacion" && habitacionId > 0) eliminarHabitacion(habitacionId);
    else if (action === "aplicar-refund-cancelacion" && cancelacionId > 0) aplicarRefundCancelacion(cancelacionId);
    else if (action === "eliminar-imagen-habitacion" && imagenId > 0 && habitacionId > 0) eliminarImagenHabitacion(imagenId, habitacionId);
    else if (action === "hacer-principal-habitacion" && imagenId > 0 && habitacionId > 0) hacerPrincipalHabitacion(imagenId, habitacionId);
    else if (action === "abrir-lightbox-galeria" && lightboxUrl && alojamientoId > 0) abrirLightboxDesdeGaleria(lightboxUrl, alojamientoId);
    else if (action === "eliminar-miembro" && miembroId > 0) eliminarMiembro(miembroId);
  });

  document.addEventListener("error", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.classList.contains("img-host-fallback")) return;
    if (target.dataset.fallbackAplicado === "1") return;
    target.dataset.fallbackAplicado = "1";
    target.src = "https://via.placeholder.com/100?text=No+Img";
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !proximaActualizacionHabitacionesAt) return;
    if (Date.now() < proximaActualizacionHabitacionesAt) return;

    const alojamientoId = String(document.getElementById("buscarAlojamiento")?.value || "").trim();
    if (!alojamientoId) return;
    cargarHabitaciones().catch((error) => console.error("Error actualizando al volver a la pestaña:", error));
  });

  // ======================================
  // BOTÓN GUARDAR SERVICIOS
  // ======================================
  const btnGuardarServicios = document.getElementById("btnGuardarServicios");

  if (btnGuardarServicios) {
    btnGuardarServicios.addEventListener("click", async (e) => {
      e.preventDefault();

      if (modoEliminandoServicios) {
        // El modo de eliminación gestiona su propio flujo de click para evitar duplicados.
        return;
      }

      const checks = document.querySelectorAll("#formServicios input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const idServicio of seleccionados) {
          await fetch(`${API_URL}/habitaciones/${habitacionServicioActual}/servicios`, {
            method: "POST",
            headers,
            body: JSON.stringify({ id_servicio: idServicio })
          });
        }

        alert("✅ Servicios asignados correctamente");
        cerrarModalServicios();
        cargarHabitaciones();
      } catch (error) {
        console.error(error);
        alert("❌ Error asignando servicios");
      }
    });
  }

  const input = document.getElementById("inputImagen");
  if (!input) return;

  input.addEventListener("change", async function () {
    const alojamientoId = this.dataset.alojamientoId;
    const habitacionId = this.dataset.habitacionId;
    const tipo = this.dataset.tipo;

    if (!alojamientoId && !habitacionId) {
      alert("❌ No se seleccionó alojamiento ni habitación");
      return;
    }

    const files = this.files;
    if (!files.length) return;

    const previewContainer = document.getElementById("previewContainer");
    if (previewContainer) previewContainer.innerHTML = "";

    const formData = new FormData();
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!previewContainer) return;
        const img = document.createElement("img");
        img.src = e.target.result;
        img.classList.add("preview-img");
        previewContainer.appendChild(img);
      };
      reader.readAsDataURL(file);
      formData.append("imagenes", file);
    });

    try {
      let url = "";
      if (tipo === "habitacion") {
        url = `${API_URL}/habitaciones/${habitacionId}/imagenes`;
      } else {
        url = `${API_URL}/alojamientos/${alojamientoId}/imagenes`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: formData
      });

      if (!res.ok) {
        alert("Error subiendo imágenes");
        return;
      }

      if (tipo === "habitacion") {
        await cargarGaleriaHabitacion(habitacionId);
      } else {
        await cargarGaleria(alojamientoId);
        await cargarGaleriaAlojamientos();
      }
    } catch (error) {
      console.error(error);
      alert("Error conexión");
    }
  });

  actualizarCamposCampanaProgramada();
  cargarOpcionesCampanaAlojamientos();
  cargarCampanasAlojamiento();
  iniciarAutoRefreshCampanas();
});

// ======================================
// TOGGLE COLLAPSIBLE FORM (ACORDEÓN)
// ======================================
function colapsarSeccion(btn, container) {
  container.classList.add("collapsed");
  btn.classList.add("collapsed");
}

function expandirSeccion(btn, container) {
  container.classList.remove("collapsed");
  btn.classList.remove("collapsed");
}

function scrollConOffset(elemento, offset = 70) {
  if (!elemento) return;
  const y = elemento.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: Math.max(y, 0), behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn    = document.getElementById("toggleCrear");
  const formContainer = document.getElementById("formContainer");
  const toggleBtnHab  = document.getElementById("toggleHabitaciones");
  const formContainerHab = document.getElementById("formContainerHab");
  const toggleBtnServ = document.getElementById("toggleServiciosAdicionales");
  const formContainerServ = document.getElementById("formContainerServiciosAdicionales");
  const toggleBtnCamp = document.getElementById("toggleCampanas");
  const formContainerCamp = document.getElementById("formContainerCampanas");

  if (toggleBtn && formContainer) {
    toggleBtn.addEventListener("click", () => {
      const yaAbierto = !formContainer.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtn, formContainer);
      } else {
        // Cerrar habitaciones si está abierta
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        if (toggleBtnCamp && formContainerCamp) {
          colapsarSeccion(toggleBtnCamp, formContainerCamp);
        }
        expandirSeccion(toggleBtn, formContainer);
        // Anclar el scroll a esta sección para evitar saltos de viewport
        setTimeout(() => scrollConOffset(toggleBtn, 70), 50);
      }
    });
  }

  if (toggleBtnHab && formContainerHab) {
    toggleBtnHab.addEventListener("click", () => {
      const yaAbierto = !formContainerHab.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtnHab, formContainerHab);
      } else {
        // Cerrar crear alojamiento si está abierta
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        if (toggleBtnCamp && formContainerCamp) {
          colapsarSeccion(toggleBtnCamp, formContainerCamp);
        }
        expandirSeccion(toggleBtnHab, formContainerHab);
        // Anclar el scroll a esta sección para evitar saltos de viewport
        setTimeout(() => scrollConOffset(toggleBtnHab, 70), 50);
      }
    });
  }

  if (toggleBtnServ && formContainerServ) {
    toggleBtnServ.addEventListener("click", () => {
      const yaAbierto = !formContainerServ.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtnServ, formContainerServ);
      } else {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnCamp && formContainerCamp) {
          colapsarSeccion(toggleBtnCamp, formContainerCamp);
        }
        expandirSeccion(toggleBtnServ, formContainerServ);
        setTimeout(() => scrollConOffset(toggleBtnServ, 70), 50);
      }
    });
  }

  if (toggleBtnCamp && formContainerCamp) {
    toggleBtnCamp.addEventListener("click", () => {
      const yaAbierto = !formContainerCamp.classList.contains("collapsed");
      if (yaAbierto) {
        colapsarSeccion(toggleBtnCamp, formContainerCamp);
      } else {
        if (toggleBtn && formContainer) colapsarSeccion(toggleBtn, formContainer);
        if (toggleBtnHab && formContainerHab) colapsarSeccion(toggleBtnHab, formContainerHab);
        if (toggleBtnServ && formContainerServ) colapsarSeccion(toggleBtnServ, formContainerServ);
        expandirSeccion(toggleBtnCamp, formContainerCamp);
        setTimeout(() => scrollConOffset(toggleBtnCamp, 70), 50);
      }
    });
  }

  // Navegación del menú Panel: siempre llevar al inicio/título del card
  const panelLinks = Array.from(document.querySelectorAll('.menu li ul a[href^="#"], .panel-workflow a[href^="#"]'))
    .filter((link) => link.getAttribute("href") !== "#");

  const obtenerObjetivoScroll = (hash) => {
    const id = (hash || "").replace("#", "");
    const destino = document.getElementById(id);
    if (!destino) return null;

    if (destino.tagName && destino.tagName.toLowerCase() === "section") {
      return destino.querySelector("h3, .toggle-btn") || destino;
    }

    const card = destino.closest("section");
    if (card) {
      return card.querySelector("h3, .toggle-btn") || card;
    }

    return destino;
  };

  panelLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;

      event.preventDefault();

      // Abrir/cerrar acordeón según el destino del menú
      if (hash === "#tituloCrear" || hash === "#crear") {
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtn && formContainer) {
          expandirSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnCamp && formContainerCamp) {
          colapsarSeccion(toggleBtnCamp, formContainerCamp);
        }
      } else if (hash === "#habitaciones") {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnServ && formContainerServ) {
          colapsarSeccion(toggleBtnServ, formContainerServ);
        }
        if (toggleBtnHab && formContainerHab) {
          expandirSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnCamp && formContainerCamp) {
          colapsarSeccion(toggleBtnCamp, formContainerCamp);
        }
      } else if (hash === "#campanasAlojamiento") {
        if (toggleBtn && formContainer) colapsarSeccion(toggleBtn, formContainer);
        if (toggleBtnHab && formContainerHab) colapsarSeccion(toggleBtnHab, formContainerHab);
        if (toggleBtnServ && formContainerServ) colapsarSeccion(toggleBtnServ, formContainerServ);
        if (toggleBtnCamp && formContainerCamp) expandirSeccion(toggleBtnCamp, formContainerCamp);
      } else if (hash === "#serviciosAdicionales") {
        if (toggleBtn && formContainer) {
          colapsarSeccion(toggleBtn, formContainer);
        }
        if (toggleBtnHab && formContainerHab) {
          colapsarSeccion(toggleBtnHab, formContainerHab);
        }
        if (toggleBtnServ && formContainerServ) {
          expandirSeccion(toggleBtnServ, formContainerServ);
        }
      }

      const objetivo = obtenerObjetivoScroll(hash);
      if (!objetivo) return;

      setTimeout(() => {
        scrollConOffset(objetivo, 70);
        history.replaceState(null, "", hash);
      }, 80);
    });
  });
});

// ======================================
// SELECCIONAR IMAGEN
// ======================================
function seleccionarImagen(alojamientoId) {
  const input = document.getElementById("inputImagen");
  input.dataset.alojamientoId = alojamientoId;
  input.click();
}

// ======================================
// GALERÍA
// ======================================
async function cargarGaleria(alojamientoId) {
  const contenedor = document.getElementById(`galeria-${alojamientoId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/imagenes`, { headers });
    if (!res.ok) throw new Error("No se pudieron cargar las imágenes");

    const imagenes = await res.json();

    contenedor.innerHTML = "";
    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      contenedor.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    // Ordenar principal primero
    imagenes.sort((a, b) => b.principal - a.principal);

    imagenes.forEach(img => {
      const div = document.createElement("div");
      div.classList.add("img-box");
      if (img.principal === 1) div.classList.add("imagen-principal");

      const url = construirUrlImagen(img.ruta);

      // Verificar url no vacía
      if (!url) return;

      div.innerHTML = `
        <img src="${url}" 
             data-host-action="abrir-lightbox"
             data-lightbox-url="${encodeURIComponent(url)}"
             class="img-host-lightbox img-host-fallback"
             style="width:100px; border-radius:8px; margin:5px;">
        <div class="acciones-img" style="text-align:center; margin-top:5px;">
          <button type="button" data-host-action="eliminar-imagen-aloj" data-imagen-id="${img.id}" data-alojamiento-id="${alojamientoId}">🗑️</button>
          <button type="button" data-host-action="hacer-principal-aloj" data-imagen-id="${img.id}" data-alojamiento-id="${alojamientoId}">⭐</button>
        </div>
      `;

      contenedor.appendChild(div);
    });
  } catch (error) {
    console.error("Error cargando galería", error);
    contenedor.innerHTML = "<p>Error cargando imágenes</p>";
  }
}

// ======================================
// ELIMINAR IMAGEN
// ======================================
async function eliminarImagen(idImagen, alojamientoId) {
  if (!confirm("¿Eliminar imagen?")) return;
  try {
    const res = await fetch(`${API_URL}/imagenes/${idImagen}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error eliminando imagen");
      return;
    }
    cargarGaleria(alojamientoId);
cargarGaleriaAlojamientos(); // ✅ REFRESCA COLLAGE
  } catch (error) {
    console.error(error);
    alert("Error eliminando imagen");
  }
}

// ======================================
// HACER IMAGEN PRINCIPAL ALOJAMIENTO
// ======================================
async function hacerPrincipal(idImagen, alojamientoId) {

  try {
    const res = await fetch(`${API_URL}/imagenes/${idImagen}/principal`, {
      method: "PUT",
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error asignando imagen principal");
      return;
    }

    // 🔥 RECARGAR GALERÍA DEL ALOJAMIENTO
    await cargarGaleria(alojamientoId);

    // 🔥 🔥 🔥 ESTA ES LA LÍNEA QUE TE FALTABA 🔥 🔥 🔥
    cargarGaleriaAlojamientos();

  } catch (error) {
    console.error(error);
  }
}

// ======================================
// LIGHTBOX
// ======================================
function abrirLightbox(imgOrSrc) {
  if (!imgOrSrc) return;

  let src = typeof imgOrSrc === "string" ? imgOrSrc : imgOrSrc.src;
  let alojamientoId = imgOrSrc.dataset?.alojamiento || null;

  const resaltarAlojamientoObjetivo = (idAlojamiento) => {
    const card = document.querySelector(`.card-item[data-id='${idAlojamiento}']`);
    if (!card) return;

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("resaltar");
    void card.offsetWidth;
    card.classList.add("resaltar");

    if (card.__resaltarTimeout) {
      clearTimeout(card.__resaltarTimeout);
    }

    card.__resaltarTimeout = window.setTimeout(() => {
      card.classList.remove("resaltar");
      card.__resaltarTimeout = null;
    }, 4000);
  };

  let lightbox = document.getElementById("lightbox");

  // Crear lightbox si no existe
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
      flexDirection: "column",
      zIndex: "9999",
    });

    const img = document.createElement("img");
    img.id = "lightbox-img";
    Object.assign(img.style, {
      maxWidth: "90%",
      maxHeight: "80%",
      borderRadius: "10px",
      boxShadow: "0 0 20px #000",
      marginBottom: "15px",
    });
    lightbox.appendChild(img);

    const btn = document.createElement("button");
    btn.id = "lightbox-btn";
    btn.textContent = "➡️ Ver alojamiento";
    btn.type = "button";
    Object.assign(btn.style, {
      padding: "10px 20px",
      border: "none",
      backgroundColor: "var(--primary)",
      color: "white",
      fontSize: "16px",
      borderRadius: "8px",
      cursor: "pointer",
      display: "none",
    });
    btn.addEventListener("click", () => {
      const alojamientoObjetivo = Number(btn.dataset.alojamiento || 0);
      if (alojamientoObjetivo) {
        resaltarAlojamientoObjetivo(alojamientoObjetivo);
      }
      lightbox.style.display = "none";
    });
    lightbox.addEventListener("click", e => {
      if (e.target === lightbox) lightbox.style.display = "none";
    });

    lightbox.appendChild(btn);
    document.body.appendChild(lightbox);
  }

  const imgElement = document.getElementById("lightbox-img");
  if (!imgElement) return;
  imgElement.src = src || "https://via.placeholder.com/300?text=No+Img";

  const btn = document.getElementById("lightbox-btn");
  if (btn) {
    if (alojamientoId) {
      btn.style.display = "inline-block";
      btn.dataset.alojamiento = alojamientoId;
    } else {
      btn.style.display = "none";
    }
  }

  lightbox.style.display = "flex";
}



function abrirLightboxDesdeGaleria(src, alojamientoId) {
  abrirLightbox(src);

  const btn = document.getElementById("lightbox-btn");

  if (btn) {
    btn.style.display = "inline-block";
    btn.textContent = "➡️ Ir alojamiento";
    btn.dataset.alojamiento = String(alojamientoId);
  }
}


// ======================================
// CERRAR SESIÓN
// ======================================
function cerrarSesion() {
  localStorage.clear();
  window.location.href = "../index.html";
}

// ======================================
// HABITACIONES
// ======================================
async function crearHabitacion() {
  const alojamientoId = document.getElementById("hab_alojamientoId").value;
  const nombre = document.getElementById("hab_nombre").value.trim();
  const capacidad = document.getElementById("hab_capacidad").value;
  const precio = document.getElementById("hab_precio").value;

  if (!alojamientoId || !nombre || !capacidad || !precio) {
    alert("Todos los campos son obligatorios");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/habitaciones/${alojamientoId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nombre, capacidad, precio })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error creando habitación");
      return;
    }
    alert("Habitación creada correctamente");
    cargarHabitaciones();
    cargarAlojamientos();
    const _fh = document.getElementById("formContainerHab");
    const _th = document.getElementById("toggleHabitaciones");
    if (_fh && _th) colapsarSeccion(_th, _fh);

    document.getElementById("hab_nombre").value = "";
    document.getElementById("hab_capacidad").value = "";
    document.getElementById("hab_precio").value = "";
  } catch (error) {
    console.error(error);
    alert("Error de conexión");
  }
}

async function cargarHabitaciones() {
  const alojamientoId = document.getElementById("buscarAlojamiento").value;
  if (!alojamientoId) {
    alert("Ingresa el ID del alojamiento");
    return;
  }
  if (misAlojamientosIds.size && !misAlojamientosIds.has(Number(alojamientoId))) {
    alert("Ese alojamiento no pertenece a tu cuenta de anfitrión.");
    return;
  }
  try {
    actualizarGraficaOcupacion(alojamientoId);
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    const contenedor = document.getElementById("listaHabitaciones");
    contenedor.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>No hay habitaciones</p>";
      const filtrosElVacio = document.getElementById('filtrosHabitaciones');
      if (filtrosElVacio) filtrosElVacio.style.display = 'none';
      programarActualizacionHabitacionesPuntual([]);
      return;
    }

    habitacionesEstadoCache.clear();
    data.forEach((h) => habitacionesEstadoCache.set(Number(h.id), h));

    // Mostrar filtros
    const filtrosEl = document.getElementById('filtrosHabitaciones');
    if (filtrosEl) {
      filtrosEl.style.display = 'block';
      // Resetear a "Todos" al recargar
      document.querySelectorAll('.filtro-hab-btn').forEach(b => {
        const esTodos = b.dataset.filtro === 'todos';
        b.classList.toggle('filtro-hab-activo', esTodos);
        actualizarEstiloFiltroBtn(b, esTodos);
      });
    }
    actualizarConteoFiltro('todos', data.length, data.length);

    data.forEach(hab => {
      asegurarCronometroSegunEstado(hab);
      const div = document.createElement("div");
      div.classList.add("card-item");
      div.dataset.estadoHab = hab.estado || 'disponible';
      const estadoActual = hab.estado || "disponible";
      const estadoColor = estadoActual === "mantenimiento"
        ? "#ff9800"
        : (estadoActual === "ocupada" ? "#f44336" : (estadoActual === "limpieza" ? "#1e88e5" : "#4caf50"));
      const isDisponible = estadoActual === "disponible";
      const isOcupada = estadoActual === "ocupada";
      const isMantenimiento = estadoActual === "mantenimiento";
      const isLimpieza = estadoActual === "limpieza";
      const tieneLimpiezaProgramada = Boolean(String(hab.limpieza_hasta || '').trim());
      const chipStyle = (activo, color) => `border:1px solid ${color}; background:${activo ? color : 'transparent'}; color:${activo ? '#fff' : color};`;
      const proxima = hab.proxima_disponibilidad ? formatearFechaDisponibilidad(hab.proxima_disponibilidad) : "Por definir";
      const bloqueInfo = isOcupada
        ? `<p style="color:#f44336;"><small>🔒 Reservada temporalmente. Disponible desde: <strong>${proxima}</strong></small></p>`
        : (isMantenimiento
          ? `<p style="color:#ff9800;"><small>🛠 En mantenimiento. Disponible desde: <strong>${proxima}</strong>${hab.mantenimiento_estimado_horas ? ` (${Number(hab.mantenimiento_estimado_horas).toFixed(1)} h estimadas)` : ''}</small></p>`
          : (isLimpieza
            ? `<p style="color:#1e88e5;"><small>🧹 Habitación en limpieza . Próxima disponibilidad: <strong>${proxima}</strong>.</small></p>`
            : ''));
      const notificacionLimpieza = (isLimpieza && !tieneLimpiezaProgramada)
        ? `<div style="margin-top:8px;padding:10px;border:1px solid #90caf9;border-radius:8px;background:#eef6ff;">
            <p style="margin:0 0 8px 0;color:#0d47a1;"><small>Notificación: define fecha y hora exactas para liberar la habitación (opcional por ahora).</small></p>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <input id="limpieza-fin-${hab.id}" type="datetime-local" style="padding:6px 8px;border:1px solid #90caf9;border-radius:6px;" />
              <button type="button" style="border:1px solid #1e88e5;background:#1e88e5;color:#fff;" data-host-action="programar-limpieza" data-habitacion-id="${hab.id}">Guardar limpieza</button>
            </div>
          </div>`
        : '';
      const menuMantenimiento = !isOcupada
        ? `<div id="menu-mantenimiento-${hab.id}" class="menu-mantenimiento-inline" data-habitacion-id="${hab.id}">
            <p id="mantenimientoHabitacionInfo-${hab.id}" style="margin:0 0 8px 0;color:#a75a00;"><small>Notificación: define fecha y hora exactas para liberar la habitación ${hab.nombre}.</small></p>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <input id="mantenimientoFechaHoraFin-${hab.id}" type="datetime-local" value="${formatearFechaHoraInputLocal(hab.mantenimiento_hasta)}" style="padding:6px 8px;border:1px solid #ffcc80;border-radius:6px;" />
              <button type="button" id="btnConfirmarMantenimiento-${hab.id}" style="border:1px solid #ff9800;background:#ff9800;color:#fff;" data-host-action="confirmar-mantenimiento">Guardar mantenimiento</button>
              <button type="button" style="border:1px solid #ffd7a8;background:#fffaf2;color:#8a5a1f;" data-host-action="cerrar-modal-mantenimiento">Cancelar</button>
            </div>
          </div>`
        : '';
      div.innerHTML = `
  <h4>${hab.nombre}</h4>
  <p>👥 ${hab.capacidad}</p>
  <p>💰 $${hab.precio}</p>
  <p><strong>Estado:</strong> <span style="color:${estadoColor}; text-transform: capitalize;">${estadoActual}</span></p>
  ${bloqueInfo}
  <p id="cronometro-hab-${hab.id}" style="margin:6px 0 2px;color:${estadoColor};${(isMantenimiento || isLimpieza) ? '' : 'display:none;'}"></p>
  

  <div class="galeria" id="galeria-hab-${hab.id}"></div>

  <div class="botones-habitacion" style="margin-bottom:8px;">
    <button type="button" style="${chipStyle(isDisponible, '#4caf50')}" data-host-action="actualizar-estado-habitacion" data-habitacion-id="${hab.id}" data-estado="disponible">🟢 Disponible</button>
    <button style="${chipStyle(isOcupada, '#f44336')}" disabled title="Este estado se calcula automáticamente por reservas activas">🔴 No disponible</button>
    <button type="button" style="${chipStyle(isMantenimiento, '#ff9800')}${isOcupada ? ' opacity:0.5; cursor:not-allowed;' : ''}" data-host-action="solicitar-mantenimiento" data-habitacion-id="${hab.id}">🛠 Mantenimiento</button>
    <button type="button" style="${chipStyle(isLimpieza, '#1e88e5')}${isOcupada ? ' opacity:0.5; cursor:not-allowed;' : ''}" data-host-action="activar-limpieza" data-habitacion-id="${hab.id}">🧹 Limpieza</button>
    <button type="button" data-host-action="toggle-resumen-reserva" data-habitacion-id="${hab.id}">📄 Ver info huésped</button>
  </div>
  ${menuMantenimiento}
  ${notificacionLimpieza}

  <div id="reserva-hab-${hab.id}" style="display:none; margin-bottom: 10px; padding: 8px; border: 1px dashed #ccc; border-radius: 8px; background: #fff;"></div>

  <div class="botones-habitacion">
    <button type="button" data-host-action="editar-habitacion" data-habitacion-id="${hab.id}" data-habitacion-nombre="${escaparHtml(hab.nombre || '')}" data-habitacion-capacidad="${Number(hab.capacidad || 1)}" data-habitacion-precio="${Number(hab.precio || 0)}">✏️ Editar habitación</button>
    <button type="button" data-host-action="ver-servicios-habitacion" data-habitacion-id="${hab.id}">👁 Ver servicios</button>
    <button type="button" data-host-action="asignar-servicio-habitacion" data-habitacion-id="${hab.id}" data-alojamiento-id="${alojamientoId}">➕ Asignar servicio</button>
     <button type="button" data-host-action="eliminar-servicio-multiple" data-habitacion-id="${hab.id}">❌ Eliminar servicio</button>
    <button type="button" data-host-action="seleccionar-imagen-habitacion" data-habitacion-id="${hab.id}">📸 Agregar fotos</button>
    <button type="button" data-host-action="abrir-camara-habitacion" data-habitacion-id="${hab.id}">📷 Usar cámara</button>
    <button type="button" data-host-action="eliminar-habitacion" data-habitacion-id="${hab.id}">🗑️ Eliminar habitación</button>
  </div>
`;
      contenedor.appendChild(div);
      cargarGaleriaHabitacion(hab.id);
    });

    refrescarCronometrosHabitaciones();

    programarActualizacionHabitacionesPuntual(data);
  } catch (error) {
    console.error(error);
    alert("Error cargando habitaciones");
  }
}

function actualizarEstiloFiltroBtn(btn, activo) {
  const colores = {
    todos:        '#007B8A',
    disponible:   '#4caf50',
    ocupada:      '#f44336',
    mantenimiento:'#ff9800',
    limpieza:     '#1e88e5'
  };
  const color = colores[btn.dataset.filtro] || '#007B8A';
  btn.style.background = activo ? color : 'transparent';
  btn.style.color       = activo ? '#fff' : color;
  btn.style.border      = `1.5px solid ${color}`;
}

function actualizarConteoFiltro(filtro, visibles, total) {
  const el = document.getElementById('filtroHabConteo');
  if (!el) return;
  el.textContent = filtro === 'todos'
    ? `Mostrando ${total} habitación${total !== 1 ? 'es' : ''}`
    : `Mostrando ${visibles} de ${total} habitación${total !== 1 ? 'es' : ''} (${filtro})`;
}

function filtrarHabitaciones(filtro) {
  const tarjetas = document.querySelectorAll('#listaHabitaciones .card-item');
  let visibles = 0;
  tarjetas.forEach(card => {
    const estado = card.dataset.estadoHab || 'disponible';
    const mostrar = filtro === 'todos' || estado === filtro;
    card.style.display = mostrar ? '' : 'none';
    if (mostrar) visibles++;
  });
  actualizarConteoFiltro(filtro, visibles, tarjetas.length);
}

// Delegación de eventos para los botones de filtro
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro-hab-btn');
  if (!btn) return;
  const filtro = btn.dataset.filtro;
  document.querySelectorAll('.filtro-hab-btn').forEach(b => {
    const activo = b === btn;
    b.classList.toggle('filtro-hab-activo', activo);
    actualizarEstiloFiltroBtn(b, activo);
  });
  filtrarHabitaciones(filtro);
});

async function actualizarEstadoHabitacion(habitacionId, estado, extras = {}) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/estado`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ estado, ...extras })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo actualizar el estado de la habitación");
      return false;
    }

    if (estadoConCronometro(estado)) {
      registrarInicioCronometro(habitacionId, estado);
    } else {
      limpiarCronometro(habitacionId);
    }

    await cargarHabitaciones();
    await cargarAlojamientos();
    return true;
  } catch (error) {
    console.error(error);
    alert("Error de conexión actualizando estado");
    return false;
  }
}

async function solicitarMantenimiento(habitacionId) {
  const hab = habitacionesEstadoCache.get(Number(habitacionId)) || null;
  const estadoActual = String(hab?.estado || '').toLowerCase();

  if (estadoActual === 'ocupada') {
    const prox = hab?.proxima_disponibilidad ? formatearFechaDisponibilidad(hab.proxima_disponibilidad) : 'Por definir';
    alert(`⚠️ No puedes poner en mantenimiento esta habitación porque actualmente se encuentra ocupada. Disponible desde: ${prox}`);
    return;
  }

  abrirModalMantenimiento(habitacionId, hab);
}

async function activarLimpieza(habitacionId) {
  const hab = habitacionesEstadoCache.get(Number(habitacionId)) || null;
  const estadoActual = String(hab?.estado || '').toLowerCase();
  if (estadoActual === 'ocupada') {
    const prox = hab?.proxima_disponibilidad ? formatearFechaDisponibilidad(hab.proxima_disponibilidad) : 'Por definir';
    alert(`⚠️ No puedes poner en limpieza esta habitación porque actualmente se encuentra ocupada. Disponible desde: ${prox}`);
    return;
  }

  await actualizarEstadoHabitacion(habitacionId, 'limpieza', {});
}

async function programarLimpieza(habitacionId) {
  const input = document.getElementById(`limpieza-fin-${habitacionId}`);
  const valor = String(input?.value || '').trim();
  if (!valor) {
    alert('⚠️ Debes seleccionar fecha y hora de finalización de limpieza.');
    return;
  }

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime()) || fecha <= new Date()) {
    alert('⚠️ La fecha y hora deben ser posteriores al momento actual.');
    return;
  }

  await actualizarEstadoHabitacion(habitacionId, 'limpieza', { limpieza_hasta: fecha.toISOString() });
}

function cerrarMenusMantenimiento(exceptoHabitacionId = null) {
  const excepto = Number(exceptoHabitacionId || 0);
  document.querySelectorAll('.menu-mantenimiento-inline.visible').forEach((menu) => {
    const menuId = Number(menu.dataset.habitacionId || 0);
    if (excepto && menuId === excepto) return;
    menu.classList.remove('visible');
  });
}

function abrirModalMantenimiento(habitacionId, hab) {
  const menu = document.getElementById(`menu-mantenimiento-${habitacionId}`);
  const info = document.getElementById(`mantenimientoHabitacionInfo-${habitacionId}`);
  const input = document.getElementById(`mantenimientoFechaHoraFin-${habitacionId}`);
  if (!menu || !input) return;

  const yaVisible = menu.classList.contains('visible') && Number(mantenimientoHabitacionSeleccionada) === Number(habitacionId);
  cerrarMenusMantenimiento(habitacionId);

  if (yaVisible) {
    menu.classList.remove('visible');
    mantenimientoHabitacionSeleccionada = null;
    return;
  }

  mantenimientoHabitacionSeleccionada = Number(habitacionId);

  if (info) {
    const nombre = String(hab?.nombre || `Habitación #${habitacionId}`);
    info.textContent = `Habitación seleccionada: ${nombre}. Define la fecha y hora exactas de disponibilidad.`;
  }

  input.value = formatearFechaHoraInputLocal(hab?.mantenimiento_hasta || '');
  menu.classList.add('visible');
}

function cerrarModalMantenimiento() {
  const habitacionId = Number(mantenimientoHabitacionSeleccionada || 0);
  const menu = habitacionId ? document.getElementById(`menu-mantenimiento-${habitacionId}`) : null;
  const input = habitacionId ? document.getElementById(`mantenimientoFechaHoraFin-${habitacionId}`) : null;
  if (menu) menu.classList.remove('visible');
  if (input) input.value = '';
  mantenimientoHabitacionSeleccionada = null;
}

async function confirmarMantenimientoProgramado() {
  const habitacionId = Number(mantenimientoHabitacionSeleccionada || 0);
  const input = habitacionId ? document.getElementById(`mantenimientoFechaHoraFin-${habitacionId}`) : null;
  const valor = String(input?.value || '').trim();

  if (!habitacionId) {
    alert('⚠️ No se encontró la habitación a programar.');
    return;
  }

  if (!valor) {
    alert('⚠️ Debes seleccionar una fecha y hora de disponibilidad.');
    return;
  }

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime()) || fecha <= new Date()) {
    alert('⚠️ La fecha y hora deben ser posteriores al momento actual.');
    return;
  }

  const ok = await actualizarEstadoHabitacion(habitacionId, 'mantenimiento', { mantenimiento_hasta: fecha.toISOString() });
  if (ok) {
    cerrarModalMantenimiento();
  }
}

async function toggleResumenReservaHabitacion(habitacionId) {
  const contenedor = document.getElementById(`reserva-hab-${habitacionId}`);
  if (!contenedor) return;

  if (contenedor.style.display === "block") {
    contenedor.style.display = "none";
    return;
  }

  try {
    const alojamientoId = document.getElementById("buscarAlojamiento").value;
    const res = await fetch(`${API_URL}/reservas/alojamiento/${alojamientoId}`, { headers });
    const reservas = await res.json();
    if (!res.ok) {
      alert(reservas.error || "No se pudo consultar la información de reservas.");
      return;
    }

    const reserva = Array.isArray(reservas)
      ? reservas.find(r => Number(r.id_habitacion) === Number(habitacionId))
      : null;

    if (!reserva) {
      contenedor.innerHTML = "<p>No hay información de huésped registrada para esta habitación.</p>";
      contenedor.style.display = "block";
      return;
    }

    const inicio = reserva.fecha_entrada ? new Date(`${reserva.fecha_entrada}T00:00:00`) : null;
    const fin = reserva.fecha_salida ? new Date(`${reserva.fecha_salida}T00:00:00`) : null;
    const noches = Number(reserva.noches || (inicio && fin ? Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)) : 0));
    const subtotalHospedaje = Number(reserva.subtotal_hospedaje || 0);
    const subtotalServicios = Number(reserva.subtotal_servicios || 0);
    const total = Number(reserva.precio_total || 0);

    let serviciosTexto = "No seleccionó servicios adicionales.";
    if (reserva.detalle_servicios_json) {
      try {
        const lista = JSON.parse(reserva.detalle_servicios_json);
        if (Array.isArray(lista) && lista.length) {
          serviciosTexto = lista
            .map((s) => `${s.nombre || 'Servicio'} ($${Number(s.valor || 0).toLocaleString('es-CO')})`)
            .join(", ");
        }
      } catch (e) {
        console.warn("No se pudo parsear detalle_servicios_json", e);
      }
    }

    contenedor.innerHTML = `
      <p><strong>Reserva #:</strong> ${reserva.id}</p>
      <p><strong>Referencia pago:</strong> ${reserva.referencia_pago || "-"}</p>
      <p><strong>Alojamiento:</strong> ID ${alojamientoId}</p>
      <p><strong>Habitación:</strong> ${reserva.habitacion || "-"}</p>
      <p><strong>Huésped:</strong> ${reserva.titular_nombre || "No registrado"}</p>
      <p><strong>Documento:</strong> ${(reserva.titular_documento_tipo || "") + " " + (reserva.titular_documento_numero || "")}</p>
      <p><strong>Correo:</strong> ${reserva.titular_correo || "No registrado"}</p>
      <p><strong>Teléfono:</strong> ${reserva.titular_telefono || "No registrado"}</p>
      <p><strong>Fecha inicio:</strong> ${reserva.fecha_entrada || "-"}</p>
      <p><strong>Fecha fin:</strong> ${reserva.fecha_salida || "-"}</p>
      <p><strong>Noches seleccionadas:</strong> ${noches > 0 ? noches : "-"}</p>
      <p><strong>Valor por estadía:</strong> $${subtotalHospedaje.toLocaleString("es-CO")}</p>
      <p><strong>Servicios adicionales:</strong> ${serviciosTexto}</p>
      <p><strong>Total servicios:</strong> $${subtotalServicios.toLocaleString("es-CO")}</p>
      <p><strong>Total acumulado:</strong> $${total.toLocaleString("es-CO")}</p>
      <p><strong>Estado:</strong> ${reserva.estado || "-"}</p>
    `;
    contenedor.style.display = "block";
  } catch (error) {
    console.error(error);
    alert("Error consultando el detalle de reserva.");
  }
}

async function gestionarReservasAlojamiento(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/reservas/alojamiento/${alojamientoId}`, { headers });
    const reservas = await res.json();
    if (!res.ok) {
      alert(reservas.error || "No se pudieron cargar reservas del alojamiento.");
      return;
    }

    const activas = (reservas || []).filter(r => ["pendiente", "confirmada", "en_curso"].includes(r.estado));
    if (!activas.length) {
      alert("No hay reservas activas para gestionar en este alojamiento.");
      return;
    }

    const lista = activas.map(r => `#${r.id} | Hab: ${r.habitacion} | ${r.fecha_entrada} a ${r.fecha_salida} | ${r.titular_nombre || r.titular_correo || 'Sin titular'}`).join("\n");
    const idReserva = prompt(`Reservas activas:\n\n${lista}\n\nEscribe el ID de la reserva a cancelar/liberar:`);
    if (!idReserva) return;

    const motivo = prompt("Motivo de cancelación (obligatorio):");
    if (!motivo || !motivo.trim()) {
      alert("El motivo es obligatorio.");
      return;
    }

    const porcentajeRaw = prompt("Porcentaje de reembolso (0 a 100):", "100");
    const porcentaje = Number(porcentajeRaw);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      alert("Porcentaje inválido.");
      return;
    }

    await cancelarReservaComoAnfitrion(idReserva, motivo, porcentaje);
  } catch (error) {
    console.error(error);
    alert("Error gestionando reservas del alojamiento.");
  }
}

async function cancelarReservaComoAnfitrion(idReserva, motivo, porcentajeReembolso) {
  try {
    const res = await fetch(`${API_URL}/reservas/${idReserva}/cancelar-anfitrion`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ motivo, porcentajeReembolso })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo cancelar la reserva.");
      return;
    }
    alert(`Reserva cancelada. Reembolso definido: ${porcentajeReembolso}%`);
    await cargarHabitaciones();
    await cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("Error de conexión al cancelar reserva.");
  }
}

// ======================================
// CHATBOT CANCELACIONES - ANFITRION
// ======================================
function limpiarResultadoCodigoReserva() {
  const panel = document.getElementById("resultadoCodigoReserva");
  if (panel) panel.innerHTML = "";
  const input = document.getElementById("codigoReservaInput");
  if (input) input.value = "";
}

function renderResultadoCodigoReserva(data) {
  const panel = document.getElementById("resultadoCodigoReserva");
  if (!panel) return;

  const reserva = data?.reserva || {};
  const turista = data?.turista || {};
  const alojamiento = data?.alojamiento || {};
  const habitacion = data?.habitacion || {};
  const servicios = Array.isArray(data?.servicios) ? data.servicios : [];

  const serviciosHtml = servicios.length
    ? `<ul class="servicios-lista">${servicios.map((s) => `<li>${s.nombre || "Servicio"} - $${Number(s.valor || 0).toLocaleString("es-CO")}</li>`).join("")}</ul>`
    : "<p style=\"margin-top:10px;\">Sin servicios adicionales.</p>";

  panel.innerHTML = `
    <div class="ok">
      <strong>Código válido.</strong> La información de la reserva fue verificada y el código quedó quemado.
      <div class="detalle-grid">
        <div><strong>Reserva:</strong> #${reserva.id || "-"}</div>
        <div><strong>Estado:</strong> ${reserva.estado || "-"}</div>
        <div><strong>Turista:</strong> ${turista.nombre || "-"}</div>
        <div><strong>Correo:</strong> ${turista.correo || "-"}</div>
        <div><strong>Teléfono:</strong> ${turista.telefono || "-"}</div>
        <div><strong>Documento:</strong> ${(turista.documento_tipo || "-") + " " + (turista.documento_numero || "")}</div>
        <div><strong>Alojamiento:</strong> ${alojamiento.titulo || "-"}</div>
        <div><strong>Habitación:</strong> ${habitacion.nombre || "-"}</div>
        <div><strong>Fechas:</strong> ${(reserva.fecha_entrada || "-") + " a " + (reserva.fecha_salida || "-")}</div>
        <div><strong>Personas:</strong> ${Number(reserva.personas || 0)}</div>
        <div><strong>Total:</strong> $${Number(reserva.precio_total || 0).toLocaleString("es-CO")}</div>
        <div><strong>Noches:</strong> ${Number(reserva.noches || 0)}</div>
      </div>
      <div>
        <strong>Servicios:</strong>
        ${serviciosHtml}
      </div>
    </div>
  `;
}

async function validarCodigoConfirmacionReserva() {
  const input = document.getElementById("codigoReservaInput");
  const panel = document.getElementById("resultadoCodigoReserva");
  const codigo = String(input?.value || "").trim();

  if (!panel) return;
  if (!codigo) {
    panel.innerHTML = '<div class="error">Debes ingresar el código de confirmación.</div>';
    return;
  }

  panel.innerHTML = "<p>Validando código...</p>";

  try {
    const res = await fetch(`${API_URL}/reservas/codigo-confirmacion/verificar`, {
      method: "POST",
      headers,
      body: JSON.stringify({ codigo })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      panel.innerHTML = `<div class="error">${data.mensaje || data.error || "No se pudo validar el código."}</div>`;
      return;
    }

    renderResultadoCodigoReserva(data.detalle || {});
  } catch (error) {
    console.error(error);
    panel.innerHTML = '<div class="error">Error de conexión validando el código.</div>';
  }
}

async function cargarSolicitudesCancelacionAnfitrion() {
  const contenedor = document.getElementById("listaCancelacionesPendientes");
  if (!contenedor) return;

  contenedor.innerHTML = "<p>Cargando solicitudes...</p>";

  try {
    const res = await fetch(`${API_URL}/cancelaciones/pendientes-anfitrion`, { headers });
    const data = await res.json();

    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.mensaje || data.error || "No se pudieron cargar solicitudes."}</p>`;
      return;
    }

    const solicitudes = Array.isArray(data.cancelaciones) ? data.cancelaciones : [];
    if (!solicitudes.length) {
      contenedor.innerHTML = "<p>No hay solicitudes de cancelacion pendientes.</p>";
      return;
    }

    contenedor.innerHTML = "";

    solicitudes.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card-item cancelacion-item";

      card.innerHTML = `
        <h4>Solicitud #${item.cancelacion_id} - Reserva #${item.reserva_id}</h4>
        <p><strong>Alojamiento:</strong> ${item.alojamiento_titulo || "-"}</p>
        <p><strong>Habitacion:</strong> ${item.habitacion_nombre || "-"}</p>
        <p><strong>Turista:</strong> ${item.turista_nombre || "-"} (${item.email_turista || "sin correo"})</p>
        <p><strong>Fechas:</strong> ${item.fecha_entrada || "-"} a ${item.fecha_salida || "-"}</p>
        <p><strong>Total reserva:</strong> $${Number(item.precio_total || 0).toLocaleString("es-CO")}</p>
        <p><strong>Motivo turista:</strong> ${item.motivo || "-"}</p>

        <div class="fila">
          <div>
            <label for="pct-${item.cancelacion_id}">Porcentaje devolucion (0-100)</label>
            <input id="pct-${item.cancelacion_id}" type="number" min="0" max="100" value="100" />
          </div>
          <div>
            <label for="motivo-${item.cancelacion_id}">Motivo descuento / observacion</label>
            <textarea id="motivo-${item.cancelacion_id}" placeholder="Ej: politicas, no-show parcial, gastos administrativos"></textarea>
          </div>
          <div>
            <label for="metodo-${item.cancelacion_id}">Método de reembolso</label>
            <select id="metodo-${item.cancelacion_id}">
              <option value="pse">PSE</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
            </select>
          </div>
          <div>
            <label for="pasarela-${item.cancelacion_id}">Pasarela</label>
            <input id="pasarela-${item.cancelacion_id}" type="text" value="wompi" placeholder="Ej: wompi" />
          </div>
        </div>

        <div class="acciones">
          <button type="button" data-host-action="aplicar-refund-cancelacion" data-cancelacion-id="${item.cancelacion_id}">✅ Confirmar cancelacion y notificar</button>
        </div>
      `;

      contenedor.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error de conexion cargando solicitudes.</p>";
  }
}

async function aplicarRefundCancelacion(cancelacionId) {
  const pctInput = document.getElementById(`pct-${cancelacionId}`);
  const motivoInput = document.getElementById(`motivo-${cancelacionId}`);
  const metodoInput = document.getElementById(`metodo-${cancelacionId}`);
  const pasarelaInput = document.getElementById(`pasarela-${cancelacionId}`);

  const porcentaje = Number(pctInput?.value ?? 100);
  const motivo = String(motivoInput?.value || "").trim() || "Sin observaciones";
  const metodo = String(metodoInput?.value || "pse").trim().toLowerCase();
  const pasarela = String(pasarelaInput?.value || "wompi").trim().toLowerCase() || "wompi";

  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    alert("El porcentaje de devolucion debe estar entre 0 y 100.");
    return;
  }

  if (!confirm(`Se confirmara la cancelacion con ${porcentaje}% de devolucion. Continuar?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/cancelaciones/aplicar-refund`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cancelacion_id: cancelacionId,
        porcentaje_devolucion: porcentaje,
        motivo_descuento: motivo,
        metodo_reembolso: metodo,
        pasarela_reembolso: pasarela
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.mensaje || data.error || "No se pudo confirmar la cancelacion.");
      return;
    }

    if (data?.detalle_reembolso?.referencia) {
      alert(`${data.mensaje || "Cancelacion confirmada."}\nReferencia devolución: ${data.detalle_reembolso.referencia}`);
    } else {
      alert(data.mensaje || "Cancelacion confirmada correctamente.");
    }
    await cargarSolicitudesCancelacionAnfitrion();
    await cargarAlojamientos();
    await cargarHabitaciones();
  } catch (error) {
    console.error(error);
    alert("Error de conexion al confirmar cancelacion.");
  }
}

// ======================================
// ELIMINAR HABITACIÓN
// ======================================
async function eliminarHabitacion(habitacionId) {
  if (!confirm("¿Seguro que quieres eliminar esta habitación?")) return;
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error eliminando habitación");
      return;
    }
    alert("🗑️ Habitación eliminada correctamente");
    cargarHabitaciones();
    cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert("Error de conexión");
  }
}

async function editarAlojamientoDesdeDataset(actionEl) {
  const id = Number(actionEl?.dataset?.alojamientoId || 0);
  if (!id) return;

  const tituloActual = String(actionEl.dataset.alojamientoTitulo || '').trim();
  const precioActual = Number(actionEl.dataset.alojamientoPrecio || 0);
  const capacidadActual = Number(actionEl.dataset.alojamientoCapacidad || 1);
  const ubicacionActual = String(actionEl.dataset.alojamientoUbicacion || '').trim();
  const descripcionActual = String(actionEl.dataset.alojamientoDescripcion || '').trim();

  const titulo = prompt('Título del alojamiento:', tituloActual);
  if (titulo === null) return;
  const precioTexto = prompt('Precio por noche:', String(precioActual || ''));
  if (precioTexto === null) return;
  const capacidadTexto = prompt('Capacidad de personas:', String(capacidadActual || ''));
  if (capacidadTexto === null) return;
  const ubicacion = prompt('Ubicación:', ubicacionActual);
  if (ubicacion === null) return;
  const descripcion = prompt('Descripción:', descripcionActual);
  if (descripcion === null) return;

  const precio = Number(precioTexto);
  const capacidad_personas = Number(capacidadTexto);

  if (!String(titulo).trim() || !Number.isFinite(precio) || precio <= 0 || !Number.isFinite(capacidad_personas) || capacidad_personas <= 0) {
    alert('⚠️ Título, precio y capacidad deben ser válidos.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        titulo: String(titulo).trim(),
        descripcion: String(descripcion || '').trim(),
        ubicacion: String(ubicacion || '').trim(),
        precio,
        capacidad_personas
      })
    });
    if (manejarSesionExpirada(res)) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'No se pudo actualizar el alojamiento.');
      return;
    }

    alert(data.mensaje || 'Alojamiento actualizado.');
    invalidarCacheAlojamientosAnfitrion();
    await cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert('Error actualizando alojamiento.');
  }
}

async function editarHabitacionDesdeDataset(actionEl) {
  const id = Number(actionEl?.dataset?.habitacionId || 0);
  if (!id) return;

  const nombreActual = String(actionEl.dataset.habitacionNombre || '').trim();
  const capacidadActual = Number(actionEl.dataset.habitacionCapacidad || 1);
  const precioActual = Number(actionEl.dataset.habitacionPrecio || 0);

  const nombre = prompt('Nombre de la habitación:', nombreActual);
  if (nombre === null) return;
  const capacidadTexto = prompt('Capacidad:', String(capacidadActual || ''));
  if (capacidadTexto === null) return;
  const precioTexto = prompt('Precio por noche:', String(precioActual || ''));
  if (precioTexto === null) return;

  const capacidad = Number(capacidadTexto);
  const precio = Number(precioTexto);

  if (!String(nombre).trim() || !Number.isFinite(capacidad) || capacidad <= 0 || !Number.isFinite(precio) || precio <= 0) {
    alert('⚠️ Debes ingresar nombre, capacidad y precio válidos.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/habitaciones/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        nombre: String(nombre).trim(),
        capacidad,
        precio
      })
    });
    if (manejarSesionExpirada(res)) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'No se pudo actualizar la habitación.');
      return;
    }

    alert(data.mensaje || 'Habitación actualizada.');
    await cargarHabitaciones();
    await cargarAlojamientos();
  } catch (error) {
    console.error(error);
    alert('Error actualizando habitación.');
  }
}

// ======================================
// ASIGNAR SERVICIO A HABITACIÓN
// ======================================
// ======================================
// ASIGNAR SERVICIOS (MULTI SELECCIÓN)
// ======================================

let habitacionServicioActual = null; // VARIABLE GLOBAL
let modoEliminandoServicios = false; // variable compartida para el flujo de eliminación

async function asignarServicio(habitacionId) {
  habitacionServicioActual = habitacionId;

  try {
    // Obtener todos los servicios disponibles
    // ===============================
// 1️⃣ Obtener datos de la habitación
// ===============================
async function asignarServicio(habitacionId, alojamientoId) {
  habitacionServicioActual = habitacionId;

  try {
    // 🔥 USAR DIRECTAMENTE el alojamientoId (SIN fetch)
    


const res = await fetch(
  `${API_URL}/alojamientos/${alojamientoId}/servicios`,
  { headers }
);

const servicios = await res.json();


    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("No hay servicios disponibles");
      return;
    }

    const resHab = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const actuales = await resHab.json();
    const actualesIds = actuales.map(s => s.id);

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    document.getElementById("modalServicios").style.display = "flex";

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios");
  }
}


// ===============================
// 2️⃣ Obtener TODOS los servicios del sistema
// ===============================
const res = await fetch(
  `${API_URL}/services`,
  { headers }
);

const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("No hay servicios disponibles");
      return;
    }

    // Obtener los servicios actuales de la habitación
    const resHab = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const actuales = await resHab.json();
    const actualesIds = actuales.map(s => s.id);

    // Limpiar y crear checkboxes
    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    // Abrir modal
    document.getElementById("modalServicios").style.display = "flex";

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios");
  }
}

// ======================================
// ELIMINAR SERVICIO DE HABITACIÓN
// ======================================
async function eliminarServicioPrompt(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Esta habitación no tiene servicios");
      return;
    }

    let lista = "";
    servicios.forEach((s, index) => lista += `${index + 1} - ${s.nombre}\n`);

    const servicioSeleccion = prompt("Servicios actuales:\n\n" + lista + "\nIngrese el número del servicio a eliminar:");
    if (!servicioSeleccion) return;

    const index = Number(servicioSeleccion) - 1;
    if (index < 0 || index >= servicios.length) {
      alert("⚠️ Número de servicio inválido");
      return;
    }

    const servicioId = servicios[index].id;
    const resDelete = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios/${servicioId}`, { method: "DELETE", headers });
    const data = await resDelete.json();
    if (!resDelete.ok) {
      alert(data.error || "❌ Error eliminando servicio");
      return;
    }
    alert("🗑️ Servicio eliminado correctamente");
    cargarHabitaciones();
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión");
  }
}

// ======================================
// CÁMARA PRO
// ======================================
let streamCamara = null;

async function abrirCamaraPro(alojamientoId) {
  window.alojamientoActual = alojamientoId;
  window.tipoSubida = "alojamiento";
  const modal = document.getElementById("camaraModal");
  const video = document.getElementById("videoCamara");
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = streamCamara;
    video.onloadedmetadata = () => video.play();
    modal.style.display = "flex";
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo acceder a la cámara");
  }
}

function tomarFoto() {
  const video = document.getElementById("videoCamara");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  canvas.toBlob(async blob => {
    if (!blob) return;
    cerrarCamara();
    const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
    mostrarPreview(file);
    await subirImagenCamara(file);
  }, "image/jpeg");
}

function mostrarPreview(file) {
  const previewContainer = document.getElementById("previewContainer");
  if (!previewContainer) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.createElement("img");
    img.src = e.target.result;
    img.style.width = "120px";
    previewContainer.appendChild(img);
  };
  reader.readAsDataURL(file);
}



function cerrarCamara() {
  if (streamCamara) {
    streamCamara.getTracks().forEach(track => track.stop());
    streamCamara = null;
  }

  const modal = document.getElementById("camaraModal");
  if (modal) modal.style.display = "none";
}




async function subirImagenCamara(file) {
  const formData = new FormData();
  formData.append("imagenes", file);

  let url = "";

  if (window.tipoSubida === "habitacion") {
    url = `${API_URL}/habitaciones/${window.habitacionActual}/imagenes`;
  } else {
    url = `${API_URL}/alojamientos/${window.alojamientoActual}/imagenes`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData
  });

  if (!res.ok) {
    alert("❌ Error subiendo imagen desde cámara");
    return;
  }

  // ✅ REFRESCAR BIEN
  if (window.tipoSubida === "habitacion") {
    await cargarGaleriaHabitacion(window.habitacionActual);
  } else {
    await cargarGaleria(window.alojamientoActual);
    await cargarGaleriaAlojamientos(); // 🔥 IMPORTANTE
  }
}

// ======================================
// CONTAR HABITACIONES POR ALOJAMIENTO
// ======================================
async function obtenerCantidadHabitaciones(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    if (!Array.isArray(data)) return 0;
    return data.length;
  } catch (error) {
    console.error("Error obteniendo habitaciones", error);
    return 0;
  }
}

// ======================================
// RESUMEN DE HABITACIONES
// ======================================
async function obtenerResumenHabitaciones(alojamientoId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/mis-alojamiento/${alojamientoId}`, { headers });
    const data = await res.json();
    if (!Array.isArray(data)) {
      return { total: 0, disponibles: 0, ocupadas: 0, mantenimiento: 0, limpieza: 0 };
    }
    let disponibles = 0;
    let ocupadas = 0;
    let mantenimiento = 0;
    let limpieza = 0;
    data.forEach(hab => {
      if (hab.estado === "ocupada") {
        ocupadas++;
      } else if (hab.estado === "mantenimiento") {
        mantenimiento++;
      } else if (hab.estado === "limpieza") {
        limpieza++;
      } else {
        disponibles++;
      }
    });
    return { total: data.length, disponibles, ocupadas, mantenimiento, limpieza };
  } catch (error) {
    console.error("Error obteniendo resumen", error);
    return { total: 0, disponibles: 0, ocupadas: 0, mantenimiento: 0, limpieza: 0 };
  }
}

// ======================================
// CREAR SERVICIO PARA UN ALOJAMIENTO
// ======================================


// ======================================
// BOTÓN PARA CREAR SERVICIO
// ======================================
// ======================================
// VER SERVICIOS DE UNA HABITACIÓN
// ======================================
async function verServiciosHabitacion(habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("❌ Esta habitación no tiene servicios asignados");
      return;
    }

    let lista = "🛎️ Servicios de la habitación:\n\n";
    servicios.forEach((s, i) => { lista += `${i + 1}. ${s.nombre}\n`; });
    alert(lista);
  } catch (error) {
    console.error(error);
    alert("Error obteniendo servicios");
  }
}

// ======================================
// SELECCIONAR IMAGEN HABITACIÓN
// ======================================
function seleccionarImagenHabitacion(habitacionId) {
  const input = document.getElementById("inputImagen");

  input.dataset.habitacionId = habitacionId;
  input.dataset.tipo = "habitacion";

  // 🔥 LIMPIAR alojamiento
  delete input.dataset.alojamientoId;

  input.click();
}
// ======================================
// CÁMARA HABITACIÓN
// ======================================
async function abrirCamaraHabitacion(habitacionId) {
  window.habitacionActual = habitacionId;
  window.tipoSubida = "habitacion";
  const modal = document.getElementById("camaraModal");
  const video = document.getElementById("videoCamara");
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = streamCamara;
    video.play();
    modal.style.display = "flex";
  } catch (error) {
    alert("No se pudo acceder a la cámara");
  }
}

// ======================================
// GALERÍA HABITACIÓN
// ======================================
async function cargarGaleriaHabitacion(habitacionId) {
  const contenedor = document.getElementById(`galeria-hab-${habitacionId}`);
  if (!contenedor) return;

  try {
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/imagenes`, { headers });
    const imagenes = await res.json();

    contenedor.innerHTML = "";

    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      contenedor.innerHTML = "<p>No hay imágenes</p>";
      return;
    }

    // 🔥 ORDENAR: principal primero
    imagenes.sort((a, b) => b.principal - a.principal);

    imagenes.forEach(img => {
      const url = construirUrlImagen(img.ruta);

      const div = document.createElement("div");
      div.classList.add("img-box");

      div.innerHTML = `
  <img src="${url}" data-host-action="abrir-lightbox" data-lightbox-url="${encodeURIComponent(url)}"
    ${img.principal ? 'style="border: 3px solid gold;"' : ''}>
  
  <div class="acciones-img">
    <button type="button" data-host-action="eliminar-imagen-habitacion" data-imagen-id="${img.id}" data-habitacion-id="${habitacionId}">🗑️</button>
    <button type="button" data-host-action="hacer-principal-habitacion" data-imagen-id="${img.id}" data-habitacion-id="${habitacionId}">⭐</button>
  </div>
`;

      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error cargando imágenes</p>";
  }
}


// ======================================
// ELIMINAR IMAGEN HABITACIÓN
// ======================================
async function eliminarImagenHabitacion(idImagen, habitacionId) {
  if (!confirm("¿Eliminar imagen?")) return;
  await fetch(`${API_URL}/imagenes/${idImagen}`, { method: "DELETE", headers });
  cargarGaleriaHabitacion(habitacionId);
}

// ======================================
// HACER IMAGEN PRINCIPAL HABITACIÓN
// ======================================
async function hacerPrincipalHabitacion(idImagen, habitacionId) {
  try {
    const res = await fetch(`${API_URL}/habitaciones/imagenes/${idImagen}/principal`, {
      method: "PUT",
      headers
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Error");
      return;
    }

    cargarGaleriaHabitacion(habitacionId);

  } catch (error) {
    console.error(error);
  }
}





// ======================================
// GALERIA ALOJAMIENTOS PRINCIPALES
// ======================================

async function cargarGaleriaAlojamientos() {

  const contenedor = document.querySelector(".collage");
  if (!contenedor) return;

  try {
    // 🔥 1. TRAER SOLO ALOJAMIENTOS DEL ANFITRION
    const alojamientos = await obtenerAlojamientosAnfitrion();
    if (alojamientos === null) return;

    contenedor.innerHTML = "<h3>🖼️ Galería de Alojamientos</h3>";

    if (!Array.isArray(alojamientos)) {
      contenedor.innerHTML += `<p>No se pudo cargar la galeria.</p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "grid-galeria";

    const imagenesPorAlojamiento = await Promise.allSettled(
      alojamientos.map(async (alojamiento) => {
        const resImgs = await fetch(`${API_URL}/alojamientos/${alojamiento.id}/imagenes`, { headers });
        const imagenes = await resImgs.json().catch(() => []);
        return { alojamiento, imagenes };
      })
    );

    // 🔥 2. RECORRER CADA ALOJAMIENTO
    for (const item of imagenesPorAlojamiento) {
      if (item.status !== 'fulfilled') continue;
      const { alojamiento, imagenes } = item.value;

      if (!Array.isArray(imagenes) || imagenes.length === 0) continue;

      // 🔥 4. BUSCAR PRINCIPAL
      let imagenPrincipal = null;

// 🔥 1. SI SOLO HAY UNA IMAGEN → ES PRINCIPAL AUTOMÁTICAMENTE
if (imagenes.length === 1) {
  imagenPrincipal = imagenes[0];
}

// 🔥 2. SI HAY VARIAS → BUSCAR LA PRINCIPAL
else {
  imagenPrincipal = imagenes.find(img => img.principal === 1);

  // 🔥 SI NO HAY PRINCIPAL → USAR LA PRIMERA
  if (!imagenPrincipal) {
    imagenPrincipal = imagenes[0];
  }
}

      // 🔥 LIMPIAR RUTA
      const url = construirUrlImagen(imagenPrincipal.ruta);

      // 🔥 CREAR CARD
      const card = document.createElement("div");
      card.className = "card-alojamiento";
      card.dataset.id = String(alojamiento.id);

      card.innerHTML = `
  <img src="${url}" data-host-action="abrir-lightbox-galeria" data-lightbox-url="${encodeURIComponent(url)}" data-alojamiento-id="${alojamiento.id}">

  <div class="card-info">
    ${alojamiento.titulo}
  </div>
`;

      grid.appendChild(card);
    }

    contenedor.appendChild(grid);

  } catch (error) {
    console.error("Error cargando galería", error);
  }
}


// ===============================
// GALERÍA DE ALOJAMIENTOS
// ===============================
document.addEventListener('DOMContentLoaded', () => {

  async function cargarGaleriaPublica() {
    const grid = document.getElementById('galeria-alojamientos'); // ID correcto
    if (!grid) return console.error('No se encontró el contenedor de la galería');

    grid.innerHTML = ''; // limpiar galería

    try {
      // 1. Traer solo alojamientos del anfitrión
      const alojamientos = await obtenerAlojamientosAnfitrion();
      if (alojamientos === null) return;

      if (!Array.isArray(alojamientos)) {
        grid.innerHTML = `<p>No se pudieron cargar alojamientos.</p>`;
        return;
      }

      const imagenesPorAlojamiento = await Promise.allSettled(
        alojamientos.map(async (alojamiento) => {
          const res = await fetch(`${API_URL}/imagenes/alojamientos/${alojamiento.id}/imagenes`, { headers });
          const imagenes = await res.json().catch(() => []);
          return { alojamiento, imagenes };
        })
      );

      // 2. Por cada alojamiento, traer sus imágenes
      for (const item of imagenesPorAlojamiento) {
        if (item.status !== 'fulfilled') continue;
        const { alojamiento, imagenes } = item.value;

        if (imagenes.length > 0) {
          const card = document.createElement('div');
          card.className = 'card-alojamiento';
          card.dataset.id = String(alojamiento.id);

          const rutaPublica = normalizarRutaImagen(imagenes[0].ruta);

          const img = document.createElement('img');
          img.src = construirUrlImagen(rutaPublica);
          img.alt = alojamiento.nombre;
          img.onclick = () => abrirLightboxDesdeGaleria(construirUrlImagen(rutaPublica), alojamiento.id);

          const info = document.createElement('div');
          info.className = 'card-info';
          info.textContent = alojamiento.titulo || alojamiento.nombre || 'Alojamiento';

          card.appendChild(img);
          card.appendChild(info);
          grid.appendChild(card);
        }
      }

    } catch (error) {
      console.error('Error cargando galería:', error);
    }
  }

  cargarGaleriaPublica();

  

  // 🔄 Si deseas actualizar automáticamente cada cierto tiempo (opcional)
  // setInterval(cargarGaleria, 5000); // actualiza cada 5 segundos
});



function cerrarModalServicios() {
  const modal = document.getElementById("modalServicios");
  if (modal) modal.style.display = "none";
}


function cerrarModalServicios() {
  document.getElementById("modalServicios").style.display = "none";
}

// ======================================
// SERVICIOS ADICIONALES CON VALOR
// ======================================
async function guardarServicioAdicional() {
  const idAlojamiento = Number(document.getElementById("sa_alojamientoId")?.value || 0);
  const nombre = (document.getElementById("sa_nombre")?.value || "").trim();
  const categoria = (document.getElementById("sa_categoria")?.value || "").trim();
  const valorRaw = (document.getElementById("sa_valor")?.value || "").trim();

  if (!idAlojamiento || !nombre) {
    alert("⚠️ Debes ingresar ID del alojamiento y nombre del servicio.");
    return;
  }

  const valor = valorRaw === "" ? null : Number(valorRaw);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    alert("⚠️ El valor del servicio debe ser un número válido mayor o igual a 0.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${idAlojamiento}/servicios-adicionales`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        nombre,
        categoria,
        valor
      })
    });

    if (manejarSesionExpirada(res)) {
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "❌ No se pudo guardar el servicio adicional.");
      return;
    }

    alert("✅ Servicio adicional guardado correctamente.");
    document.getElementById("sa_nombre").value = "";
    document.getElementById("sa_valor").value = "";
    if (document.getElementById("sa_buscarAlojamiento")) {
      document.getElementById("sa_buscarAlojamiento").value = idAlojamiento;
    }
    await cargarServiciosAdicionales(idAlojamiento);
  } catch (error) {
    console.error(error);
    alert("❌ Error de conexión guardando servicio adicional.");
  }
}

async function cargarServiciosAdicionales(idManual = null) {
  const idAlojamiento = Number(
    idManual ||
    document.getElementById("sa_buscarAlojamiento")?.value ||
    document.getElementById("sa_alojamientoId")?.value ||
    0
  );

  const contenedor = document.getElementById("sa_lista");
  if (!contenedor) return;

  if (!idAlojamiento) {
    contenedor.innerHTML = "<p>Ingresa un ID de alojamiento para cargar los servicios adicionales.</p>";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/alojamientos/${idAlojamiento}/servicios-adicionales`, { headers });

    if (manejarSesionExpirada(res)) {
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      contenedor.innerHTML = `<p>${data.error || "No fue posible cargar servicios."}</p>`;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      contenedor.innerHTML = "<p>Este alojamiento aún no tiene servicios adicionales.</p>";
      return;
    }

    contenedor.innerHTML = data.map((item) => {
      const valor = item.valor_adicional === null || item.valor_adicional === undefined
        ? "Valor a consultar"
        : `$${Number(item.valor_adicional).toLocaleString("es-CO")}`;

      return `
        <div class="card-item">
          <h4>${item.nombre}</h4>
          <p>📂 ${item.categoria || "General"}</p>
          <p>💰 ${valor}</p>
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = "<p>Error de conexión al cargar servicios adicionales.</p>";
  }
}








function cerrarModalEliminarServicios() {
  document.getElementById("modalEliminarServicios").style.display = "none";
}

let habitacionEliminarServiciosActual = null;

async function eliminarServicioMultiple(habitacionId) {
  modoEliminandoServicios = true;
  try {
    // Obtener servicios actuales de la habitación
    const res = await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("Esta habitación no tiene servicios");
      return;
    }

    // Crear contenido de modal
    const modal = document.getElementById("modalServicios");
    modal.style.display = "flex";

    const form = document.getElementById("formServicios");
    form.innerHTML = ""; // limpiar

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.innerHTML = `
        <input type="checkbox" value="${servicio.id}"> ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    // Cambiar texto del botón para eliminar
    const btnGuardar = document.getElementById("btnGuardarServicios");
    btnGuardar.textContent = "Eliminar servicios seleccionados";

    // Listener temporal para eliminar servicios seleccionados
    const handler = async (e) => {
      e.preventDefault();
      const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const idServicio of seleccionados) {
          await fetch(`${API_URL}/habitaciones/${habitacionId}/servicios/${idServicio}`, {
            method: "DELETE",
            headers
          });
        }
        alert("🗑️ Servicios eliminados correctamente");
        cerrarModalServicios();
        cargarHabitaciones();
      } catch (error) {
        console.error(error);
        alert("❌ Error eliminando servicios");
      } finally {
        modoEliminandoServicios = false;
      }

      // Remover listener para evitar duplicados
      btnGuardar.removeEventListener("click", handler);
      btnGuardar.textContent = "Guardar servicios";
    };

    btnGuardar.addEventListener("click", handler);

  } catch (error) {
    console.error(error);
    alert("❌ Error obteniendo servicios");
  }
}







function eliminarServicioGlobal() {
  const select = document.getElementById('servicioSelect');
  
  if (!select) {
    alert('❌ No se encontró el select de servicios.');
    return;
  }

  const servicioId = select.value;
  if (!servicioId) {
    alert('⚠️ Debes seleccionar un servicio para eliminar.');
    return;
  }

  fetch(`/api/servicios/${servicioId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
  })
  .then(res => {
    if (!res.ok) return res.json().then(data => { throw new Error(data.error || 'Error eliminando servicio'); });
    return res.json();
  })
  .then(data => {
    alert(data.mensaje);
    select.value = ''; // reset
  })
  .catch(err => alert('❌ ' + err.message));
}



function eliminarServicioAlojamiento(alojamientoId) {
  const select = document.getElementById(`servicioSelect-${alojamientoId}`);
  if (!select || !select.value) {
    alert('Debes seleccionar un servicio para eliminar');
    return;
  }

  const servicioId = select.value;

  fetch(`/api/alojamientos/${alojamientoId}/servicios/${servicioId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
  })
  .then(res => {
    if (!res.ok) return res.json().then(data => { throw new Error(data.error || 'Error eliminando servicio'); });
    return res.json();
  })
  .then(data => {
    alert(data.mensaje);
    select.value = ''; // resetear
  })
  .catch(err => alert(err.message));
}













async function visualizarServicios(idAlojamiento) {

  try {

    const token = localStorage.getItem("token");

    const res = await fetch(
      `${API_URL}/alojamientos/${idAlojamiento}/servicios`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      alert("❌ Error obteniendo servicios");
      return;
    }

    const servicios = await res.json();

    if (!servicios.length) {
      alert("ℹ️ Este alojamiento no tiene servicios.");
      return;
    }

    // mostrar servicios
    const lista = servicios
      .map(s => `• ${s.nombre}`)
      .join("\n");

    alert(`Servicios del alojamiento:\n\n${lista}`);

  } catch (error) {
    console.error(error);
    alert("❌ Error cargando servicios");
  }
}




// ======================================
// VER SERVICIOS DE UN ALOJAMIENTO
// ======================================
async function visualizarServicios(alojamientoId) {
  try {

    const res = await fetch(
      `${API_URL}/alojamientos/${alojamientoId}/servicios`,
      { headers }
    );

    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Este alojamiento no tiene servicios.");
      return;
    }

    let lista = "🛎️ Servicios del alojamiento:\n\n";

    servicios.forEach((s, i) => {
      lista += `${i + 1}. ${s.nombre}\n`;
    });

    alert(lista);

  } catch (error) {
    console.error(error);
    alert("❌ Error cargando servicios");
  }
}




// ======================================
// ELIMINAR SERVICIOS DE UN ALOJAMIENTO
// ======================================

let alojamientoEliminarServiciosActual = null;

async function eliminarServicioGlobal(alojamientoId) {
  if (!alojamientoId) return alert("❌ No se recibió el ID del alojamiento");

  try {
    // Guardar el alojamiento actual
    alojamientoEliminarServiciosActual = alojamientoId;

    // Obtener servicios del alojamiento
    const res = await fetch(`${API_URL}/alojamientos/${alojamientoId}/servicios`, { headers });
    const servicios = await res.json();

    if (!Array.isArray(servicios) || servicios.length === 0) {
      alert("ℹ️ Este alojamiento no tiene servicios");
      return;
    }

    // Limpiar modal
    const modal = document.getElementById("modalServicios");
    modal.style.display = "flex";

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    // Crear checkboxes para todos los servicios
    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.innerHTML = `<input type="checkbox" value="${servicio.id}"> ${servicio.nombre}`;
      form.appendChild(label);
    });

    // Cambiar texto del botón
    const btnGuardar = document.getElementById("btnGuardarServicios");
    btnGuardar.textContent = "Eliminar servicios seleccionados";

    // Remover listeners antiguos
    const oldBtn = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(oldBtn, btnGuardar);

    // Listener para eliminar los seleccionados
    oldBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  // 🔥 CERRAR MODAL INMEDIATAMENTE
  cerrarModalServicios();

  const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      if (!seleccionados.length) {
        alert("⚠️ Selecciona al menos un servicio");
        return;
      }

      try {
        for (const servicioId of seleccionados) {
          const resDelete = await fetch(`${API_URL}/alojamientos/${alojamientoEliminarServiciosActual}/servicios/${servicioId}`, {
            method: "DELETE",
            headers
          });
          const data = await resDelete.json();
          if (!resDelete.ok) {
            alert(data.error || "❌ Error eliminando servicio");
          }
        }

        alert("🗑️ Servicios eliminados correctamente");
        cerrarModalServicios();
        cargarAlojamientos(); // refresca la lista

      } catch (error) {
        console.error(error);
        alert("Error eliminando servicios");
      }
    });

  } catch (error) {
    console.error(error);
    alert("Error cargando servicios del alojamiento");
  }
}




async function crearServicio(alojamientoId) {

  const nombre = prompt("Ingresa el nombre del nuevo servicio:");
  if (!nombre || !nombre.trim()) {
    alert("⚠️ Operación cancelada: ingresa un nombre válido");
    return;
  }

  const nombreLimpio = nombre.trim(); // mantenemos mayúsculas mínimas para mostrar

  try {

    const res = await fetch(`${API_URL}/services/${alojamientoId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nombre: nombreLimpio })
    });

    const data = await res.json();

    if (res.ok) {
      if (data.mensaje && data.mensaje.toLowerCase().includes('ya se encuentra incluido')) {
        alert('⚠️ este servico ya se encuentra incluido en este alojamiento');
        return;
      }
      alert("✅ Servicio creado/ligado al alojamiento correctamente");
      cargarAlojamientos();
      return;
    }

    if (data.error && (data.error.toLowerCase().includes('ya existe') || data.error.toLowerCase().includes('ya se encuentra incluido'))) {
      alert('⚠️ este servico ya se encuentra incluido en este alojamiento');
      return;
    }

    throw new Error(data.error || "Error agregando servicio");

  } catch (error) {
    console.error(error);
    alert(error.message || "❌ Error de conexión");
  }
}






async function asignarServicioAlojamiento(alojamientoId) {

  try {

    const resServicios = await fetch(`${API_URL}/services`, { headers });
    const servicios = await resServicios.json();

    const resActuales = await fetch(
      `${API_URL}/alojamientos/${alojamientoId}/servicios`,
      { headers }
    );

    const actuales = await resActuales.json();
    const actualesIds = actuales.map(s => s.id);

    const form = document.getElementById("formServicios");
    form.innerHTML = "";

    servicios.forEach(servicio => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox"
          value="${servicio.id}"
          ${actualesIds.includes(servicio.id) ? "checked" : ""}
        >
        ${servicio.nombre}
      `;
      form.appendChild(label);
    });

    document.getElementById("modalServicios").style.display = "flex";

    const btn = document.getElementById("btnGuardarServicios");

    const nuevoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevoBtn, btn);

    nuevoBtn.addEventListener("click", async (e) => {

      e.preventDefault();

      const checks = form.querySelectorAll("input:checked");
      const seleccionados = Array.from(checks).map(c => Number(c.value));

      for (const idServicio of seleccionados) {
        await fetch(
          `${API_URL}/alojamientos/${alojamientoId}/servicios`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ id_servicio: idServicio })
          }
        );
      }

      alert("✅ Servicios actualizados");

      cerrarModalServicios();

    });

  } catch (error) {
    console.error(error);
  }
}





let alojamientoServicioActual = null;

function abrirModalServicio(alojamientoId) {
  alojamientoServicioActual = alojamientoId;

  document.getElementById("modalNuevoServicio").style.display = "flex";
  document.getElementById("inputNuevoServicio").value = "";
}

function cerrarModalNuevoServicio() {
  document.getElementById("modalNuevoServicio").style.display = "none";
}

// ======================================
// GEOLOCALIZACIÓN OPCIONAL
// ======================================
async function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    alert('La geolocalización requiere HTTPS o localhost.');
    return;
  }

  const renderAviso = (texto, color = '#007b8a') => {
    let aviso = document.getElementById('avisoUbicacion');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'avisoUbicacion';
      aviso.style.fontSize = '0.9rem';
      const formContainer = document.getElementById('formContainer');
      if (formContainer) formContainer.appendChild(aviso);
    }
    if (aviso) {
      aviso.style.color = color;
      aviso.innerHTML = texto;
    }
  };

  const onSuccess = (position) => {
    const { latitude, longitude } = position.coords;
    const linkCompartir = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const gpsInput = document.getElementById('gpsUbicacion');
    if (gpsInput) gpsInput.value = linkCompartir;

    renderAviso(`📍 Ubicación GPS cargada. <a href="${linkCompartir}" target="_blank">Abrir en Google Maps</a>`);
  };

  const optionsEstandar = { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 };
  const optionsAltaPrecision = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

  const usarFallbackIP = async () => {
    renderAviso('No se pudo usar GPS. Intentando ubicación aproximada por red...', '#b36b00');

    const proveedores = [
      async () => {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('ipapi no disponible');
        const data = await res.json();
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      },
      async () => {
        const res = await fetch('https://ipwho.is/');
        if (!res.ok) throw new Error('ipwho no disponible');
        const data = await res.json();
        if (data.success === false) throw new Error('ipwho sin resultado');
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      },
      async () => {
        const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client');
        if (!res.ok) throw new Error('bigdatacloud no disponible');
        const data = await res.json();
        return { lat: Number(data.latitude), lng: Number(data.longitude) };
      }
    ];

    for (const proveedor of proveedores) {
      try {
        const { lat, lng } = await proveedor();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error('Coordenadas inválidas');
        }

        const linkCompartir = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
        const gpsInput = document.getElementById('gpsUbicacion');
        if (gpsInput) gpsInput.value = linkCompartir;

        renderAviso(`📍 Ubicación aproximada cargada. <a href="${linkCompartir}" target="_blank">Abrir en Google Maps</a>`, '#007b8a');
        return true;
      } catch (e) {
        console.warn('Proveedor de ubicación por IP falló:', e);
      }
    }

    return false;
  };

  const solicitarUbicacion = (options) => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  };

  const describirError = (error) => {
    let mensaje = 'No se pudo obtener la ubicación. ';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        mensaje += 'Debes permitir el acceso a la ubicación en tu navegador.';
        break;
      case error.POSITION_UNAVAILABLE:
        mensaje += 'La información de ubicación no está disponible en este dispositivo o red.';
        break;
      case error.TIMEOUT:
        mensaje += 'La solicitud de ubicación tardó demasiado.';
        break;
      default:
        mensaje += 'Error desconocido.';
    }
    return mensaje;
  };

  if (navigator.permissions && navigator.permissions.query) {
    try {
      const permiso = await navigator.permissions.query({ name: 'geolocation' });
      if (permiso.state === 'denied') {
        const msg = 'El navegador tiene bloqueado el permiso de ubicación para este sitio. Activa el permiso en el icono de candado de la barra de direcciones y vuelve a intentar.';
        renderAviso(msg, '#c0392b');
        alert(msg);
        return;
      }
    } catch (_) {
      // Algunos navegadores no exponen este permiso; se continúa con la solicitud directa.
    }
  }

  renderAviso('Solicitando acceso a tu ubicación...', '#007b8a');

  try {
    const pos = await solicitarUbicacion(optionsEstandar);
    onSuccess(pos);
    return;
  } catch (errorEstandar) {
    console.warn('No se obtuvo geolocalización estándar', errorEstandar);

    if (errorEstandar.code === errorEstandar.PERMISSION_DENIED) {
      const msg = describirError(errorEstandar);
      renderAviso(msg, '#c0392b');
      alert(msg);
      return;
    }
  }

  try {
    renderAviso('No se obtuvo ubicación estándar. Reintentando con alta precisión...', '#b36b00');
    const posPrecisa = await solicitarUbicacion(optionsAltaPrecision);
    onSuccess(posPrecisa);
    return;
  } catch (errorPreciso) {
    console.warn('No se obtuvo geolocalización de alta precisión', errorPreciso);

    const okIP = await usarFallbackIP();
    if (okIP) return;

    const msg = describirError(errorPreciso);
    console.error('Error final al obtener geolocalización', errorPreciso);
    renderAviso(msg, '#c0392b');
    alert(msg);
  }
}

// ======================================
// EQUIPO DEL ALOJAMIENTO
// ======================================

let _equipoAlojamientoActual = null;
let _equipoAlojamientosDisponibles = [];
let _equipoAutoRefreshTimer = null;
let _equipoRefreshEnCurso = false;
let _equipoEventSource = null;
let _equipoReconnectTimer = null;

// Toggle colapso de la seccion (igual que las demas)
document.getElementById('toggleEquipo').addEventListener('click', () => {
  const container = document.getElementById('formContainerEquipo');
  container.classList.toggle('collapsed');
});

// Carga inicial: ya no se requiere capturar manualmente ID de alojamiento.
cargarEquipo();

async function obtenerAlojamientosEquipo() {
  const alojamientos = await obtenerAlojamientosAnfitrion();
  if (alojamientos === null) return null;
  _equipoAlojamientosDisponibles = Array.isArray(alojamientos) ? alojamientos : [];
  return _equipoAlojamientosDisponibles;
}

async function obtenerMiembrosEquipo(alojamientoId) {
  const res = await fetch(`${API_URL}/equipo/${alojamientoId}`, { headers });
  if (manejarSesionExpirada(res)) return null;
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Error al cargar el equipo.');
  }
  const miembros = await res.json();
  return Array.isArray(miembros) ? miembros : [];
}

async function cargarEquipo() {
  if (!_equipoAlojamientoActual) {
    try {
      const alojamientos = await obtenerAlojamientosEquipo();
      if (alojamientos === null) return;
      if (!Array.isArray(alojamientos) || !alojamientos.length) {
        document.getElementById('listaEquipo').innerHTML = '<p style="color:#888">Aún no tienes alojamientos registrados.</p>';
        return;
      }
      _equipoAlojamientoActual = Number(alojamientos[0].id);
    } catch (e) {
      alert(e?.message || 'No fue posible detectar automáticamente tus alojamientos.');
      return;
    }
  }

  const id = _equipoAlojamientoActual;

  const lista = document.getElementById('listaEquipo');
  lista.innerHTML = '<p>Cargando...</p>';

  try {
    let miembros = await obtenerMiembrosEquipo(id);
    if (miembros === null) return;

    // Si el primer alojamiento no tiene miembros, buscar en los demás para evitar mensajes engañosos.
    if (!miembros.length) {
      if (!_equipoAlojamientosDisponibles.length) {
        const alojamientos = await obtenerAlojamientosEquipo();
        if (alojamientos === null) return;
      }

      for (const alojamiento of _equipoAlojamientosDisponibles) {
        const candidatoId = Number(alojamiento?.id || 0);
        if (!candidatoId || candidatoId === Number(id)) continue;

        const candidatos = await obtenerMiembrosEquipo(candidatoId);
        if (candidatos === null) return;
        if (candidatos.length) {
          _equipoAlojamientoActual = candidatoId;
          miembros = candidatos;
          break;
        }
      }
    }

    renderizarEquipo(miembros);
    conectarStreamEquipo(_equipoAlojamientoActual);
    iniciarAutoRefreshEquipo();
  } catch (e) {
    lista.innerHTML = `<p style="color:#c0392b">${e?.message || 'Error de conexión.'}</p>`;
  }
}

async function cargarEquipoSilencioso() {
  if (!_equipoAlojamientoActual || _equipoRefreshEnCurso) return;
  _equipoRefreshEnCurso = true;

  try {
    const res = await fetch(`${API_URL}/equipo/${_equipoAlojamientoActual}`, { headers });
    if (!res.ok) return;

    const miembros = await res.json();
    renderizarEquipo(miembros);
  } catch (e) {
    // Refresco silencioso: no interrumpir al usuario con alerts.
  } finally {
    _equipoRefreshEnCurso = false;
  }
}

function iniciarAutoRefreshEquipo() {
  if (_equipoAutoRefreshTimer) return;

  _equipoAutoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    cargarEquipoSilencioso();
  }, 7000);
}

function detenerAutoRefreshEquipo() {
  if (_equipoAutoRefreshTimer) {
    clearInterval(_equipoAutoRefreshTimer);
    _equipoAutoRefreshTimer = null;
  }
}

function detenerStreamEquipo() {
  if (_equipoReconnectTimer) {
    clearTimeout(_equipoReconnectTimer);
    _equipoReconnectTimer = null;
  }
  if (_equipoEventSource) {
    _equipoEventSource.close();
    _equipoEventSource = null;
  }
}

function programarReconexionStreamEquipo() {
  if (_equipoReconnectTimer || !_equipoAlojamientoActual) return;
  _equipoReconnectTimer = setTimeout(() => {
    _equipoReconnectTimer = null;
    conectarStreamEquipo(_equipoAlojamientoActual);
  }, 3500);
}

function conectarStreamEquipo(alojamientoId) {
  const tokenLocal = localStorage.getItem('token');
  if (!alojamientoId || !tokenLocal || typeof EventSource === 'undefined') return;

  detenerStreamEquipo();

  const streamUrl = `${API_URL}/equipo/${alojamientoId}/stream?token=${encodeURIComponent(tokenLocal)}`;
  const source = new EventSource(streamUrl);
  _equipoEventSource = source;

  source.onopen = () => {
    // Si SSE está activo, no hace falta polling frecuente.
    detenerAutoRefreshEquipo();
  };

  source.addEventListener('equipo_actualizado', () => {
    cargarEquipoSilencioso();
  });

  source.onerror = () => {
    detenerStreamEquipo();
    // Fallback para no perder actualizaciones si SSE falla.
    iniciarAutoRefreshEquipo();
    programarReconexionStreamEquipo();
  };
}

window.addEventListener('beforeunload', () => {
  detenerAutoRefreshEquipo();
  detenerStreamEquipo();
});

function renderizarEquipo(miembros) {
  const lista = document.getElementById('listaEquipo');
  if (!miembros.length) {
    lista.innerHTML = '<p style="color:#888">No hay miembros en el equipo. Invita al primero.</p>';
    return;
  }

  lista.innerHTML = miembros.map(m => {
    const puedeEliminar = Number(m.puedeEliminar ?? 1) === 1 && Number(m.id || 0) > 0;
    const etiquetaOrigen = String(m.origen || '') === 'admin_anfitriones'
      ? '<div style="font-size:0.78rem;color:#0b5f6b;margin-top:4px;">Administrador asignado por anfitrión</div>'
      : '';

    return `
    <div class="card" style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <div>
        <strong>${m.nombre || '(pendiente)'}</strong>
        <div style="font-size:0.88rem; color:#888;">${m.correo}</div>
        <span style="font-size:0.83rem; background:#e8f4fd; border-radius:4px; padding:2px 7px;">${m.rol}</span>
        ${etiquetaOrigen}
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:0.82rem; padding:3px 9px; border-radius:12px; font-weight:600; ${m.estado === 'activo' ? 'background:#e8f5e9;color:#2e7d32;' : 'background:#fff3e0;color:#e65100;'}">
          ${m.estado === 'activo' ? 'Activo' : 'Invitacion pendiente'}
        </span>
        ${puedeEliminar
          ? `<button type="button" style="background:none;border:none;cursor:pointer;font-size:1.1rem;" data-host-action="eliminar-miembro" data-miembro-id="${m.id}" title="Eliminar miembro">X</button>`
          : ''}
      </div>
    </div>
  `;
  }).join('');
}

function abrirModalInvitar() {
  document.getElementById('invitar_correo').value = '';
  document.getElementById('invitar_rol').value = 'administrador';
  document.getElementById('modalInvitarMiembro').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModalInvitar() {
  document.getElementById('modalInvitarMiembro').style.display = 'none';
  document.body.style.overflow = '';
}

async function enviarInvitacion() {
  if (!_equipoAlojamientoActual) { alert('Carga primero el equipo del alojamiento.'); return; }
  const correo = document.getElementById('invitar_correo').value.trim();
  const rol = document.getElementById('invitar_rol').value;
  const btn = document.getElementById('btnEnviarInvitacion');
  if (!correo) { alert('Ingresa un correo electronico.'); return; }

  try {
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = 'Enviando...';
    }

    const res = await fetch(`${API_URL}/equipo/${_equipoAlojamientoActual}/invitar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ correo, rol })
    });
    if (manejarSesionExpirada(res)) return;
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Error al enviar invitacion.'); return; }
    alert('Invitacion enviada correctamente.');
    cerrarModalInvitar();
    cargarEquipo();
  } catch (e) {
    alert('Error de conexion.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || '✅ Enviar invitación';
    }
  }
}

async function eliminarMiembro(miembroId) {
  if (!_equipoAlojamientoActual) return;
  if (!confirm('Eliminar este miembro del equipo?')) return;
  try {
    const res = await fetch(
      `${API_URL}/equipo/${_equipoAlojamientoActual}/miembro/${miembroId}`,
      { method: 'DELETE', headers }
    );
    if (manejarSesionExpirada(res)) return;
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Error al eliminar miembro.'); return; }
    cargarEquipo();
  } catch (e) {
    alert('Error de conexion.');
  }
}
