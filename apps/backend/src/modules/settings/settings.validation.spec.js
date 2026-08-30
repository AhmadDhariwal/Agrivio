import { describe, expect, it } from 'vitest';
import { parseSettingsPatch } from './settings.validation.js';

describe('settings validation', () => {
  it('parses supported residual fields and trims strings', () => {
    const result = parseSettingsPatch({
      expectedVersion: 2,
      tradingName: '  Agrivio Trading  ',
      contactPhone: '03001112222',
    });
    expect(result).toEqual({
      expectedVersion: 2,
      patch: {
        tradingName: 'Agrivio Trading',
        contactPhone: '03001112222',
      },
    });
  });

  it('rejects empty patches and domain-owned fields', () => {
    expect(() => parseSettingsPatch({ expectedVersion: 1 })).toThrow(/At least one residual settings field/);
    expect(() =>
      parseSettingsPatch({ expectedVersion: 1, timezone: 'Asia/Karachi', tradingName: 'A' }),
    ).toThrow(/organization profile/);
    expect(() =>
      parseSettingsPatch({ expectedVersion: 1, invoicePrefix: 'MAIN', tradingName: 'A' }),
    ).toThrow(/branches/);
    expect(() =>
      parseSettingsPatch({ expectedVersion: 1, creditPolicy: {}, tradingName: 'A' }),
    ).toThrow(/Customers/);
  });

  it('rejects browser-supplied organizationId and subscription payloads', () => {
    expect(() =>
      parseSettingsPatch({
        expectedVersion: 1,
        organizationId: '000000000000000000000001',
        tradingName: 'A',
      }),
    ).toThrow(/organizationId cannot be supplied/);
    expect(() =>
      parseSettingsPatch({
        expectedVersion: 1,
        subscription: { status: 'active' },
        tradingName: 'A',
      }),
    ).toThrow(/subscription is not a residual setting/);
  });
});
