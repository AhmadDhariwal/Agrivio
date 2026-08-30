# Controlled launch and monitoring handover

**Status: preparatory draft.** Production launch has not been executed. This is not R1-F09-009 completion.

## Launch sequence

1. Production builds green (`npm run test:regression:release`).
2. Full canonical regression green, including Playwright E2E on the release candidate.
3. REL-G03–REL-G07 remain F09 P2 work (not accepted from preparatory suites).
4. Backup/restore/import rehearsal evidence for the **target** environment (not in-memory snapshot).
5. Two **real** pilot organizations complete setup/import/UAT scripts with signed acceptance.
6. No open Critical or High defects from that UAT.
7. Enable production access only for approved pilot organizations after release approval.
8. Watch backups, errors, reconciliation exceptions, and the support queue.

## Monitoring

Until a monitoring provider is named, operators use application health (`/api/v1/health`), backup status (`operations.backups.view`), and support intake. Alert smoke against a vendor is deferred until that vendor exists.

## Suspension and isolation

Subscription suspension continues to block operational writes. Tenant isolation remains backend-enforced.
