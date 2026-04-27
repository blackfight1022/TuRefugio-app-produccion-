export function getApiBaseUrl() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port || (protocol === 'https:' ? '443' : '80');
  return `${protocol}//${hostname}:${port}/api`;
}
