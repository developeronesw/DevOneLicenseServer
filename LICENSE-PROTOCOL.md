# DevOne CMS 2.0 License Protocol

This server implements the licensing contract defined by DevOne CMS 2.0.

## Non-negotiable product rules

- Base CMS is single-site without a paid Network license.
- One Network license authorizes one installation.
- `maxSites: null` means unlimited sites within that authorized installation.
- Terms are annual or 99-year.
- Activation is exactly once.
- A license is not transferable between independent installations.
- Invalid, expired, revoked, or unverifiable Network entitlements fall back to single-site behavior.

## Security model

- Installation identity is separate from the paid license key.
- Installation secrets are high-entropy credentials; only a verifier/hash is stored.
- Raw installation secrets and license keys are never logged.
- Private signing material exists only in the License Server runtime.
- Registration and activation require authenticated installation proof, not merely a caller-supplied installation ID.
- All production communication uses HTTPS.
- Client-facing credential and license failures remain generic.

## Phase 1 API contract

The versioned API namespace is `/v1`.

| Operation | Route | Phase 1 |
|---|---|---|
| Health | GET `/v1/health` | Implemented |
| Register installation | POST `/v1/installations/register` | Contract only |
| Authenticate installation | POST `/v1/installations/authenticate` | Contract only |
| Activate Network license | POST `/v1/licenses/activate` | Contract only |
| Refresh entitlement | POST `/v1/licenses/refresh` | Contract only |
| Deactivate license | POST `/v1/licenses/deactivate` | Contract only |
| Recover installation | POST `/v1/installations/recover` | Contract only |
| De-register installation | POST `/v1/installations/deregister` | Contract only |
| Update installation metadata | PATCH `/v1/installations/:id` | Contract reserved |
| Revoke license | POST `/v1/licenses/:id/revoke` | Contract reserved |

Exact persistence, proof format, signing format, rate limits, and atomic activation behavior are Phase 2/3 implementation work. DevOne CMS 2.0 must not consume a fake activation endpoint.

## Data boundary

The future License Server system of record stores installation metadata including installation ID, canonical domain, administrator email, credential verifier, lifecycle timestamps, and license association.

Runtime-specific storage is abstracted behind database, cache, and secret-provider interfaces so the licensing domain does not depend directly on D1, KV, PostgreSQL, SQLite, Redis, or filesystem APIs.
