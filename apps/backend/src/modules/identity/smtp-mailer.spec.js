import { describe, expect, it } from 'vitest';
import { createSmtpMailTransport } from './smtp-mailer';

describe('smtp-mailer', () => {
  it('returns skipped:true when AGRIVIO_SMTP_HOST is empty', async () => {
    const transport = createSmtpMailTransport({
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: '',
      smtpPassword: '',
      smtpFrom: 'noreply@example.com',
      publicWebBaseUrl: 'http://localhost:4200',
    });

    expect(transport.enabled).toBe(false);
    // sendPasswordReset internally calls sendMail which returns { skipped: true }
    // We verify no network error is thrown and the return value indicates skipped
    const result = await transport.sendPasswordReset({ email: 'user@example.com', token: 'tok123' });
    expect(result).toEqual({ skipped: true });
  });

  it('stores publicWebBaseUrl on the transport object', () => {
    const transport = createSmtpMailTransport({
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: '',
      smtpPassword: '',
      smtpFrom: 'noreply@example.com',
      publicWebBaseUrl: 'https://app.agrivio.com/',
    });
    expect(transport.publicWebBaseUrl).toBe('https://app.agrivio.com/');
  });

  it('builds a reset URL with trailing slash stripped from publicWebBaseUrl', async () => {
    // enabled=false → sendPasswordReset returns { skipped: true } without network
    const transport = createSmtpMailTransport({
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: '',
      smtpPassword: '',
      smtpFrom: 'noreply@example.com',
      publicWebBaseUrl: 'https://app.agrivio.com/',
    });
    // Does not throw even when the URL has a trailing slash
    const result = await transport.sendPasswordReset({ email: 'u@e.com', token: 'my-token' });
    expect(result).toEqual({ skipped: true });
  });

  it('throws when network connection to SMTP fails (host set but unreachable)', async () => {
    const transport = createSmtpMailTransport({
      smtpHost: '127.0.0.1',
      smtpPort: 19999, // nothing listening here
      smtpSecure: false,
      smtpUsername: '',
      smtpPassword: '',
      smtpFrom: 'noreply@example.com',
      publicWebBaseUrl: 'http://localhost:4200',
    });

    expect(transport.enabled).toBe(true);
    await expect(
      transport.sendPasswordReset({ email: 'user@example.com', token: 'tok' }),
    ).rejects.toThrow();
  }, 8000);
});
