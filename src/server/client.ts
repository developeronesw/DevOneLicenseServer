import type {
  ActivateLicenseRequest,
  ApiResponse,
  AuthenticateInstallationRequest,
  InstallationAuthResult,
  LicenseOperationResult,
  RefreshLicenseRequest,
  RegisterInstallationRequest,
  RegistrationReceipt,
} from "./contracts";
import { LICENSE_API_VERSION, LICENSE_ROUTES } from "./contracts";

export interface LicenseServerClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class LicenseServerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LicenseServerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  register(input: RegisterInstallationRequest): Promise<ApiResponse<RegistrationReceipt>> {
    return this.post(LICENSE_ROUTES.register, input);
  }

  authenticate(input: AuthenticateInstallationRequest): Promise<ApiResponse<InstallationAuthResult>> {
    return this.post(LICENSE_ROUTES.authenticate, input);
  }

  activate(input: ActivateLicenseRequest): Promise<ApiResponse<LicenseOperationResult>> {
    return this.post(LICENSE_ROUTES.activate, input);
  }

  refresh(input: RefreshLicenseRequest): Promise<ApiResponse<LicenseOperationResult>> {
    return this.post(LICENSE_ROUTES.refresh, input);
  }

  private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-devone-license-api": LICENSE_API_VERSION,
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResponse<T>;
  }
}
