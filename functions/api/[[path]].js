const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUEST_HEADERS_TO_REMOVE = new Set([
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const RESPONSE_HEADERS_TO_REMOVE = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function parseConfiguredOrigin(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${name} must be an HTTPS origin without a path`);
  }
  return url.origin;
}

function requestSourceIsAllowed(request, allowedWebOrigin) {
  const origin = request.headers.get('Origin');
  if (origin !== null) {
    return origin === allowedWebOrigin;
  }

  const referer = request.headers.get('Referer');
  if (referer !== null) {
    try {
      return new URL(referer).origin === allowedWebOrigin;
    } catch {
      return false;
    }
  }

  return SAFE_METHODS.has(request.method.toUpperCase());
}

function copyRequestHeaders(requestHeaders) {
  const headers = new Headers();
  for (const [name, value] of requestHeaders) {
    const normalizedName = name.toLowerCase();
    if (
      REQUEST_HEADERS_TO_REMOVE.has(normalizedName) ||
      normalizedName.startsWith('cf-') ||
      normalizedName.startsWith('x-forwarded-')
    ) {
      continue;
    }
    headers.append(name, value);
  }
  return headers;
}

function readSetCookies(headers) {
  if (typeof headers.getAll === 'function') {
    return headers.getAll('Set-Cookie');
  }
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const setCookie = headers.get('Set-Cookie');
  return setCookie === null ? [] : [setCookie];
}

function copyResponseHeaders(upstreamHeaders) {
  const headers = new Headers();
  for (const [name, value] of upstreamHeaders) {
    const normalizedName = name.toLowerCase();
    if (RESPONSE_HEADERS_TO_REMOVE.has(normalizedName) || normalizedName === 'set-cookie') {
      continue;
    }
    headers.append(name, value);
  }

  for (const setCookie of readSetCookies(upstreamHeaders)) {
    headers.append('Set-Cookie', setCookie);
  }

  headers.set('Cache-Control', 'private, no-store');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  return headers;
}

function errorResponse(status, message, extraHeaders = {}) {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  return new Response(JSON.stringify({ error: { message } }), { status, headers });
}

export async function onRequest(context) {
  const request = context.request;
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return errorResponse(405, 'Method not allowed', {
      Allow: [...ALLOWED_METHODS].join(', '),
    });
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
    return errorResponse(404, 'Not found');
  }

  let upstreamOrigin;
  let allowedWebOrigin;
  try {
    upstreamOrigin = parseConfiguredOrigin(
      context.env?.AGRIVIO_API_UPSTREAM_ORIGIN,
      'AGRIVIO_API_UPSTREAM_ORIGIN',
    );
    allowedWebOrigin = parseConfiguredOrigin(
      context.env?.AGRIVIO_PUBLIC_WEB_ORIGIN,
      'AGRIVIO_PUBLIC_WEB_ORIGIN',
    );
  } catch {
    return errorResponse(503, 'API proxy is not configured');
  }

  if (requestUrl.origin !== allowedWebOrigin) {
    return errorResponse(403, 'Request host is not allowed');
  }
  if (!requestSourceIsAllowed(request, allowedWebOrigin)) {
    return errorResponse(403, 'Request origin is not allowed');
  }

  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamOrigin);
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      method,
      headers: copyRequestHeaders(request.headers),
      body: BODYLESS_METHODS.has(method) ? undefined : request.body,
      redirect: 'manual',
      cf: {
        cacheEverything: false,
        cacheTtl: 0,
      },
    });
  } catch {
    return errorResponse(502, 'Upstream API is unavailable');
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: copyResponseHeaders(upstreamResponse.headers),
  });
}
