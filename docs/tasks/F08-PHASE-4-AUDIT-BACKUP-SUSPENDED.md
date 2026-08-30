# F08 Phase 4 — Audit views, backup/restore status, suspended policy

## Task Status

* Status: **Complete** (implementation)
* Date: 2026-08-14
* Work items: `R1-F08-007`, `R1-F08-008`, `R1-F08-009`
* Does **not** implement `R1-F08-010` (vertical-slice E2E / F08 P5)

## Frozen-policy matrix (R1-F08-009)

Authoritative code: `apps/backend/src/modules/subscriptions/frozen-suspended-policy.js`.

| ID | Capability | Subscription label | Entitlement | Suspended |
| --- | --- | --- | --- | --- |
| report-view | GET `/reports`, GET `/reports/:key` | `suspended-read` | none (no commercial `reports` boolean exists) | allow |
| report-export | POST `/reports/:key/export` | `suspended-read` | `reportsExports` | allow if entitled |
| dashboard | GET `/dashboard` | `operational` | none | deny |
| import-preview | imports templates/create/upload/validate/get/errors | `operational` | `imports` | deny |
| import-execute | imports confirm/execute | `operational` | `imports` | deny |
| audit-view | GET `/audit-events` | `suspended-read` | `auditHistory` (depth string) | allow if entitled |

Suspended does **not** mean block everything. SUBSCRIPTION_AND_BILLING §4.3 allows viewing/exporting historical data where policy allows; API_DESIGN puts `suspended-read` on reports/export/audit and **not** on imports. Reactivation restores operational labels. Suspension does not delete data.

## R1-F08-007 — Audit views

Read-only query of canonical `audit_events`. Org inquiry is tenant-scoped; cross-org `organizationId` filters are forbidden. Platform `GET /api/v1/platform/audit-events` requires `platform.audit.view`. Audit-history depth is the plan `auditHistory` string (`Nd` / `unlimited`); unconfigured/unhandled values deny. Events remain append-only.

## R1-F08-008 — Backup / restore status

Operations owns `backup_operation_records` and `restore_operation_records` only. Provider-neutral coordination: restore records are `coordination_initiated` with `productionRestoreExecuted: false`. Backup failures are listed to `operations.backups.view`. Restore initiation requires explicit `operations.restore.execute` (not automatic Super Admin). Restore coordination is audited. No business-ledger mutation APIs.

## Angular

* `/app/audit` — inquiry filters (date/actor/action/resource/reason)
* `/app/platform/operations` — backup status + restore coordination (platform context)
* Reports/imports pages explain suspended allow/deny
* Shell nav gated by `audit.view` / `operations.backups.view`

## Model review (A/B)

| Model | Class | Result |
| --- | --- | --- |
| `audit_events` | A | Existing Audit collection; query indexes already present |
| `backup_operation_records` | A | Frozen Operations backup status |
| `restore_operation_records` | A | Frozen restore coordination; not a business ledger |

Deferred **C/D**: WORM vendor, backup-provider selection, F09 restore rehearsal, generic DB admin.

## Validation

* `f08-p4-audit.spec.js`
* `f08-p4-operations.spec.js`
* `f08-p4-suspended-policy.spec.js`
* Architecture (`test:architecture`)
* Focused Angular page/route specs
* Lint / typecheck / build (see completion report)
* No browser E2E (F08 P5 / `R1-F08-010`)

## Next

* F08 P5 — `R1-F08-010` alerts/reporting/imports/audit/ops vertical slice and E2E

## API/cache hardening follow-up (2026-08-30)

Organization audit inquiry now caches each exact normalized filter/page query briefly and deduplicates concurrent identical reads. Audit remains read-only and tenant scoped.
