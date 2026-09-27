import { genericError, jsonResponse } from "./server/http";
import { LICENSE_API_VERSION } from "./server/contracts";

export interface WorkerAssets {
  fetch(request: Request): Promise<Response>;
}

export interface LicenseWorkerEnv {
  ASSETS: WorkerAssets;
}

export default {
  async fetch(request: Request, env: LicenseWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/health" && request.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        data: { service: "devone-license-server", apiVersion: LICENSE_API_VERSION, status: "ok" },
        requestId: crypto.randomUUID(),
      });
    }

    if (url.pathname.startsWith("/v1/")) return genericError(501, "not_implemented");
    return env.ASSETS.fetch(request);
  },
};
