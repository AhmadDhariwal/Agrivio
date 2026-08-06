# F02 Phase 1 — Organization Onboarding

**Status:** Complete  
**Phase gate:** ✅ lint · ✅ typecheck (backend + frontend) · ✅ build (backend + frontend) · ✅ test (99 backend + 5 frontend)

---

## Roadmap items completed

| ID | Description |
|----|-------------|
| R1-F02-005 | Public organization signup request (POST `/api/v1/organization-activation-requests`) |
| R1-F02-006 | Super Admin pending-request review, approval/rejection, owner activation token issuance, owner account activation |

---

## Backend flows implemented

### R1-F02-005 — Public signup request

1. `POST /api/v1/organization-activation-requests` (idempotent via `Idempotency-Key` header)
2. Validates and normalizes `orgName`, `ownerEmail`, `ownerName`, `timezone`
3. Blocks duplicate pending/active requests for the same owner email (409 `DUPLICATE_REQUEST`)
4. Creates: `pending` Organization + `pending` User (if new) + `pending` Owner Membership
5. Writes audit event `organization.activation_request.submitted` (owner email redacted)
6. Returns `{ organizationId, isNewUser }`

### R1-F02-006 — Platform review, approval/rejection, owner activation

**Review**
- `GET /api/v1/platform/organizations` — list with optional `?status=` filter (requires `platform:orgs:view`)
- `GET /api/v1/platform/organizations/:id` — get single org (requires `platform:orgs:view`)

**Decide (approve or reject)**
- `POST /api/v1/platform/organizations/:id/approve` (idempotent via `Idempotency-Key`)
- Requires `X-Platform-Actor` header in dev/test (replaced by session auth in R1-F02-003)
- Requires `platform:orgs:approve` permission
- **Approve** (atomic transaction):
  - Activates Organization (status → `active`, `approvedAt`, `approvedBy`)
  - Activates pending Owner Membership
  - Creates trial Subscription (`Starter` plan by default)
  - Issues a random 256-bit activation token (hashed via SHA-256; plaintext returned once, never stored again)
  - Writes audit event `organization.activation_request.approved`
- **Reject** (atomic transaction):
  - Sets Organization status → `rejected`, stores `rejectionReason`
  - Writes audit event `organization.activation_request.rejected`

**Owner account activation**
- `POST /api/v1/auth/activate` — consumes token, sets password, activates user
- Validates password policy (min 12, max 128 chars)
- Looks up token by SHA-256 hash; checks expiry and prior use
- Safe replay: if token already consumed, returns cached result without re-hashing
- Atomically marks token `usedAt` + sets Argon2id password hash + activates User
- Writes audit event `user.account.activated`

---

## Frontend flows implemented

- `GET /request-access` → `OrgRequestComponent` — public signup form
- `GET /activate?token=…` → `ActivateAccountComponent` — owner password-setup form

Both are lazy-loaded Angular standalone components. Default route redirects to `/request-access`.

---

## Main files changed / created

### New backend

| File | Purpose |
|------|---------|
| `apps/backend/src/modules/identity-access/persistence/user.model.js` | Mongoose User schema |
| `apps/backend/src/modules/identity-access/persistence/membership.model.js` | Mongoose Membership schema |
| `apps/backend/src/modules/identity-access/persistence/activation-token.model.js` | Mongoose ActivationToken schema (TTL index) |
| `apps/backend/src/modules/organizations/persistence/organization.model.js` | Mongoose Organization schema |
| `apps/backend/src/modules/subscriptions/persistence/subscription.model.js` | Mongoose Subscription schema |
| `apps/backend/src/modules/audit/persistence/audit-event.model.js` | Mongoose AuditEvent schema |
| `apps/backend/src/modules/identity-access/services/user.store.js` | UserModel CRUD wrapper |
| `apps/backend/src/modules/identity-access/services/membership.store.js` | MembershipModel CRUD wrapper |
| `apps/backend/src/modules/identity-access/services/activation-token.store.js` | ActivationTokenModel CRUD wrapper |
| `apps/backend/src/modules/organizations/services/organization.store.js` | OrganizationModel CRUD wrapper |
| `apps/backend/src/modules/subscriptions/services/subscription.store.js` | SubscriptionModel CRUD wrapper |
| `apps/backend/src/modules/audit/services/audit.store.js` | AuditEventModel store |
| `apps/backend/src/modules/platform/services/onboarding.service.js` | R1-F02-005 service |
| `apps/backend/src/modules/platform/services/platform-org.service.js` | R1-F02-006 approve/reject service |
| `apps/backend/src/modules/identity-access/services/activation.service.js` | Token consumption + password hash service |
| `apps/backend/src/modules/platform/middleware/platform-auth.middleware.js` | Permission guard + dev actor injection |
| `apps/backend/src/modules/platform/controllers/onboarding.controller.js` | Onboarding request handler |
| `apps/backend/src/modules/platform/controllers/platform-org.controller.js` | Platform org review handlers |
| `apps/backend/src/modules/identity-access/controllers/activation.controller.js` | Account activation handler |
| `apps/backend/src/modules/platform/routes/onboarding.routes.js` | Onboarding Express router |
| `apps/backend/src/modules/platform/routes/platform-org.routes.js` | Platform org Express router |
| `apps/backend/src/modules/identity-access/routes/auth.routes.js` | Auth Express router |

### Modified backend

| File | Change |
|------|--------|
| `apps/backend/src/app.js` | Wired all new services, stores, middleware, and routers |
| `packages/api-contracts/src/lib/api-contracts.ts` | Added path constants + `TokenExpired`, `TokenAlreadyUsed`, `DuplicateRequest` error codes |
| `apps/backend/src/platform/idempotency/idempotency-service.js` | Removed spurious `key` field from `IdempotencyScope` typedef |
| `apps/backend/src/pnpm-workspace.yaml` (root) | Enabled `argon2: true` in `allowBuilds` |

### New frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/app/features/public/onboarding-api.service.ts` | HTTP service for onboarding + activation APIs |
| `apps/frontend/src/app/features/public/org-request/org-request.component.ts` | Public signup form component |
| `apps/frontend/src/app/features/public/org-request/org-request.component.html` | Signup form template |
| `apps/frontend/src/app/features/authentication/activate-account/activate-account.component.ts` | Owner activation form component |
| `apps/frontend/src/app/features/authentication/activate-account/activate-account.component.html` | Activation form template |

### Modified frontend

| File | Change |
|------|--------|
| `apps/frontend/src/app/app.routes.ts` | Added `request-access` and `activate` routes; default redirect |
| `apps/frontend/src/app/app.config.ts` | Added `provideHttpClient()` |

---

## Focused test coverage

### `onboarding.service.spec.js` — 20 tests
- Valid submission: creates org, user, membership; returns `isNewUser: true`
- Existing user: reuses user record; returns `isNewUser: false`
- Missing/invalid `orgName`, `ownerEmail`, `ownerName`, `timezone` → `VALIDATION_FAILED`
- Duplicate pending org for same email → `DUPLICATE_REQUEST` (409)
- Audit event written; owner email redacted in metadata
- API response contract: `{ organizationId, isNewUser }`

### `platform-org.service.spec.js` — 14 tests
- `listOrganizations` returns all / filtered by status
- `getOrganization` returns org / 404 on missing
- Approve: returns `{ decision: 'approve', activationToken: string }`; token is URL-safe, ≥ 10 chars
- Approve: writes `organization.activation_request.approved` audit event with `activationTokenIssued: true`
- Approve: `activationToken` metadata NOT in audit event (never logged)
- Reject: returns `{ decision: 'reject' }`, no token
- Reject with reason: `reason` propagated to store
- Reject: writes `organization.activation_request.rejected` audit event
- Already-decided org → `CONFLICT` (409)
- Missing org → `NOT_FOUND` (404)
- Missing Owner membership → `CONFLICT` (409) inside transaction

### `activation.service.spec.js` — 20 tests
- Valid token + password: activates user, marks token used, returns `{ userId, organizationId }`
- Safe replay: already-used token returns same result without re-hashing
- Expired token → `TOKEN_EXPIRED` (410)
- Wrong/unknown token → `NOT_FOUND` (404)
- Password too short (< 12) → `VALIDATION_FAILED`
- Password too long (> 128) → `VALIDATION_FAILED`
- Missing password → `VALIDATION_FAILED`
- Missing token → `VALIDATION_FAILED`
- Audit event written: `user.account.activated`; no password hash in audit
- `verifyPassword` helper: correct password returns `true`, wrong returns `false`

### Architecture boundary test (existing — unchanged)
- Controllers must not import persistence models directly

---

## Phase gate results

| Check | Result |
|-------|--------|
| `backend:lint` | ✅ All files pass |
| `backend:typecheck` | ✅ 0 errors |
| `frontend:typecheck` | ✅ 0 errors |
| `backend:build` | ✅ Success |
| `frontend:build` | ✅ 3 lazy chunks (org-request, activate-account, common) |
| `backend:test` | ✅ 99 passed / 0 failed (17 files) |
| `frontend:test` | ✅ 5 passed / 0 failed (2 files) |

---

## Docker-dependent checks pending

- Real MongoDB multi-document transaction rollback verification (requires running `mongod` replica set)
- TTL index automatic token expiry (requires running `mongod` with TTL background task active)

---

## Security posture

- Activation tokens: 256-bit random (`crypto.randomBytes(32)`), hashed with SHA-256 before storage, expire after 72 h (configurable via `defaultActivationTokenExpiry`), single-use, scoped to `owner-activation`
- Passwords: Argon2id via `argon2` native module; never logged or stored in plaintext
- Audit events: owner email field value replaced with `[REDACTED]`; `activationToken` plaintext never written to any log or event
- `X-Platform-Actor` header injection disabled in `production` (`NODE_ENV` check in `createDevPlatformActorMiddleware`)
- Idempotency keys: conflict-safe via SHA-256 keyed hash over scope + actor + operation

---

## Remaining risks / next steps

- R1-F02-003 (session-based platform auth) must replace the `X-Platform-Actor` header middleware before production deployment
- Email delivery of the activation link is out of scope for Phase 1; the `activationToken` is returned in the API response body for integration by a separate notification service
- MongoDB transactional guarantees require a replica-set connection string — local single-node `mongod` uses non-transactional fallback
