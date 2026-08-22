# Local technical backup / restore / import rehearsal

**Status:** local technical rehearsal runbook for R1-F09-005. This does not select a production hosting or backup vendor.

Database restore is **not** application rollback. Restore discards later valid transactions unless the incident owner explicitly accepts that.

Keep these separate:

1. F08 backup/restore **coordination/status** APIs (`backup_operation_records`, `restore_operation_records`)
2. This **local technical** `mongodump` / `mongorestore` rehearsal

The in-app restore API does not dump or restore MongoDB.

## Prerequisites

* Local MongoDB replica set `rs0` with a PRIMARY (`npm run db:status`)
* MongoDB Database Tools: `mongodump` and `mongorestore` on `PATH`, or set `AGRIVIO_MONGODUMP_PATH` / `AGRIVIO_MONGORESTORE_PATH`
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

## Allowed rehearsal DB naming

```text
agrivio_rehearsal_source_<runId>
agrivio_rehearsal_restored_<runId>
agrivio_rehearsal_import_<runId>
```

`<runId>` is alphanumeric only.

## Backup command (REL-G08)

Replace placeholders. Do not point `--db` at `Agrivio`.

```text
mongodump --uri="<replica-set-uri>" --db="<sourceDb>" --out="<dumpDir>"
```

Example namespace: `agrivio_rehearsal_source_<runId>`.

## Backup verification

* Process exit status is 0
* `<dumpDir>/<sourceDb>` exists and is non-empty
* Record tool version, start/end, artifact size, and expected namespace
* Optionally record a successful coordination backup outcome for operator visibility (not a substitute for the dump)

## Restore command (REL-G09)

Restore into a **different** disposable database. Do not overwrite the source.

```text
mongorestore --uri="<replica-set-uri>" --nsFrom="<sourceDb>.*" --nsTo="<restoredDb>.*" --dir="<dumpDir>"
```

`<restoredDb>` must be `agrivio_rehearsal_restored_<runId>`.

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

* Missing or incomplete dump directory: `mongorestore` must exit non-zero; do not mark the target verified
* Refused target names (`Agrivio` or any non-rehearsal name): abort before invoking restore
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

## Production vendor caveat

LOCAL TECHNICAL REHEARSAL: evidenced by this runbook and `npm run test:ops:rehearsal`

PRODUCTION TARGET/VENDOR BACKUP VERIFICATION: pending until a production backup provider is selected
