# DevOne License Server

Standalone licensing authority for DevOne CMS 2.0.

## Phase 1 foundation

The License Server is a separate service from DevOne CMS 2.0. The CMS remains the source of truth for licensing behavior; this service owns server-side installation records, license authority, and signing authority.

### Runtime architecture

```
React / Vite Admin UI
        |
        v
Versioned License API
        |
   +----+----+
   |         |
Cloudflare  Node.js
 Worker    future VPS
   |
 D1 / KV / Secrets
```

Business contracts under `src/server/` are runtime-neutral. Cloudflare and future Node/VPS adapters plug into those contracts instead of leaking provider-specific APIs into licensing logic.

### Stack boundary

- React 19 + Vite 8 + TypeScript 5
- Node.js 22+ development/runtime target
- Cloudflare Workers as the permanent primary deployment
- Cloudflare D1 for authoritative licensing records in later phases
- KV for short-lived/cacheable state where appropriate
- Runtime-injected private signing secrets; never committed
- No PHP and no legacy 1.7.4 licensing runtime

## CMS 2.0 contract

DevOne CMS 2.0 defines the licensing behavior this server must implement:

- Base CMS is single-site without a paid Network activation.
- One Network license authorizes one installation.
- `maxSites: null` means unlimited sites within that authorized installation.
- Annual and 99-year terms are supported.
- Activation is exactly once.
- Installation identity is separate from the paid license key.
- Invalid, expired, revoked, or unverifiable Network entitlements fall back to single-site behavior.
- Installation secrets are high-entropy credentials; only a verifier/hash belongs server-side.
- Raw installation secrets and license keys must never be logged.
- Private signing material remains only in the License Server runtime.

The typed contract in `src/server/contracts.ts` is the server-side Phase 1 representation of that CMS 2.0 contract. It is intentionally not an activation implementation yet.

## API boundary

Phase 1 establishes the versioned `/v1` route namespace and a CMS-facing `LicenseServerClient`. Registration, authentication, activation, refresh, deactivation, recovery, and de-registration are implemented in later phases.

`GET /v1/health` is the only live operation in Phase 1. Other `/v1/*` operations fail closed with a generic not-implemented response until their server-side storage and security rules are implemented.

## Development

```bash
npm install
npm run check
npm test
npm run build
npm run dev
```

Never commit secrets, private signing keys, installation secrets, production credentials, or raw license keys.
