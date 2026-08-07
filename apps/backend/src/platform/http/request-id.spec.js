import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id';
describe('resolveRequestId', () => {
  it('accepts a valid opaque client request id', () => {
    const clientId = 'client-correlation-12345678';
    expect(resolveRequestId(clientId)).toBe(clientId);
  });

  it('rejects invalid client ids and generates a new id', () => {
    const generated = resolveRequestId('short');
    expect(generated).not.toBe('short');
    expect(generated.length).toBeGreaterThanOrEqual(8);
  });

  it('generates ids when the header is absent', () => {
    const first = resolveRequestId(undefined);
    const second = resolveRequestId(undefined);
    expect(first).not.toBe(second);
  });
});
