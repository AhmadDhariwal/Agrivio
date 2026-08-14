# Data recovery procedure

**Status: preparatory draft.** A named backup vendor and target-environment restore rehearsal are outstanding. In-memory catalog restore is not REL-G09.

Database restore is **not** application rollback. Restore discards later valid transactions unless the incident owner explicitly accepts that.

## When to use

Use only for data-loss or corruption incidents after REL-G09-style rehearsal has succeeded in the target environment.

## Steps

1. Require `operations.restore.execute` on a platform operator (not the default Super Admin bundle).
2. Record backup policy verification (latest successful backup within the agreed window).
3. Initiate restore **coordination** in Agrivio (`restore_operation_records`, audit `restore.coordination.initiated`).
4. Execute the vendor restore in a rehearsal or isolated environment first; verify tenant isolation and stock/ledger/account reconciliation before reconnecting users.
5. Set `productionRestoreExecuted` only when a real production restore ran (the in-app API does not flip this by coordinating).
6. Do not treat restore as an undo button for an application release.

## Rehearsal evidence

In-repo F09 rehearsal verifies backup records, coordination-only restore, in-memory catalog snapshot restore, and import preview/execute reconciliation. A named backup vendor restore of production MongoDB remains outstanding until that vendor is selected.
