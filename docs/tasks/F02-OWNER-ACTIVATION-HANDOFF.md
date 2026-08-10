# F02 Owner Activation Handoff Fix

## Task Status

* Status: **Complete**
* Date: 2026-08-10
* Scope: Approval → one-time Owner activation handoff UX/API; activation confirm password; Super Admin reissue for approved/no-password Owners
* Does **not** implement F03

## Root cause

Backend already issued a one-time plaintext `activationToken` on approve (hash-only at rest). The platform Organizations UI only showed the raw token plus an in-app `routerLink`, without:

* Owner email in the handoff panel
* Absolute activation URL for out-of-band copy/send
* Copy-link action / explicit shown-once warning

List summaries also omitted `ownerEmail`, so the Owner column was often blank. No API existed to reissue a lost token for an already-approved Owner without a password.

## Recovery for already-approved / no-password Owners

Previously: **no product recovery path** once the plaintext token was discarded (hash cannot be reversed).

Now: authorized Super Admin uses **Reissue activation** (`POST /api/v1/platform/organizations/:id/reissue-activation`), which invalidates unused tokens and returns a new one-time handoff (URL + token shown once).

## Activation URL format

```text
http://localhost:4200/activate?token=<url-encoded-plaintext-token>
```

Origin from `AGRIVIO_PUBLIC_WEB_BASE_URL` (default `http://localhost:4200`). Path always `/activate?token=...`.

## Validation

| Gate | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run typecheck` | passed |
| `npm run test:unit` | passed |
| `npm run test:architecture` | passed |
| `npm run build` | passed |
| Playwright `onboarding.e2e` | passed (approve → absolute URL → activate → reuse blocked → sign-in) |
