export function normalizeImagePath(rawPath) {
  const clean = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^public\//i, '')
    .replace(/^\/+/, '');

  if (!clean) return 'uploads/default.jpg';
  if (clean.startsWith('uploads/')) return clean;
  const fromUploads = clean.split('uploads/').pop();
  return `uploads/${fromUploads}`;
}

export function buildImageUrl(rawPath) {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port || (protocol === 'https:' ? '443' : '80');
  return `${protocol}//${hostname}:${port}/${normalizeImagePath(rawPath)}`;
}
