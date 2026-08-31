# Data recovery procedure

**Status: local technical REL-G08/G09/G10 evidenced on this host.** Production vendor backup/restore remains pending. Application rollback remains a separate procedure.

Database restore is **not** application rollback. Restore discards later valid transactions unless the incident owner explicitly accepts that.

## What backups cover

MongoDB backups (`npm run ops:backup`) use `mongodump --archive --gzip` and capture:

* All MongoDB collection documents, index definitions, and collection metadata

They do **not** capture non-MongoDB filesystem assets (billing evidence files, uploaded documents).

**Full disaster recovery requires backing up both:**

1. The MongoDB archive directory (`AGRIVIO_BACKUP_DIR`)
2. Application-level file storage (billing evidence root, uploads directory)

## When to use

Use only for data-loss or corruption incidents after REL-G09-style rehearsal has succeeded in the target environment.

## Steps

1. Require `operations.restore.execute` on a platform operator (not the default Super Admin bundle).
2. Record backup policy verification (latest successful backup within the agreed window).
3. Initiate restore **coordination** in Agrivio (`restore_operation_records`, audit `restore.coordination.initiated`).
4. **Stop writes** to the primary database (maintenance window). Restore is destructive — it uses `--drop` on the target.
5. Execute the technical restore in a rehearsal or isolated environment first using [BACKUP_RESTORE_REHEARSAL.md](BACKUP_RESTORE_REHEARSAL.md); verify tenant isolation and stock/ledger/account reconciliation before reconnecting users. A named production vendor restore remains outstanding until that vendor is selected.
   ```text
   npm run ops:restore -- --backup=<archiveName>.archive.gz --confirm-database=<targetDb>
   ```
   The restore CLI verifies the SHA-256 checksum from the sidecar manifest before calling `mongorestore`. It rejects archives with mismatched checksums (potential corruption).
6. Set `productionRestoreExecuted` only when a real production restore ran (the in-app API does not flip this by coordinating).
7. Do not treat restore as an undo button for an application release.

## Restore semantics

* `--drop` is always used: existing collections in the target are dropped before data is loaded.
* Never restore over the primary production database without first stopping writes and verifying in a rehearsal environment.
* Never restore without SHA-256 checksum verification against the manifest.

## Rehearsal evidence

LOCAL TECHNICAL REHEARSAL: `npm run test:ops:rehearsal` seeds disposable rehearsal databases, runs real `mongodump`/`mongorestore` into a separate rehearsal database, and runs the F08 import workflow. Restore counts are compared to the dump cut point. F08 coordination APIs remain status-only (`productionRestoreExecuted` stays false unless a real production restore ran).

PRODUCTION TARGET/VENDOR BACKUP VERIFICATION: pending.

