# DevOne License Server

Standalone licensing authority for DevOne CMS 2.0. This repository is the source of truth for the server-side Network License protocol.

## Stack and runtime

- React 19, Vite 8, TypeScript 5; Node.js 22+
- Cloudflare Workers with static assets is the primary production runtime.
- D1 is the authoritative installation/license registry.
- KV provides persistent server-side installation state and the automatic signing-key fallback.
- R2 is provisioned for license-server storage and future artifacts.
- No PHP and no 1.7.4 licensing runtime.

## Phase 5 deployment model

Phase 5 is designed for a deploy-first, browser-install experience:

1. GitHub Actions runs checks and builds the Worker assets.
2. Wrangler automatically provisions the declared D1, KV, and R2 resources when they do not already exist.
3. D1 migrations are applied through the DB binding.
4. The Worker and light/off-white installer UI are deployed together.
5. Visit /install to verify the resources and initialize the server-side signing key.
6. No D1/KV/R2 IDs are entered into the installer and no Cloudflare API token is ever sent to the browser.

Automatic resource provisioning is a Cloudflare Wrangler feature currently documented as an open beta. It requires Wrangler 4.45.0 or newer; this repository uses a newer 4.x Wrangler release.

## Phase 2 registry

- POST /v1/installations/register — validate ID/domain/email and store a salted PBKDF2-SHA256 verifier (210,000 iterations).
- POST /v1/installations/authenticate — verify installation secret and update last-seen.
- POST /v1/installations/deactivate — authenticate and disable the installation.
- POST /v1/installations/deregister — authenticate, mark deregistered, and erase stored verifier/salt.
- POST /v1/installations/metadata — authenticated domain/admin-email update.
- GET /v1/health — service health.

## Phase 3/4 license authority

- Network license issuance and activation are implemented in the server core.
- License keys are stored as SHA-256 hashes.
- Network entitlements are signed with Ed25519.
- Activation is atomically bound to one installation.
- Activation/refresh are rate limited.
- Request bodies are limited to 8 KiB and malformed requests fail closed.

## Automatic signing key

For zero-manual installation, the Worker supports two signing-key modes:

1. LICENSE_SIGNING_PRIVATE_KEY Worker secret, if supplied — preferred for a managed production deployment.
2. Server-side KV fallback, generated once on first installation check and never returned to the browser.

The private signing material is never sent in an API response. The KV fallback is intentionally server-side and exists so a fresh deployment can be initialized without manually creating a Cloudflare secret. A future hardened deployment can migrate an installation to the Worker-secret mode.

## Checks

    npm install
    npm run check
    npm test
    npm run build
    npm run dev

For local Worker development, Wrangler can provision local simulated D1/KV/R2 resources from the same bindings. Production deployment uses the Cloudflare account credentials stored in CI/CD secrets.
