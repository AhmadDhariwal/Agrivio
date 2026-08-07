import { describe, expect, it } from 'vitest';
import { createMockDatabaseLifecycle } from './mongo-connection';
describe('createMockDatabaseLifecycle', () => {
  it('tracks connect and disconnect state', async () => {
    const database = createMockDatabaseLifecycle({ ready: true });

    expect(await database.isReady()).toBe(false);
    await database.connect();
    expect(await database.isReady()).toBe(true);
    await database.disconnect();
    expect(await database.isReady()).toBe(false);
  });

  it('reflects configured readiness while connected', async () => {
    const database = createMockDatabaseLifecycle({ ready: false });
    await database.connect();
    expect(await database.isReady()).toBe(false);
  });
});
