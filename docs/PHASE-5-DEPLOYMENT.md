# Phase 5 — Production Deployment

Phase 5 changes the deployment target from a manually assembled Worker/D1 stack to a deploy-first Cloudflare installation.

## What is automatic

The Wrangler configuration declares:

- DB — D1
- LICENSE_KV — KV
- LICENSE_STORAGE — R2

The bindings intentionally omit account-specific resource IDs. With Wrangler 4.45.0+, Cloudflare can automatically provision missing KV, R2, and D1 resources during deployment. This repository uses a newer Wrangler 4.x release.

The GitHub Actions workflow therefore does not require:

- a D1 database ID
- a manually created KV namespace
- a manually created R2 bucket
- a Cloudflare API token in the browser

Cloudflare API credentials are still required by the deployment runner itself because the runner is what deploys the Worker and provisions account resources.

## Deployment flow

1. Push to main or manually run the deployment workflow.
2. CI installs dependencies and runs npm run check.
3. CI runs npm test.
4. CI builds the Vite assets.
5. Wrangler applies D1 migrations through the DB binding. Missing D1 resources can be automatically provisioned.
6. Wrangler deploys the Worker and static installer assets, automatically provisioning/linking KV and R2 as declared bindings.
7. Open the Worker URL and visit /install.
8. The installer verifies D1, KV, and R2 and initializes the server-side signing key if a Worker secret was not supplied.

## Required CI secrets

Only these are required for deployment:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN

The API token is used only by GitHub Actions. It is never exposed to the installer page or stored in application code.

## Signing key modes

### Managed mode

Set the Worker secret LICENSE_SIGNING_PRIVATE_KEY before deployment. This is the preferred hardened configuration when the operator wants the signing key managed as a Cloudflare Worker secret.

### Automatic installation mode

If the Worker secret is absent, Phase 5 generates an Ed25519 key pair on first /install status check and stores the base64 PKCS#8 private key in the server-only LICENSE_KV binding. The private key is never returned by the API.

This mode is specifically intended to make a fresh deployment testable without an extra secret setup step. The next hardening phase can add an authenticated key-management migration path.

## Installer UI

The installer is intentionally light/off-white and separate from the dark neon DevOne CMS 1.7.x visual language.

Open:

- / — server landing/status page
- /install — installation check and initialization UI

The installer checks:

- D1 migration tables
- KV availability
- R2 binding availability
- signing-key availability/source

A successful check reports Installation foundation complete.

## Smoke test

After the GitHub Actions deployment succeeds:

1. Open /install.
2. Confirm D1, KV, R2, and Signing Key report available.
3. Open /v1/health and confirm ok: true.
4. Register a disposable DevOne CMS installation.
5. Authenticate it.
6. Continue with the Phase 5.1 administrator/license-management work.

Do not use a customer license for the first production smoke test.
