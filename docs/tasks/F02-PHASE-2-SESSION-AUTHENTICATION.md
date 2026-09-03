# F02 Phase 2 — Session Authentication

## Task Status

* Status: Complete
* Completion date: 2026-08-08
* Work items: `R1-F02-003`, `R1-F02-004`
* Coupled session-context endpoint included for authenticated lifecycle (`POST /api/v1/auth/session/context`) without claiming full R1-F02-007/008 RBAC
* Backend convention: Express 5 + JavaScript CommonJS (`require` / `module.exports`)
* Next phase: **F02 Phase 3** (active context UX / permission evaluation — roadmap `R1-F02-007`+)

## Scope Delivered

* Opaque HttpOnly session cookies (`agrivio_session`), hashed at rest in `auth_sessions`
* CSRF issuance (`POST /api/v1/auth/csrf`) and validation (`X-CSRF-Token`) for mutating browser requests
* Login / logout / GET session
* Session context switch with session+CSRF rotation
* Password-reset request/confirm with hashed single-use tokens in `password_reset_tokens` (30-minute expiry)
* Password reset invalidates all sessions
* Owner activation establishes authenticated session and rotates CSRF
* Platform routes authenticate via platform session context; `X-Platform-Actor` remains development/test-only and is impossible in production
* Angular `/login`, `/password-reset`, `/password-reset/confirm`; onboarding forms attach CSRF

## Security behavior

* Argon2id password verify/hash reused from identity password service
* Session absolute lifetime 12h; inactivity 30m
* CSRF bound to session; Origin/Referer guard (required in production)
* No passwords, hashes, session tokens, reset tokens, or credential cookies in audit/logs (redaction filters retained)
* Reset responses do not reveal account existence (test-only `resetTokenForTest` in `NODE_ENV=test`)

## Consolidation note

* `modules/audit` retains Mongoose `audit_events` model; `platform/audit` retains audit writer — not duplicate infrastructure
* `modules/platform` actor middleware now prefers real session platform context

## Docker-dependent verification

MongoDB replica-set transaction/TTL proofs for `auth_sessions` / `password_reset_tokens` remain pending and do not block this phase.

## Validation

| Suite | Result |
| --- | --- |
| Backend unit | 18 files / 57 tests passed |
| Frontend unit | passed (login/reset/onboarding CSRF flows) |
| Backend lint / typecheck / build | passed |
| Frontend typecheck / build | passed |
| Architecture | passed |
| Unit gate (`nx run-many -t test --all`) | passed |

## Final platform-flow hardening (2026-09-03)

`/signin` is now the canonical sign-in route; `/login` is a compatibility redirect. Sign-in, password reset, activation/request-access, and the public landing entry wait for the authoritative cookie-session probe and redirect authenticated users to `/app` or `/context` without rendering public auth UI. The `/app` parent guard continues to block all protected child rendering and sends missing/expired sessions to `/signin`; permission and capability denials remain `/app/access-denied` and `/app/feature-unavailable` respectively.

Successful logout still posts the existing server endpoint, then clears the CSRF token, session/context, capability state, and existing scoped query cache before navigating to `/signin`. The authenticated context selector no longer offers “Back to sign in.” `QueryCacheService` was not modified.
