export function getToken() {
  return localStorage.getItem('token') || '';
}

export function getRole() {
  return String(localStorage.getItem('rol') || '').toLowerCase().trim();
}

export function getAuthHeaders(extra = {}) {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Error de solicitud');
  }
  return data;
}

export function logoutTo(path = '/app/login') {
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  localStorage.removeItem('es_superadmin');
  localStorage.removeItem('panel_destino');
  window.location.href = path;
}
