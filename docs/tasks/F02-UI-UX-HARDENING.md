# F02 UI/UX Hardening — Product UI, Routing, Developer Runtime

## Task Status

* Status: **Complete** (UI/UX hardening pass)
* Completion date: 2026-08-10
* Branch: `task/R1-F02-P6`
* Scope: Final F02 usability/presentation correction before F03
* Does **not** implement F03 business functionality

## Exact F02 user-facing page count

**13** routed user-facing pages/views (excluding layout chrome-only concerns counted separately from content).

| # | URL | Page name | Access | Required role/context | How to reach | Required data/setup |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/` | Landing | Public | None | Root entry | None |
| 2 | `/login` | Sign in | Public | None | Landing → Sign in | Active user credentials |
| 3 | `/password-reset` | Password reset request | Public | None | Landing / Sign in links | Eligible account email |
| 4 | `/password-reset/confirm` | Password reset confirm | Public | None | Reset flow / token link | Valid reset token |
| 5 | `/request-access` | Organization access request | Public | None | Landing CTA | None (creates pending onboarding) |
| 6 | `/activate` | Owner activation | Public | Activation token | Approval handoff / token query | One-time activation token |
| 7 | `/context` | Active context switcher | Authenticated | Signed-in session | Post sign-in / shell nav | Session with available contexts |
| 8 | `/app` | Workspace home | Authenticated | Signed-in + preferred active context | Context continue / shell | Session |
| 9 | `/app/subscription/billing` | Billing evidence + history | Authenticated org | `subscription.billing-evidence.submit` (nav); backend authoritative | Shell → Billing | Org context + billing permission |
| 10 | `/app/platform/organizations` | Organization requests | Authenticated platform | Platform context + `platform.organizations.view` | Shell → Organizations | Platform Super Admin session |
| 11 | `/app/platform/plans` | Subscription plans | Authenticated platform | Platform context + `platform.subscriptions.manage` | Shell → Plans | Platform session |
| 12 | `/app/platform/billing-review` | Billing review queue | Authenticated platform | Platform context + `platform.billing.verify` | Shell → Billing review | Platform session + submitted evidence |
| 13 | `/**` (e.g. `/unknown`) | Not found | Public | None | Invalid deep link | None |

Legacy redirects (not separate pages): `/subscription/billing`, `/platform/organizations`, `/platform/plans`, `/platform/billing-review` → `/app/...`.

## UI system introduced

* Global SCSS tokens (`apps/frontend/src/styles/_tokens.scss`)
* Base typography/focus/background (`_base.scss`)
* Shared presentational classes (`_components.scss`)
* Fonts: Source Serif 4 (display) + Manrope (UI)
* Palette: deep forest/emerald primary, warm neutral surfaces, restrained status colors
* No Angular Material / Bootstrap / Tailwind / PrimeNG

## Reusable primitives

Under `apps/frontend/src/app/shared/ui/`:

* `AuthLayoutComponent`
* `UiAlertComponent`
* `UiPageHeaderComponent`
* `UiEmptyStateComponent`
* `UiLoadingStateComponent`
* `UiStatusBadgeComponent`
* `UiConfirmDialogComponent`

Plus class-based buttons, fields, tables, cards, badges, shell/auth layouts in global SCSS.

## Accessibility / responsive work

* Semantic headings and labeled controls on auth/forms
* Visible `:focus-visible` rings via design tokens
* Password show/hide controls
* Confirm dialog for consequential approve/reject actions
* Auth pages centered and usable on common mobile widths
* Shell remains desktop-first with collapsible sidebar at ≤900px

## Local environment workflow

```bash
# one-time/root
npm install

# frontend
cd apps/frontend
npm start

# backend (auto-loads ignored root/.env.local via process.loadEnvFile)
cd apps/backend
node index.js
```

* Does not override existing process/CI env vars
* Skips auto-load when `NODE_ENV=test`, `CI=true`, or `AGRIVIO_SKIP_ENV_FILE=true`
* Loads from both `apps/backend/index.js` (bare `node index.js`) and `src/main.js` (Nx `serve`/`dev:backend`)
* Resolves repo-root `.env.local` first, then `apps/backend/.env.local`
* `.env.example` documents all currently supported keys with safe placeholders
* `AGRIVIO_SKIP_MONGO` remains test-only

### Exact `.env.local` example (no real secrets)

```text
NODE_ENV=development
AGRIVIO_APP_PROFILE=local
HOST=localhost
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB_NAME=Agrivio
MONGODB_REPLICA_SET=rs0
SESSION_SECRET=replace-with-a-long-local-development-secret-at-least-32-chars
AGRIVIO_PUBLIC_API_BASE_URL=http://localhost:3000
```

PowerShell secret generation example:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## API / frontend development connectivity

```text
browser Angular app (http://localhost:4200)
→ http://localhost:3000/api/v1/*
→ Express backend
```

* `environment.publicApiBaseUrl = http://localhost:3000`
* Credentialed requests (`withCredentials: true`)
* CORS allowlist origins for localhost:4200/3000 (no wildcard credentials)
* Session cookie auth preserved

## Routing defects found/fixed

* Added wildcard not-found page (`/**`)
* Added session UX guard on `/app` and `/context`
* Added platform-context UX guard on platform admin child routes
* Added missing legacy redirect for `/platform/organizations`
* Soft nav remains non-authoritative; backend authorization unchanged

## Tests

* Frontend unit: route inventory/guards, landing, billing evidence loading, platform confirm flow, existing auth/onboarding suites preserved
* Backend unit: `load-local-env.spec.js`
* Playwright: onboarding vertical slice updated for confirm dialog + label-oriented sign-in selectors

### Validation performed (2026-08-10)

| Gate | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run typecheck` | passed |
| `npm run test:unit` | passed |
| `npm run test:architecture` | passed |
| `npm run build` | passed |
| Playwright Chromium (`onboarding.e2e` + `scaffold.e2e`) | 2 passed (local; webServer uses `NODE_ENV=test` + `AGRIVIO_SKIP_MONGO`) |

## Manual visual review notes

Browser inspection of rendered pages confirmed polished public surfaces:

* `/` landing — brand-forward Agrivio entry, primary/secondary CTAs
* `/login` — auth card, labeled fields, password show/hide
* `/request-access` — polished onboarding form card
* `/does-not-exist` — intentional not-found page

Protected shell/platform/billing pages still require authenticated data for full visual review.

## Pages requiring authenticated data for visual review

* `/context`, `/app`, billing, and all platform pages require a real signed-in session
* Minimum setup: local Mongo replica-set (`Agrivio` / `rs0`) **or** documented test bootstrap under `NODE_ENV=test` + `AGRIVIO_ALLOW_E2E_BOOTSTRAP=true` (not for normal development DB bypass)
* Platform pages additionally require Super Admin platform context
* Billing review requires at least one submitted billing evidence record

## Mongo / Docker verification still pending

Unchanged residual F02 infrastructure debt from Phase 6:

* Docker/replica-set TTL/index proofs
* CI Chromium E2E against started Mongo
* Integration job tenant-isolation smoke against replica set

Do **not** claim Mongo transaction/index verification from mock/`AGRIVIO_SKIP_MONGO` runs.

## Suggested commit message

```text
feat(f02): harden product UI, routing, and local backend env loading

Polish Agrivio F02 screens with a lightweight visual system and shared UI
primitives, repair route discovery/not-found/guards, and auto-load ignored
.env.local for direct node index.js development startup.
```
