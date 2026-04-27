// Hacer la URL de API dinámicamente para funcionar en cualquier dispositivo
const API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)}/api`;

let accesoValidado = false;
let reservaValidadaId = null;
let idAlojamientoDetectado = null;
let debounceTimer = null;

function setEstado(msg, ok = false) {
  const el = document.getElementById("estadoValidacion");
  if (!el) return;

  const texto = String(msg || "").trim();
  el.textContent = texto;

  if (!texto) {
    el.className = "estado-card";
    return;
  }

  el.className = `estado-card ${ok ? "estado-ok" : "estado-error"}`;
}

function actualizarEstadoBotonEnviar() {
  const btn = document.getElementById("btnEnviarResena");
  if (!btn) return;
  btn.disabled = !accesoValidado;
}

function actualizarReservaDetectada(texto) {
  const el = document.getElementById("reservaDetectada");
  if (!el) return;
  el.textContent = texto || "";
}

async function validarAccesoResenaPorCorreo() {
  const correo = document.getElementById("correo")?.value?.trim()?.toLowerCase();

  accesoValidado = false;
  reservaValidadaId = null;
  idAlojamientoDetectado = null;
  actualizarEstadoBotonEnviar();
  actualizarReservaDetectada("");

  if (!correo || !correo.includes("@")) {
    setEstado("Ingresa un correo válido para validar acceso a reseña.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/resenas/validar-acceso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo })
    });
    const data = await res.json();

    if (!res.ok) {
      setEstado(data.error || "No se pudo validar el acceso a reseña.");
      return;
    }

    accesoValidado = true;
    reservaValidadaId = data?.reserva?.id || null;
    idAlojamientoDetectado = Number(data?.reserva?.id_alojamiento || 0);
    actualizarReservaDetectada(`Alojamiento detectado: ${data?.reserva?.alojamiento || "N/D"}  | Habitación: ${data?.reserva?.habitacion || "N/D"}`);
    setEstado("Acceso habilitado. Ya puedes enviar tu reseña.", true);
    actualizarEstadoBotonEnviar();
  } catch (error) {
    console.error(error);
    setEstado("Error de conexión al validar acceso.");
    actualizarEstadoBotonEnviar();
  }
}

async function enviarResena(event) {
  event.preventDefault();

  if (!accesoValidado) {
    setEstado("El correo aún no tiene una reserva finalizada pendiente de reseña.");
    return;
  }

  const correo = document.getElementById("correo")?.value?.trim()?.toLowerCase();
  const calificacion = Number(document.getElementById("calificacion")?.value || 0);
  const comentario = document.getElementById("comentario")?.value?.trim();

  if (!calificacion || !comentario) {
    setEstado("La calificación y comentario son obligatorios.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/resenas/publica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo,
        calificacion,
        comentario,
        id_reserva: reservaValidadaId,
        id_alojamiento: idAlojamientoDetectado
      })
    });
    const data = await res.json();

    if (!res.ok) {
      setEstado(data.error || "No se pudo registrar la reseña.");
      return;
    }

    setEstado("Gracias. Tu reseña fue registrada correctamente.", true);
    document.getElementById("comentario").value = "";
    document.getElementById("calificacion").value = "";
    accesoValidado = false;
    reservaValidadaId = null;
    idAlojamientoDetectado = null;
    actualizarEstadoBotonEnviar();
    actualizarReservaDetectada("No tienes una reseña pendiente con este correo en este momento.");
  } catch (error) {
    console.error(error);
    setEstado("Error de conexión al enviar reseña.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const correoInput = document.getElementById("correo");
  correoInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validarAccesoResenaPorCorreo, 600);
  });
  correoInput?.addEventListener("blur", validarAccesoResenaPorCorreo);

  actualizarEstadoBotonEnviar();
  document.getElementById("formResena")?.addEventListener("submit", enviarResena);
});
