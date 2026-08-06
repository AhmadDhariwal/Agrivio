import { describe, expect, it } from 'vitest';
import {
  createAuditWriter,
  createInMemoryAuditEventStore,
  sanitizeAuditEvent,
} from './audit-writer.js';
import {
  createMockTransactionSessionPort,
  createTransactionRunner,
} from '../transactions/transaction-runner.js';

describe('audit writer', () => {
  it('redacts sensitive audit metadata', () => {
    const sanitized = sanitizeAuditEvent({
      actorId: 'actor-12345678',
      organizationId: 'org-12345678',
      action: 'demo.updated',
      resourceType: 'demo',
      metadata: {
        password: 'secret',
        note: 'safe',
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain('secret');
    expect(sanitized['metadata']).toEqual({
      password: '[REDACTED]',
      note: 'safe',
    });
  });

  it('participates in the same transaction as business effects', async () => {
    const store = createInMemoryAuditEventStore();
    const audit = createAuditWriter(store);
    const mock = createMockTransactionSessionPort();
    const runner = createTransactionRunner(mock.port);

    await runner.run(async (session) => {
      await audit.appendBusinessEvent(session, {
        actorId: 'actor-12345678',
        organizationId: 'org-12345678',
        action: 'demo.created',
        resourceType: 'demo',
        resourceId: 'demo-1',
      });
      return true;
    });

    expect(store.listForTest()).toHaveLength(1);
    expect(mock.getState().committed).toBe(true);
  });
});
