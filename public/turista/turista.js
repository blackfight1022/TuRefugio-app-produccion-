// ════════════════════════════════════════════════════════════════
// CONFIGURACIÓN INICIAL
// ════════════════════════════════════════════════════════════════
// Hacer la URL de API dinámicamente para funcionar en cualquier dispositivo
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;
const token = localStorage.getItem('token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

let usuarioActual = null;
let reservasActuales = [];
let chatbotState = {
  emailTurista: null,
  reservasDisponibles: [],
  reservaSeleccionada: null,
  motivoCancelacion: null,
  codigoEnviado: null
};

const MENSAJE_CHAT_INICIAL = '¡Hola! Soy tu asistente. Para ayudarte a cancelar una reserva, necesito el correo con el que realizaste la reserva. 📧';

function normalizarRutaImagen(rutaOriginal) {
  const limpio = String(rutaOriginal || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^public\//i, '')
    .replace(/^\/+/, '');

  if (!limpio) return 'uploads/default.jpg';
  return limpio.startsWith('uploads/') ? limpio : `uploads/${limpio.split('uploads/').pop()}`;
}

function construirUrlImagen(rutaOriginal) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/${normalizarRutaImagen(rutaOriginal)}`;
}

function formatearFechaReserva(valor) {
  if (!valor) return 'Fecha no disponible';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return fecha.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// ════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    window.location.href = '../login/login.html';
    return;
  }

  const formEditarPerfil = document.getElementById('form-editar-perfil');
  if (formEditarPerfil) {
    formEditarPerfil.addEventListener('submit', guardarEdicionPerfil);
  }

  const formCambiarContrasena = document.getElementById('form-cambiar-contrasena');
  if (formCambiarContrasena) {
    formCambiarContrasena.addEventListener('submit', cambiarContrasena);
  }

  document.getElementById('btnEditarPerfil')?.addEventListener('click', editarPerfil);
  document.getElementById('btnCerrarSesionTurista')?.addEventListener('click', (event) => {
    event.preventDefault();
    cerrarSesion();
  });
  document.getElementById('btnCerrarChatbotTurista')?.addEventListener('click', cerrarChatbot);
  document.getElementById('btnEnviarCorreoTurista')?.addEventListener('click', enviarCorreoTurista);
  document.getElementById('btnConfirmarCodigoTurista')?.addEventListener('click', confirmarCodigoTurista);

  document.addEventListener('click', (event) => {
    const panelLink = event.target.closest('[data-panel-destino]');
    if (panelLink) {
      event.preventDefault();
      mostrarPanel(panelLink.dataset.panelDestino);
      return;
    }

    const closeModalBtn = event.target.closest('[data-close-modal]');
    if (closeModalBtn) {
      cerrarModal(closeModalBtn.dataset.closeModal);
      return;
    }

    const cancelarReservaBtn = event.target.closest('[data-cancelar-reserva-id]');
    if (cancelarReservaBtn) {
      abrirCancelacion(Number(cancelarReservaBtn.dataset.cancelarReservaId));
      return;
    }

    const reservaOpcion = event.target.closest('[data-chatbot-reserva-index]');
    if (reservaOpcion) {
      seleccionarReservaChatbot(Number(reservaOpcion.dataset.chatbotReservaIndex));
      return;
    }

    const motivoBtn = event.target.closest('[data-chatbot-motivo]');
    if (motivoBtn) {
      enviarMotivoCancelacion(motivoBtn.dataset.chatbotMotivo);
      return;
    }

    const marcarLeidoBtn = event.target.closest('[data-marcar-leido-id]');
    if (marcarLeidoBtn) {
      marcarLeido(Number(marcarLeidoBtn.dataset.marcarLeidoId));
      return;
    }
  });
  
  cargarDatosUsuario();
  cargarHistorialReservas();
  cargarMensajes();
  cargarFavoritos();
});

// ════════════════════════════════════════════════════════════════
// GESTIÓN DE PANELES
// ════════════════════════════════════════════════════════════════
function mostrarPanel(nombrePanel) {
  // Ocultar todos los paneles
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('activo');
  });
  
  // Mostrar panel seleccionado
  const panelActual = document.getElementById(`panel-${nombrePanel}`);
  if (panelActual) {
    panelActual.classList.add('activo');
    
    // Si es el panel de gestión, mostrar elemento de bienvenida
    if (nombrePanel === 'gestion-reservas') {
      inicializarChatbotTurista();
    } else if (nombrePanel === 'mensajeria') {
      cargarMensajes();
    }
  }
}

// ════════════════════════════════════════════════════════════════
// PERFIL DEL TURISTA
// ════════════════════════════════════════════════════════════════
async function cargarDatosUsuario() {
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers });
    if (!res.ok) throw new Error('No autenticado');
    
    usuarioActual = await res.json();
    mostrarPerfil();
  } catch (error) {
    console.error('Error cargando datos:', error);
    alert('Error cargando tu perfil');
  }
}

function mostrarPerfil() {
  const perfilDiv = document.getElementById('perfil-datos');
  if (!usuarioActual) return;
  
  perfilDiv.innerHTML = `
    <div class="perfil-item">
      <label>Nombre:</label>
      <p>${usuarioActual.nombre || 'No disponible'}</p>
    </div>
    <div class="perfil-item">
      <label>Correo:</label>
      <p>${usuarioActual.correo || 'No disponible'}</p>
    </div>
    <div class="perfil-item">
      <label>Teléfono:</label>
      <p>${usuarioActual.telefono || 'No disponible'}</p>
    </div>
    <div class="perfil-item">
      <label>Tipo de Documento:</label>
      <p>${usuarioActual.tipo_documento || 'No disponible'}</p>
    </div>
    <div class="perfil-item">
      <label>Número de Documento:</label>
      <p>${usuarioActual.numero_documento || 'No disponible'}</p>
    </div>
    <div class="perfil-item">
      <label>Dirección:</label>
      <p>${usuarioActual.direccion || 'No disponible'}</p>
    </div>
  `;
}

function mostrarFeedbackPerfil(mensaje, tipo = 'ok') {
  const feedback = document.getElementById('perfil-feedback');
  if (!feedback) return;

  feedback.textContent = mensaje;
  feedback.classList.remove('ok', 'error');
  feedback.classList.add(tipo === 'error' ? 'error' : 'ok');
  feedback.style.display = 'block';
}

function limpiarFeedbackPerfil() {
  const feedback = document.getElementById('perfil-feedback');
  if (!feedback) return;

  feedback.textContent = '';
  feedback.classList.remove('ok', 'error');
  feedback.style.display = 'none';
}

async function editarPerfil() {
  if (!usuarioActual) {
    alert('No hay datos de usuario para editar.');
    return;
  }

  document.getElementById('perfil-nombre').value = usuarioActual.nombre || '';
  document.getElementById('perfil-correo').value = usuarioActual.correo || '';
  document.getElementById('perfil-telefono').value = usuarioActual.telefono || '';
  document.getElementById('perfil-tipo-documento').value = usuarioActual.tipo_documento || '';
  document.getElementById('perfil-numero-documento').value = usuarioActual.numero_documento || '';
  document.getElementById('perfil-direccion').value = usuarioActual.direccion || '';
  const campoActual = document.getElementById('perfil-contrasena-actual');
  const campoNueva = document.getElementById('perfil-contrasena-nueva');
  const campoConfirmar = document.getElementById('perfil-contrasena-confirmar');
  if (campoActual) campoActual.value = '';
  if (campoNueva) campoNueva.value = '';
  if (campoConfirmar) campoConfirmar.value = '';
  limpiarFeedbackPerfil();

  const modal = document.getElementById('modal-editar-perfil');
  if (modal) {
    modal.style.display = 'flex';
  }
}

async function guardarEdicionPerfil(event) {
  event.preventDefault();

  const nombre = document.getElementById('perfil-nombre')?.value || '';
  const telefono = document.getElementById('perfil-telefono')?.value || '';
  const tipoDocumento = document.getElementById('perfil-tipo-documento')?.value || '';
  const numeroDocumento = document.getElementById('perfil-numero-documento')?.value || '';
  const direccion = document.getElementById('perfil-direccion')?.value || '';
  const cuerpo = {
    nombre: String(nombre).trim(),
    telefono: String(telefono).trim(),
    tipo_documento: String(tipoDocumento).trim().toUpperCase(),
    numero_documento: String(numeroDocumento).trim(),
    direccion: String(direccion).trim()
  };

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(cuerpo)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'No se pudo actualizar el perfil.');
    }

    usuarioActual = data?.usuario || usuarioActual;
    mostrarPerfil();
    mostrarFeedbackPerfil('Perfil actualizado correctamente.', 'ok');

    setTimeout(() => {
      cerrarModal('modal-editar-perfil');
      limpiarFeedbackPerfil();
    }, 900);
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    mostrarFeedbackPerfil(error.message || 'Error al actualizar el perfil.', 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// CAMBIO DE CONTRASEÑA (PANEL PERFIL)
// ════════════════════════════════════════════════════════════════
async function cambiarContrasena(event) {
  event.preventDefault();

  const actual = document.getElementById('cp-actual')?.value || '';
  const nueva = document.getElementById('cp-nueva')?.value || '';
  const confirmar = document.getElementById('cp-confirmar')?.value || '';
  const feedback = document.getElementById('cp-feedback');

  const mostrarCpFeedback = (msg, tipo) => {
    feedback.textContent = msg;
    feedback.classList.remove('ok', 'error');
    feedback.classList.add(tipo);
    feedback.style.display = 'block';
  };

  if (nueva.length < 6) {
    return mostrarCpFeedback('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
  }
  if (nueva !== confirmar) {
    return mostrarCpFeedback('Las contraseñas nuevas no coinciden.', 'error');
  }

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        nombre: usuarioActual?.nombre || '',
        contrasena_actual: actual,
        contrasena_nueva: nueva
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar la contraseña.');

    mostrarCpFeedback('Contraseña actualizada correctamente.', 'ok');
    document.getElementById('form-cambiar-contrasena').reset();
    setTimeout(() => { feedback.style.display = 'none'; }, 3000);
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    mostrarCpFeedback(error.message || 'Error al cambiar la contraseña.', 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// HISTORIAL DE RESERVAS
// ════════════════════════════════════════════════════════════════
async function cargarHistorialReservas() {
  try {
    const res = await fetch(`${API_URL}/reservas/mis-reservas`, { headers });
    if (!res.ok) throw new Error('Error cargando reservas');
    
    reservasActuales = await res.json();
    mostrarHistorial();
  } catch (error) {
    console.error('Error:', error);
  }
}

function mostrarHistorial() {
  const contenedor = document.getElementById('historial-contenedor');
  
  if (reservasActuales.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos">No tienes reservas aún.</p>';
    return;
  }

  const formatoMoneda = (valor) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) return '$0';
    return `$${n.toLocaleString('es-CO')}`;
  };

  const normalizarEstadoPago = (valor, reserva) => {
    const estado = String(valor || '').trim().toLowerCase();
    const estadoReserva = String(reserva?.estado || '').trim().toLowerCase();
    const porcentajeReembolso = Number(reserva?.cancelacion_porcentaje_reembolso);

    if (estadoReserva === 'cancelada') {
      if (estado === 'reembolsado' || (Number.isFinite(porcentajeReembolso) && porcentajeReembolso > 0)) {
        return 'REEMBOLSADO';
      }
      return 'CANCELADO';
    }

    if (estado === 'pagado' || estado === 'pago' || estado === 'aprobado') return 'PAGO CONFIRMADO';
    if (estado === 'rechazado') return 'PAGO RECHAZADO';
    if (estado === 'cancelado') return 'PAGO CANCELADO';
    if (estado === 'reembolsado') return 'REEMBOLSADO';
    return 'PENDIENTE';
  };

  contenedor.innerHTML = reservasActuales.map(reserva => {
    const estadoVisual = obtenerEstadoVisualReserva(reserva);
    const finalizada = esReservaFinalizada(reserva);
    const estadoReserva = String(reserva?.estado || '').toLowerCase();
    const esCancelada = estadoReserva === 'cancelada';
    const alojamientoNombre = reserva.alojamiento_nombre || reserva.alojamiento || 'No registrado';
    const habitacionNombre = reserva.habitacion_nombre || reserva.habitacion || 'N/A';
    const referenciaPago = reserva.referencia_pago || 'N/A';
    const entrada = reserva.fecha_entrada || 'N/A';
    const salida = reserva.fecha_salida || 'N/A';
    const noches = Number(reserva.noches) > 0 ? Number(reserva.noches) : calcularNoches(reserva.fecha_entrada, reserva.fecha_salida);
    const hospedaje = Number.isFinite(Number(reserva.valor_hospedaje)) ? Number(reserva.valor_hospedaje) : Number(reserva.subtotal_hospedaje || 0);
    const servicios = Number.isFinite(Number(reserva.valor_servicios)) ? Number(reserva.valor_servicios) : Number(reserva.subtotal_servicios || 0);
    const descuento = Number.isFinite(Number(reserva.descuento)) ? Number(reserva.descuento) : 0;
    const total = Number.isFinite(Number(reserva.total)) ? Number(reserva.total) : Number(reserva.precio_total || 0);
    const estadoPago = normalizarEstadoPago(reserva.estado_pago, reserva);
    const porcentajeReembolso = Number(reserva.cancelacion_porcentaje_reembolso);
    const porcentajeValido = Number.isFinite(porcentajeReembolso) && porcentajeReembolso >= 0 && porcentajeReembolso <= 100;
    const montoDevolucion = porcentajeValido ? (total * porcentajeReembolso) / 100 : null;
    const montoDescuentoCancelacion = porcentajeValido ? Math.max(total - montoDevolucion, 0) : null;

    return `
    <div class="tarjeta-reserva">
      <div class="reserva-header">
        <h3>Reserva #${reserva.id}</h3>
        <span class="estado-badge estado-${estadoVisual.clase}">${estadoVisual.texto}</span>
      </div>
      
      <div class="reserva-detalles">
        <div class="detalle-col">
          <p><strong>Alojamiento:</strong> ${alojamientoNombre}</p>
          <p><strong>Habitación:</strong> ${habitacionNombre}</p>
          <p><strong>Referencia Pago:</strong> ${referenciaPago}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Entrada:</strong> ${entrada}</p>
          <p><strong>Salida:</strong> ${salida}</p>
          <p><strong>Noches:</strong> ${noches}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Hospedaje:</strong> ${formatoMoneda(hospedaje)}</p>
          <p><strong>Servicios:</strong> ${formatoMoneda(servicios)}</p>
          <p><strong>Descuento:</strong> -${formatoMoneda(descuento)}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Total:</strong> <span class="total-monto">${formatoMoneda(total)}</span></p>
          <p><strong>Estado Pago:</strong> ${estadoPago}</p>
        </div>
      </div>

      ${finalizada
        ? `<div class="reserva-finalizada-ok">✅ Reserva finalizada con exito.</div>`
        : reserva.estado !== 'cancelada' ? `
        <button type="button" data-cancelar-reserva-id="${reserva.id}" class="btn-secundario">Cancelar Reserva</button>
      ` : ''}

      ${esCancelada ? `
      <div class="reserva-finalizada-ok" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412;">
        <p><strong>Descuento por cancelación:</strong> ${montoDescuentoCancelacion === null ? 'Pendiente de definir' : formatoMoneda(montoDescuentoCancelacion)}</p>
        <p><strong>Dinero a devolver al turista:</strong> ${montoDevolucion === null ? 'Pendiente de definir' : formatoMoneda(montoDevolucion)}</p>
        <p><strong>Porcentaje de devolución:</strong> ${porcentajeValido ? `${porcentajeReembolso}%` : 'Pendiente'}</p>
      </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

function calcularNoches(entrada, salida) {
  const inicio = new Date(entrada);
  const fin = new Date(salida);
  return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
}

function obtenerFinDeReserva(fechaSalida) {
  if (!fechaSalida) return null;
  const texto = String(fechaSalida).trim();
  if (!texto) return null;

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T23:59:59`)
    : new Date(texto);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function esReservaFinalizada(reserva) {
  const estado = String(reserva?.estado || '').toLowerCase();
  if (estado === 'cancelada') return false;
  if (estado === 'finalizada') return true;

  const finReserva = obtenerFinDeReserva(reserva?.fecha_salida);
  if (!finReserva) return false;
  return Date.now() > finReserva.getTime();
}

function obtenerEstadoVisualReserva(reserva) {
  const estado = String(reserva?.estado || 'pendiente').toLowerCase();

  if (estado === 'cancelada') {
    return {
      clase: 'cancelada',
      texto: 'CANCELADA'
    };
  }

  if (esReservaFinalizada(reserva)) {
    return {
      clase: 'finalizada',
      texto: 'FINALIZADA CON EXITO'
    };
  }

  return {
    clase: estado,
    texto: estado.toUpperCase()
  };
}

// ════════════════════════════════════════════════════════════════
// CHATBOT TURISTA - GESTIÓN DE CANCELACIONES
// ════════════════════════════════════════════════════════════════
function inicializarChatbotTurista() {
  if (!chatbotState.emailTurista) {
    resetearChatbotTurista();
    return;
  }

  mostrarReservasChatbot();
}

function agregarMensajeChatbot(tipo, texto) {
  const chatMensajes = document.getElementById('chat-mensajes-turista');
  if (!chatMensajes) return;

  chatMensajes.innerHTML += `
    <div class="mensaje ${tipo}">
      <p>${texto}</p>
    </div>
  `;
  chatMensajes.scrollTop = chatMensajes.scrollHeight;
}

function resetearChatbotTurista() {
  chatbotState = {
    emailTurista: null,
    reservasDisponibles: [],
    reservaSeleccionada: null,
    motivoCancelacion: null,
    codigoEnviado: null
  };

  const chatMensajes = document.getElementById('chat-mensajes-turista');
  const emailInput = document.getElementById('email-turista');
  const botonEnviar = document.querySelector('.chat-input button');

  if (chatMensajes) {
    chatMensajes.innerHTML = `
      <div class="mensaje bot">
        <p>${MENSAJE_CHAT_INICIAL}</p>
      </div>
    `;
  }

  if (emailInput) {
    emailInput.value = '';
    emailInput.style.display = 'block';
    emailInput.type = 'email';
    emailInput.placeholder = 'Ingresa tu correo...';
    emailInput.focus();
  }

  if (botonEnviar) {
    botonEnviar.style.display = 'inline-block';
  }

  cerrarModal('modal-confirmacion');
}

async function enviarCorreoTurista() {
  const email = document.getElementById('email-turista').value.trim();
  
  if (!email || !email.includes('@')) {
    agregarMensajeChatbot('bot', '⚠️ Por favor ingresa un correo válido para continuar.');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/reservas/por-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email })
    });

    const payload = await res.json();
    
    if (!res.ok) {
      agregarMensajeChatbot('bot', `❌ ${payload.mensaje || payload.error || 'No se encontraron reservas con este correo'}`);
      return;
    }
    
    const reservas = Array.isArray(payload.reservas) ? payload.reservas : [];
    const reservasCancelables = reservas.filter((reserva) => !esReservaFinalizada(reserva) && String(reserva?.estado || '').toLowerCase() !== 'cancelada');
    if (reservasCancelables.length === 0) {
      agregarMensajeChatbot('bot', `ℹ️ ${payload.mensaje || 'No encontramos reservas activas con ese correo. Puedes intentar con otro.'}`);
      return;
    }

    chatbotState.emailTurista = email;
    chatbotState.reservasDisponibles = reservasCancelables;
    
    mostrarReservasChatbot();
  } catch (error) {
    console.error('Error:', error);
    agregarMensajeChatbot('bot', '❌ Error al buscar reservas. Intenta nuevamente en unos segundos.');
  }
}

function mostrarReservasChatbot() {
  const chatMensajes = document.getElementById('chat-mensajes-turista');
  const emailInput = document.getElementById('email-turista');
  
  // Ocultar input y mostrar reservas
  emailInput.style.display = 'none';
  document.querySelector('.chat-input button').style.display = 'none';
  
  let reservasHtml = `
    <div class="mensaje bot">
      <p>Encontré ${chatbotState.reservasDisponibles.length} reserva(s) a tu nombre. Selecciona cuál deseas cancelar:</p>
    </div>
  `;
  
  chatbotState.reservasDisponibles.forEach((res, idx) => {
    reservasHtml += `
      <div class="reserva-opcion" data-chatbot-reserva-index="${idx}" style="cursor:pointer; padding:10px; margin:10px 0; background:#f0f0f0; border-radius:5px; border-left:4px solid #ff6b6b;">
        <p><strong>Reserva #${res.id}</strong> - ${res.alojamiento_nombre}</p>
        <p>Fechas: ${res.fecha_entrada} a ${res.fecha_salida}</p>
        <p>Total: $${Number(res.precio_total || 0).toLocaleString('es-CO')}</p>
      </div>
    `;
  });
  
  chatMensajes.innerHTML += reservasHtml;
  chatMensajes.scrollTop = chatMensajes.scrollHeight;
}

function seleccionarReservaChatbot(index) {
  chatbotState.reservaSeleccionada = chatbotState.reservasDisponibles[index];
  
  const chatMensajes = document.getElementById('chat-mensajes-turista');
  
  chatMensajes.innerHTML += `
    <div class="mensaje turista">
      <p>Quiero cancelar la reserva #${chatbotState.reservaSeleccionada.id}</p>
    </div>
    <div class="mensaje bot">
      <p>Entendido. ¿Cuál es el motivo de tu cancelación?</p>
      <div style="margin-top:10px;">
        <button type="button" data-chatbot-motivo="Cambio de planes" style="margin:5px; padding:8px 15px; cursor:pointer;">Cambio de planes</button>
        <button type="button" data-chatbot-motivo="Emergencia personal" style="margin:5px; padding:8px 15px; cursor:pointer;">Emergencia personal</button>
        <button type="button" data-chatbot-motivo="Problema de salud" style="margin:5px; padding:8px 15px; cursor:pointer;">Problema de salud</button>
        <button type="button" data-chatbot-motivo="Otro" style="margin:5px; padding:8px 15px; cursor:pointer;">Otro motivo</button>
      </div>
    </div>
  `;
  
  chatMensajes.scrollTop = chatMensajes.scrollHeight;
}

function enviarMotivoCancelacion(motivo) {
  chatbotState.motivoCancelacion = motivo;
  
  const chatMensajes = document.getElementById('chat-mensajes-turista');
  
  chatMensajes.innerHTML += `
    <div class="mensaje turista">
      <p>${motivo}</p>
    </div>
    <div class="mensaje bot">
      <p>✅ He registrado tu motivo de cancelación: <strong>${motivo}</strong></p>
      <p>Ahora te conectaré con el administrador del alojamiento para procesar tu cancelación.</p>
      <p>Se enviará un código de confirmación a tu correo.</p>
    </div>
  `;
  
  chatMensajes.scrollTop = chatMensajes.scrollHeight;
  
  // Llamar al backend para enviar información al anfitrión y código de confirmación
  enviarDatosAlAnfitrion();
}

async function enviarDatosAlAnfitrion() {
  try {
    const res = await fetch(`${API_URL}/cancelaciones/iniciar`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reserva_id: chatbotState.reservaSeleccionada.id,
        email_turista: chatbotState.emailTurista,
        motivo: chatbotState.motivoCancelacion
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.mensaje || 'Error procesando cancelación');
    }

    chatbotState.codigoEnviado = data.codigo_demo || null;

    if (data.email_enviado === false && data.codigo_demo) {
      agregarMensajeChatbot('bot', `⚠️ No se pudo enviar el correo. Usa el código que aparece en el recuadro amarillo del formulario de confirmación.`);
    }

    mostrarModalConfirmacion(data);
  } catch (error) {
    console.error('Error:', error);
    agregarMensajeChatbot('bot', '❌ Error al procesar la cancelación. Intenta de nuevo.');
  }
}

function mostrarModalConfirmacion(data) {
  document.getElementById('motivo-cancelacion-display').textContent = 
    `Motivo: ${chatbotState.motivoCancelacion}`;

  const avisoDemo = document.getElementById('codigo-demo-aviso');
  if (avisoDemo) {
    if (data && data.email_enviado === false && data.codigo_demo) {
      avisoDemo.textContent = `⚠️ El correo no pudo enviarse. Código de confirmación: ${data.codigo_demo}`;
      avisoDemo.style.display = 'block';
    } else {
      avisoDemo.style.display = 'none';
    }
  }

  document.getElementById('modal-confirmacion').style.display = 'block';
}

async function confirmarCodigoTurista() {
  const codigo = document.getElementById('codigo-confirmacion-turista').value.trim();
  
  if (!codigo) {
    agregarMensajeChatbot('bot', '⚠️ Debes ingresar el código de confirmación para continuar.');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/cancelaciones/confirmar-turista`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reserva_id: chatbotState.reservaSeleccionada.id,
        codigo
      })
    });
    
    if (!res.ok) {
      agregarMensajeChatbot('bot', '❌ Código inválido o expirado. Verifica el código e intenta nuevamente.');
      return;
    }

    agregarMensajeChatbot('bot', '✅ Código confirmado. Tu solicitud de cancelación fue enviada al anfitrión.');
    cerrarModal('modal-confirmacion');
    
    // Recargar reservas
    setTimeout(() => {
      cargarHistorialReservas();
      mostrarPanel('historial');
    }, 1500);
  } catch (error) {
    console.error('Error:', error);
    agregarMensajeChatbot('bot', '❌ Ocurrió un error al validar el código. Intenta nuevamente.');
  }
}

function abrirCancelacion(reservaId) {
  const reserva = reservasActuales.find(r => r.id === reservaId);
  if (!reserva) return;

  if (esReservaFinalizada(reserva)) {
    alert('Esta reserva ya finalizo con exito. Ya no es posible cancelarla.');
    return;
  }

  mostrarPanel('gestion-reservas');

  if (usuarioActual) {
    document.getElementById('email-turista').value = usuarioActual.correo;
    setTimeout(() => enviarCorreoTurista(), 500);
  }
}

function cerrarChatbot() {
  resetearChatbotTurista();
  mostrarPanel('bienvenida');
}

// ════════════════════════════════════════════════════════════════
// MENSAJERÍA
// ════════════════════════════════════════════════════════════════
async function cargarMensajes() {
  try {
    const res = await fetch(`${API_URL}/mensajes/turista`, { headers });
    if (!res.ok) throw new Error('Error cargando mensajes');
    
    const response = await res.json();
    const mensajes = response.mensajes || [];
    mostrarMensajes(mensajes);
  } catch (error) {
    console.error('Error:', error);
  }
}

function mostrarMensajes(mensajes) {
  const contenedor = document.getElementById('mensajes-contenedor');
  
  if (mensajes.length === 0) {
    contenedor.innerHTML = '<p class="sin-datos">No tienes mensajes aún.</p>';
    return;
  }
  
  contenedor.innerHTML = mensajes.map(msg => `
    <div class="tarjeta-mensaje">
      <div class="mensaje-header">
        <h3>${msg.asunto || 'Mensaje de Tu Refugio'}</h3>
        <span class="fecha">${new Date(msg.fecha_creacion).toLocaleDateString('es-CO')}</span>
      </div>
      <div class="mensaje-contenido">
        <p>${msg.contenido}</p>
        ${msg.tipo === 'cancelacion' ? `
          <div class="mensaje-cancelacion">
            <p><strong>Reserva:</strong> #${msg.reserva_id}</p>
            <p><strong>Porcentaje Devolución:</strong> ${msg.porcentaje_devolucion || 'Pendiente'}%</p>
            <p><strong>Estado:</strong> ${msg.estado}</p>
            ${msg.motivo_descuento ? `<p><strong>Motivo:</strong> ${msg.motivo_descuento}</p>` : ''}
          </div>
        ` : ''}
      </div>
      <button type="button" data-marcar-leido-id="${msg.id}" class="btn-pequeno">
        ${msg.leido ? '✓ Leído' : 'Marcar como Leído'}
      </button>
    </div>
  `).join('');
}

async function marcarLeido(mensajeId) {
  try {
    await fetch(`${API_URL}/mensajes/${mensajeId}/leido`, {
      method: 'PUT',
      headers
    });
    cargarMensajes();
  } catch (error) {
    console.error('Error:', error);
  }
}

// ════════════════════════════════════════════════════════════════
// FAVORITOS
// ════════════════════════════════════════════════════════════════
async function cargarFavoritos() {
  try {
    const res = await fetch(`${API_URL}/favoritos`, { headers });
    if (!res.ok) return;
    
    const response = await res.json();
    const favoritos = response.alojamientos || [];
    mostrarFavoritos(favoritos);
  } catch (error) {
    console.error('Error cargando favoritos:', error);
  }
}

function mostrarFavoritos(alojamientos) {
  const galeria = document.getElementById('galeria-favoritos');
  
  if (alojamientos.length === 0) {
    galeria.innerHTML = '<p>Aún no tienes favoritos</p>';
    return;
  }
  
  galeria.innerHTML = alojamientos.map(aloj => `
    <div class="favorito-item" data-favorito-aloj-id="${aloj.id}">
      <div class="favorito-imagen-container">
        <img src="${construirUrlImagen(aloj.imagen_principal || aloj.imagen)}" alt="${aloj.titulo}" class="favorito-imagen">
        <span class="favorito-estado-pill" aria-label="En favoritos">❤️ En favoritos</span>
        <div class="favorito-overlay">
          <button class="btn-favorito-accion btn-mantener-favorito" data-aloj-id="${aloj.id}" title="Conservar en favoritos">❤️ Mantener</button>
          <button class="btn-favorito-accion btn-ver-detalles" data-aloj-id="${aloj.id}" title="Ver detalles">👁️ Ver</button>
          <button class="btn-favorito-accion btn-quitar-favorito" data-aloj-id="${aloj.id}" title="Quitar de favoritos">❌</button>
        </div>
      </div>
      <div class="favorito-titulo">${aloj.titulo || 'Alojamiento'}</div>
    </div>
  `).join('');
  
  // Agregar event listeners a los botones
  document.querySelectorAll('.btn-ver-detalles').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const alojId = btn.dataset.alojId;
      window.location.href = `../detalles_alojamiento/detalles.html?id=${alojId}`;
    });
  });

  document.querySelectorAll('.btn-mantener-favorito').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const alojId = btn.dataset.alojId;
      await mantenerEnFavoritos(alojId);
    });
  });
  
  document.querySelectorAll('.btn-quitar-favorito').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const alojId = btn.dataset.alojId;
      quitarDeFavoritos(alojId);
    });
  });
}

async function quitarDeFavoritos(alojId) {
  const confirmado = await Swal.fire({
    title: '¿Quitar de favoritos?',
    text: 'Este alojamiento dejará de aparecer en tu panel de favoritos.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, quitar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirmado.isConfirmed) return;

  try {
    const res = await fetch(`${API_URL}/favoritos/${alojId}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.mensaje || 'No se pudo eliminar el favorito.');
    }

    const tarjeta = document.querySelector(`[data-favorito-aloj-id="${alojId}"]`);
    if (tarjeta) {
      const pill = tarjeta.querySelector('.favorito-estado-pill');
      if (pill) {
        pill.textContent = '❌ Eliminado';
        pill.classList.add('favorito-estado-pill-eliminado');
      }
      tarjeta.classList.add('favorito-item-removiendo');
      await new Promise((resolve) => setTimeout(resolve, 520));
    }

    Swal.fire({
      icon: 'success',
      title: 'Favorito eliminado',
      text: 'El alojamiento fue retirado de tu lista.',
      timer: 1200,
      showConfirmButton: false
    });

    if (tarjeta) {
      tarjeta.remove();
      const galeria = document.getElementById('galeria-favoritos');
      if (galeria && !galeria.querySelector('.favorito-item')) {
        galeria.innerHTML = '<p>Aún no tienes favoritos</p>';
      }
    } else {
      cargarFavoritos();
    }
  } catch (error) {
    console.error('Error quitando favorito:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo quitar de favoritos.'
    });
  }
}

async function mantenerEnFavoritos(alojId) {
  try {
    const res = await fetch(`${API_URL}/favoritos/${alojId}`, {
      method: 'POST',
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.mensaje || 'No se pudo conservar el favorito.');
    }

    const tarjeta = document.querySelector(`[data-favorito-aloj-id="${alojId}"]`);
    const pill = tarjeta?.querySelector('.favorito-estado-pill');
    if (pill) {
      pill.textContent = '❤️ En favoritos';
      pill.classList.remove('favorito-estado-pill-eliminado');
      pill.classList.add('favorito-estado-pill-activo');
      setTimeout(() => pill.classList.remove('favorito-estado-pill-activo'), 700);
    }

    Swal.fire({
      icon: 'success',
      title: 'Sigue en favoritos',
      text: 'Este alojamiento se mantiene en tu lista.',
      timer: 1000,
      showConfirmButton: false
    });
  } catch (error) {
    console.error('Error conservando favorito:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo conservar en favoritos.'
    });
  }
}

// ════════════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════════════
function cerrarModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  window.location.href = '../index.html';
}
