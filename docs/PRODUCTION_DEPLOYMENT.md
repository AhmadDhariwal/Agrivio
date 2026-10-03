# Agrivio Production Deployment Guide

This document outlines the exact manual steps required to deploy the Agrivio full-stack application to production.
The application consists of a Node.js/Express backend (Render), an Angular frontend (Cloudflare Pages), and a MongoDB database (Atlas).

## 1. Prerequisites
- A GitHub repository containing the Agrivio codebase.
- Accounts with **MongoDB Atlas**, **Render**, and **Cloudflare**.
- A secure generated **Session Secret** (minimum 32 characters).
- SMTP credentials for system emails (e.g., SendGrid, Mailgun).

## 2. Environment Variables Reference
*Note: Do not commit actual secrets to version control. Set these strictly in your hosting provider's dashboard.*

### Render Backend Variables
| Variable | Description | Example / Requirement |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime mode. | **Must** be `production`. |
| `AGRIVIO_APP_PROFILE` | Application profile. | `production` |
| `HOST` | The bind address for the API. | **Must** be `0.0.0.0` for Render. |
| `MONGODB_URI` | Atlas connection string. | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | The actual database name to use. | `AgrivioProduction` |
| `MONGODB_REPLICA_SET` | Replica Set Name (Optional for SRV) | *Leave blank for Atlas SRV connections.* |
| `SESSION_SECRET` | Secure random string >= 32 chars. | *(Generated securely)* |
| `AGRIVIO_PUBLIC_WEB_BASE_URL` | The Cloudflare Pages origin URL. | `https://agrivio.pages.dev` (No trailing slash) |
| `AGRIVIO_SMTP_HOST` | Mail host. | `smtp.example.com` |
| `AGRIVIO_SMTP_PORT` | Mail port. | `587` |
| `AGRIVIO_SMTP_SECURE` | Use secure transport. | `false` (for 587) or `true` (for 465) |
| `AGRIVIO_SMTP_USERNAME` | Mail user. | `postmaster@...` |
| `AGRIVIO_SMTP_PASSWORD` | Mail password. | *(Secret)* |
| `AGRIVIO_SMTP_FROM` | Outgoing from address. | `noreply@agrivio.com` |

### Cloudflare Pages Variables
| Variable | Description | Example / Requirement |
| :--- | :--- | :--- |
| `AGRIVIO_PUBLIC_API_BASE_URL` | The URL of your Render backend. | `https://agrivio-api.onrender.com` |

---

## 3. MongoDB Atlas Setup
Agrivio **requires a Replica Set** to support multi-document transactions. Standalone MongoDB is not supported.

1. **Create a Cluster**: In MongoDB Atlas, create a new cluster (M0 free tier is sufficient for testing, M10+ for production). Atlas clusters are natively replica sets.
2. **Database User**: Navigate to *Database Access* and create a new user with `readWriteAnyDatabase` privileges. Save the password securely.
3. **Network Access**: Navigate to *Network Access* and allow IP addresses from Render. (You may need to allow `0.0.0.0/0` if you don't have dedicated IPs).
4. **Obtain Connection String**: Get the standard Node.js driver connection string (`mongodb+srv://...`). You do NOT need to specify the `MONGODB_REPLICA_SET` environment variable manually; the application will automatically negotiate the replica set topology via DNS when using SRV protocols.

---

## 4. Render Backend Deployment
Deploy the backend as a **Web Service**.

1. Connect your GitHub repository.
2. **Language**: `Node`
3. **Branch**: `main`
4. **Root Directory**: `.` (Leave empty or set to `.`, the repository root).
5. **Build Command**: `npm run build:backend` (Render automatically runs `npm install` for you in the root directory)
6. **Start Command**: `node dist/apps/backend/main.js`
7. **Environment Variables**: Add all variables listed in the Render section above.
8. **Health Check Path**: `/api/v1/operations/readiness` (This endpoint strictly verifies MongoDB connectivity before marking the instance as healthy, preventing Render from routing traffic to unready containers.)

---

## 5. Cloudflare Pages Frontend Deployment
Deploy the frontend via Cloudflare Pages connected to your GitHub repository.

1. **Project Name**: `agrivio-web` (or your preference).
2. **Production Branch**: `main`
3. **Framework Preset**: `None`
4. **Build Command**: `npm run build:frontend`
5. **Build Output Directory**: `dist/apps/frontend/browser`
6. **Environment Variables**: Add `AGRIVIO_PUBLIC_API_BASE_URL` pointing to your Render service.
7. **Node.js Version**: Ensure Cloudflare uses Node.js 24.x (set `NODE_VERSION=24` if necessary).

---

## 6. Safe Database Initialization
Agrivio does not automatically run destructive migrations or seed scripts on production startup.
Once the database is connected, it is a blank slate.

**To initialize indexes:**
You can safely run `npm run db:sync-indexes` locally by temporarily setting your local `.env.local` to point to the production Atlas URI. This script uses Mongoose's `syncIndexes()` which drops unregistered indexes and creates missing ones. It does not wipe data, making it safe for production, though it's recommended to run during low-traffic periods to avoid lock contention.

*Warning: Do not execute `npm run db:reset` or `npm run db:init` against the production database, as these are designed for local Docker development resetting.*

**To bootstrap the Super Admin:**
Run `npm run bootstrap:super-admin` with the target environment variables to create the initial administrative user.

---

## 7. Deployment Sequence & Smoke Tests
Follow this strict deployment order to prevent startup failures:

1. **Atlas**: Provision the database and configure network access.
2. **Render**: Deploy the backend. Monitor the logs to ensure the `/api/v1/operations/readiness` endpoint passes.
3. **Cloudflare**: Deploy the frontend.
4. **Smoke Test - Business Workflow**:
   - Load the Cloudflare Pages URL. Verify the login screen appears.
   - Login using the bootstrapped Super Admin credentials.
   - Verify that the Dashboard loads without network CORS errors in the browser console.
   - Navigate to **Customers**. Create a test customer.
   - Navigate to **Sales**. Create a test sale for the customer on credit.
   - Check **Reports > Customer Ledger** to ensure chronological running balance behavior.
5. **Smoke Test - Security**:
   - Attempt an unauthorized action (e.g., accessing an admin route as a normal user) and ensure a 403 Forbidden is returned.

## 8. Rollback Procedure
- **Frontend**: Cloudflare Pages supports instantaneous rollbacks from the deployment dashboard.
- **Backend**: Render allows deploying previous commits from the "Events" or "Deploys" tab.
- **Database**: Atlas provides Point-in-Time Recovery (if enabled on paid tiers). Do not manually reverse application logic migrations without restoring an equivalent database backup.
