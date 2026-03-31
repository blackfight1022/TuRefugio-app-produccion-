document.addEventListener('DOMContentLoaded', async () => {
  const estadoPago = document.getElementById('estadoPago');
  const facturaEmitida = document.getElementById('facturaEmitida');
  const facturaContenido = document.getElementById('facturaContenido');
  const params = new URLSearchParams(window.location.search);
  const reservaId = params.get('reserva');

  // Evita exponer query params a scripts de terceros (pixel/tag managers).
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (!reservaId) {
    estadoPago.innerHTML = '<p>No se encontró una reserva asociada a esta respuesta de pago.</p>';
    return;
  }

  try {
    const estadoResponse = await fetch(`/api/payments/estado-reserva/${reservaId}`);
    const estadoData = await estadoResponse.json();

    if (!estadoResponse.ok) {
      throw new Error(estadoData.error || 'No fue posible consultar el estado del pago.');
    }

    estadoPago.innerHTML = `
      <h2>Reserva #${estadoData.id}</h2>
      <p>Referencia de pago: <strong>${estadoData.referencia_pago || 'Sin referencia'}</strong></p>
      <p>Total procesado: <strong>$${Number(estadoData.precio_total || 0).toLocaleString('es-CO')}</strong></p>
      <p>Estado de la reserva:</p>
      <span class="estado-pill">${estadoData.estado_reserva || 'pendiente'}</span>
      <p style="margin-top:12px;">Estado del pago:</p>
      <span class="estado-pill">${estadoData.estado_pago || 'pendiente'}</span>
    `;

    if (!estadoData.numero_factura) {
      return;
    }

    const facturaResponse = await fetch(`/api/payments/factura/reserva/${reservaId}`);
    const facturaData = await facturaResponse.json();
    if (!facturaResponse.ok) {
      throw new Error(facturaData.error || 'No fue posible cargar la factura.');
    }

    facturaEmitida.hidden = false;
    const servicios = Array.isArray(facturaData.detalle_json?.servicios) ? facturaData.detalle_json.servicios : [];
    facturaContenido.innerHTML = `
      <p><strong>Número:</strong> ${facturaData.numero_factura}</p>
      <p><strong>Cliente:</strong> ${facturaData.datos_cliente_json?.nombre || ''} - ${facturaData.datos_cliente_json?.documentoTipo || ''} ${facturaData.datos_cliente_json?.documentoNumero || ''}</p>
      <p><strong>Anfitrión:</strong> ${facturaData.datos_anfitrion_json?.nombre || ''}</p>
      <p><strong>Documento/NIT anfitrión:</strong> ${facturaData.datos_anfitrion_json?.documento || 'No disponible'}</p>
      <p><strong>Alojamiento:</strong> ${facturaData.detalle_json?.alojamiento || ''}</p>
      <p><strong>Habitación:</strong> ${facturaData.detalle_json?.habitacion || ''}</p>
      <p><strong>Noches:</strong> ${facturaData.detalle_json?.noches || 0}</p>
      <p><strong>Hospedaje:</strong> $${Number(facturaData.detalle_json?.subtotalHospedaje || 0).toLocaleString('es-CO')}</p>
      <p><strong>Servicios adicionales:</strong></p>
      ${servicios.length ? `<ul>${servicios.map((item) => `<li>${item.nombre} - $${Number(item.valor || 0).toLocaleString('es-CO')}</li>`).join('')}</ul>` : '<p>No aplica.</p>'}
      <p><strong>Total servicios:</strong> $${Number(facturaData.detalle_json?.subtotalServicios || 0).toLocaleString('es-CO')}</p>
      <p><strong>Total factura:</strong> $${Number(facturaData.detalle_json?.total || 0).toLocaleString('es-CO')}</p>
    `;
  } catch (error) {
    console.error(error);
    estadoPago.innerHTML = `<p>${error.message || 'Ocurrió un error consultando el resultado del pago.'}</p>`;
  }
});