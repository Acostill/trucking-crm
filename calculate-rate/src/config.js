const DEFAULT_API_BASE = 'http://localhost:3001';

function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_API_BASE;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

const API_BASE_URL = normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL || DEFAULT_API_BASE);

function buildApiUrl(path) {
  if (!path) return API_BASE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return API_BASE_URL + (path.startsWith('/') ? path : '/' + path);
}

export { API_BASE_URL, buildApiUrl };

