import { D1InstallationStore } from "./server/d1-installation-store";
import { D1LicenseStore } from "./server/d1-license-store";
import { InstallationRegistry } from "./server/registry";
import { LicenseAuthority } from "./server/license-authority";
import { D1RateLimiter } from "./server/rate-limit";
import { AdminAuth } from "./server/admin-auth";
import { genericError, jsonResponse } from "./server/http";
import { LICENSE_API_VERSION, LICENSE_ROUTES } from "./server/contracts";
import type { LicenseDatabase } from "./server/runtime";

interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number; last_row_id?: number } }>; }
interface D1Binding { prepare(query: string): D1Statement }
interface KVBinding { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void>; }
interface R2Binding { head(key: string): Promise<unknown | null> }

export interface LicenseWorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Binding;
  LICENSE_KV: KVBinding;
  LICENSE_STORAGE: R2Binding;
  LICENSE_SIGNING_PRIVATE_KEY?: string;
  LICENSE_COMMERCE_TOKEN?: string;
}

const dbAdapter = (db: D1Binding): LicenseDatabase => ({
  first: async <T>(q: string, ...p: unknown[]) => db.prepare(q).bind(...p).first<T>(),
  all: async <T>(q: string, ...p: unknown[]) => (await db.prepare(q).bind(...p).all<T>()).results,
  run: async (q: string, ...p: unknown[]) => {
    const r = await db.prepare(q).bind(...p).run();
    return { changes: r.meta.changes, lastInsertId: r.meta.last_row_id };
  },
  batch: async () => { throw new Error("Batch not used by adapters"); },
});

function success<T>(data: T, id: string): Response {
  return jsonResponse(200, { ok: true, data, requestId: id });
}
function successWithCookie<T>(data: T, id: string, cookie?: string): Response {
  const response = success(data, id);
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
function failure(status: 400 | 401 | 403 | 404 | 409 | 410 | 500 | 501, code: string, id: string, cookie?: string): Response {
  const response = jsonResponse(status, { ok: false, error: "The request could not be completed.", code, requestId: id });
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
async function body(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) return null;
  const text = await request.text();
  if (text.length > 8192) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
function base64FromBytes(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}
async function signingKey(value: string): Promise<CryptoKey> {
  const bytes = bytesFromBase64(value);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("pkcs8", buffer, { name: "Ed25519" }, false, ["sign"]);
}
async function ensureSigningKey(env: LicenseWorkerEnv): Promise<CryptoKey> {
  if (env.LICENSE_SIGNING_PRIVATE_KEY) return signingKey(env.LICENSE_SIGNING_PRIVATE_KEY);
  const keyName = "system/signing-private-key";
  const existing = await env.LICENSE_KV.get(keyName);
  if (existing) return signingKey(existing);
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  await env.LICENSE_KV.put(keyName, base64FromBytes(pkcs8));
  return pair.privateKey;
}
async function installationStatus(env: LicenseWorkerEnv): Promise<Record<string, unknown>> {
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('installations','licenses','api_rate_limits','admin_users')").bind().all<{ name: string }>();
  const tableNames = new Set(tables.results.map(row => row.name));
  await ensureSigningKey(env);
  await env.LICENSE_KV.put("system/initialized", new Date().toISOString());
  let r2Ready = false;
  try { await env.LICENSE_STORAGE.head("system/installation-probe"); r2Ready = true; } catch { r2Ready = false; }
  const foundation = tableNames.has("installations") && tableNames.has("licenses") && tableNames.has("api_rate_limits");
  return {
    service: "devone-license-server", apiVersion: LICENSE_API_VERSION,
    ready: foundation && tableNames.has("admin_users") && r2Ready,
    resources: { d1: foundation, kv: true, r2: r2Ready },
    signingKey: { configured: true, source: env.LICENSE_SIGNING_PRIVATE_KEY ? "worker-secret" : "server-side-kv" },
    administrator: { configured: tableNames.has("admin_users") },
  };
}
function adminAuth(env: LicenseWorkerEnv): AdminAuth {
  return new AdminAuth(dbAdapter(env.DB), env.LICENSE_KV);
}
function adminRequired(auth: AdminAuth, request: Request, id: string) {
  return auth.require(request).then(result => result.ok ? null : failure(result.status, result.code, id));
}

export default {
  async fetch(request: Request, env: LicenseWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const id = crypto.randomUUID();

    if (url.pathname === LICENSE_ROUTES.health && request.method === "GET") return success({ service: "devone-license-server", apiVersion: LICENSE_API_VERSION, status: "ok" }, id);
    if (url.pathname === "/v1/install/status" && request.method === "GET") {
      try { return success(await installationStatus(env), id); } catch { return genericError(500, "install_check_failed", id); }
    }

    const db = dbAdapter(env.DB);
    const auth = adminAuth(env);

    if (url.pathname === "/v1/admin/status" && request.method === "GET") {
      try {
        return success({ configured: await auth.configured(), session: (await auth.require(request)).ok }, id);
      } catch { return genericError(500, "admin_status_failed", id); }
    }
    if (url.pathname === "/v1/admin/setup" && request.method === "POST") {
      const data = await body(request);
      if (!data) return failure(400, "invalid_request", id);
      try {
        const result = await auth.setup(data);
        return result.ok ? successWithCookie(result.data, id, result.cookie) : failure(result.status, result.code, id);
      } catch { return genericError(500, "admin_setup_failed", id); }
    }
    if (url.pathname === "/v1/admin/login" && request.method === "POST") {
      const data = await body(request);
      if (!data) return failure(400, "invalid_request", id);
      try {
        const result = await auth.login(String(data.username || ""), String(data.password || ""));
        return result.ok ? successWithCookie(result.data, id, result.cookie) : failure(result.status, result.code, id);
      } catch { return genericError(500, "admin_login_failed", id); }
    }
    if (url.pathname === "/v1/admin/logout" && request.method === "POST") {
      try {
        const result = await auth.logout(request);
        return successWithCookie(result.data, id, result.cookie);
      } catch { return genericError(500, "admin_logout_failed", id); }
    }

    if (url.pathname.startsWith("/v1/admin/") && request.method === "GET") {
      const denied = await adminRequired(auth, request, id);
      if (denied) return denied;
      if (url.pathname === "/v1/admin/me") return success((await auth.require(request)).data, id);
      if (url.pathname === "/v1/admin/licenses") {
        try {
          const rows = await db.all<{
            license_id:string; term:"annual"|"lifetime"; state:"active"|"revoked"; issued_at:string; expires_at:string;
            installation_id:string|null; activated_at:string|null; revoked_at:string|null;
          }>("SELECT license_id, term, state, issued_at, expires_at, installation_id, activated_at, revoked_at FROM licenses ORDER BY created_at DESC LIMIT 250");
          return success(rows.map(row => ({
            licenseId: row.license_id, term: row.term, state: row.state, issuedAt: row.issued_at, expiresAt: row.expires_at,
            installationId: row.installation_id, activatedAt: row.activated_at, revokedAt: row.revoked_at,
          })), id);
        } catch { return genericError(500, "license_list_failed", id); }
      }
    }

    if (url.pathname === "/v1/admin/licenses/issue" && request.method === "POST") {
      const denied = await adminRequired(auth, request, id);
      if (denied) return denied;
      const data = await body(request);
      if (!data) return failure(400, "invalid_request", id);
      try {
        const key = await ensureSigningKey(env);
        const authority = new LicenseAuthority(new D1LicenseStore(db), () => new Date(), key);
        const result = await authority.issue(String(data.term || ""));
        return result.ok ? success(result.data, id) : failure(result.status, result.code, id);
      } catch { return genericError(500, "license_issue_failed", id); }
    }

    if (url.pathname === "/v1/admin/licenses/revoke" && request.method === "POST") {
      const denied = await adminRequired(auth, request, id);
      if (denied) return denied;
      const data = await body(request);
      if (!data) return failure(400, "invalid_request", id);
      try {
        const key = await ensureSigningKey(env);
        const authority = new LicenseAuthority(new D1LicenseStore(db), () => new Date(), key);
        const result = await authority.revoke(String(data.licenseId || ""));
        return result.ok ? success(result.data, id) : failure(result.status, result.code, id);
      } catch { return genericError(500, "license_revoke_failed", id); }
    }

    if (url.pathname === "/v1/licenses/purchase" && request.method === "POST") {
      const purchaseToken = request.headers.get("x-devone-commerce-token") || "";
      if (!env.LICENSE_COMMERCE_TOKEN || purchaseToken !== env.LICENSE_COMMERCE_TOKEN) return failure(401, "purchase_auth_required", id);
      const data = await body(request);
      if (!data) return failure(400, "invalid_request", id);
      try {
        const key = await ensureSigningKey(env);
        const authority = new LicenseAuthority(new D1LicenseStore(db), () => new Date(), key);
        const result = await authority.issue(String(data.term || ""));
        return result.ok ? success(result.data, id) : failure(result.status, result.code, id);
      } catch { return genericError(500, "purchase_issue_failed", id); }
    }

    if (!url.pathname.startsWith("/v1/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return failure(400, "invalid_request", id);

    const data = await body(request);
    if (!data) return failure(400, "invalid_request", id);
    const registry = new InstallationRegistry(new D1InstallationStore(db), { now: () => new Date() });
    let result;
    try {
      if (url.pathname === LICENSE_ROUTES.register) {
        result = await registry.register(data as never);
      } else if (url.pathname === LICENSE_ROUTES.authenticate) {
        result = await registry.authenticate(String(data.installationId || ""), String(data.installationSecret || ""));
      } else if (url.pathname === LICENSE_ROUTES.deactivate) {
        result = await registry.deactivate(String(data.installationId || ""), String(data.installationSecret || ""));
      } else if (url.pathname === LICENSE_ROUTES.deregister) {
        result = await registry.deregister(String(data.installationId || ""), String(data.installationSecret || ""));
      } else if (url.pathname.endsWith("/metadata")) {
        result = await registry.updateMetadata(String(data.installationId || ""), String(data.installationSecret || ""), String(data.domain || ""), String(data.adminEmail || ""));
      } else if (url.pathname === LICENSE_ROUTES.activate || url.pathname === LICENSE_ROUTES.refresh) {
        const proof = String(data.proof || "");
        const timestamp = String(data.timestamp || "");
        const installationId = String(data.installationId || "");
        const limiter = new D1RateLimiter(db);
        if (!(await limiter.allow(url.pathname + ":" + installationId, Date.now()))) return failure(409, "rate_limited", id);
        const proofResult = await registry.verifyProof(installationId, proof, timestamp);
        if (!proofResult.ok) return failure(proofResult.status, proofResult.code, id);
        const key = await ensureSigningKey(env);
        const authority = new LicenseAuthority(new D1LicenseStore(db), () => new Date(), key);
        result = url.pathname === LICENSE_ROUTES.activate ? await authority.activate(String(data.licenseKey || ""), installationId) : await authority.refresh(installationId);
      } else {
        return failure(501, "not_implemented", id);
      }
    } catch {
      return genericError(500, "internal_error", id);
    }
    return result.ok ? success(result.data, id) : failure(result.status, result.code, id);
  },
};
