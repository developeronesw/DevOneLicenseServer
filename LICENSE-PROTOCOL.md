# DevOne CMS 2.0 License Protocol

This is derived from the DevOne CMS 2.0 licensing contract.

- Base CMS is single-site without a paid Network license.
- One Network license authorizes one installation.
- maxSites=null means unlimited sites within that authorized installation.
- Terms: annual or 99-year.
- Invalid, expired, revoked, or unverifiable Network entitlements fall back to single-site.
- Activation is exactly once.
- Installation identity is separate from the paid license key.
- Installation secrets are high-entropy credentials; only a verifier/hash is stored.
- Raw installation secrets and license keys are never logged.
- Private signing material exists only in the License Server runtime.

Planned API operations:
POST /v1/installations/register
POST /v1/installations/authenticate
POST /v1/licenses/activate
POST /v1/licenses/refresh
POST /v1/licenses/deactivate
POST /v1/installations/recover
POST /v1/installations/deregister
PATCH /v1/installations/:id
POST /v1/licenses/:id/revoke

Exact schemas become the contract before CMS integration is enabled.
