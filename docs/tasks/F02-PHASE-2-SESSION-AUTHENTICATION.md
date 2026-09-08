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

## Final auth and multi-tab routing hardening (2026-09-06)

Frontend auth state now distinguishes unknown, restoring, authenticated, and unauthenticated states. Public-only and protected guards wait for the single deduplicated cookie-session restore result, preventing sign-in rendering and repeated session probes during redirect chains. Authenticated `/`, `/signin`, and legacy `/login` navigation resolves to `/app`, `/context`, or the canonical platform workspace according to the restored active context.

Secret-free `BroadcastChannel` events notify sibling tabs after login, logout, or context change. Receiving tabs always revalidate through `GET /api/v1/auth/session`; logout and authoritative `401` handling clear existing CSRF, session/context, capability, and tenant-cache state. The server-side HttpOnly cookie, CSRF flow, authorization, and revocation model remain unchanged, and `QueryCacheService` was not modified.

## Cross-site staging CSRF transport hardening (2026-09-08)

The production `staging` profile now emits the existing opaque HttpOnly session cookie with
`Secure; SameSite=None`. This allows the allowlisted Cloudflare Pages frontend to return the
pre-authentication session cookie to the Render API after obtaining the existing JSON CSRF token
from `POST /api/v1/auth/csrf`. Other profiles retain `SameSite=Lax`; exact-origin credentialed CORS,
Origin/Referer validation, session-bound CSRF validation, authentication, and token rotation are
unchanged.

Focused tests cover the deployed cross-site origin, cookie attributes, rejection when the CSRF
header has no matching cookie, successful public organization activation request with both values,
and Angular `withCredentials` plus `X-CSRF-Token` transport.

## Staging same-origin API topology (2026-09-08)

The staging Angular build uses `AGRIVIO_PUBLIC_API_BASE_URL=same-origin`, producing relative
`/api/v1/...` browser requests. A Cloudflare Pages Function at `functions/api/[[path]].js` forwards
only those requests to the fixed `AGRIVIO_API_UPSTREAM_ORIGIN` Render origin. It preserves the
validated Pages Origin/Referer, cookies, CSRF and application headers, query strings, streaming
bodies, upstream status/body, and each `Set-Cookie` header independently. Hop-by-hop and Cloudflare
forwarding headers are removed, and API responses carry private/no-store browser and CDN cache
directives. `apps/frontend/public/_routes.json` is copied to the Angular browser output so static and
SPA routes do not invoke the Function.

Cloudflare Pages staging settings are:

* Root directory: repository root
* Build command: `npm run build:frontend`
* Build output directory: `dist/apps/frontend/browser`
* `AGRIVIO_PUBLIC_API_BASE_URL=same-origin`
* `AGRIVIO_API_UPSTREAM_ORIGIN=https://agrivio-staging-api.onrender.com`
* `AGRIVIO_PUBLIC_WEB_ORIGIN=https://agrivio-staging-web.pages.dev`

The existing Render session, CSRF, strict origin, credentialed exact-origin CORS, Mongo session,
and staging `Secure; SameSite=None` cookie policies remain unchanged for the first proxy deployment.
