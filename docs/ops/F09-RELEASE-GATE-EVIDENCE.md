# F09 release-gate evidence

Date: 2026-08-14 (corrected: only R1-F09-001 is in scope to prove)

Status key: **proven** = Frozen evidence for this gate exists in-repo; **preparatory** = artifacts exist but Frozen DoD is not accepted; **pending** = external/production evidence required.

| Gate | Evidence | Status |
| --- | --- | --- |
| REL-G01 Production build | `npm run build` inside `npm run test:regression:release` | Proven with R1-F09-001 when that command is green |
| REL-G02 Full regression | Canonical `npm run test:regression:release` (includes E2E). Fast `npm run test:regression` is non-E2E only. | Proven with R1-F09-001 when that command is green |
| REL-G03 Tenant isolation | Preparatory `f09-security-attack.spec.js` + prior F02 isolation suite | Preparatory — R1-F09-002 not accepted |
| REL-G04 Authorization matrix | Preparatory `f09-permission-matrix.spec.js` | Preparatory — R1-F09-003 not accepted |
| REL-G05 Security hardening | Preparatory attack suite; coded throttle default 20/15 min; production rate-limit values still unresolved | Preparatory — R1-F09-002 not accepted |
| REL-G06 Performance baseline | Accepted non-SLA planning thresholds in PROJECT_DECISIONS; `npm run test:perf:baseline` 2026-08-15 within targets (20 VU mix, 500/200 import rows); `npm run test:perf:navigation` passed | Proven for planning/non-prod on this workstation — not a production SLA |
| REL-G07 Accessibility baseline | `npm run test:a11y:baseline` and canonical E2E 2026-08-15: keyboard/semantic/label/focus/validation + 526 rendered WCAG 2.2 AA contrast pairs. NFR-A11Y-006 recorded in PROJECT_DECISIONS. Not full WCAG 2.2 AA product conformance. NFR-A11Y-007 not executed. | Proven for Frozen NFR-A11Y-001–006 on critical workflows |
| REL-G08 Backup verification | In-repo backup-record check; not target/vendor policy | Preparatory / pending — R1-F09-005 not accepted |
| REL-G09 Restore rehearsal | In-memory catalog snapshot only — **not** a database/target restore | Not passed — R1-F09-005 not accepted |
| REL-G10 Import rehearsal | In-repo category import rehearsal | Preparatory — R1-F09-005 not accepted |
| REL-G11 Data reconciliation | Sample in-repo lists only | Preparatory / pending real pilot data |
| REL-G12 UAT approval | Automated demo orgs only. Real two-client UAT sign-off outstanding | Pending — R1-F09-006/007 not accepted |
| REL-G13 Application rollback | Draft [APPLICATION_ROLLBACK.md](APPLICATION_ROLLBACK.md) | Preparatory — R1-F09-008 not accepted |
| REL-G14 Release notes | Draft [RELEASE_NOTES.md](RELEASE_NOTES.md) | Preparatory — R1-F09-008 not accepted |
| REL-G15 Operational ownership | Named production owners unresolved | Pending — R1-F09-008 not accepted |

## Blockers for later F09 phases (not R1-F09-001)

* Hosting, production MongoDB topology, backup provider, monitoring provider (decision deadline: F09 entry)
* Named support, security, backup, restore, and release owners (deadline: production readiness review)
* Agreed production performance thresholds (deadline: F09 performance gate). Release 1 *planning* (non-SLA) thresholds are recorded in PROJECT_DECISIONS; they are not production SLAs.
* Two real pilot clients and signed UAT
