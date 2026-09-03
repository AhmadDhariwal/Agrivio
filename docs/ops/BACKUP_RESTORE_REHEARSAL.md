# Local technical backup / restore / import rehearsal

**Status:** local technical rehearsal runbook for R1-F09-005. This does not select a production hosting or backup vendor.

Database restore is **not** application rollback. Restore discards later valid transactions unless the incident owner explicitly accepts that.

Keep these separate:

1. F08 backup/restore **status and restore-coordination** APIs (`backup_operation_records`, `restore_operation_records`)
2. This **local technical** `mongodump` / `mongorestore` rehearsal via native engine and CLI

The in-app restore API does not dump or restore MongoDB. The native engine (backup-engine.js / restore-engine.js) and the operator CLI (`npm run ops:backup`, `npm run ops:restore`) do.

## What mongodump captures

`mongodump --archive --gzip` captures:

* All MongoDB collection documents
* Index definitions
* Collection metadata

It does **not** capture non-MongoDB filesystem assets (billing evidence files, uploaded documents). Full disaster recovery requires backing up both:

1. The MongoDB archive directory (`AGRIVIO_BACKUP_DIR`)
2. Any application-level file storage (billing evidence root, uploads directory)

See [DATA_RECOVERY.md](DATA_RECOVERY.md) for the full recovery procedure.

## Prerequisites

* Local MongoDB replica set `rs0` with a PRIMARY (`npm run db:status`)
* MongoDB Database Tools: `mongodump` and `mongorestore` on `PATH`, or set `AGRIVIO_MONGODUMP_PATH` / `AGRIVIO_MONGORESTORE_PATH`
  * Install: https://www.mongodb.com/try/download/database-tools
* Node.js matching the workspace toolchain
* Commands below are path-generic; run them from the repository root without assuming a specific drive letter

## Required Mongo tools

```text
mongodump --version
mongorestore --version
```

If either tool is missing, REL-G08 / REL-G09 are **BLOCKED**. Do not substitute JSON snapshots or in-memory catalog copies.

## Safety checks

Before every dump, restore, or drop:

1. Resolve the exact database name
2. Assert it matches the rehearsal naming policy
3. Refuse `Agrivio`, `agrivio_dev`, `admin`, `local`, `config`, and unrelated `agrivio_test_*` databases

Never restore over an existing development database. Never restore production from this runbook.

**Destructive production restore of the primary database must only be performed during a controlled maintenance window with writes stopped.** Always restore into an isolated rehearsal database first to verify data integrity before any production cutover. See [DATA_RECOVERY.md](DATA_RECOVERY.md) steps 4–5.

## Allowed rehearsal DB naming

```text
agrivio_rehearsal_source_<runId>
agrivio_rehearsal_restored_<runId>
agrivio_rehearsal_import_<runId>
```

`<runId>` is alphanumeric only.

## Backup via CLI (REL-G08)

Set required environment variables and use the privileged operator CLI:

```text
AGRIVIO_BACKUP_DIR=/path/to/backups npm run ops:backup
```

This calls `backup-engine.js` which:
1. Resolves `mongodump` from `AGRIVIO_MONGODUMP_PATH` or `PATH`
2. Spawns `mongodump --uri=... --db=<dbName> --archive=<path>.archive.gz --gzip` (no shell=true)
3. Computes SHA-256 checksum after completion
4. Writes and re-reads a sidecar `.manifest.json` with filename, checksum, size, and timestamps
5. Recomputes SHA-256 from the completed archive and fails the operation if manifest or checksum verification fails
6. Enforces `AGRIVIO_BACKUP_RETENTION_DAYS` cleanup
7. Persists running/success/failure plus verified manifest, checksum, retention, and restore-readiness metadata in `backup_operation_records`

The archive is a self-contained `.archive.gz` file in `AGRIVIO_BACKUP_DIR`.

### Manual equivalent (rehearsal only)

Replace placeholders. Do not point `--db` at `Agrivio`.

```text
mongodump --uri="<replica-set-uri>" --db="<sourceDb>" --archive="<path>.archive.gz" --gzip
```

Example namespace: `agrivio_rehearsal_source_<runId>`.

## Backup verification

* Process exit status is 0
* Archive file exists, size > 0
* Manifest JSON records filename, sha256, fileSizeBytes, startedAt, completedAt
* Record tool version, start/end, artifact size, and expected namespace
* Confirm the authoritative backup outcome and manifest metadata appear in Super Admin Backup Status

## Restore via CLI (REL-G09)

```text
AGRIVIO_BACKUP_DIR=/path/to/backups npm run ops:restore -- --backup=<archiveName>.archive.gz --confirm-database=<targetDb>
```

`<targetDb>` must be `agrivio_rehearsal_restored_<runId>` for local rehearsal.

The restore CLI:
1. Resolves `mongorestore` from `AGRIVIO_MONGORESTORE_PATH` or `PATH`
2. Reads the sidecar manifest and verifies SHA-256 checksum before restoring
3. Rejects restore if checksum does not match (archive may be corrupted)
4. Spawns `mongorestore --uri=... --nsFrom=<sourceDb>.* --nsTo=<targetDb>.* --archive=<path> --gzip --drop`
5. Uses `--drop` to empty target collections before restore (target must be a disposable rehearsal DB)

### Restore semantics

* `--drop` is always used: existing collections in the target are dropped before data is loaded
* The source archive is never modified
* The source database is never overwritten
* For production restore: stop writes to the primary database before restoring, and only restore into the primary after verifying in a rehearsal environment

## Restore verification

* Exit status 0
* Capture a **dump comparison snapshot** on the source immediately after optional backup-coordination recording and immediately before `mongodump`. Restore collection names and document counts must match that dump cut point, not an earlier pre-coordination snapshot. `backup_operation_records` written before dump are part of the dump and must match. Restore-coordination records written after `mongorestore` are outside the dump boundary and must not be used as the restore-count baseline.
* Inventory quantity equals signed stock movements
* Inventory valuation equals authoritative WAC / cost-state
* Customer receivable/advance equals signed ledger effects
* Supplier payable/advance equals signed ledger effects
* Account balances equal signed account movements
* Representative dashboard and report payloads match source vs restored
* Restore coordination remains `coordinationOnly` with `productionRestoreExecuted=false`

## Reconciliation checklist

* organizations, memberships/users, branches, warehouses
* products/categories, batches
* purchases, sales, payments
* stock movements, inventory balances, WAC
* customer and supplier ledger effects
* account movements
* audit events
* invoice sequences

Use existing inventory and supplier reconciliation interfaces. Do not invent a rehearsal-only accounting formula.

## Restore failure / abort

* Missing or incomplete archive: reject before invoking mongorestore
* SHA-256 mismatch: reject before invoking mongorestore; archive may be corrupted
* Refused target names (`Agrivio` or any non-rehearsal name): abort before invoking restore
* `mongorestore` exits non-zero: restore is failed; do not mark the target verified
* On abort: leave source intact, drop only disposable rehearsal targets that matched the naming policy, keep textual evidence

## Import rehearsal (REL-G10)

Use a disposable `agrivio_rehearsal_import_<runId>` database and the real F08 workflow:

template → upload → preview → validation → confirm → execute

Minimum types: categories, products, customers, suppliers, cash opening, opening stock, customer opening receivable, supplier opening payable.

Invalid workbook: preview must identify invalid row and field; confirm/execute must not proceed; zero business effects.

## Cleanup

* Drop only rehearsal databases matching the naming policy
* Delete temporary dump directories
* Retain textual evidence (this runbook, task record, evidence JSON)
* Never drop `Agrivio` or unrelated databases

## Automated entry

```text
npm run test:ops:rehearsal
```

## Privileged operator CLI

```text
npm run ops:backup       # creates backup archive + manifest
npm run ops:restore -- --backup=<archive> --confirm-database=<target>
```

## Production vendor caveat

LOCAL TECHNICAL REHEARSAL: evidenced by this runbook and `npm run test:ops:rehearsal`

PRODUCTION TARGET/VENDOR BACKUP VERIFICATION: pending until a production backup provider is selected

