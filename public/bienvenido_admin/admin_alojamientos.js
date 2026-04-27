const API_BASE = '/api/admin/alojamientos-admin';
let autoRefresh = null;
let permisoSuperadmin = false;
let adminActualId = 0;
let alojamientoAsignadoId = 0;
let ultimoResumen = null;
let ultimoMovimientos = [];
let ultimoExtractos = [];

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

function tieneSesionAdminLocal() {
  const token = localStorage.getItem('token');
  const rol = String(localStorage.getItem('rol') || '').toLowerCase().trim();
  return Boolean(token) && rol === 'admin';
}

if (!tieneSesionAdminLocal()) {
  window.location.replace('../admin/admin.html');
}

function headersAuth() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headersAuth(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Error consultando panel de alojamientos.');
  }
  return data;
}

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-CO')}`;
}

function fFecha(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('es-CO');
}

async function cargarResumen() {
  const r = await api(`${API_BASE}/resumen`);
  ultimoResumen = r || null;
  document.getElementById('kpi-hosts').textContent = r.anfitriones_asignados || 0;
  document.getElementById('kpi-aloj').textContent = r.alojamientos_asignados || 0;
  document.getElementById('kpi-res').textContent = r.reservas_total || 0;
  document.getElementById('kpi-ing').textContent = money(r.ingresos_pagados || 0);
}

async function cargarAnfitriones() {
  const rows = await api(`${API_BASE}/anfitriones`);
  const tbody = document.getElementById('tbody-anfitriones');
  const rowsAsignados = rows.filter((r) => Number(r.admin_id || 0) === adminActualId);

  alojamientoAsignadoId = rowsAsignados.length ? Number(rowsAsignados[0].alojamiento_id || 0) : 0;

  tbody.innerHTML = rowsAsignados.length ? rowsAsignados.map((r) => {
    const estadoCls = String(r.estado_cuenta || 'activo') === 'suspendido' ? 'danger' : 'ok';
    const idAnfitrion = Number(r.anfitrion_id || 0);
    const idsAlojamiento = String(r.alojamiento_ids || '').trim() || '-';
    return `<tr>
      <td>${idsAlojamiento}</td>
      <td>${r.nombre || '-'}</td>
      <td>${r.correo || '-'}</td>
      <td><span class="badge ${estadoCls}">${r.estado_cuenta || 'activo'}</span></td>
      <td>${r.admin_nombre || 'Sin asignar'}</td>
      <td>${fFecha(r.asignado_en)}</td>
      <td><button class="sec" type="button" data-admin-aloj-action="retirar-anfitrion" data-anfitrion-id="${idAnfitrion}" ${idAnfitrion ? '' : 'disabled'}>Retirar</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7">No tienes anfitrión asignado en este momento.</td></tr>';
}

async function retirarAlojamiento(anfitrionId) {
  const id = Number(anfitrionId || 0);
  if (!id) return;

  const confirm = await Swal.fire({
    icon: 'warning',
    title: 'Retirar anfitrión asignado',
    text: 'Todos los alojamientos de este anfitrión dejarán de aparecer en tu panel. ¿Deseas continuar?',
    showCancelButton: true,
    confirmButtonText: 'Sí, retirar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirm.isConfirmed) return;

  await api(`${API_BASE}/asignaciones/${id}`, { method: 'DELETE' });
  await Swal.fire({ icon: 'success', title: 'Retirado', text: 'El anfitrión y sus alojamientos fueron retirados de tu panel.' });
  await recargaCompleta();
}

function filtroQuery() {
  return '';
}

async function cargarMovimientos() {
  const rows = await api(`${API_BASE}/movimientos${filtroQuery()}`);
  ultimoMovimientos = Array.isArray(rows) ? rows : [];
  const tbody = document.getElementById('tbody-movimientos');

  tbody.innerHTML = rows.length ? rows.map((m) => {
    const tipo = String(m.tipo || '').toLowerCase();
    const cls = tipo === 'pago' ? 'ok' : (tipo === 'reserva' ? 'warn' : 'danger');
    return `<tr>
      <td>${fFecha(m.fecha)}</td>
      <td><span class="badge ${cls}">${m.tipo || '-'}</span></td>
      <td>${m.anfitrion || '-'}</td>
      <td>${m.alojamiento || '-'}</td>
      <td>${m.detalle || '-'}</td>
      <td>${m.valor ? money(m.valor) : '-'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6">No hay movimientos para este alcance.</td></tr>';
}

async function cargarExtractos() {
  const rows = await api(`${API_BASE}/extractos${filtroQuery()}`);
  ultimoExtractos = Array.isArray(rows) ? rows : [];
  const tbody = document.getElementById('tbody-extractos');

  tbody.innerHTML = rows.length ? rows.map((r) => `
    <tr>
      <td>${r.alojamiento || '-'}</td>
      <td>${r.anfitrion || '-'}</td>
      <td>${Number(r.reservas_total || 0)}</td>
      <td>${Number(r.reservas_confirmadas || 0)}</td>
      <td>${Number(r.reservas_canceladas || 0)}</td>
      <td>${money(r.ingresos_pagados || 0)}</td>
      <td>${fFecha(r.ultima_reserva)}</td>
    </tr>`).join('') : '<tr><td colspan="7">No hay extractos para este alcance.</td></tr>';
}

async function recargarTablas() {
  await Promise.all([cargarMovimientos(), cargarExtractos()]);
}

async function recargaCompleta() {
  await Promise.all([cargarResumen(), cargarAnfitriones()]);
  await recargarTablas();
}

async function cargarPermisos() {
  const data = await api(`${API_BASE}/permisos`);
  permisoSuperadmin = Boolean(data?.es_superadmin);
}

function descargarExtractosCSV() {
  if (!ultimoExtractos.length) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay extractos para descargar.' });
    return;
  }

  if (typeof XLSX === 'undefined') {
    Swal.fire({ icon: 'error', title: 'No disponible', text: 'No se pudo cargar la librería de Excel.' });
    return;
  }

  const encabezados = [
    'Alojamiento',
    'Anfitrion',
    'Reservas',
    'Confirmadas',
    'Canceladas',
    'Ingresos pagados',
    'Ultima reserva'
  ];

  const filas = ultimoExtractos.map((r) => [
    r.alojamiento || '-',
    r.anfitrion || '-',
    Number(r.reservas_total || 0),
    Number(r.reservas_confirmadas || 0),
    Number(r.reservas_canceladas || 0),
    Number(r.ingresos_pagados || 0),
    fFecha(r.ultima_reserva)
  ]);

  const fecha = new Date().toISOString().slice(0, 10);

  const worksheet = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Extractos');
  XLSX.writeFile(workbook, `extractos_alojamiento_${fecha}.xlsx`);
}

function descargarInformeHTML() {
  if (!ultimoExtractos.length && !ultimoMovimientos.length) {
    Swal.fire({ icon: 'info', title: 'Sin datos', text: 'No hay información para generar el informe.' });
    return;
  }

  if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
    Swal.fire({ icon: 'error', title: 'No disponible', text: 'No se pudo cargar la librería de PDF.' });
    return;
  }

  const fecha = new Date();
  const resumen = ultimoResumen || {};

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Informe de gestion de alojamiento asignado', 40, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generado: ${fecha.toLocaleString('es-CO')}`, 40, y);
  y += 18;

  const resumenLineas = [
    `Anfitriones asignados: ${Number(resumen.anfitriones_asignados || 0)}`,
    `Alojamientos: ${Number(resumen.alojamientos_asignados || 0)}`,
    `Reservas: ${Number(resumen.reservas_total || 0)}`,
    `Ingresos pagados: ${money(resumen.ingresos_pagados || 0)}`
  ];
  doc.text(resumenLineas, 40, y);
  y += 58;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Extractos por alojamiento', 40, y);
  y += 8;

  doc.autoTable({
    startY: y,
    head: [['Alojamiento', 'Anfitrion', 'Reservas', 'Confirmadas', 'Canceladas', 'Ingresos pagados', 'Ultima reserva']],
    body: (ultimoExtractos || []).map((r) => [
      r.alojamiento || '-',
      r.anfitrion || '-',
      Number(r.reservas_total || 0),
      Number(r.reservas_confirmadas || 0),
      Number(r.reservas_canceladas || 0),
      money(r.ingresos_pagados || 0),
      fFecha(r.ultima_reserva)
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
    theme: 'grid'
  });

  const yMov = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : y) + 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Movimientos recientes', 40, yMov);

  doc.autoTable({
    startY: yMov + 8,
    head: [['Fecha', 'Tipo', 'Alojamiento', 'Detalle', 'Valor']],
    body: (ultimoMovimientos || []).slice(0, 120).map((m) => [
      fFecha(m.fecha),
      m.tipo || '-',
      m.alojamiento || '-',
      m.detalle || '-',
      m.valor ? money(m.valor) : '-'
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [243, 247, 251], textColor: [30, 30, 30] },
    theme: 'grid'
  });

  doc.save(`informe_alojamiento_${fecha.toISOString().slice(0, 10)}.pdf`);
}

function iniciarAutoRefresh() {
  if (autoRefresh) clearInterval(autoRefresh);
  autoRefresh = setInterval(() => {
    if (!document.hidden) {
      recargarTablas().catch(() => {});
    }
  }, 12000);
}

function cerrarSesion(event) {
  if (event) event.preventDefault();
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('panel_destino');
  localStorage.removeItem('es_superadmin');
  sessionStorage.clear();
  window.location.replace('../login/login.html');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    recargaCompleta().catch(() => {});
  }
});

window.addEventListener('beforeunload', () => {
  if (autoRefresh) clearInterval(autoRefresh);
});

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btnCerrarSesionAlojamientosAdmin')?.addEventListener('click', cerrarSesion);

  document.addEventListener('click', (event) => {
    const accion = event.target.closest('[data-admin-aloj-action]');
    if (!accion || accion.disabled) return;

    const tipo = accion.dataset.adminAlojAction;
    if (tipo === 'cargar-anfitriones') cargarAnfitriones().catch(console.error);
    if (tipo === 'recargar-tablas') recargarTablas().catch(console.error);
    if (tipo === 'cargar-extractos') cargarExtractos().catch(console.error);
    if (tipo === 'descargar-csv') descargarExtractosCSV();
    if (tipo === 'descargar-pdf') descargarInformeHTML();
    if (tipo === 'retirar-anfitrion') {
      const anfitrionId = Number(accion.dataset.anfitrionId || 0);
      if (Number.isFinite(anfitrionId) && anfitrionId > 0) {
        retirarAlojamiento(anfitrionId).catch(console.error);
      }
    }
  });

  try {
    adminActualId = obtenerIdUsuarioDesdeToken();
    await cargarPermisos();
    await recargaCompleta();
    iniciarAutoRefresh();
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'No fue posible cargar el panel', text: error.message });
  }
});