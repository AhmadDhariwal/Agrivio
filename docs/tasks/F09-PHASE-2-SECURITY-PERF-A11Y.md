# F09 Phase 2 — Security, permission matrix, performance, accessibility

## Task Status

* Status: **Not started / preparatory artifacts only — Frozen DoD not accepted**
* Date: 2026-08-14 (status corrected)
* Work items: `R1-F09-002`, `R1-F09-003`, `R1-F09-004`

## Preparatory (unaccepted)

In-repo suites and UI landmarks exist from premature work. They may run in unit/E2E jobs. They do **not** satisfy Frozen DoD.

| ID | Frozen DoD gap |
| --- | --- |
| R1-F09-002 | Attack/isolation tests exist as rehearsal. REL-G03/REL-G05 are not closed: no security review acceptance, rate-limit production values remain a controlled unresolved item until the F09 security review. |
| R1-F09-003 | Permission-matrix spec is preparatory. REL-G04 is not accepted until the matrix is verified as the F09 P2 work item against the frozen 81-permission catalog with that phase’s evidence. |
| R1-F09-004 | `f09-accessibility.e2e.spec.ts` may run with Playwright; that does not complete REL-G07. Browser accessibility baseline was not an accepted F09 P2 gate. REL-G06 cannot pass: Frozen production performance thresholds remain unresolved (QUALITY_GATES / IMPLEMENTATION_ROADMAP). No invented numeric SLA. |

## Out of scope for this record

* External penetration-test vendor procurement.
* Final SLA contracts.
* Claiming Phase 2 complete.
