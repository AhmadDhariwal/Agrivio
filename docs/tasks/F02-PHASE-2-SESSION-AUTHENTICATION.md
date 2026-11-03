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

## Staging Sign In request and submit hardening (2026-09-10)

The canonical `/signin` route no longer performs a speculative cookie-session lookup merely to
render the public form. Protected-route hard refreshes retain the existing deduplicated,
authoritative session bootstrap, and authenticated state already established in the current tab
still redirects away from Sign In. Successful login continues to apply the server-returned session
directly, while logout, expiry, and secret-free cross-tab revalidation remain unchanged.

During login, the email and password controls are disabled without resetting or mutating their
values. Duplicate submits are ignored; failure re-enables the controls and preserves the submitted
values for correction, while success navigates without a cleared/invalid form flash.

## Production Sign In regression (2026-11-02)

Restored the intended `/signin` wiring to the existing `signInGuard`; it had regressed to
`publicOnlyGuard`, which waits for session discovery and cancels navigation on non-401 errors.
Only this route changes. An established authenticated tab retains its normal redirect; a fresh
Sign In entry does not probe the session. Protected routes and all other auth flows are unchanged.

Focused regression coverage renders the real Sign In form with pending discovery and after
401/429/500/502/network/timeout results, and verifies the redirect after successful discovery.
Backend checks cover login/session/logout and session reads while the auth limiter store is
exhausted or unavailable. Proxy checks cover upstream statuses, connection failure, and client-IP
forwarding; production/direct trusted-proxy tests cover distinct clients and spoofed headers.
No backend/proxy runtime, limit, or persisted-model changes are included.

Validation passed: focused Angular guard/routing/store/login/logout suites (5 files, 27 tests);
backend session/store-isolation and login/session/logout checks (3 tests), auth limiter checks
(4 tests), and trusted-proxy checks (8 tests); `npm run test:pages-proxy` (11 tests);
`nx run-many -t build -p frontend,backend --parallel=2`; and `git diff --check`.
The Mongo limiter failure is simulated at the store boundary, not a live production-database test.

Production investigation: a Pages session response carried Render's HTML 502 and
`x-render-routing: no-deploy`, rather than the proxy's JSON connection-error response. A direct
production request timed out at 45 seconds; subsequent direct and proxied checks returned JSON
401 in about 0.45 and 0.29 seconds. These observations do not establish an idle-shutdown cause.
The later log review below separates staging lifecycle records from production request evidence.
The intermittent 429's response/event evidence remains outstanding: the inspected session path
does not call the auth/onboarding limiter or its Mongo bucket store. Do not treat that 429's
origin or the hosting recovery as a completed production fix without corresponding provider
evidence. Deploying the frontend correction remains an operator action.

### E2E routing follow-up

Aligned `auth-routing.e2e.spec.ts` with the non-blocking Sign In entry: full-document navigation
to `/signin` or legacy `/login` shows the form without session discovery, including when a valid
cookie exists. The test still verifies restoration from `/`, protected-page refresh, a second tab,
and logout propagation between authenticated tabs. Added a separate unavailable-session-endpoint
check for direct entry, legacy entry, and refresh. No application behavior changes in this follow-up.

## Public homepage session-discovery fallback (2026-11-03)

Reproduced initial navigation on the deployed `main-7IYBZFU2.js` with browser-intercepted session
responses: 401 rendered the homepage; plain-text 429, plain-text 502, and network failure each
left the root outlet empty. The root route's `publicOnlyGuard` caught unexpected discovery errors
and returned false, cancelling navigation. The separate non-blocking Sign In guard was active.

Changed only `publicOnlyGuard`'s error fallback to allow the public page to render. Successful
session discovery still redirects to the organization/platform workspace or context selector.
Unexpected errors leave authentication unknown rather than marking the user authenticated or
logged out. The same fallback applies to the existing public-only reset/onboarding routes.
Protected-route guards, session persistence, cross-tab behavior, CSRF, RBAC, tenant isolation,
backend/proxy behavior, and rate limits are unchanged.

The supplied historical 429 has Ray ID `a5499f140f474aec-LHE`, timestamp
`2026-11-03 07:21:19 UTC` (12:21:19 PKT), response body `Too Many Requests`, content type
`text/plain`, bundle `main-7IYBZFU2.js`, and an Angular `initialNavigation` Initiator. This supports
the reproduced root-navigation failure. An infrastructure-generated 429 is the likely source:
the inspected session path has no app limiter, and Agrivio/proxy-generated errors use JSON.
This is an inference, not proof of which provider generated it. A Cloudflare Ray ID proves
Cloudflare handled the response, not that Cloudflare originated it; Render traffic also traverses
Cloudflare. Provider events and Render logs remain unavailable to this investigation without
account access or an export; the Render integration is not connected. The user is checking the
dashboards. The user's log review identified Render startup at `2026-11-02 10:45:28 UTC` and
SIGTERM at `2026-11-02 11:00:12 UTC` as staging-profile/staging-database records; they cannot
explain the next day's production 429. The available Cloudflare CSV contains Security Insights
recommendations, not request events, so it cannot trace the supplied Ray ID. Historical
retention/plan limitations have not been confirmed and must not be assumed. Remaining evidence
needed: a production Cloudflare request/security event for that Ray ID and timestamp, and matching
production Render request/runtime logs (including routing/request identifiers where available).
No hosting rate-limit change is justified by the available evidence.

Validation passed: focused frontend routing/auth tests (6 files, 38 tests), including homepage
401/429/502/network-error rendering, strict protected-route handling for the same responses, and
successful organization/platform/context redirects. `nx build frontend`, formatting of the new
test file, and `git diff --check` passed. No backend or full E2E suite was run for this change.
The public fallback is implemented locally; production deployment remains an operator action.
