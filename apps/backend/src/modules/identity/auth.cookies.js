const { API_SESSION_COOKIE_NAME } = require('@agrivio/api-contracts');

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (typeof cookieHeader !== 'string' || cookieHeader.trim() === '') {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name !== '') {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

function readSessionToken(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[API_SESSION_COOKIE_NAME];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function buildSessionCookie(options) {
  const parts = [
    `${API_SESSION_COOKIE_NAME}=${encodeURIComponent(options.token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function buildClearedSessionCookie(options) {
  const parts = [`${API_SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing.map(String), cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [String(existing), cookie]);
}

module.exports = {
  parseCookieHeader,
  readSessionToken,
  buildSessionCookie,
  buildClearedSessionCookie,
  appendSetCookie,
};
