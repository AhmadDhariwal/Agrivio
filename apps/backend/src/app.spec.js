import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('API boot smoke', () => {
  it('boots an Express application and accepts a connection', async () => {
    const app = createApp();
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

      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      });
    }
  });
});
