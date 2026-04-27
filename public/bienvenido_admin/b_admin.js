const API_BASE = '/api/admin';
let autoRefreshUsuarios = null;
let _reservasCargadas = [];
let _transaccionesCargadas = [];
let _finanzasReservas = [];
let _totalesFinanzas = null;

function obtenerIdUsuarioDesdeToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return 0;
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return Number(payload?.id || 0);
  } catch {
    return 0;
  }
}

function esAdminPlataformaLocal() {
  if (String(localStorage.getItem('es_superadmin') || '0') === '1') return true;
  const miId = obtenerIdUsuarioDesdeToken();
  if (miId && window._usuariosCargados) {
    const yo = window._usuariosCargados.find((u) => Number(u.id) === miId);
    if (yo && Number(yo.es_superadmin || 0) === 1) {
      localStorage.setItem('es_superadmin', '1');
      return true;
    }
  }
  return false;
}

function tieneSesionAdminLocal() {
  const token = localStorage.getItem('token');
  const rol = String(localStorage.getItem('rol') || '').toLowerCase().trim();
  return Boolean(token) && rol === 'admin';
}

if (!tieneSesionAdminLocal()) {
  window.location.replace('../admin/admin.html');
}

function obtenerHeadersAuth() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

function formatearFecha(fecha) {
  if (!fecha) return '-';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString('es-CO');
}

function safeText(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatoMoneda(valor) {
  return `$${Number(valor || 0).toLocaleString('es-CO')}`;
}

async function fetchAdmin(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...obtenerHeadersAuth(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Error consultando información del panel admin.');
  }

  return data;
}

async function cargarResumenDashboard() {
  const data = await fetchAdmin(`${API_BASE}/dashboard/resumen`);
  document.getElementById('kpi-usuarios').textContent = data.total_usuarios || 0;
  document.getElementById('kpi-reservas').textContent = data.total_reservas || 0;
  document.getElementById('kpi-transacciones').textContent = data.total_transacciones || 0;
  document.getElementById('kpi-suspendidas').textContent = data.cuentas_suspendidas || 0;
}

async function cargarExtractosReservas() {
  const rows = await fetchAdmin(`${API_BASE}/extractos/reservas`);
  _reservasCargadas = Array.isArray(rows) ? rows : [];
  const tbody = document.getElementById('tabla-reservas-body');

  tbody.innerHTML = rows.length
    ? rows.map((r) => `
        <tr>
          <td>${safeText(r.id)}</td>
          <td>${safeText(r.turista)}<br><small>${safeText(r.correo_turista)}</small></td>
          <td>${safeText(r.alojamiento)}<br><small>Host: ${safeText(r.anfitrion)}</small></td>
          <td>${safeText(r.habitacion)}</td>
          <td>${safeText(r.fecha_entrada)}</td>
          <td>${safeText(r.fecha_salida)}</td>
          <td>$${Number(r.precio_total || 0).toLocaleString('es-CO')}</td>
          <td><span class="badge badge-${String(r.estado || '').toLowerCase()}">${safeText(r.estado)}</span></td>
          <td>${safeText(r.referencia_pago)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="9">No hay reservas registradas.</td></tr>';
}

async function cargarExtractosTransacciones() {
  const rows = await fetchAdmin(`${API_BASE}/extractos/transacciones`);
  _transaccionesCargadas = Array.isArray(rows) ? rows : [];
  const tbody = document.getElementById('tabla-transacciones-body');

  tbody.innerHTML = rows.length
    ? rows.map((p) => `
        <tr>
          <td>${safeText(p.id)}</td>
          <td>${safeText(p.id_reserva)}</td>
          <td>${safeText(p.turista)}<br><small>${safeText(p.correo_turista)}</small></td>
          <td>${safeText(p.alojamiento)}<br><small>Host: ${safeText(p.anfitrion)}</small></td>
          <td>$${Number(p.monto || 0).toLocaleString('es-CO')}</td>
          <td>${safeText(p.metodo_pago)}</td>
          <td><span class="badge badge-${String(p.estado || '').toLowerCase()}">${safeText(p.estado)}</span></td>
          <td>${safeText(p.pasarela)}</td>
          <td>${safeText(p.referencia_pago)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="9">No hay transacciones registradas.</td></tr>';
}

function construirQueryFinanzas() {
  const params = new URLSearchParams();
  const alojamientoId = document.getElementById('filtro-finanzas-alojamiento')?.value || '';
  const fechaInicio = document.getElementById('filtro-finanzas-inicio')?.value || '';
  const fechaFin = document.getElementById('filtro-finanzas-fin')?.value || '';

  if (alojamientoId) params.set('alojamiento_id', alojamientoId);
  if (fechaInicio) params.set('fecha_inicio', fechaInicio);
  if (fechaFin) params.set('fecha_fin', fechaFin);

  const query = params.toString();
  return query ? `?${query}` : '';
}

function renderizarTotalesFinanzas(totales) {
  document.getElementById('fin-devengado-plataforma').textContent = formatoMoneda(totales.total_comision_plataforma || 0);
  document.getElementById('fin-devengado-alojamientos').textContent = formatoMoneda(totales.total_neto_alojamientos || 0);
  document.getElementById('fin-base-cancelada').textContent = formatoMoneda(totales.total_cancelado || 0);

  const totalCancelado = Number(totales.total_cancelado || 0);
  const totalDevoluciones = Number(totales.total_devoluciones || 0);
  const pctDevolucionSobreCancelado = totalCancelado > 0 ? ((totalDevoluciones / totalCancelado) * 100) : 0;
  document.getElementById('fin-devolucion-total').textContent = `${pctDevolucionSobreCancelado.toFixed(2)}%`;
  document.getElementById('fin-devengado-plataforma-detalle').textContent = 'Suma del 15% de cada reserva (incluye canceladas).';
  document.getElementById('fin-devengado-alojamientos-detalle').textContent = `Saldo efectivo total para alojamientos: ${formatoMoneda(totales.total_neto_alojamientos || 0)}.`;
  document.getElementById('fin-base-cancelada-detalle').textContent = `Saldo total acumulado de reservas canceladas: ${formatoMoneda(totalCancelado)}.`;
  document.getElementById('fin-devolucion-total-detalle').textContent = `Monto total descontado a usuarios: ${formatoMoneda(totalDevoluciones)}. Puede ser un descuento parcial o total según la devolución aplicada por el alojamiento.`;
}

function renderizarDevengadosPorAlojamiento() {
  const termino = String(document.getElementById('filtro-devengado-busqueda')?.value || '').toLowerCase().trim();
  const tbody = document.getElementById('tabla-devengados-alojamiento-body');

  const mapa = new Map();
  for (const r of (_finanzasReservas || [])) {
    const key = String(r.alojamiento_id || r.alojamiento || 'sin-alojamiento');
    if (!mapa.has(key)) {
      mapa.set(key, {
        alojamiento: String(r.alojamiento || '-'),
        reservas: 0,
        devengadoPlataforma: 0,
        devengadoAlojamiento: 0,
        baseCancelada: 0,
        devolucion: 0
      });
    }

    const item = mapa.get(key);
    item.reservas += 1;
    item.devengadoPlataforma += Number(r.comision_plataforma || 0);
    item.devengadoAlojamiento += Number(r.neto_alojamiento || 0);

    if (String(r.estado_pago || '').toLowerCase() === 'cancelado') {
      item.baseCancelada += Number(r.valor_reserva || 0);
      item.devolucion += Number(r.valor_devolucion || 0);
    }
  }

  let rows = Array.from(mapa.values());
  if (termino) {
    rows = rows.filter((r) => r.alojamiento.toLowerCase().includes(termino));
  }

  tbody.innerHTML = rows.length
    ? rows.map((r) => `
        <tr>
          <td>${safeText(r.alojamiento)}</td>
          <td>${Number(r.reservas || 0).toLocaleString('es-CO')}</td>
          <td>${formatoMoneda(r.devengadoPlataforma)}</td>
          <td>${formatoMoneda(r.devengadoAlojamiento)}</td>
          <td>${formatoMoneda(r.baseCancelada)}</td>
          <td>${formatoMoneda(r.devolucion)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6">No hay devengados por alojamiento para el filtro actual.</td></tr>';
}

async function cargarAlojamientosFinanzas() {
  const select = document.getElementById('filtro-finanzas-alojamiento');
  if (!select) return;

  const actual = String(select.value || '');
  const rows = await fetchAdmin(`${API_BASE}/alojamientos/lista`);
  const opciones = ['<option value="">Todos los alojamientos</option>']
    .concat((rows || []).map((a) => `<option value="${Number(a.id || 0)}">${safeText(a.titulo)} (#${Number(a.id || 0)})</option>`));
  select.innerHTML = opciones.join('');
  if (actual) select.value = actual;
}

async function cargarFinanzasReservas() {
  const query = construirQueryFinanzas();
  const data = await fetchAdmin(`${API_BASE}/finanzas/reservas${query}`);

  _finanzasReservas = Array.isArray(data?.reservas) ? data.reservas : [];
  _totalesFinanzas = data?.totales || null;

  renderizarTotalesFinanzas(_totalesFinanzas || {
    total_reservas: 0,
    valor_total_reservas: 0,
    total_pago: 0,
    total_pendiente: 0,
    total_cancelado: 0,
    total_devoluciones: 0,
    total_comision_plataforma: 0,
    total_neto_alojamientos: 0
  });

  const tbody = document.getElementById('tabla-finanzas-body');
  tbody.innerHTML = _finanzasReservas.length
    ? _finanzasReservas.map((r) => {
        const estado = String(r.estado_pago || '').toLowerCase();
        const badge = estado === 'pago'
          ? 'badge-confirmada'
          : (estado === 'cancelado'
            ? 'badge-cancelada'
            : (estado === 'rechazado' ? 'badge-rechazado' : 'badge-pendiente'));
        return `
          <tr>
            <td>${safeText(r.reserva_id)}</td>
            <td>${safeText(r.alojamiento)}<br><small>Host: ${safeText(r.anfitrion)}</small></td>
            <td><span class="badge ${badge}">${safeText(r.estado_pago)}</span></td>
            <td>${formatoMoneda(r.valor_reserva)}</td>
            <td>${Number(r.porcentaje_devolucion || 0).toFixed(2)}%</td>
            <td>${formatoMoneda(r.valor_devolucion)}</td>
            <td>${formatoMoneda(r.comision_plataforma)}</td>
            <td>${formatoMoneda(r.neto_alojamiento)}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="8">No hay información financiera para este filtro.</td></tr>';

  renderizarDevengadosPorAlojamiento();
}

async function suspenderUsuario(id) {
  const { value: formValues } = await Swal.fire({
    title: 'Suspender usuario temporalmente',
    html:
      '<input id="swal-fecha" type="datetime-local" class="swal2-input" placeholder="Fecha fin suspensión (opcional)">' +
      '<input id="swal-motivo" type="text" class="swal2-input" placeholder="Motivo (opcional)">',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Suspender',
    cancelButtonText: 'Cancelar',
    preConfirm: () => ({
      suspension_hasta: document.getElementById('swal-fecha').value || null,
      suspension_motivo: document.getElementById('swal-motivo').value || null
    })
  });

  if (!formValues) return;

  await fetchAdmin(`${API_BASE}/usuarios/${id}/suspension`, {
    method: 'PATCH',
    body: JSON.stringify({
      estado: 'suspendido',
      suspension_hasta: formValues.suspension_hasta,
      suspension_motivo: formValues.suspension_motivo
    })
  });

  await Swal.fire({ icon: 'success', title: 'Usuario suspendido' });
  await cargarTodo();
}

async function activarUsuario(id) {
  await fetchAdmin(`${API_BASE}/usuarios/${id}/suspension`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'activo' })
  });

  await Swal.fire({ icon: 'success', title: 'Usuario reactivado' });
  await cargarTodo();
}

async function eliminarUsuario(id) {
  const confirm = await Swal.fire({
    icon: 'warning',
    title: '¿Eliminar usuario?',
    text: 'Esta acción eliminará el usuario del sistema. No se puede deshacer.',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirm.isConfirmed) return;

  await fetchAdmin(`${API_BASE}/usuarios/${id}`, {
    method: 'DELETE'
  });

  await Swal.fire({ icon: 'success', title: 'Usuario eliminado' });
  await cargarTodo();
}

async function cargarUsuarios() {
  const rows = await fetchAdmin(`${API_BASE}/usuarios`);
  window._usuariosCargados = rows;
  const tbody = document.getElementById('tabla-usuarios-body');
  const adminActualId = obtenerIdUsuarioDesdeToken();
  const adminPlataforma = esAdminPlataformaLocal();

  const fechaInicio = document.getElementById('filtro-fecha-inicio')?.value || '';
  const fechaFin = document.getElementById('filtro-fecha-fin')?.value || '';

  const filtrados = rows.filter((u) => {
    const rol = String(u.rol || '').toLowerCase();
    const esMismoUsuario = Number(u.id || 0) === adminActualId;
    const esAdminPlataforma = rol === 'admin' && Number(u.es_superadmin || 0) === 1;

    if (esMismoUsuario || (esAdminPlataforma && !adminPlataforma)) return false;
    if (rol === 'admin' && !esAdminPlataforma && !adminPlataforma) return false;

    if (fechaInicio && u.creado_en) {
      if (new Date(u.creado_en) < new Date(fechaInicio)) return false;
    }
    if (fechaFin && u.creado_en) {
      const fin = new Date(fechaFin);
      fin.setHours(23, 59, 59, 999);
      if (new Date(u.creado_en) > fin) return false;
    }
    return true;
  });

  tbody.innerHTML = filtrados.length
    ? filtrados.map((u) => {
        const rol = String(u.rol || '').toLowerCase();
        const esAdminAlojamiento = rol === 'admin' && Number(u.es_superadmin || 0) !== 1;
        const esGestionable = (rol === 'anfitrion' || rol === 'visitante' || (adminPlataforma && esAdminAlojamiento));
        const estado = String(u.estado_cuenta || 'activo').toLowerCase();
        const alojamiento = rol === 'admin' ? safeText(u.alojamiento_asignado || 'Sin alojamiento') : '-';
        const btnSuspension = estado === 'suspendido'
          ? `<button class="btn-mini btn-ok" type="button" data-admin-user-action="activar" data-admin-user-id="${u.id}" ${!esGestionable ? 'disabled' : ''}>Reactivar</button>`
          : `<button class="btn-mini btn-warn" type="button" data-admin-user-action="suspender" data-admin-user-id="${u.id}" ${!esGestionable ? 'disabled' : ''}>Suspender</button>`;

        return `
          <tr>
            <td>${safeText(u.id)}</td>
            <td>${safeText(u.nombre)}</td>
            <td>${safeText(u.correo)}</td>
            <td>${safeText(u.rol)}</td>
            <td>${alojamiento}</td>
            <td><span class="badge ${estado === 'suspendido' ? 'badge-suspendido' : 'badge-activo'}">${safeText(u.estado_cuenta)}</span></td>
            <td>${formatearFecha(u.suspension_hasta)}</td>
            <td class="acciones-cell">
              ${btnSuspension}
              <button class="btn-mini btn-danger" type="button" data-admin-user-action="eliminar" data-admin-user-id="${u.id}" ${!esGestionable ? 'disabled' : ''}>Eliminar</button>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="8">No hay usuarios disponibles.</td></tr>';
}

function descargarInformePDF(tipo = 'usuarios') {
  if (tipo === 'usuarios' && (!window._usuariosCargados || !window._usuariosCargados.length)) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'Carga primero los usuarios.' });
    return;
  }

  if (tipo === 'reservas' && (!_reservasCargadas || !_reservasCargadas.length)) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'Carga primero los extractos de reservas.' });
    return;
  }

  if (tipo === 'transacciones' && (!_transaccionesCargadas || !_transaccionesCargadas.length)) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'Carga primero las transacciones.' });
    return;
  }

  if (tipo === 'finanzas' && (!_finanzasReservas || !_finanzasReservas.length)) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'Carga primero las finanzas de reservas.' });
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    Swal.fire({ icon: 'error', title: 'No disponible', text: 'No se pudo cargar la librería de PDF.' });
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const fecha = new Date();

  const fechaInicio = tipo === 'usuarios'
    ? (document.getElementById('filtro-fecha-inicio')?.value || '')
    : (tipo === 'reservas'
      ? (document.getElementById('filtro-reservas-inicio')?.value || '')
      : (tipo === 'transacciones'
        ? (document.getElementById('filtro-transacciones-inicio')?.value || '')
        : (document.getElementById('filtro-finanzas-inicio')?.value || '')));

  const fechaFin = tipo === 'usuarios'
    ? (document.getElementById('filtro-fecha-fin')?.value || '')
    : (tipo === 'reservas'
      ? (document.getElementById('filtro-reservas-fin')?.value || '')
      : (tipo === 'transacciones'
        ? (document.getElementById('filtro-transacciones-fin')?.value || '')
        : (document.getElementById('filtro-finanzas-fin')?.value || '')));

  let y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titulo = tipo === 'usuarios'
    ? 'Informe de Usuarios - Tu Refugio'
    : (tipo === 'reservas'
      ? 'Informe de Extractos de Reservas - Tu Refugio'
      : (tipo === 'transacciones'
        ? 'Informe de Transacciones - Tu Refugio'
        : 'Informe Distribución 15% Plataforma / 85% Alojamiento - Tu Refugio'));
  doc.text(titulo, 40, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generado: ${fecha.toLocaleString('es-CO')}`, 40, y);
  if (fechaInicio || fechaFin) {
    y += 16;
    doc.text(`Rango de fechas: ${fechaInicio || '(inicio)'} — ${fechaFin || '(fin)'}`, 40, y);
  }
  y += 14;

  if (tipo === 'reservas') {
    const filas = (_reservasCargadas || []).filter((r) => {
      const baseFecha = r.fecha_entrada || r.creado_en;
      if (!baseFecha) return !fechaInicio && !fechaFin;
      const f = new Date(baseFecha);
      if (Number.isNaN(f.getTime())) return true;
      if (fechaInicio && f < new Date(fechaInicio)) return false;
      if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setHours(23, 59, 59, 999);
        if (f > fin) return false;
      }
      return true;
    }).map((r) => [
      safeText(r.id),
      safeText(r.turista),
      safeText(r.correo_turista),
      safeText(r.alojamiento),
      safeText(r.habitacion),
      safeText(r.fecha_entrada),
      safeText(r.fecha_salida),
      `$${Number(r.precio_total || 0).toLocaleString('es-CO')}`,
      safeText(r.estado),
      safeText(r.referencia_pago)
    ]);

    doc.autoTable({
      startY: y,
      head: [['ID', 'Turista', 'Correo', 'Alojamiento', 'Habitación', 'Entrada', 'Salida', 'Total', 'Estado', 'Referencia']],
      body: filas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
      theme: 'grid'
    });
    doc.save(`informe_reservas_${fecha.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  if (tipo === 'transacciones') {
    const filas = (_transaccionesCargadas || []).filter((t) => {
      const baseFecha = t.fecha;
      if (!baseFecha) return !fechaInicio && !fechaFin;
      const f = new Date(baseFecha);
      if (Number.isNaN(f.getTime())) return true;
      if (fechaInicio && f < new Date(fechaInicio)) return false;
      if (fechaFin) {
        const fin = new Date(fechaFin);
        fin.setHours(23, 59, 59, 999);
        if (f > fin) return false;
      }
      return true;
    }).map((t) => [
      safeText(t.id),
      safeText(t.id_reserva),
      safeText(t.turista),
      safeText(t.correo_turista),
      safeText(t.alojamiento),
      `$${Number(t.monto || 0).toLocaleString('es-CO')}`,
      safeText(t.metodo_pago),
      safeText(t.estado),
      safeText(t.pasarela),
      safeText(t.referencia_pago)
    ]);

    doc.autoTable({
      startY: y,
      head: [['ID Pago', 'ID Reserva', 'Turista', 'Correo', 'Alojamiento', 'Monto', 'Método', 'Estado', 'Pasarela', 'Referencia']],
      body: filas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
      theme: 'grid'
    });
    doc.save(`informe_transacciones_${fecha.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  if (tipo === 'finanzas') {
    const filas = (_finanzasReservas || []).map((r) => [
      safeText(r.reserva_id),
      safeText(r.alojamiento),
      safeText(r.anfitrion),
      safeText(r.estado_pago),
      formatoMoneda(r.valor_reserva),
      `${Number(r.porcentaje_devolucion || 0).toFixed(2)}%`,
      formatoMoneda(r.valor_devolucion),
      formatoMoneda(r.comision_plataforma),
      formatoMoneda(r.neto_alojamiento)
    ]);

    const tot = _totalesFinanzas || {};
    doc.setFontSize(9);
    doc.text(
      `Totales -> Pago: ${formatoMoneda(tot.total_pago || 0)} | Pendiente: ${formatoMoneda(tot.total_pendiente || 0)} | Cancelado: ${formatoMoneda(tot.total_cancelado || 0)} | Plataforma 15%: ${formatoMoneda(tot.total_comision_plataforma || 0)} | Alojamiento 85% neto: ${formatoMoneda(tot.total_neto_alojamientos || 0)}`,
      40,
      y
    );

    doc.autoTable({
      startY: y + 12,
      head: [['ID Reserva', 'Alojamiento', 'Host', 'Estado pago', 'Valor reserva', '% devolución', 'Valor devolución', 'Plataforma (15%)', 'Alojamiento (85% neto)']],
      body: filas,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
      theme: 'grid'
    });
    doc.save(`informe_finanzas_${fecha.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const adminActualId = obtenerIdUsuarioDesdeToken();
  const adminPlataforma = esAdminPlataformaLocal();
  const filas = (window._usuariosCargados || []).filter((u) => {
    const rol = String(u.rol || '').toLowerCase();
    const esMismoUsuario = Number(u.id || 0) === adminActualId;
    const esAdminPlataforma = rol === 'admin' && Number(u.es_superadmin || 0) === 1;
    if (esMismoUsuario || (esAdminPlataforma && !adminPlataforma)) return false;
    if (rol === 'admin' && !esAdminPlataforma && !adminPlataforma) return false;
    if (fechaInicio && u.creado_en && new Date(u.creado_en) < new Date(fechaInicio)) return false;
    if (fechaFin && u.creado_en) {
      const fin = new Date(fechaFin); fin.setHours(23, 59, 59, 999);
      if (new Date(u.creado_en) > fin) return false;
    }
    return true;
  }).map((u) => {
    const rol = String(u.rol || '').toLowerCase();
    const alojamiento = rol === 'admin' ? (u.alojamiento_asignado || 'Sin alojamiento') : '-';
    return [
      safeText(u.id),
      safeText(u.nombre),
      safeText(u.correo),
      safeText(u.rol),
      alojamiento,
      safeText(u.estado_cuenta || 'activo'),
      formatearFecha(u.suspension_hasta),
      formatearFecha(u.creado_en)
    ];
  });

  doc.autoTable({
    startY: y,
    head: [['ID', 'Nombre', 'Correo', 'Rol', 'Alojamiento (admin)', 'Estado', 'Suspensión hasta', 'Creado en']],
    body: filas,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
    theme: 'grid'
  });

  doc.save(`informe_usuarios_${fecha.toISOString().slice(0, 10)}.pdf`);
}

async function cargarTodo() {
  await Promise.all([
    cargarResumenDashboard(),
    cargarExtractosReservas(),
    cargarExtractosTransacciones(),
    cargarAlojamientosFinanzas(),
    cargarFinanzasReservas(),
    cargarUsuarios()
  ]);
}

function iniciarAutoRefreshUsuarios() {
  if (autoRefreshUsuarios) {
    clearInterval(autoRefreshUsuarios);
  }

  autoRefreshUsuarios = setInterval(() => {
    if (document.hidden) return;
    Promise.all([cargarUsuarios(), cargarResumenDashboard(), cargarFinanzasReservas(), cargarExtractosReservas(), cargarExtractosTransacciones()]).catch(() => {});
  }, 30000);
}

async function validarSesionAdmin() {
  const token = localStorage.getItem('token');
  const rol = String(localStorage.getItem('rol') || '').toLowerCase().trim();

  if (!token || rol !== 'admin') {
    return false;
  }

  try {
    await fetchAdmin(`${API_BASE}/dashboard/resumen`);
    return true;
  } catch (_error) {
    return false;
  }
}

function activarMapaNavegacion() {
  const links = Array.from(document.querySelectorAll('.sidebar nav a[href^="#"]'));
  const sections = links
    .map((link) => {
      const id = link.getAttribute('href').slice(1);
      const section = document.getElementById(id);
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const setActivo = (linkActivo) => {
    links.forEach((link) => link.classList.remove('activo'));
    if (linkActivo) linkActivo.classList.add('activo');
  };

  setActivo(sections[0].link);

  const observer = new IntersectionObserver(
    (entries) => {
      const visibles = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visibles.length) return;

      const sectionVisible = visibles[0].target;
      const match = sections.find((item) => item.section === sectionVisible);
      if (match) setActivo(match.link);
    },
    {
      root: null,
      rootMargin: '-30% 0px -55% 0px',
      threshold: [0.1, 0.25, 0.5]
    }
  );

  sections.forEach(({ section }) => observer.observe(section));

  links.forEach((link) => {
    link.addEventListener('click', () => {
      setActivo(link);
    });
  });
}

async function exigirSesionAdmin({ mostrarAlerta = false } = {}) {
  const sesionAdminValida = await validarSesionAdmin();
  if (sesionAdminValida) return true;

  localStorage.removeItem('token');
  localStorage.removeItem('rol');

  if (mostrarAlerta) {
    await Swal.fire({
      icon: 'warning',
      title: 'Acceso denegado',
      text: 'Inicia sesión como administrador.'
    });
  }

  window.location.replace('../admin/admin.html');
  return false;
}

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btnCerrarSesionAdmin')?.addEventListener('click', cerrarSesion);
  document.querySelector('[data-admin-action="buscar-devengados"]')?.addEventListener('input', renderizarDevengadosPorAlojamiento);

  document.addEventListener('click', (event) => {
    const accion = event.target.closest('[data-admin-action]');
    if (accion) {
      const tipo = accion.dataset.adminAction;
      if (tipo === 'cargar-extractos-reservas') cargarExtractosReservas().catch(console.error);
      if (tipo === 'cargar-extractos-transacciones') cargarExtractosTransacciones().catch(console.error);
      if (tipo === 'cargar-finanzas') cargarFinanzasReservas().catch(console.error);
      if (tipo === 'cargar-usuarios') cargarUsuarios().catch(console.error);
      if (tipo === 'descargar-pdf') descargarInformePDF(accion.dataset.pdfTipo || 'usuarios');
      return;
    }

    const accionUsuario = event.target.closest('[data-admin-user-action]');
    if (!accionUsuario || accionUsuario.disabled) return;

    const userId = Number(accionUsuario.dataset.adminUserId || 0);
    if (!Number.isFinite(userId) || userId <= 0) return;

    const userAction = accionUsuario.dataset.adminUserAction;
    if (userAction === 'activar') activarUsuario(userId).catch(console.error);
    if (userAction === 'suspender') suspenderUsuario(userId).catch(console.error);
    if (userAction === 'eliminar') eliminarUsuario(userId).catch(console.error);
  });

  const puedeContinuar = await exigirSesionAdmin({ mostrarAlerta: true });
  if (!puedeContinuar) return;

  try {
    await cargarTodo();
    activarMapaNavegacion();
    iniciarAutoRefreshUsuarios();
  } catch (error) {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    await Swal.fire({ icon: 'error', title: 'Sesión inválida', text: error.message || 'No se pudo validar la sesión de administrador.' });
    window.location.replace('../admin/admin.html');
  }
});

window.addEventListener('pageshow', async () => {
  if (!tieneSesionAdminLocal()) {
    window.location.replace('../admin/admin.html');
    return;
  }

  await exigirSesionAdmin({ mostrarAlerta: false });
});

async function cerrarSesion(event) {
  if (event) event.preventDefault();
  if (autoRefreshUsuarios) clearInterval(autoRefreshUsuarios);
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('es_superadmin');
  localStorage.removeItem('panel_destino');
  sessionStorage.clear();
  window.location.replace('../login/login.html');
}