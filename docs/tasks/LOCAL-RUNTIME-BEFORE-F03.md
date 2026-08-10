# Local Runtime Finalization (pre-F03)

## Task Status

* Status: **Complete** (code/docs/diagnostics); **one-time Administrator Mongo enablement may remain on machines still running standalone mongod**
* Date: 2026-08-10
* Scope: Local developer startup only — backend Mongo contract, native `rs0` support, frontend serve paths
* Does **not** implement F03

## Backend root cause

`npm run dev` / `node index.js` load `.env.local` and connect with:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB_NAME=Agrivio
MONGODB_REPLICA_SET=rs0
```

On this machine MongoDB Server `8.2` was installed as a Windows service listening on `127.0.0.1:27017`, but `mongod.cfg` had `#replication:` commented out (standalone). The Node driver then fails with:

```text
Server selection timed out after 10000 ms
```

because a `replicaSet=rs0` URI cannot select a standalone member. Docker Compose was not available, and existing `db:*` scripts were Docker-only.

## Backend startup fix

* Contract validation: URI must include `replicaSet` matching `MONGODB_REPLICA_SET`; no standalone fallback
* Startup diagnostics classify:
  * `mongo_unreachable`
  * `mongo_not_replica_set`
  * `wrong_replica_set_name`
  * `no_primary`
  * `invalid_database_configuration`
* After connect, refuse non-PRIMARY / wrong RS topologies
* `.env.local` auto-load preserved (`process.loadEnvFile`, skip on CI / `NODE_ENV=test` / `AGRIVIO_SKIP_ENV_FILE`)

## Exact local Mongo requirements

| Item | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `27017` |
| Logical database | `Agrivio` (`MONGODB_DB_NAME`) |
| Replica set | `rs0` |
| Topology | Single-node replica set (Docker **or** locally installed mongod) |
| Forbidden | Standalone mongod; skipping Mongo for normal local runs |

### Native Windows one-time enablement (Administrator)

```powershell
# From an elevated PowerShell at repo root:
npm run db:configure-native -- --write-config
# or manually: set replication.replSetName: rs0 in mongod.cfg, then:
Restart-Service MongoDB
npm run db:init
npm run db:status
```

`db:reset` remains Docker-volume destruction only and never auto-resets a native Mongo data directory.

## Mongo verification commands

```bash
npm run db:status
```

Equivalent checks (Node driver / mongosh if installed):

```bash
# ping
node -e "import('mongodb').then(async ({MongoClient})=>{const c=new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true');await c.connect();console.log(await c.db('admin').command({ping:1}));await c.close();})"

# replica-set status / PRIMARY
node -e "import('mongodb').then(async ({MongoClient})=>{const c=new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true');await c.connect();console.log(await c.db('admin').command({replSetGetStatus:1}));await c.close();})"

# database connectivity (rs0 URI)
node -e "import('mongodb').then(async ({MongoClient})=>{const c=new MongoClient('mongodb://127.0.0.1:27017/?replicaSet=rs0');await c.connect();console.log(await c.db('Agrivio').command({ping:1}));await c.close();})"
```

If `mongosh` is on PATH:

```text
mongosh --host 127.0.0.1 --port 27017 --eval "db.adminCommand('ping')"
mongosh --host 127.0.0.1 --port 27017 --eval "rs.status()"
mongosh --host 127.0.0.1 --port 27017 --eval "db.hello()"
mongosh "mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0" --eval "db.runCommand({ping:1})"
```

## Frontend serve contract

Preserved / required:

```bash
cd apps/frontend && npm start
npx nx serve frontend
npx nx serve frontend --port=4300
npx ng serve
npx ng serve --port 4300
```

* Root `angular.json` restores workspace-local Angular CLI discovery for `npx ng serve` without removing Nx
* `apps/frontend/.env.serve` sets `PORT=4200` so Nx does not reuse root `.env.local` API `PORT=3000` for the Angular dev server
* Bare `ng s` still requires a global/PATH `ng`; project startup must use `npm start`, `npx nx serve`, or `npx ng serve`

## Database / collection behavior

* Mongoose schemas/models own collection names and indexes (no SQL-style manual table creation)
* Collections are created lazily on first write (and indexes via schema `index(...)` when models are used)
* Existing F02 collections (appear after real application flows, not merely process boot):

| Collection | Typical first flow |
| --- | --- |
| `organizations` | Access request / onboarding approve |
| `users` | Onboarding / activation |
| `organization_memberships` | Onboarding approve / activation |
| `account_activation_tokens` | Onboarding approve |
| `auth_sessions` | Sign-in |
| `password_reset_tokens` | Password reset request |
| `access_assignments` | Assignment APIs (when used) |
| `subscriptions` | Onboarding / subscription lifecycle |
| `subscription_plans` | Platform plans admin |
| `subscription_billing_records` | Billing evidence submit/review |
| `audit_events` | Audited platform/org actions |

Boot alone against an empty `Agrivio` database does not require pre-created collections.

## Validation performed (2026-08-10)

| Check | Result |
| --- | --- |
| `npm run lint` | passed |
| `npm run typecheck` | passed |
| `npm run test:unit` | passed (includes new mongo diagnostics tests) |
| `npm run test:architecture` | passed |
| `npm run build` | passed |
| `npm run db:status` | correctly reports standalone native mongod (exit 1 until rs0 enabled) |
| `cd apps/backend && node index.js` | fails fast with `mongo_not_replica_set` (expected until Admin enables rs0) |
| `cd apps/backend && npm run dev` | same classified failure + watch restart message |
| `cd apps/frontend && npm start` | ready on `:4200` (after `.env.serve` PORT pin) |
| `npx nx serve frontend` | ready on `:4200` |
| `npx nx serve frontend --port=4300` | ready on `:4300` |
| `npx ng serve` / `npx ng serve --port 4300` | ready (workspace `angular.json`) |

## Remaining blocker on this machine

Administrator elevation is required once to set `replication.replSetName: rs0` and restart the MongoDB Windows service. UAC elevation was cancelled in the agent session; after the user completes `npm run db:configure-native -- --write-config` (elevated) + `npm run db:init`, backend `node index.js` / `npm run dev` should reach `backend ready`.

## Suggested commit message

```text
fix(dev): finalize local rs0 runtime and startup diagnostics

Support native MongoDB single-node rs0 alongside Docker, classify Mongo
startup failures clearly, align local DB name Agrivio, and restore
workspace-local Angular CLI serve via angular.json.
```
