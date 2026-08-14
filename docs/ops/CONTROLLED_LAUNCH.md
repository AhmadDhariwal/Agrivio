# Controlled launch and monitoring handover

## Launch sequence

1. Production builds green (`npm run build` / `npm run test:regression`).
2. Full regression green, including Playwright `npm run e2e` on the release candidate.
3. REL-G03–REL-G07 security, matrix, performance, and accessibility suites green.
4. Backup/restore/import rehearsal evidence recorded.
5. Two pilot organizations can sign in and complete setup/import/UAT scripts.
6. No open Critical or High defects.
7. Enable production access only for approved pilot organizations.
8. Watch backups, errors, reconciliation exceptions, and the support queue.

## Monitoring

Until a monitoring provider is named, operators use application health (`/api/v1/health`), backup status (`operations.backups.view`), and support intake. Alert smoke against a vendor is deferred until that vendor exists.

## Suspension and isolation

Subscription suspension continues to block operational writes. Tenant isolation remains backend-enforced.
