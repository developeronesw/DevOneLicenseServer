import {
  LICENSE_API_VERSION,
  LICENSE_PRODUCT,
  LICENSE_ROUTES,
  isValidEmail,
  isValidInstallationId,
  isValidNetworkEntitlement,
} from "../src/server/contracts";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

expect(LICENSE_API_VERSION === "1", "API version must remain v1.");
expect(LICENSE_PRODUCT === "devone-cms", "Product identifier must match DevOne CMS.");
expect(LICENSE_ROUTES.register === "/v1/installations/register", "Registration route changed unexpectedly.");
expect(LICENSE_ROUTES.activate === "/v1/licenses/activate", "Activation route changed unexpectedly.");
expect(isValidEmail("admin@example.com"), "Valid email rejected.");
expect(!isValidEmail("not-an-email"), "Invalid email accepted.");
expect(isValidInstallationId("Abcdefghijklmnop"), "Valid installation ID rejected.");
expect(!isValidInstallationId("short"), "Short installation ID accepted.");
expect(isValidNetworkEntitlement({
  licenseId: "lic_123",
  product: "devone-cms",
  edition: "network",
  maxSites: null,
  features: ["multisite"],
  issuedAt: "2026-09-27T00:00:00Z",
  expiresAt: "2125-09-27T00:00:00Z",
  term: "99-year",
  signature: "signature",
}), "Valid Network entitlement rejected.");

console.log("Phase 1 contract tests passed.");
