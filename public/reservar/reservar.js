document.addEventListener("DOMContentLoaded", () => {
  const resumenRaw = sessionStorage.getItem("resumenReservaTuRefugio");
  const resumenContenedor = document.getElementById("resumenReserva");
  const alojamientoInput = document.getElementById("alojamiento");
  const habitacionInput = document.getElementById("habitacion");
  const fechaInicioInput = document.getElementById("fecha-inicio");
  const fechaFinInput = document.getElementById("fecha-fin");
  const valorEstadiaInfo = document.getElementById("valor-estadia");
  const personasInput = document.getElementById("personas");
  const totalInput = document.getElementById("total-estimado");
  const form = document.querySelector("main form");
  const confirmarBtn = form?.querySelector('button[type="submit"]');
  const checkoutModal = document.getElementById("checkoutModal");
  const checkoutForm = document.getElementById("checkoutForm");
  const cerrarCheckoutBtn = document.getElementById("cerrarCheckout");
  const btnPagarWompi = document.getElementById("btnPagarWompi");
  const checkoutResumenMini = document.getElementById("checkoutResumenMini");
  const checkoutNombre = document.getElementById("checkout-nombre");
  const checkoutTipoDocumento = document.getElementById("checkout-tipo-documento");
  const checkoutNumeroDocumento = document.getElementById("checkout-numero-documento");
  const checkoutCorreo = document.getElementById("checkout-correo");
  const checkoutTelefono = document.getElementById("checkout-telefono");
  const wompiWidgetZone = document.getElementById("wompiWidgetZone");
  let reservaEnCheckoutId = null;
  let intervaloMonitoreoPago = null;

  if (!resumenRaw) {
    if (resumenContenedor) {
      resumenContenedor.innerHTML = "<p>No hay una selección previa de habitación o servicios. Regresa a la vista de detalles.</p>";
    }
    return;
  }

  let resumen;
  try {
    resumen = JSON.parse(resumenRaw);
  } catch (error) {
    console.error(error);
    if (resumenContenedor) {
      resumenContenedor.innerHTML = "<p>No se pudo cargar el resumen de reserva.</p>";
    }
    return;
  }

  if (alojamientoInput) {
    alojamientoInput.value = resumen.alojamientoTitulo || `Alojamiento #${resumen.alojamientoId || ""}`;
  }

  if (habitacionInput) {
    const nombreHabitacion = resumen.habitacion?.nombre || "No seleccionada";
    const precioHabitacion = Number(resumen.habitacion?.precio || 0).toLocaleString("es-CO");
    habitacionInput.value = `${nombreHabitacion} - $${precioHabitacion}`;
  }

  if (personasInput && resumen.habitacion?.capacidad) {
    personasInput.value = Math.max(1, Number(resumen.habitacion.capacidad));
    personasInput.max = Number(resumen.habitacion.capacidad);
  }

  const precioHabitacionBase = Number(resumen.habitacion?.precio || 0);
  const serviciosSeleccionados = Array.isArray(resumen.servicios) ? resumen.servicios : [];
  const totalServicios = Number(resumen.totalServicios || 0);

  function formatoMoneda(valor) {
    return `$${Number(valor || 0).toLocaleString("es-CO")}`;
  }

  function calcularNoches() {
    if (!fechaInicioInput?.value || !fechaFinInput?.value) {
      return 0;
    }

    const inicio = new Date(`${fechaInicioInput.value}T00:00:00`);
    const fin = new Date(`${fechaFinInput.value}T00:00:00`);
    const diferenciaMs = fin.getTime() - inicio.getTime();

    if (Number.isNaN(diferenciaMs) || diferenciaMs <= 0) {
      return 0;
    }

    return Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));
  }

  function obtenerTotalesActuales() {
    const noches = calcularNoches();
    const subtotalHospedaje = noches > 0 ? precioHabitacionBase * noches : 0;
    const totalFinal = subtotalHospedaje + totalServicios;

    return {
      noches,
      subtotalHospedaje,
      totalServicios,
      totalFinal
    };
  }

  function renderResumen() {
    if (!resumenContenedor) {
      return;
    }

    const { noches, subtotalHospedaje, totalFinal } = obtenerTotalesActuales();
    const listaServicios = serviciosSeleccionados.length
      ? `<ul>${serviciosSeleccionados.map((item) => `<li>${item.nombre} - ${formatoMoneda(item.valor || 0)}</li>`).join("")}</ul>`
      : "<p>No seleccionaste servicios adicionales.</p>";

    resumenContenedor.innerHTML = `
      <h2>📋 Resumen de tu reserva</h2>
      <p><strong>Alojamiento:</strong> ${resumen.alojamientoTitulo || "No especificado"}</p>
      <p><strong>Habitación:</strong> ${resumen.habitacion?.nombre || "No seleccionada"}</p>
      <p><strong>Valor por noche:</strong> ${formatoMoneda(precioHabitacionBase)}</p>
      <p><strong>Noches seleccionadas:</strong> ${noches > 0 ? noches : "Sin definir"}</p>
      <p><strong>Fecha de inicio:</strong> ${fechaInicioInput?.value || "Sin definir"}</p>
      <p><strong>Fecha de fin:</strong> ${fechaFinInput?.value || "Sin definir"}</p>
      <p><strong>Valor por estadia:</strong> ${formatoMoneda(subtotalHospedaje)}</p>
      <p><strong>Servicios adicionales:</strong></p>
      ${listaServicios}
      <p><strong>Total servicios:</strong> ${formatoMoneda(totalServicios)}</p>
      <p class="resumen-linea-total"><strong>Total acumulado:</strong> ${formatoMoneda(totalFinal)}</p>
    `;
  }

  function actualizarResumenCheckout() {
    if (!checkoutResumenMini) {
      return;
    }

    const { noches, subtotalHospedaje, totalFinal } = obtenerTotalesActuales();
    checkoutResumenMini.innerHTML = `
      <strong>${resumen.alojamientoTitulo || "Alojamiento"}</strong><br>
      Habitación: ${resumen.habitacion?.nombre || "No seleccionada"}<br>
      Noches: ${noches || "Sin definir"}<br>
      Inicio: ${fechaInicioInput?.value || "Sin definir"}<br>
      Fin: ${fechaFinInput?.value || "Sin definir"}<br>
      Hospedaje: ${formatoMoneda(subtotalHospedaje)}<br>
      Servicios adicionales: ${formatoMoneda(totalServicios)}<br>
      <strong>Total a pagar: ${formatoMoneda(totalFinal)}</strong>
    `;
  }

  function actualizarEstadoBotonPago() {
    if (!btnPagarWompi) {
      return;
    }

    const datosCompletos = [
      checkoutNombre?.value,
      checkoutTipoDocumento?.value,
      checkoutNumeroDocumento?.value,
      checkoutCorreo?.value,
      checkoutTelefono?.value
    ].every((value) => String(value || "").trim());

    btnPagarWompi.disabled = !datosCompletos;
  }

  function recalcularTotales() {
    const { noches, subtotalHospedaje, totalFinal } = obtenerTotalesActuales();
    const rangoValido = noches > 0;

    if (valorEstadiaInfo) {
      if (noches > 0) {
        valorEstadiaInfo.textContent = `Tu estadia sera de ${noches} noche${noches > 1 ? "s" : ""}. Valor por alojamiento: ${formatoMoneda(subtotalHospedaje)}.`;
      } else {
        valorEstadiaInfo.textContent = "Selecciona una fecha de fin posterior a la fecha de inicio para calcular el valor de tu estadia.";
      }
    }

    if (totalInput) {
      totalInput.value = formatoMoneda(totalFinal);
    }

    if (confirmarBtn) {
      confirmarBtn.disabled = !rangoValido;
      confirmarBtn.title = rangoValido
        ? "Confirmar reserva"
        : "Debes seleccionar una fecha de fin posterior a la fecha de inicio";
    }

    renderResumen();
    actualizarResumenCheckout();
  }

  function abrirModalCheckout() {
    if (!checkoutModal) {
      return;
    }

    actualizarResumenCheckout();
    checkoutModal.classList.add("activo");
    checkoutModal.setAttribute("aria-hidden", "false");
    checkoutNombre?.focus();
  }

  function cerrarModalCheckout() {
    if (!checkoutModal) {
      return;
    }

    checkoutModal.classList.remove("activo");
    checkoutModal.setAttribute("aria-hidden", "true");
    if (wompiWidgetZone) {
      wompiWidgetZone.innerHTML = "";
      wompiWidgetZone.style.display = "none";
    }
    if (btnPagarWompi) {
      btnPagarWompi.textContent = "Pagar";
    }
    if (intervaloMonitoreoPago) {
      clearInterval(intervaloMonitoreoPago);
      intervaloMonitoreoPago = null;
    }
    reservaEnCheckoutId = null;
    actualizarEstadoBotonPago();
  }

  async function consultarEstadoPagoReserva() {
    if (!reservaEnCheckoutId) return;

    try {
      const res = await fetch(`/api/payments/estado-reserva/${reservaEnCheckoutId}`);
      if (!res.ok) return;

      const estado = await res.json();
      const estadoReserva = String(estado?.estado_reserva || "").toLowerCase();
      const estadoPago = String(estado?.estado_pago || "").toLowerCase();

      if (estadoReserva === "confirmada" || estadoPago === "pagado") {
        if (intervaloMonitoreoPago) {
          clearInterval(intervaloMonitoreoPago);
          intervaloMonitoreoPago = null;
        }

        if (btnPagarWompi) {
          btnPagarWompi.disabled = true;
          btnPagarWompi.textContent = "Pago confirmado";
        }

        if (wompiWidgetZone) {
          wompiWidgetZone.style.display = "block";
          wompiWidgetZone.innerHTML = "<p style='margin-top:12px;color:#0f5132;background:#d1e7dd;border:1px solid #badbcc;border-radius:8px;padding:10px;'>✅ Pago confirmado. Redirigiendo al panel principal...</p><p style='margin-top:10px;'><a href='../index.html' style='color:#0b5ed7;font-weight:600;text-decoration:underline;'>Ir ahora al panel principal</a></p>";
        }

        setTimeout(() => {
          sessionStorage.removeItem('resumenReservaTuRefugio');
          window.location.href = "../index.html";
        }, 1500);
      }
    } catch (error) {
      // Silencioso: se vuelve a intentar en el siguiente ciclo.
    }
  }

  function iniciarMonitoreoPago() {
    if (!reservaEnCheckoutId) return;
    if (intervaloMonitoreoPago) {
      clearInterval(intervaloMonitoreoPago);
    }

    consultarEstadoPagoReserva();
    intervaloMonitoreoPago = setInterval(consultarEstadoPagoReserva, 3000);
  }

  function construirPayloadCheckout() {
    const { noches, subtotalHospedaje, totalFinal } = obtenerTotalesActuales();

    return {
      id_habitacion: resumen.habitacion?.id,
      fecha_entrada: fechaInicioInput?.value,
      fecha_salida: fechaFinInput?.value,
      personas: Number(personasInput?.value || 1),
      cliente: {
        nombre: checkoutNombre?.value.trim(),
        tipoDocumento: checkoutTipoDocumento?.value,
        numeroDocumento: checkoutNumeroDocumento?.value.trim(),
        correo: checkoutCorreo?.value.trim(),
        telefono: checkoutTelefono?.value.trim()
      },
      servicios: serviciosSeleccionados.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        valor: item.valor
      })),
      resumen: {
        noches,
        subtotalHospedaje,
        subtotalServicios: totalServicios,
        totalFinal
      }
    };
  }

  function enviarAFormWompi(config) {
    if (!wompiWidgetZone) {
      throw new Error("No se encontró el contenedor del widget de pago.");
    }

    wompiWidgetZone.innerHTML = "";
    wompiWidgetZone.style.display = "block";

    const fields = config.fields || {};
    const required = ['public-key', 'currency', 'amount-in-cents', 'reference', 'signature:integrity'];
    const faltantes = required.filter((k) => {
      const v = fields[k];
      return v === undefined || v === null || String(v).trim() === '' || String(v).trim().toLowerCase() === 'undefined';
    });

    if (faltantes.length) {
      throw new Error(`Configuración de pago incompleta. Faltan campos requeridos: ${faltantes.join(', ')}`);
    }

    // Construir URL manualmente: los nombres de clave NO deben codificarse
    // (Wompi/CloudFront requiere "signature:integrity" literal, no "signature%3Aintegrity").
    // window.location.href preserva el string tal como está — a diferencia de
    // URLSearchParams y form.submit() que siempre codifican los nombres de campo.
    const baseUrl = config.action || 'https://checkout.wompi.co/p/';
    const queryParts = [];
    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const v = String(value).trim();
      if (!v || v.toLowerCase() === 'undefined') return;
      queryParts.push(`${key}=${encodeURIComponent(v)}`);
    });
    const checkoutUrl = `${baseUrl}?${queryParts.join('&')}`;

    // Mostrar botón; al hacer clic se navega con href directo (no form.submit ni
    // URLSearchParams) para que los ":" en las claves lleguen sin codificar.
    wompiWidgetZone.innerHTML = `
      <p style="margin-bottom:12px; font-size:14px; color:#1a424d;">
        Todo listo. El pago se abrirá en una pestaña nueva para evitar bloqueos del navegador.
      </p>
      <p style="margin-bottom:12px; font-size:13px; color:#5d6d74; background:#fff3cd; border:1px solid #ffe69c; border-radius:8px; padding:10px;">
        Mantén abierta esta pestaña. Cuando Wompi confirme el pago, aquí te regresaremos automáticamente al panel principal.
      </p>
      <button id="wompi-submit-btn"
         type="button"
         style="display:inline-block; background:#7c3aed; color:#fff; font-weight:700;
                padding:12px 28px; border-radius:10px; border:none; cursor:pointer;
                font-size:15px; letter-spacing:0.5px;">
        Abrir pago seguro en Wompi
      </button>
      <p style="margin-top:10px; font-size:12px; color:#5d6d74;">
        Si tu navegador bloquea la apertura automática, usa el enlace de respaldo.
      </p>
      <p style="margin-top:8px; font-size:13px;">
        <a id="wompi-fallback-link" href="${checkoutUrl}" target="_blank" rel="noopener noreferrer" style="color:#0b5ed7; font-weight:600; text-decoration:underline;">
          Abrir Wompi manualmente
        </a>
      </p>
    `;

    document.getElementById('wompi-submit-btn').addEventListener('click', () => {
      const opened = window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        document.getElementById('wompi-fallback-link')?.click();
      }
    });

    if (btnPagarWompi) {
      btnPagarWompi.disabled = true;
      btnPagarWompi.textContent = "Pago iniciado";
    }
  }

  if (fechaInicioInput && fechaFinInput) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    const hoyISO = `${yyyy}-${mm}-${dd}`;

    fechaInicioInput.min = hoyISO;
    fechaFinInput.min = hoyISO;

    fechaInicioInput.addEventListener("change", () => {
      fechaFinInput.min = fechaInicioInput.value || hoyISO;
      recalcularTotales();
    });

    fechaFinInput.addEventListener("change", recalcularTotales);
  }

  [checkoutNombre, checkoutTipoDocumento, checkoutNumeroDocumento, checkoutCorreo, checkoutTelefono].forEach((elemento) => {
    elemento?.addEventListener("input", actualizarEstadoBotonPago);
    elemento?.addEventListener("change", actualizarEstadoBotonPago);
  });

  cerrarCheckoutBtn?.addEventListener("click", cerrarModalCheckout);
  checkoutModal?.addEventListener("click", (event) => {
    if (event.target === checkoutModal) {
      cerrarModalCheckout();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && checkoutModal?.classList.contains("activo")) {
      cerrarModalCheckout();
    }
  });

  recalcularTotales();
  actualizarEstadoBotonPago();

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (confirmarBtn?.disabled) {
        alert("Selecciona un rango de fechas valido para continuar con la reserva.");
        return;
      }
      abrirModalCheckout();
    });
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      actualizarEstadoBotonPago();
      if (btnPagarWompi?.disabled) {
        alert("Completa todos los datos del titular de la reserva antes de continuar.");
        return;
      }

      const payload = construirPayloadCheckout();
      btnPagarWompi.disabled = true;
      btnPagarWompi.textContent = "Pagar";

      try {
        const response = await fetch("/api/reservas/checkout-public", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "No se pudo preparar la reserva para pago.");
        }

        const checkout = result.checkout || result.wompi;
        reservaEnCheckoutId = result?.reserva?.id || null;

        if (!checkout?.enabled) {
          throw new Error(checkout?.message || "El pago no está disponible en este momento.");
        }

        enviarAFormWompi(checkout);
        iniciarMonitoreoPago();
      } catch (error) {
        console.error(error);
        alert(error.message || "Ocurrió un problema iniciando el pago.");
        btnPagarWompi.textContent = "Pagar";
        actualizarEstadoBotonPago();
      }
    });
  }
});
