# Pre-F03 Source Layout Conventions and Super Admin Bootstrap

## Task Status

* Status: **Complete**
* Date: 2026-08-10
* Scope: Final pre-F03 architecture cleanup — Angular feature folder cohesion, shallow backend module layout, operational Super Admin bootstrap CLI
* Does **not** implement F03 employee management or other F03 business functionality

## Super Admin bootstrap

### Before

* No supported operational path to create the first platform Super Admin
* Only test-only `POST /api/v1/test/e2e/bootstrap` existed (`NODE_ENV=test` + `AGRIVIO_ALLOW_E2E_BOOTSTRAP=true`)
* Direct MongoDB document editing was the only practical local/production-adjacent option

### After

Operational CLI creates an active Super Admin with Argon2id password hashing:

```bash
npm run bootstrap:super-admin -- --email admin@example.com --display-name "Platform Admin" --password "your-secure-password"
```

Password may also be supplied via `AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD` (never persisted by the tool).

Behavior:

* Not a public HTTP endpoint
* Cannot self-register as Super Admin through the app
* Refuses to promote an existing organization/Owner user
* Idempotent when the same email is already `platformAccess: super_admin`
* Persists Argon2id hash only (no plaintext password/token)
* User is immediately `active` for normal `/login`
* Platform context and `/app/platform/organizations` continue to work after login + context selection
* Organization approval + Owner activation unchanged

Implementation:

* `apps/backend/src/modules/identity/bootstrap-super-admin.service.js`
* `scripts/bootstrap-super-admin.mjs`
* Root script: `bootstrap:super-admin`

## Frontend source-layout convention (F00–F09)

Every Angular page/component owns a cohesive folder. Prefer feature-based layout:

```text
features/<feature>/
├── pages/
│   └── <page>/
│       ├── <page>.component.ts   # or <page>.page.ts
│       ├── <page>.component.html
│       ├── <page>.component.scss
│       └── <page>.component.spec.ts
├── components/
│   └── <reusable-feature-component>/
├── data-access/
├── models/                 # only when needed
├── services/               # only when needed
└── <feature>.routes.ts     # only when feature owns route config
```

Rules:

* Page-specific HTML/SCSS/spec stay beside their TS
* Feature-shared API/data access belongs in `data-access`
* Feature-shared models belong in `models`
* Do not move feature orchestration into global `shared`
* `shared` = genuinely reusable UI/utilities only
* `core` = application-wide infrastructure only
* Standalone Angular, kebab-case directories/files
* Do **not** create empty folders merely to match the template
* Preserve routes, guards, lazy loading, permissions, and UI behavior when relocating files

### Applied in this task

Reorganized all F00–F02 frontend features (`auth`, `onboarding`, `platform`, `public`, `shell`, `subscriptions`) plus `shared/ui` components into cohesive folders.

## Backend source-layout convention (F00–F09)

Keep the backend simple:

`Route → middleware/validation → Controller → Service → Repository only when useful → Mongoose Model`

Organize by canonical business module. For modules with several files:

```text
modules/<module>/
├── routes/
├── controllers/
├── services/           # composition roots / use cases may remain at module root when shallow is clearer
├── repositories/       # only when useful (stores currently remain at module root)
├── persistence/        # Mongoose models
└── tests/              # optional; colocated `*.spec.js` also allowed
```

Rules:

* Not every folder is mandatory
* Very small modules must not gain unnecessary depth
* Models remain owned by their canonical module under `persistence/`
* No ports/adapters, generic repositories, generic CRUD frameworks, or interfaces solely to mirror concrete classes
* Preserve CommonJS, tenant isolation, permissions, transactions, and audit behavior

### Applied in this task

* Moved Mongoose models into `persistence/`
* Moved HTTP routes into `routes/` and controllers into `controllers/` for `identity`, `onboarding`, `organizations`, `subscriptions`
* Left tiny modules (`audit`, `locations`, `platform`) shallow (model-only or middleware-only)
* Did **not** introduce repositories/ports/facades for symmetry with Angular

## Validation

Commands run:

```text
npm run lint                 # pass
npm run typecheck            # pass
npm run test:unit            # pass (95 backend + 22 frontend + package tests)
npm run test:architecture    # pass
npm run build                # pass
npm run e2e                  # pass (onboarding + scaffold; clean ports required)
npm run bootstrap:super-admin # create + idempotent re-run verified against Agrivio/rs0
```

Live Mongo verification: bootstrapped Super Admin signed in, selected platform context, and listed `/api/v1/platform/organizations` successfully.

Plus applicable integration/E2E against local Mongo `Agrivio` / `rs0`.

## Future agents (F03–F09)

Follow these conventions for every new feature/module. Prefer relocating files into cohesive folders when touching an existing flat layout; do not mass-format unrelated files.
