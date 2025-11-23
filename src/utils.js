// UTILITIES
// --------------------------------------
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// URL & QUERY PARSING
// --------------------------------------
export function parseQuery() {
  const params = new URLSearchParams(location.search);
  const user = params.get('user') || '';
  const controls = (params.get('controls') || '').split(',').filter(Boolean);
  return { user, controls };
}

export function updateQuery({ user, controls }) {
  const params = new URLSearchParams(location.search);
  if (user) {
    params.set('user', user);
  }
  if (controls && controls.length) {
    params.set('controls', controls.join(','));
  } else {
    params.delete('controls');
  }
  const url = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, '', url);
}

// FORMATTING & HELPERS
// --------------------------------------
export function toLocalDate(ts) {
  return new Date(ts * 1000);
}

export function niceCount(n) {
  if (n == null) {
    return '\u2014';
  }
  return n.toLocaleString();
}

export function tzName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Local Time';
  }
}

export function sanitizeUsername(username) {
  return (username || '').trim().toLowerCase();
}

