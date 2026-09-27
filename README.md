# DevOne License Server

Standalone licensing authority for DevOne CMS 2.0.

## Stack
- React + latest Vite/TypeScript
- Node.js 22+ tooling
- Cloudflare as the permanent primary deployment
- Portable server boundaries for later VPS/self-hosting
- D1 for authoritative licensing records
- KV for short-lived/cacheable state where appropriate
- Private signing keys only in protected server runtime secrets

## CMS contract
DevOne CMS 2.0 is the source of truth. The server implements its documented licensing protocol and Core API integration boundary. Base CMS use remains single-site without a paid Network activation. A Network license authorizes one installation; maxSites=null means unlimited sites within that installation. Annual and 99-year terms are supported. Invalid, expired, revoked, or unverifiable entitlements fall back to single-site behavior.

## Five phases
1. Foundation — React/Vite, Node runtime boundary, Cloudflare adapter boundary, API contract, matching UI.
2. Installation Registry — registration, authentication proofs, domain metadata, lifecycle.
3. License Authority — license records, activation-once semantics, signed entitlements, terms.
4. Verification & Administration — validation/refresh, revocation, recovery, audit controls, admin UI.
5. Production & Portability — Cloudflare deployment, security hardening, migrations, backups, tests, VPS portability.

## Development
npm install
npm run check
npm run build
npm run dev

Never commit secrets, private signing keys, installation secrets, production credentials, or raw license keys.
