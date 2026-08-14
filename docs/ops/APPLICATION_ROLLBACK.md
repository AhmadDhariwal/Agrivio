# Application rollback procedure

**Status: preparatory draft.** Named rollback/incident owners are unresolved. This is not R1-F09-008 completion.

Application rollback redeploys a prior approved application version. It must **not** automatically restore the database.

## When to use

Use when a faulty application release causes errors but later valid business transactions in MongoDB must be kept.

## Steps

1. Confirm the incident owner and the last known-good application artifact (frontend + backend production builds).
2. Stop routing new traffic to the faulty version (hosting-specific; provider unresolved until named).
3. Redeploy the prior approved frontend and backend artifacts.
4. Do **not** restore MongoDB as part of this procedure.
5. Smoke: health, login, one posted sale or purchase read, backup status view.
6. Record the incident, versions, and verification in the support log.

## Schema rule

Prefer expand/contract schema so application rollback does not require database rollback.
