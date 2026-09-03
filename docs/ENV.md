# Environment configuration

Runtime variables for Agrivio. Copy `.env.example` to an ignored `.env.local`. Never commit secrets. Angular receives only browser-safe public values.

## Required outside test

| Variable | Notes |
| --- | --- |
| `MONGODB_URI` | Replica-set URI. No production fallback. |
| `SESSION_SECRET` | Min 32 characters outside test. No production fallback. |
| `AGRIVIO_PUBLIC_WEB_BASE_URL` | Required in production. Used for CORS, activation URLs, and password-reset links. |

## Optional / local defaults

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `AGRIVIO_APP_PROFILE` | `local`, `test`, `staging`, `production` |
| `HOST` / `PORT` | API bind. Default `localhost:3000` |
| `MONGODB_DB_NAME` | Default `Agrivio` (test default is `agrivio_test_default`) |
| `MONGODB_REPLICA_SET` | Default `rs0` |
| `AGRIVIO_PUBLIC_API_BASE_URL` | Browser compile-time API origin (not a server secret) |
| `AGRIVIO_ALLOWED_ORIGINS` | Extra CORS origins. No `*` |
| `AGRIVIO_SKIP_ENV_FILE` | Skip `.env.local` auto-load |
| `AGRIVIO_SMTP_*` | Mail transport. Optional in local; `AGRIVIO_SMTP_HOST` and `AGRIVIO_SMTP_FROM` required in production |

## Production-only requirements

- `AGRIVIO_PUBLIC_WEB_BASE_URL`
- `AGRIVIO_SMTP_HOST`
- `AGRIVIO_SMTP_FROM`
- No loopback CORS auto-allow
- `AGRIVIO_ALLOW_E2E_BOOTSTRAP` is rejected

## Test-only

- `AGRIVIO_SKIP_MONGO` only when `NODE_ENV=test`
- Test profile may use placeholder `SESSION_SECRET` / Mongo URI
- Password-reset tokens are returned only when `NODE_ENV=test`

## Ops / E2E (optional)

`AGRIVIO_E2E_API_ORIGIN`, `AGRIVIO_E2E_WEB_ORIGIN`, `AGRIVIO_MONGODUMP_PATH`, `AGRIVIO_MONGORESTORE_PATH`, `AGRIVIO_MONGOD_CFG`, `AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD`, `CI`
# Audit retention

* `AGRIVIO_PLATFORM_AUDIT_RETENTION_DAYS` — optional positive integer defining the separately scoped platform-audit retention window. When absent, platform audit purge is disabled.
* `AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE` — optional positive integer for local, demo, or test tenant-audit cleanup rehearsals only. It is rejected in production; production tenant retention comes from the subscription plan's `auditHistory` entitlement.
