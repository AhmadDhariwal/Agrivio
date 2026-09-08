# F02 Phase 1 — Organization Onboarding

## Task Status

* Status: Complete (reimplemented on CommonJS backend)
* Completion date: 2026-08-08
* Recovery source: **Reimplementation** — previous F02 Phase 1 code was not present in the current working tree, Git history, reflog, stash, dangling objects, or remote branches after the CommonJS migration
* Work items: `R1-F02-005`, `R1-F02-006`
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next phase: **F02 Phase 2 — Session Authentication**

## Scope Delivered

* Public organization activation request (`POST /api/v1/organization-activation-requests`)
* Safe duplicate-request behaviour via applicant fingerprint
* Super Admin organization list/detail
* Explicit approve route (`POST .../approve`)
* Explicit reject route (`POST .../reject`) — name matches behaviour
* Later Frozen-gap close (2026-08-14, not a new F02 ID): `POST /api/v1/platform/organizations` reuses this pending-org path; `POST .../:id/suspend` orchestrates the F02-011 subscription lifecycle
* Secure activation-token creation, SHA-256 hash at rest, 24h expiry, single-use
* Owner activation (`POST /api/v1/auth/activate`) with Argon2id password hashing
* Canonical collections only: `organizations`, `users`, `organization_memberships`, `subscriptions`, `account_activation_tokens`, `audit_events`
* Trial subscription created on approval (frozen DATA_MODEL / SUBSCRIPTION_AND_BILLING requirement)
* Later Frozen-gap close (2026-08-14): organization-level `POST .../suspend` orchestrates this same `suspendSubscription` lifecycle; it does not add a second state machine
* Angular `/request-access` and `/activate`

## Security Corrections

* `X-Platform-Actor` is accepted only in `development`/`test`; production rejects the header with 403 and does not authorize platform calls via that bypass
* Plain activation tokens are returned once on approve and never stored; only `tokenHash` is persisted
* Password hashes and tokens are excluded from audit metadata / redaction patterns
* Login/session authentication intentionally deferred to F02 Phase 2

## Backend Modules

```text
apps/backend/src/modules/
├── onboarding/
├── organizations/
├── identity/
├── subscriptions/
├── platform/
└── audit/
```

## Tests

Meaningful behaviour tests covering signup validation, duplicates, approve/reject, token expiry/reuse/wrong token, password policy, production actor bypass, and Angular form posts.

| Suite | Result |
| --- | --- |
| Backend unit | 17 files / 53 tests passed |
| Frontend unit | 4 files / 7 tests passed |
| Architecture | 3 tests passed |
| Backend lint / typecheck / build | passed |
| Frontend typecheck / build | passed |
| Unit gate (`nx run-many -t test --all`) | passed |

F02 onboarding-focused coverage lives in:

* `apps/backend/src/modules/onboarding/onboarding.spec.js`
* `apps/backend/src/modules/identity/password.service.spec.js`
* `apps/backend/src/modules/platform/platform-actor.middleware.spec.js`
* `apps/frontend/src/app/features/onboarding/*.page.spec.ts`

## CommonJS alignment

Backend runtime modules use Express 5 + JavaScript CommonJS (`require` / `module.exports`). Vitest `*.spec.js` files may use ESM `import` (Vitest requirement). No backend `"type": "module"`. `argon2` is listed under `allowBuilds: false` in `pnpm-workspace.yaml` because native install scripts are not required when prebuilt bindings are present on this toolchain.

## Docker-dependent checks

MongoDB replica-set transaction/TTL proofs remain pending and do not block this phase.

## Mongo activation-token session consistency hardening (2026-09-08)

Owner activation-token lookup and open-token enumeration now receive the active Mongoose session
when invoked inside onboarding transactions. This keeps approve/reissue/activate behavior on the
transaction's primary snapshot instead of allowing those reads to escape through connection-level
read routing. Token generation, SHA-256 hashing, hash-only persistence, expiry, single-use
consumption, and the canonical `account_activation_tokens` collection are unchanged.

A real replica-set Mongo regression now proves approve and reissue hashes remain retrievable after
commit, the prior token is consumed, only the newest token activates, reuse is rejected, and an
activation-token insert is visible both inside its transaction and after commit.

The regression also passes the freshly reissued token through the production activation-URL
builder and standard query-string decoding before the fresh HTTP activation request. Frontend
coverage independently proves Angular query parsing and the `/auth/activate` payload preserve an
opaque token byte-for-byte, including reserved characters. Activation-body validation rejects
blank tokens without trimming or otherwise mutating a non-blank token before hashing.
