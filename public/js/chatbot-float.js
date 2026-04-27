(function () {
	const STORAGE_KEY = "tu_refugio_chatbot_flotante_v2";
	const INACTIVITY_MS = 300000;

	const PAGE_CONTEXT = {
		"/": {
			title: "Inicio",
			subtitle: "",
			menu: [
				"Como funciona Tu Refugio",
				"Comision de plataforma",
				"Politicas y cancelaciones",
				"Como reservar",
				"Seguridad y confianza",
				"Contacto de soporte"
			],
			welcome: "Hola, soy el asistente de Tu Refugio. Puedo orientarte sobre funcionamiento, políticas, comisión, reservas y soporte institucional."
		},
		"/bienvenido_admin/b_admin.html": {
			title: "Panel admin",
			subtitle: "",
			menu: [
				"Comision de plataforma",
				"Politicas y cancelaciones",
				"Pagos y transacciones",
				"Seguimiento de mensajes",
				"Soporte de incidencias",
				"Resumen institucional",
				"Contacto de soporte"
			],
			welcome: "Hola, soy el asistente de seguimiento de Tu Refugio. Aqui puedes resolver inquietudes operativas y conservar el historial de conversación del panel."
		}
	};

	function resolvePath() {
		const path = window.location.pathname || "/";
		if (path === "/index.html") return "/";
		return path;
	}

	function getContext() {
		const path = resolvePath();
		return PAGE_CONTEXT[path] || PAGE_CONTEXT["/"];
	}

	function readStore() {
		try {
			const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
			return data && typeof data === "object" ? data : {};
		} catch {
			return {};
		}
	}

	function writeStore(store) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	}

	function formatTime(ts) {
		const d = new Date(ts || Date.now());
		return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
	}

	function escapeHtml(value) {
		return String(value || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	function normalizeText(value) {
		return String(value || "")
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9\s]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function buildAnswer(question, context) {
		const q = normalizeText(question);

		if (q.includes("funciona") || q.includes("como funciona")) {
			return "Tu Refugio centraliza la búsqueda, comparación y reserva de alojamientos en una experiencia segura. Los viajeros exploran opciones, comparan criterios, reservan y luego pueden dejar reseñas verificadas.";
		}

		if (q.includes("comision") || q.includes("porcentaje")) {
			return "La comisión institucional de Tu Refugio es del 15% por cada reserva confirmada. El 85% restante corresponde al alojamiento.";
		}

		if (q.includes("politica") || q.includes("cancel") || q.includes("devol")) {
			return "Las políticas de la plataforma priorizan transparencia, trazabilidad y condiciones claras de reserva. Las cancelaciones pueden contemplar devolución parcial o total según las reglas visibles del alojamiento.";
		}

		if (q.includes("reservar") || q.includes("reserva")) {
			return "Para reservar, revisa disponibilidad, políticas, capacidad y precio. Luego selecciona la opción adecuada y continúa con el flujo de pago y confirmación.";
		}

		if (q.includes("seguridad") || q.includes("confianza") || q.includes("verific")) {
			return "Tu Refugio promueve pagos protegidos, control de sesiones, trazabilidad de transacciones y reseñas verificadas para fortalecer la confianza entre viajeros y anfitriones.";
		}

		if (q.includes("pago") || q.includes("transaccion") || q.includes("transacciones")) {
			return "Desde el panel administrativo puedes contrastar referencia, estado, pasarela y valor. Si detectas una inconsistencia, documenta el caso y escálalo al canal oficial de soporte.";
		}

		if (q.includes("seguimiento") || q.includes("mensajes") || q.includes("conversacion") || q.includes("conversaciones")) {
			return "El panel conserva el historial de conversación por contexto. Puedes revisar preguntas previas para dar continuidad a casos reportados por usuarios y soporte.";
		}

		if (q.includes("contacto") || q.includes("soporte") || q.includes("correo") || q.includes("incidencia")) {
			return "Canal oficial de comunicación: soporte.turefugio@gmail.com. Para una atención más ágil, incluye referencia de reserva, fecha, correo asociado y descripción breve del caso.";
		}

		if (q.includes("resumen") || q.includes("institucional")) {
			return "Tu Refugio es una plataforma enfocada en confianza, claridad operativa y experiencia segura. Integra búsqueda avanzada, comparación inteligente, reservas verificadas y soporte institucional continuo.";
		}

		return context.title === "Panel admin"
			? "Puedo ayudarte con pagos, comisión, políticas, reservas y seguimiento de incidencias. Puedes escribir el número de una opción del menú para responder con mayor precisión."
			: "Puedo ayudarte con funcionamiento, reservas, políticas, comisión, seguridad y soporte. Puedes escribir el número de una opción del menú para una respuesta directa.";
	}

	function initChatbot() {
		const context = getContext();
		const pathKey = resolvePath();
		const store = readStore();

		if (!Array.isArray(store[pathKey])) {
			store[pathKey] = [{ role: "bot", text: context.welcome, time: Date.now() }];
			writeStore(store);
		}

		const launcher = document.createElement("button");
		launcher.className = "tr-chatbot-launcher";
		launcher.type = "button";
		launcher.setAttribute("aria-label", "Abrir asistente Tu Refugio");
		launcher.textContent = "💬";

		const panel = document.createElement("section");
		panel.className = "tr-chatbot";
		panel.innerHTML = `
			<header class="tr-chatbot-head">
				<div>
					<h3>Asistente Tu Refugio</h3>
				</div>
				<div class="tr-chatbot-head-actions">
					<button type="button" class="tr-chatbot-close" aria-label="Cerrar">✕</button>
				</div>
			</header>
			<div class="tr-chatbot-body">
				<div class="tr-chatbot-context">Soporte inteligente • Conversación guardada</div>
				<div class="tr-chatbot-menu" id="tr-chatbot-menu"></div>
				<div class="tr-chatbot-messages" id="tr-chatbot-messages"></div>
				<form class="tr-chatbot-form" id="tr-chatbot-form">
					<div class="tr-chatbot-input-wrap" role="group" aria-label="Caja de mensaje">
						<input id="tr-chatbot-input" type="text" placeholder="Escribe tu consulta..." autocomplete="off" />
					</div>
					<button type="submit" class="tr-chatbot-send" aria-label="Enviar mensaje" title="Enviar mensaje">
						<span class="tr-chatbot-send-icon" aria-hidden="true">➤</span>
					</button>
				</form>
			</div>
		`;

		document.body.appendChild(launcher);
		document.body.appendChild(panel);

		const messagesEl = panel.querySelector("#tr-chatbot-messages");
		const menuEl = panel.querySelector("#tr-chatbot-menu");
		const input = panel.querySelector("#tr-chatbot-input");
		const form = panel.querySelector("#tr-chatbot-form");
		const closeBtn = panel.querySelector(".tr-chatbot-close");
		let inactivityTimer = null;

		function getMessages() {
			const current = readStore();
			return Array.isArray(current[pathKey]) ? current[pathKey] : [];
		}

		function setMessages(messages) {
			const current = readStore();
			current[pathKey] = messages;
			writeStore(current);
		}

		function ensureWelcomeMessage() {
			const currentMessages = getMessages();
			if (currentMessages.length > 0) return;
			setMessages([{ role: "bot", text: context.welcome, time: Date.now() }]);
		}

		function renderMenu() {
			menuEl.innerHTML = `
				<p class="tr-chatbot-menu-title">Selecciona una opción o escribe el número indicado</p>
				<div class="tr-chatbot-menu-list">
					${context.menu.map((item, index) => `<button type="button" data-index="${index + 1}">${index + 1}. ${escapeHtml(item)}</button>`).join("")}
				</div>
			`;

			menuEl.querySelectorAll("button").forEach((button) => {
				button.addEventListener("click", () => {
					input.value = button.getAttribute("data-index") || "";
					sendMessage();
				});
			});
		}

		function renderMessages() {
			ensureWelcomeMessage();
			messagesEl.innerHTML = getMessages().map((msg) => `
				<article class="tr-chatbot-msg ${msg.role === "user" ? "user" : "bot"}">
					<p>${escapeHtml(msg.text)}</p>
					<small>${formatTime(msg.time)}</small>
				</article>
			`).join("");

			messagesEl.scrollTop = messagesEl.scrollHeight;
		}

		function resetInactivityTimer() {
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
			}

			inactivityTimer = setTimeout(() => {
				setMessages([]);
				panel.classList.remove("abierto");
			}, INACTIVITY_MS);
		}

		function sendMessage() {
			const raw = String(input.value || "").trim();
			if (!raw) return;

			const numeric = /^\d+$/.test(raw) ? Number(raw) : 0;
			const resolvedQuestion = numeric > 0 && numeric <= context.menu.length ? context.menu[numeric - 1] : raw;

			const messages = getMessages();
			messages.push({ role: "user", text: raw, time: Date.now() });
			setMessages(messages);
			renderMessages();
			input.value = "";
			resetInactivityTimer();

			window.setTimeout(() => {
				const next = getMessages();
				next.push({ role: "bot", text: buildAnswer(resolvedQuestion, context), time: Date.now() });
				setMessages(next);
				renderMessages();
				resetInactivityTimer();
			}, 220);
		}

		launcher.addEventListener("click", () => {
			panel.classList.toggle("abierto");
			if (panel.classList.contains("abierto")) {
				renderMenu();
				renderMessages();
				input.focus();
				resetInactivityTimer();
			}
		});

		closeBtn.addEventListener("click", () => {
			panel.classList.remove("abierto");
		});

		form.addEventListener("submit", (event) => {
			event.preventDefault();
			sendMessage();
		});

		input.addEventListener("input", resetInactivityTimer);

		renderMenu();
		renderMessages();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initChatbot);
	} else {
		initChatbot();
	}
})();
