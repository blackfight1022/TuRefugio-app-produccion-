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
function construirUrlImagen(rutaOriginal) {
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}`;
  return `${base}/${normalizarRutaImagen(rutaOriginal)}`;
}
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
  document.getElementById('perfil-contrasena-actual').value = '';
  document.getElementById('perfil-contrasena-nueva').value = '';
  document.getElementById('perfil-contrasena-confirmar').value = '';
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
  const contrasenaActual = document.getElementById('perfil-contrasena-actual')?.value || '';
  const contrasenaNueva = document.getElementById('perfil-contrasena-nueva')?.value || '';
  const contrasenaConfirmar = document.getElementById('perfil-contrasena-confirmar')?.value || '';

  // Validación opcional de contraseña
  if (contrasenaActual || contrasenaNueva || contrasenaConfirmar) {
    if (!contrasenaActual) {
      return mostrarFeedbackPerfil('Ingresa tu contraseña actual para cambiarla.', 'error');
    }
    if (!contrasenaNueva) {
      return mostrarFeedbackPerfil('Ingresa la nueva contraseña.', 'error');
    }
    if (contrasenaNueva.length < 6) {
      return mostrarFeedbackPerfil('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
    }
    if (contrasenaNueva !== contrasenaConfirmar) {
      return mostrarFeedbackPerfil('Las contraseñas nuevas no coinciden.', 'error');
    }
  }

  const cuerpo = {
    nombre: String(nombre).trim(),
    telefono: String(telefono).trim(),
    tipo_documento: String(tipoDocumento).trim().toUpperCase(),
    numero_documento: String(numeroDocumento).trim(),
    direccion: String(direccion).trim()
  };
  if (contrasenaActual && contrasenaNueva) {
    cuerpo.contrasena_actual = contrasenaActual;
    cuerpo.contrasena_nueva = contrasenaNueva;
  }

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
  
  contenedor.innerHTML = reservasActuales.map(reserva => `
    <div class="tarjeta-reserva">
      <div class="reserva-header">
        <h3>Reserva #${reserva.id}</h3>
        <span class="estado-badge estado-${reserva.estado}">${reserva.estado.toUpperCase()}</span>
      </div>
      
      <div class="reserva-detalles">
        <div class="detalle-col">
          <p><strong>Alojamiento:</strong> ${reserva.alojamiento_nombre || 'N/A'}</p>
          <p><strong>Habitación:</strong> ${reserva.habitacion_nombre || 'N/A'}</p>
          <p><strong>Referencia Pago:</strong> ${reserva.referencia_pago || 'N/A'}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Entrada:</strong> ${reserva.fecha_entrada}</p>
          <p><strong>Salida:</strong> ${reserva.fecha_salida}</p>
          <p><strong>Noches:</strong> ${calcularNoches(reserva.fecha_entrada, reserva.fecha_salida)}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Hospedaje:</strong> $${reserva.valor_hospedaje?.toLocaleString() || '0'}</p>
          <p><strong>Servicios:</strong> $${reserva.valor_servicios?.toLocaleString() || '0'}</p>
          <p><strong>Descuento:</strong> -$${reserva.descuento?.toLocaleString() || '0'}</p>
        </div>
        
        <div class="detalle-col">
          <p><strong>Total:</strong> <span class="total-monto">$${reserva.total?.toLocaleString() || '0'}</span></p>
          <p><strong>Estado Pago:</strong> ${reserva.estado_pago || 'N/A'}</p>
        </div>
      </div>
      
      ${reserva.estado !== 'cancelada' ? `
        <button onclick="abrirCancelacion(${reserva.id})" class="btn-secundario">Cancelar Reserva</button>
      ` : ''}
    </div>
  `).join('');
}

function calcularNoches(entrada, salida) {
  const inicio = new Date(entrada);
  const fin = new Date(salida);
  return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
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
    if (reservas.length === 0) {
      agregarMensajeChatbot('bot', `ℹ️ ${payload.mensaje || 'No encontramos reservas activas con ese correo. Puedes intentar con otro.'}`);
      return;
    }

    chatbotState.emailTurista = email;
    chatbotState.reservasDisponibles = reservas;
    
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
      <div class="reserva-opcion" onclick="seleccionarReservaChatbot(${idx})" style="cursor:pointer; padding:10px; margin:10px 0; background:#f0f0f0; border-radius:5px; border-left:4px solid #ff6b6b;">
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
        <button onclick="enviarMotivoCancelacion('Cambio de planes')" style="margin:5px; padding:8px 15px; cursor:pointer;">Cambio de planes</button>
        <button onclick="enviarMotivoCancelacion('Emergencia personal')" style="margin:5px; padding:8px 15px; cursor:pointer;">Emergencia personal</button>
        <button onclick="enviarMotivoCancelacion('Problema de salud')" style="margin:5px; padding:8px 15px; cursor:pointer;">Problema de salud</button>
        <button onclick="enviarMotivoCancelacion('Otro')" style="margin:5px; padding:8px 15px; cursor:pointer;">Otro motivo</button>
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
  mostrarPanel('gestion-reservas');
  
  const reserva = reservasActuales.find(r => r.id === reservaId);
  if (reserva && usuarioActual) {
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
      <button onclick="marcarLeido(${msg.id})" class="btn-pequeno">
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
    const res = await fetch(`${API_URL}/alojamientos/mis-favoritos`, { headers });
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
    <div class="favorito-item" onclick="window.location.href='../detalles_alojamiento/detalles.html?id=${aloj.id}'" style="cursor:pointer;">
      <img src="${construirUrlImagen(aloj.imagen_principal || aloj.imagen)}" alt="${aloj.titulo}">
    </div>
  `).join('');
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
