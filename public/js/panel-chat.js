(function () {
  const POLL_MS_ABIERTO = 15000;
  const POLL_MS_CERRADO = 60000;
  const POLL_TICK_MS = 5000;
  const STORAGE_KEY = 'tu_refugio_panel_chat_ui_v1';

  const state = {
    contactos: [],
    yo: null,
    contactoId: 0,
    canal: 'gestion',
    pollHandle: null,
    abierto: false,
    lastContactosAt: 0,
    refrescoEnCurso: false,
    backoffUntil: 0
  };

  function getToken() {
    return localStorage.getItem('token') || '';
  }

  function authHeaders(extra) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(extra || {})
    };
  }

  async function api(url, options) {
    if (Date.now() < state.backoffUntil) {
      throw new Error('Demasiadas solicitudes. Espera unos segundos antes de reintentar.');
    }

    const response = await fetch(url, {
      ...(options || {}),
      headers: authHeaders(options?.headers)
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 30000;
      state.backoffUntil = Date.now() + esperaMs;
      throw new Error('Demasiadas solicitudes. Intenta nuevamente en unos minutos.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Error de comunicación con el chat.');
    }

    state.backoffUntil = 0;
    return data;
  }

  function formatearFecha(v) {
    // SQLite CURRENT_TIMESTAMP llega como "YYYY-MM-DD HH:MM:SS" (UTC).
    // Lo convertimos a ISO UTC para evitar desfases de zona horaria en el cliente.
    const raw = String(v || '').trim();
    const isoUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;
    const d = new Date(isoUtc || Date.now());

    if (Number.isNaN(d.getTime())) {
      const fallback = new Date();
      return fallback.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }

    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function saveUiState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      contactoId: state.contactoId,
      canal: state.canal
    }));
  }

  function loadUiState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.contactoId = Number(raw.contactoId || 0);
      state.canal = String(raw.canal || 'gestion');
    } catch {
      state.contactoId = 0;
      state.canal = 'gestion';
    }
  }

  function crearPanel() {
    const launcher = document.querySelector('.tr-chatbot-launcher');
    if (!launcher) return null;

    const badge = document.createElement('span');
    badge.className = 'tr-chat-badge';
    badge.hidden = true;
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', 'mensajes nuevos');
    launcher.appendChild(badge);

    const panel = document.createElement('section');
    panel.className = 'tr-panel-chat';
    panel.innerHTML = `
      <header class="tr-panel-chat-head">
        <h3>Chat interno Tu Refugio</h3>
        <button type="button" class="tr-panel-chat-close" aria-label="Cerrar">✕</button>
      </header>
      <div class="tr-panel-chat-body">
        <div class="tr-panel-chat-meta" id="tr-panel-chat-meta">Canal de gestión y soporte</div>
        <div class="tr-panel-chat-controls">
          <select id="tr-panel-chat-contact" class="tr-panel-chat-select"></select>
          <select id="tr-panel-chat-channel" class="tr-panel-chat-channel"></select>
        </div>
        <div id="tr-panel-chat-messages" class="tr-panel-chat-messages"></div>
        <form id="tr-panel-chat-form" class="tr-panel-chat-form">
          <input id="tr-panel-chat-input" class="tr-panel-chat-input" type="text" maxlength="1200" placeholder="Escribe tu mensaje..." autocomplete="off" />
          <button type="submit" class="tr-panel-chat-send" aria-label="Enviar">➤</button>
        </form>
      </div>
    `;

    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('.tr-panel-chat-close');
    const contactSelect = panel.querySelector('#tr-panel-chat-contact');
    const channelSelect = panel.querySelector('#tr-panel-chat-channel');
    const messagesEl = panel.querySelector('#tr-panel-chat-messages');
    const form = panel.querySelector('#tr-panel-chat-form');
    const input = panel.querySelector('#tr-panel-chat-input');
    const meta = panel.querySelector('#tr-panel-chat-meta');

    function contactoActivo() {
      return state.contactos.find((c) => Number(c.id) === Number(state.contactoId)) || null;
    }

    function actualizarBadge() {
      const total = state.contactos.reduce((sum, c) =>
        sum + (c.canales || []).reduce((s, ch) => s + Number(ch.pendientes || 0), 0), 0);
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? '99+' : String(total || '');
    }

    function renderCanales() {
      const contacto = contactoActivo();
      const canales = contacto?.canales || [];
      channelSelect.innerHTML = canales.map((c) => `<option value="${escapeHtml(c.codigo)}">${escapeHtml(c.etiqueta)}${c.pendientes ? ` (${c.pendientes})` : ''}</option>`).join('');

      if (!canales.some((c) => c.codigo === state.canal)) {
        state.canal = canales[0]?.codigo || 'gestion';
      }
      channelSelect.value = state.canal;

      if (state.canal === 'soporte') {
        meta.textContent = 'Canal de soporte con administrador de plataforma';
      } else {
        meta.textContent = 'Canal de gestión entre anfitrión y administrador asignado';
      }
    }

    function renderContactos() {
      if (!state.contactos.length) {
        contactSelect.innerHTML = '<option value="">No tienes contactos habilitados</option>';
        channelSelect.innerHTML = '<option value="">Sin canales</option>';
        messagesEl.innerHTML = '<p class="tr-panel-chat-empty">No hay contactos disponibles para este usuario.</p>';
        return;
      }

      contactSelect.innerHTML = state.contactos.map((c) => {
        const totalPendientes = (c.canales || []).reduce((acc, ch) => acc + Number(ch.pendientes || 0), 0);
        const badge = totalPendientes > 0 ? ` (${totalPendientes})` : '';
        return `<option value="${c.id}">${escapeHtml(c.nombre)}${badge}</option>`;
      }).join('');

      if (!state.contactos.some((c) => Number(c.id) === Number(state.contactoId))) {
        state.contactoId = Number(state.contactos[0].id || 0);
      }

      contactSelect.value = String(state.contactoId);
      renderCanales();
    }

    async function cargarContactos() {
      const data = await api('/api/panel-chat/contactos');
      state.contactos = Array.isArray(data.contactos) ? data.contactos : [];
      state.yo = data.yo || null;
      state.lastContactosAt = Date.now();
      renderContactos();
      actualizarBadge();
      saveUiState();
    }

    async function cargarMensajes() {
      if (!state.contactoId) {
        messagesEl.innerHTML = '<p class="tr-panel-chat-empty">Selecciona un contacto para iniciar la conversación.</p>';
        return;
      }

      const query = new URLSearchParams({
        contacto_id: String(state.contactoId),
        canal: state.canal
      });

      const data = await api(`/api/panel-chat/mensajes?${query.toString()}`);
      const mensajes = Array.isArray(data.mensajes) ? data.mensajes : [];

      if (!mensajes.length) {
        messagesEl.innerHTML = '<p class="tr-panel-chat-empty">Aún no hay mensajes en este canal.</p>';
        return;
      }

      messagesEl.innerHTML = mensajes.map((m) => {
        const esMio = Number(m.emisor_id) === Number(state.yo?.id || 0);
        return `
          <article class="tr-panel-chat-msg ${esMio ? 'user' : 'other'}">
            <p>${escapeHtml(m.contenido)}</p>
            <small>${escapeHtml(m.emisor_nombre || '')} • ${formatearFecha(m.creado_en)}</small>
          </article>
        `;
      }).join('');

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function enviarMensaje() {
      const contenido = String(input.value || '').trim();
      if (!contenido || !state.contactoId) return;

      await api('/api/panel-chat/mensajes', {
        method: 'POST',
        body: JSON.stringify({
          contacto_id: state.contactoId,
          canal: state.canal,
          contenido
        })
      });

      input.value = '';
      await cargarMensajes();
      await cargarContactos();
    }

    async function refrescarAbierto() {
      if (document.hidden || state.refrescoEnCurso) return;

      const ahora = Date.now();
      const debeRefrescarContactos = state.abierto
        ? (ahora - state.lastContactosAt >= POLL_MS_ABIERTO)
        : (ahora - state.lastContactosAt >= POLL_MS_CERRADO);

      if (!debeRefrescarContactos && !state.abierto) return;

      state.refrescoEnCurso = true;
      try {
        if (debeRefrescarContactos) {
          await cargarContactos();
        }
        if (state.abierto) {
          await cargarMensajes();
        }
      } catch (e) {
        console.error('[panel-chat]', e);
      } finally {
        state.refrescoEnCurso = false;
      }
    }

    launcher.addEventListener('click', async () => {
      state.abierto = !state.abierto;
      panel.classList.toggle('abierto', state.abierto);
      if (!state.abierto) return;

      try {
        await cargarContactos();
        await cargarMensajes();
        input.focus();
      } catch (e) {
        messagesEl.innerHTML = `<p class="tr-panel-chat-empty">${escapeHtml(e.message || 'No fue posible abrir el chat.')}</p>`;
      }
    });

    closeBtn.addEventListener('click', () => {
      state.abierto = false;
      panel.classList.remove('abierto');
    });

    contactSelect.addEventListener('change', async () => {
      state.contactoId = Number(contactSelect.value || 0);
      renderCanales();
      saveUiState();
      await cargarMensajes();
      await cargarContactos();
    });

    channelSelect.addEventListener('change', async () => {
      state.canal = String(channelSelect.value || 'gestion');
      saveUiState();
      renderCanales();
      await cargarMensajes();
      await cargarContactos();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await enviarMensaje();
      } catch (e) {
        console.error('[panel-chat] enviar:', e);
      }
    });

    state.pollHandle = setInterval(refrescarAbierto, POLL_TICK_MS);

    return {
      cargarContactos,
      cargarMensajes
    };
  }

  function init() {
    if (!getToken()) return;
    loadUiState();
    crearPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
