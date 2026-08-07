import { describe, expect, it } from 'vitest';
import { createIdempotencyService, createInMemoryIdempotencyStore } from './idempotency-service';
const scope = {
  scopeType: 'organization',
  organizationId: 'org-12345678',
  actorId: 'actor-12345678',
  operation: 'demo.write',
};

describe('idempotency service', () => {
  it('executes once and replays the stored response', async () => {
    const service = createIdempotencyService(createInMemoryIdempotencyStore());
    let executions = 0;

    const first = await service.execute(scope, 'key-12345678', { amount: '10.00' }, async () => {
      executions += 1;
      return { statusCode: 201, body: { id: 'created-1' } };
    });

    const second = await service.execute(scope, 'key-12345678', { amount: '10.00' }, async () => {
      executions += 1;
      return { statusCode: 201, body: { id: 'created-2' } };
    });

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.response.body).toEqual({ id: 'created-1' });
    expect(executions).toBe(1);
  });

  it('conflicts when the same key is reused with a different fingerprint', async () => {
    const service = createIdempotencyService(createInMemoryIdempotencyStore());

    await service.execute(scope, 'key-12345678', { amount: '10.00' }, async () => ({
      statusCode: 200,
      body: { ok: true },
    }));

    await expect(
      service.execute(scope, 'key-12345678', { amount: '11.00' }, async () => ({
        statusCode: 200,
        body: { ok: true },
      })),
    ).rejects.toMatchObject({ name: 'IdempotencyConflictError' });
  });

  it('prevents concurrent duplicate execution for the same key', async () => {
    const service = createIdempotencyService(createInMemoryIdempotencyStore());
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const first = service.execute(scope, 'key-12345678', { payload: 1 }, async () => {
      await gate;
      return { statusCode: 200, body: { ok: true } };
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(
      service.execute(scope, 'key-12345678', { payload: 1 }, async () => ({
        statusCode: 200,
        body: { ok: true },
      })),
    ).rejects.toMatchObject({ name: 'IdempotencyInProgressError' });

    if (release) {
      release(undefined);
    }
    await first;
  });
});
