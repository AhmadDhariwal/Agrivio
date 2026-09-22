import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionSource = await readFile(
  new URL('../../functions/api/[[path]].js', import.meta.url),
  'utf8',
);
const { onRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(functionSource).toString('base64')}`
);

const env = {
  AGRIVIO_API_UPSTREAM_ORIGIN: 'https://agrivio-staging-api.onrender.com',
  AGRIVIO_PUBLIC_WEB_ORIGIN: 'https://agrivio-staging-web.pages.dev',
};

async function withFetchMock(mock, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('forwards GET path, query, Cookie, and application headers to the fixed upstream', async () => {
  let forwarded;
  const response = await withFetchMock(
    async (url, init) => {
      forwarded = { url, init };
      return Response.json({ ok: true });
    },
    () =>
      onRequest({
        env,
        request: new Request(
          'https://agrivio-staging-web.pages.dev/api/v1/items?limit=25&search=seed%20lot',
          {
            headers: {
              Accept: 'application/json',
              Cookie: 'agrivio_session=opaque',
              'Idempotency-Key': 'idem-1',
              'X-Filename': 'import.xlsx',
            },
          },
        ),
      }),
  );

  assert.equal(response.status, 200);
  assert.equal(
    forwarded.url,
    'https://agrivio-staging-api.onrender.com/api/v1/items?limit=25&search=seed%20lot',
  );
  assert.equal(forwarded.init.method, 'GET');
  assert.equal(forwarded.init.body, undefined);
  assert.equal(forwarded.init.headers.get('Cookie'), 'agrivio_session=opaque');
  assert.equal(forwarded.init.headers.get('Idempotency-Key'), 'idem-1');
  assert.equal(forwarded.init.headers.get('X-Filename'), 'import.xlsx');
  assert.deepEqual(forwarded.init.cf, { cacheEverything: false, cacheTtl: 0 });
});

test('streams POST bodies and forwards CSRF, content, cookie, and idempotency headers', async () => {
  const bytes = new Uint8Array([0, 1, 2, 254, 255]);
  let forwardedBody;
  let forwardedHeaders;
  await withFetchMock(
    async (_url, init) => {
      forwardedHeaders = init.headers;
      forwardedBody = new Uint8Array(await new Response(init.body).arrayBuffer());
      return new Response(null, { status: 204 });
    },
    () =>
      onRequest({
        env,
        request: new Request('https://agrivio-staging-web.pages.dev/api/v1/imports/job-1/upload', {
          method: 'POST',
          headers: {
            Origin: env.AGRIVIO_PUBLIC_WEB_ORIGIN,
            Cookie: 'agrivio_session=opaque',
            'Content-Type': 'application/octet-stream',
            'X-CSRF-Token': 'csrf-value',
            'Idempotency-Key': 'idem-2',
            'X-Filename': 'stock.xlsx',
          },
          body: bytes,
          duplex: 'half',
        }),
      }),
  );

  assert.deepEqual(forwardedBody, bytes);
  assert.equal(forwardedHeaders.get('Origin'), env.AGRIVIO_PUBLIC_WEB_ORIGIN);
  assert.equal(forwardedHeaders.get('Cookie'), 'agrivio_session=opaque');
  assert.equal(forwardedHeaders.get('X-CSRF-Token'), 'csrf-value');
  assert.equal(forwardedHeaders.get('Idempotency-Key'), 'idem-2');
  assert.equal(forwardedHeaders.get('X-Filename'), 'stock.xlsx');
  assert.equal(forwardedHeaders.get('Content-Type'), 'application/octet-stream');
});

test('forwards upstream status, body, headers, and multiple Set-Cookie values without caching', async () => {
  const upstreamHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'X-Request-Id': 'request-1',
  });
  upstreamHeaders.append(
    'Set-Cookie',
    'agrivio_session=opaque; Path=/; HttpOnly; Secure; SameSite=None',
  );
  upstreamHeaders.append('Set-Cookie', 'secondary=value; Path=/; HttpOnly; Secure; SameSite=None');

  const response = await withFetchMock(
    async () =>
      new Response(JSON.stringify({ error: { message: 'Conflict' } }), {
        status: 409,
        headers: upstreamHeaders,
      }),
    () =>
      onRequest({
        env,
        request: new Request(
          'https://agrivio-staging-web.pages.dev/api/v1/organization-activation-requests',
          {
            method: 'POST',
            headers: { Origin: env.AGRIVIO_PUBLIC_WEB_ORIGIN },
            body: '{}',
            duplex: 'half',
          },
        ),
      }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: { message: 'Conflict' } });
  assert.equal(response.headers.get('X-Request-Id'), 'request-1');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.deepEqual(response.headers.getSetCookie(), [
    'agrivio_session=opaque; Path=/; HttpOnly; Secure; SameSite=None',
    'secondary=value; Path=/; HttpOnly; Secure; SameSite=None',
  ]);
});

test('rejects cross-site mutation origins before calling the upstream', async () => {
  let fetchCalled = false;
  const response = await withFetchMock(
    async () => {
      fetchCalled = true;
      return new Response();
    },
    () =>
      onRequest({
        env,
        request: new Request('https://agrivio-staging-web.pages.dev/api/v1/auth/login', {
          method: 'POST',
          headers: { Origin: 'https://attacker.example' },
          body: '{}',
          duplex: 'half',
        }),
      }),
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(fetchCalled, false);
});

test('cannot select an arbitrary upstream through query parameters', async () => {
  let forwardedUrl;
  await withFetchMock(
    async (url) => {
      forwardedUrl = url;
      return new Response();
    },
    () =>
      onRequest({
        env,
        request: new Request(
          'https://agrivio-staging-web.pages.dev/api/v1/session?upstream=https%3A%2F%2Fattacker.example',
        ),
      }),
  );

  assert.equal(
    forwardedUrl,
    'https://agrivio-staging-api.onrender.com/api/v1/session?upstream=https%3A%2F%2Fattacker.example',
  );
});

test('fails closed for a missing or invalid internal upstream configuration', async () => {
  for (const upstream of [undefined, 'http://insecure.example', 'https://example.com/path']) {
    const response = await onRequest({
      env: { ...env, AGRIVIO_API_UPSTREAM_ORIGIN: upstream },
      request: new Request('https://agrivio-staging-web.pages.dev/api/v1/auth/session'),
    });
    assert.equal(response.status, 503);
  }
});

test('leaves non-API routes outside the proxy and limits Pages invocations to /api/*', async () => {
  let fetchCalled = false;
  const response = await withFetchMock(
    async () => {
      fetchCalled = true;
      return new Response();
    },
    () =>
      onRequest({
        env,
        request: new Request('https://agrivio-staging-web.pages.dev/app/dashboard'),
      }),
  );
  assert.equal(response.status, 404);
  assert.equal(fetchCalled, false);

  const routes = JSON.parse(
    await readFile(new URL('../../apps/frontend/public/_routes.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(routes, { version: 1, include: ['/api/*'], exclude: [] });
});
