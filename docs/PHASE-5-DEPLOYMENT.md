# Phase 5 — Production Deployment

Phase 5 turns the tested DevOne License Server into a self-provisioning Cloudflare Worker deployment with a browser installer.

## Cloudflare resources

The Wrangler configuration declares these bindings without account-specific IDs:

- Worker: `devone-license-server`
- D1: `devone-license-db` → `DB`
- KV: `LICENSE_KV`
- R2: `LICENSE_STORAGE`
- Static assets: `dist` → `ASSETS`

Wrangler 4.45.0+ automatically provisions missing D1, KV, and R2 resources during deployment. The resources remain linked to the Worker on later deployments without committing account-specific IDs. citeturn0search0turn0search15

The project intentionally uses Workers Static Assets rather than the older Workers Sites model. Cloudflare currently recommends Workers Static Assets for new full-stack applications. citeturn0search1turn0search14

## What you need before testing

You only need a Cloudflare API token and account ID available to the deployment environment.

For GitHub Actions, create these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The browser installer must never receive a Cloudflare API token. Cloudflare resource creation happens during the trusted `wrangler deploy` step.

## Deployment flow

The production workflow now does this:

1. Install dependencies.
2. Run TypeScript checks.
3. Run the test suite.
4. Build the React/Vite application.
5. Copy `wrangler.example.jsonc` to `wrangler.jsonc`.
6. Run `wrangler deploy`, which provisions missing D1, KV, and R2 resources and deploys the Worker plus static assets.
7. Apply all D1 migrations remotely.
8. Open the deployed hostname and visit `/install`.

There is no `DEVONE_LICENSE_D1_DATABASE_ID` secret and no manual `wrangler d1 create`, KV creation, or R2 creation step.

## Signing key bootstrap

The Worker still supports the stronger `LICENSE_SIGNING_PRIVATE_KEY` Worker secret when one is supplied.

For a zero-manual-resource test deployment, if that secret is absent the Worker generates an Ed25519 PKCS#8 private key on first signing use and stores the base64 private key in the private `LICENSE_KV` binding. The key never goes to the browser or API response.

For production customer licensing, prefer supplying `LICENSE_SIGNING_PRIVATE_KEY` as a Cloudflare Worker secret so signing material is held by the platform secret store rather than application storage.

## Installer

The deployed application provides:

- `/` — deployment overview
- `/install` — Phase 5 installation/resource readiness screen
- `/v1/health` — API health and resource binding check

The installer confirms that D1, KV, and R2 bindings are available. The actual Cloudflare resource provisioning has already happened during deployment; the browser is not given account-level privileges.

## Production smoke test

After the first successful deployment:

1. Open the Worker URL.
2. Open `/install`.
3. Confirm all three resources show **Binding available**.
4. Confirm `GET /v1/health` reports `status: ok`.
5. Use a disposable DevOne CMS installation to exercise registration and activation.
6. Verify the signed entitlement with the CMS verification implementation.
7. Do not use a customer license for the first smoke test.

The Phase 5 installer is intentionally a deployment/readiness screen at this stage. Administrator license issuance, recovery, audit logging, and production rate-limit policy remain subsequent hardening work.

## Local checks

```sh
npm install
npm run check
npm test
npm run build
```

For a local Worker preview, copy `wrangler.example.jsonc` to `wrangler.jsonc` and run:

```sh
npx wrangler dev
```

Wrangler can also provision local development bindings when automatic provisioning is enabled. citeturn0search0
