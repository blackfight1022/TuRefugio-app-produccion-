const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;

function getToken() {
  return new URLSearchParams(window.location.search).get('token');
}

async function verificarInvitacion() {
  const token = getToken();
  const contenido = document.getElementById('contenido');

  if (!token) {
    contenido.innerHTML = `
      <h2>Enlace inválido</h2>
      <p style="color:#64748b">Este enlace de invitación no es válido.</p>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}/equipo/aceptar/${token}`);
    const data = await res.json();

    if (!res.ok) {
      contenido.innerHTML = `
        <h2>Invitación no disponible</h2>
        <p style="color:#dc2626">${data.error || 'El enlace no es válido o ha expirado.'}</p>
        <p style="color:#64748b;font-size:0.9rem;margin-top:8px;">Solicita al anfitrión que te envíe una nueva invitación.</p>`;
      return;
    }

    mostrarFormulario(data);
  } catch (_e) {
    contenido.innerHTML = `
      <h2>Error de conexión</h2>
      <p style="color:#dc2626">No se pudo conectar con el servidor. Intenta más tarde.</p>`;
  }
}

function mostrarFormulario(info) {
  const contenido = document.getElementById('contenido');
  contenido.innerHTML = `
    <h2>Aceptar invitación</h2>
    <p class="subtitulo">Te han invitado a administrar un alojamiento en <strong>Tu Refugio</strong>.</p>
    <div class="info-box">
      <strong>Alojamiento:</strong> ${info.alojamiento}<br>
      <strong>Correo:</strong> ${info.correo}<br>
      <strong>Rol asignado:</strong> ${info.rol}
    </div>
    <form id="formAceptar">
      <div class="form-group">
        <label for="nombre">Nombre completo *</label>
        <input id="nombre" type="text" placeholder="Tu nombre completo" required />
      </div>
      <div class="form-group">
        <label for="contrasena">Contraseña *</label>
        <input id="contrasena" type="password" placeholder="Mínimo 8 caracteres" required minlength="8" />
      </div>
      <div class="form-group">
        <label for="contrasena2">Confirmar contraseña *</label>
        <input id="contrasena2" type="password" placeholder="Repite la contraseña" required minlength="8" />
      </div>
      <button type="submit" id="btnAceptar">✅ Aceptar invitación</button>
      <div id="mensaje"></div>
    </form>`;

  document.getElementById('formAceptar')?.addEventListener('submit', aceptarInvitacion);
}

async function aceptarInvitacion(event) {
  event.preventDefault();
  const token = getToken();
  const nombre = document.getElementById('nombre').value.trim();
  const contrasena = document.getElementById('contrasena').value;
  const contrasena2 = document.getElementById('contrasena2').value;
  const mensajeEl = document.getElementById('mensaje');
  const btn = document.getElementById('btnAceptar');

  mensajeEl.textContent = '';
  mensajeEl.className = '';

  if (contrasena !== contrasena2) {
    mensajeEl.textContent = 'Las contraseñas no coinciden.';
    mensajeEl.className = 'error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const res = await fetch(`${API_URL}/equipo/aceptar/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, contrasena })
    });
    const data = await res.json();

    if (!res.ok) {
      mensajeEl.textContent = data.error || 'Error al aceptar la invitación.';
      mensajeEl.className = 'error';
      btn.disabled = false;
      btn.textContent = '✅ Aceptar invitación';
      return;
    }

    mensajeEl.textContent = '¡Bienvenido! Redirigiendo al login...';
    mensajeEl.className = 'exito';

    setTimeout(() => {
      window.location.href = '/login/login.html';
    }, 2200);
  } catch (_e) {
    mensajeEl.textContent = 'Error de conexión. Intenta de nuevo.';
    mensajeEl.className = 'error';
    btn.disabled = false;
    btn.textContent = '✅ Aceptar invitación';
  }
}

verificarInvitacion();