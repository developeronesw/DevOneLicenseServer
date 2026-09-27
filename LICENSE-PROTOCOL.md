# DevOne CMS 2.0 License Protocol

## Product rules
- Base CMS is single-site without paid Network activation.
- One Network license authorizes one installation; `maxSites: null` means unlimited sites within that installation.
- Annual and 99-year terms; activation exactly once.
- Invalid, expired, revoked, or unverifiable entitlements fail closed to single-site behavior.

## Installation registry (Phase 2)
- Registration requires a 16–128 character URL-safe installation ID, a 32–256 character high-entropy installation secret, an HTTPS domain, and a valid administrator email.
- Domain input may be a bare hostname or HTTPS URL; it is normalized to the lowercase hostname. Credentials, non-HTTPS schemes, and malformed URLs are rejected.
- Secret verifier uses PBKDF2-HMAC-SHA256 with a random 16-byte salt and 210,000 iterations. Only the salt and verifier are stored.
- Authentication compares verifier bytes in constant time, updates last-seen, and returns a five-minute receipt. The receipt is informational and is not a signed bearer token.
- Deactivation prevents subsequent authentication. Deregistration additionally clears the verifier and salt and records its timestamp. Re-registration with the same ID remains blocked by the retained tombstone.
- Metadata changes require the current installation secret.
- Production requests must use HTTPS. Never log raw request bodies, installation secrets, or license keys.

## Routes
| Method | Route | Status |
|---|---|---|
| GET | `/v1/health` | Implemented |
| POST | `/v1/installations/register` | Implemented |
| POST | `/v1/installations/authenticate` | Implemented |
| POST | `/v1/installations/deactivate` | Implemented |
| POST | `/v1/installations/deregister` | Implemented |
| POST | `/v1/installations/metadata` | Implemented |
| POST | `/v1/licenses/activate` | Reserved; 501 |
| POST | `/v1/licenses/refresh` | Reserved; 501 |
| POST | `/v1/installations/recover` | Reserved; 501 |

## Storage
`migrations/0001_installation_registry.sql` defines the installation registry and `migrations/0002_license_authority.sql` defines the Network license authority table. Domain logic depends on storage interfaces; `D1InstallationStore` and `D1LicenseStore` provide the Cloudflare D1 adapters, preserving the future Node/VPS port boundary.

## License authority (Phase 3/4)
- Network license records store only a SHA-256 digest of the issued license key; the cleartext key is returned once by the authority and is not persisted.
- Activation is atomically bound to one installation and checks active state and expiry before claiming the license.
- Entitlements are signed with Ed25519 using a private `CryptoKey` supplied by the runtime; the private key must remain a server-side secret and must never be committed or returned by an API.
- The D1 adapter performs activation as a conditional SQL update so concurrent requests cannot claim an unassigned license twice.
- Public activation/refresh wiring remains gated until the installation `proof` contract is finalized. The Phase 2 authentication receipt is explicitly not a signed bearer credential, so it is not reused as proof.
