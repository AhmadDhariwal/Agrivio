import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { API_REQUEST_ID_HEADER, ApiTransportErrorCode } from '@agrivio/api-contracts';
import { createApp } from './app.js';
import { loadApiEnv } from './platform/config/runtime-config.js';
import { createMockDatabaseLifecycle } from './platform/database/mongo-connection.js';

describe('API boot smoke', () => {
  it('boots an Express application and accepts a connection', async () => {
    const config = loadApiEnv({ NODE_ENV: 'test' });
    const app = createApp({
      config,
      database: createMockDatabaseLifecycle({ ready: true }),
    });
    const server = createServer(app);

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(undefined));
    });

    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected server to listen on a TCP port');
      }
      expect(server.listening).toBe(true);
      expect(address.port).toBeGreaterThan(0);

      const response = await fetch(`http://127.0.0.1:${address.port}/unknown-route`);
      const body = /** @type {{ error: { code: string }; requestId: string }} */ (
        await response.json()
      );

      expect(response.status).toBe(404);
      expect(body.error.code).toBe(ApiTransportErrorCode.NotFound);
      expect(body.requestId).toBeTypeOf('string');
      expect(response.headers.get(API_REQUEST_ID_HEADER)).toBe(body.requestId);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      });
    }
  });
});
