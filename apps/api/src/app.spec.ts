import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('API boot smoke', () => {
  it('boots an Express application and accepts a connection', async () => {
    const app = createApp();
    const server = createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address() as AddressInfo;
      expect(server.listening).toBe(true);
      expect(address.port).toBeGreaterThan(0);

      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
