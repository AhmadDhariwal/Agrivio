# F09 Phase 3 — Backup / restore / import rehearsals

## Task Status

* Status: **Complete for local technical rehearsal** (`R1-F09-005`). REL-G08/G09 proven on this host with real `mongodump`/`mongorestore`. REL-G10 passed. Production target/vendor backup verification remains pending.
* Date: 2026-08-15
* Work items: `R1-F09-005`

## Delivered

* Disposable rehearsal DB naming policy (refuses `Agrivio` and unrelated databases).
* Representative source dataset via application HTTP workflows on `agrivio_rehearsal_source_*`.
* Dump comparison snapshot captured immediately after optional backup-coordination recording and immediately before `mongodump`; restored counts compared to that cut point (not a stale pre-coordination snapshot).
* Source vs restored inventory, WAC, ledger, account, dashboard/report reconciliation.
* Missing-dump `mongorestore` non-zero exit and Agrivio restore refusal.
* Integrated F08 import preview/confirm/execute plus invalid preview (REL-G10).
* Runbook: [BACKUP_RESTORE_REHEARSAL.md](../ops/BACKUP_RESTORE_REHEARSAL.md)
* Command: `npm run test:ops:rehearsal`
* Evidence: [F09-R1-F09-005-REHEARSAL-EVIDENCE.json](../ops/F09-R1-F09-005-REHEARSAL-EVIDENCE.json)

## Gate split (this workstation, 2026-08-15)

| Layer | Status |
| --- | --- |
| LOCAL TECHNICAL BACKUP (`mongodump`) | **PASS** — tool 100.17.0, exit 0, non-empty BSON artifact |
| LOCAL TECHNICAL RESTORE (`mongorestore`) | **PASS** — tool 100.17.0, exit 0, separate disposable DB, dump-cut-point count match plus business reconciliation |
| INTEGRATED IMPORT REHEARSAL | **PASS** |
| PRODUCTION TARGET/VENDOR BACKUP VERIFICATION | pending — no production backup vendor selected |

## Out of scope

* R1-F09-006+
* Production restore
* Hosting / backup / monitoring vendor selection
* Frozen document edits
