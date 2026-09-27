export const LICENSE_API_VERSION = "1" as const;
export const LICENSE_PRODUCT = "devone-cms" as const;

export type LicenseEdition = "single" | "network";
export type LicenseTerm = "annual" | "99-year";
export type LicenseState = "active" | "expired" | "revoked" | "deactivated";
export type InstallationState = "active" | "deactivated" | "deregistered" | "recovery";

export type LicenseFeature =
  | "multisite"
  | "network_admin"
  | "network_users"
  | "network_domains"
  | "network_extensions";

export interface NetworkEntitlement {
  licenseId: string;
  product: typeof LICENSE_PRODUCT;
  edition: "network";
  maxSites: null;
  features: LicenseFeature[];
  issuedAt: string;
  expiresAt: string;
  term: LicenseTerm;
  signature: string;
}

export interface InstallationRecord {
  installationId: string;
  domain: string;
  adminEmail: string;
  state: InstallationState;
  registeredAt: string;
  lastSeenAt: string;
  deregisteredAt: string | null;
  licenseId: string | null;
}

export interface RegisterInstallationRequest {
  installationId: string;
  installationSecret: string;
  domain: string;
  adminEmail: string;
}

export interface RegistrationReceipt {
  installationId: string;
  registeredAt: string;
  serverVersion: string;
}

export interface AuthenticateInstallationRequest {
  installationId: string;
  proof: string;
  timestamp: string;
}

export interface InstallationAuthResult {
  installationId: string;
  authenticated: true;
  expiresAt: string;
}

export interface ActivateLicenseRequest {
  licenseKey: string;
  installationId: string;
  proof: string;
  timestamp: string;
}

export interface RefreshLicenseRequest {
  installationId: string;
  proof: string;
  timestamp: string;
}

export interface LicenseOperationResult {
  entitlement: NetworkEntitlement;
}

export interface ApiError {
  ok: false;
  error: string;
  code: string;
  requestId: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const LICENSE_ROUTES = {
  health: "/v1/health",
  register: "/v1/installations/register",
  authenticate: "/v1/installations/authenticate",
  activate: "/v1/licenses/activate",
  refresh: "/v1/licenses/refresh",
  deactivate: "/v1/licenses/deactivate",
  recover: "/v1/installations/recover",
  deregister: "/v1/installations/deregister",
} as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const installationIdPattern = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidEmail(value: string): boolean {
  return emailPattern.test(value.trim());
}

export function isValidInstallationId(value: string): boolean {
  return installationIdPattern.test(value);
}

export function isValidNetworkEntitlement(value: NetworkEntitlement): boolean {
  return value.product === LICENSE_PRODUCT
    && value.edition === "network"
    && value.maxSites === null
    && value.signature.length > 0
    && Number.isFinite(Date.parse(value.issuedAt))
    && Number.isFinite(Date.parse(value.expiresAt));
}
