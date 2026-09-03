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

## Audit RBAC and privacy hardening follow-up (2026-09-03)

Tenant Audit list, detail, filter-options, and KPI summary now share the authenticated organization scope and exclude platform-scoped events. `organizationId` query input cannot widen tenant access, cross-organization detail IDs keep safe not-found semantics, and `audit.view` remains mandatory before Audit capabilities are evaluated. No tenant Admin role was introduced.

Actor options are server-backed through existing organization memberships, searchable by authoritative employee display name/email, retain `actorId` as the filter value, and include System only when an in-window system event exists for that organization. Tenant Audit cache namespaces explicitly include tenant scope, organization ID, normalized filters/search, and pagination; existing session cache clearing remains unchanged and `QueryCacheService` was not modified.

Platform operations now write an explicit `platform` audit scope. `GET /api/v1/platform/audit-events` returns only platform events and requires an authenticated `super_admin` platform session; the development actor-header bypass is disabled for this route. Tenant queries also deny known legacy platform-administration actions that predate explicit scope persistence.

### Model review

`audit_events.scope` is a class B security field (`tenant` / `platform`) owned by Audit infrastructure. It is optional only for backward compatibility with existing immutable records; all canonical writer paths assign it. The change is additive and non-destructive, adds the platform-scope chronological query index, preserves immutable append-only lifecycle, carries no secrets, and is consumed by API isolation queries. Existing organization-leading indexes remain in place.

### Focused validation

* Backend Audit/RBAC + isolated real-Mongo scope/index proof: 9 passed
* Frontend Audit data/page: 22 passed
* Frontend typecheck: passed
* Changed-file ESLint, changed-JS `node --check`, and `git diff --check`: passed

### Freeze state

* TENANT AUDIT ISOLATION: ✅ VERIFIED
* AUDIT EMPLOYEE FILTERING: ✅ VERIFIED
* CROSS-ORG AUDIT ACCESS: ✅ BLOCKED
* SUPER ADMIN AUDIT PRIVACY: ✅ VERIFIED
* AUDIT RBAC: ✅ FROZEN

## Final retention and backup-status hardening (2026-09-03)

Tenant Audit remains append-only: no tenant delete or purge route exists. Super Admin platform sessions can view retention status and purge only records older than the authoritative cutoff. Tenant cutoffs come from each organization plan's `auditHistory`; platform Audit uses the separately configured `AGRIVIO_PLATFORM_AUDIT_RETENTION_DAYS`. `AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE` supports short local/demo/test rehearsal windows and is rejected in production. Purge requires explicit confirmation and a reason, stays within the selected tenant/platform scope, preserves in-window records, and records `audit.retention.purged` in platform Audit.

Backup Status now exposes the actual operator backup record's running/success/failed state, start/completion time, MongoDB database, archive filename/size, SHA-256 and manifest verification, retention/expiry, failure, and restore readiness. `npm run ops:backup` calls the existing `mongodump --archive --gzip` engine and persists that engine result; concurrent running backups are rejected. No web backup-create permission or button was invented because the frozen permission catalog has view and restore-coordination permissions only. Web restore remains coordination-only; destructive `mongorestore --drop` remains in the privileged CLI.

Backup coverage is explicitly MongoDB application data. Billing evidence and other filesystem/object-storage files are not covered and still require an independent production backup strategy.

### Model review follow-up

`backup_operation_records` retains Operations ownership. Added fields are class A/B operational evidence (`startedAt`, `completedAt`, `databaseName`, archive filename/size/SHA-256, manifest/checksum verification, retention/expiry, and restore readiness). They are optional for backward compatibility with older status records and consumed by the status API/UI. A partial unique running-status index provides cross-process concurrency enforcement. No tenant ownership or business-ledger semantics were introduced. Deployment must synchronize the new index.
