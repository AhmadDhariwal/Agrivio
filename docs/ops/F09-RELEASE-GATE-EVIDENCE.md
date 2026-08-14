# F09 release-gate evidence

Date: 2026-08-14

| Gate | Evidence | Status |
| --- | --- | --- |
| REL-G01 Production build | `npm run build` in `test:regression` | In-repo |
| REL-G02 Full regression | `npm run test:regression` + `npm run e2e` | In-repo |
| REL-G03 Tenant isolation | `f09-security-attack.spec.js` + F02 isolation suite | In-repo |
| REL-G04 Authorization matrix | `f09-permission-matrix.spec.js` | In-repo |
| REL-G05 Security hardening | Attack suite; auth throttle 20/15 min recorded | In-repo |
| REL-G06 Performance baseline | 250-product list &lt; 2s planning threshold | In-repo |
| REL-G07 Accessibility baseline | `f09-accessibility.e2e.spec.ts` + shell skip link | In-repo |
| REL-G08 Backup verification | `verifyBackupPolicy` rehearsal | In-repo (not vendor) |
| REL-G09 Restore rehearsal | Coordination + in-memory snapshot restore | In-repo (not vendor) |
| REL-G10 Import rehearsal | Category import preview/execute | In-repo |
| REL-G11 Data reconciliation | Post-import / post-restore category lists | In-repo sample |
| REL-G12 UAT approval | Two automated pilots; defect log empty of Crit/High | Automated; live client sign-off outstanding |
| REL-G13 Application rollback | [APPLICATION_ROLLBACK.md](APPLICATION_ROLLBACK.md) | Documented |
| REL-G14 Release notes | [RELEASE_NOTES.md](RELEASE_NOTES.md) | Documented |
| REL-G15 Operational ownership | Interim engineer/reviewer; named production owners outstanding | Partial |

## Blockers for a real production cutover

* Hosting, production MongoDB topology, backup provider, monitoring provider (decision deadline: F09 entry)
* Named support, security, backup, restore, and release owners (deadline: production readiness review)
* Live pilot commercial prices and signed UAT by designated client reviewers
