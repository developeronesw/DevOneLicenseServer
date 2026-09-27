# DevOne License Server

Standalone licensing authority for DevOne CMS 2.0. Phase 1 established React/Vite, a runtime-neutral contract, and the Cloudflare Worker shell. Phase 2 adds the installation registry and D1 schema.

## Stack and runtime

- React 19, Vite 8, TypeScript 5; Node.js 22+
- Cloudflare Workers is the primary production runtime; future Node/VPS adapters implement the same runtime-neutral interfaces.
- D1 is the authoritative installation registry. No raw installation secrets are persisted.
- No PHP and no 1.7.4 licensing runtime.

## Phase 2 registry

Apply `migrations/0001_installation_registry.sql` to the D1 database and bind it as `DB` in the Worker. Routes now available:

- `POST /v1/installations/register` — validate ID/domain/email and store a salted PBKDF2-SHA256 verifier (210,000 iterations).
- `POST /v1/installations/authenticate` — verify installation secret; update last-seen; returns a short-lived authentication receipt.
- `POST /v1/installations/deactivate` — authenticate and disable the installation.
- `POST /v1/installations/deregister` — authenticate, mark deregistered, and erase stored verifier/salt.
- `POST /v1/installations/metadata` — authenticated domain/admin-email update.
- `GET /v1/health` — service health.

All API JSON responses are no-store and generic on errors. Request bodies are limited to 8 KiB. Use HTTPS in production. The authentication secret is sent only in the request body over HTTPS; never log request bodies or credentials. Registration is conflict-safe at the database insert boundary.

License activation, recovery, signing, rate limiting, and administrator dashboard operations remain later-phase work; the corresponding routes are not falsely reported as operational.

## Local development and checks

```sh
npm install
npm run check
npm test
npm run build
npm run dev
```

For Cloudflare, configure a D1 binding named `DB`, apply the migration, then run `npm run worker:dev`. Do not commit secrets or production credentials.
