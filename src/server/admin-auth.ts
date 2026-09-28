import { isValidEmail } from "./contracts";

const ITERATIONS = 210_000;
const SESSION_TTL = 8 * 60 * 60;
const encoder = new TextEncoder();

interface AdminRow {
  admin_id: string;
  username: string;
  email: string;
  password_salt: string;
  password_verifier: string;
  created_at: string;
}
interface AdminDatabase {
  first<T>(query: string, ...params: unknown[]): Promise<T | null>;
  run(query: string, ...params: unknown[]): Promise<{ changes: number }>;
}
interface AdminKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
function b64(bytes: Uint8Array): string { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function fromB64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) view[i] = bytes[i];
  return buffer;
}
async function derivePassword(password: string, salt: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    256,
  );
  return new Uint8Array(bits);
}
function safeEqual(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0; }
function validUsername(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9._-]{3,48}$/.test(value); }
function validPassword(value: unknown): value is string { return typeof value === "string" && value.length >= 12 && value.length <= 256; }
function sessionCookie(token: string): string { return "devone_admin_session=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + SESSION_TTL; }
function clearCookie(): string { return "devone_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"; }
function cookieToken(request: Request): string | null {
  const raw = request.headers.get("cookie") || "";
  const match = raw.match(/(?:^|;\s*)devone_admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function tokenHash(token: string): Promise<string> { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)))); }

export type AdminResult<T> = { ok: true; data: T; cookie?: string } | { ok: false; status: 400 | 401 | 409; code: string; cookie?: string };

export class AdminAuth {
  constructor(private readonly db: AdminDatabase, private readonly kv: AdminKV) {}
  private async createSession(username: string, email: string): Promise<AdminResult<{ username: string; email: string }>> {
    const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await this.kv.put("admin/session/" + await tokenHash(token), JSON.stringify({ username, email }), { expirationTtl: SESSION_TTL });
    return { ok: true, data: { username, email }, cookie: sessionCookie(token) };
  }

  async setup(input: Record<string, unknown>): Promise<AdminResult<{ username: string; email: string }>> {
    const username = String(input.username || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = input.password;
    if (!validUsername(username) || !isValidEmail(email) || !validPassword(password)) return { ok: false, status: 400, code: "invalid_admin_setup" };
    let count: { count: number } | null;
    try {
      count = await this.db.first<{ count: number }>("SELECT COUNT(*) as count FROM admin_users");
    } catch (error) {
      console.error("admin_setup_count_error", error);
      return { ok: false, status: 409, code: "admin_setup_count_failed" };
    }
    if ((count?.count || 0) > 0) return { ok: false, status: 409, code: "admin_already_configured" };

    let salt: Uint8Array;
    let verifier: Uint8Array;
    try {
      salt = crypto.getRandomValues(new Uint8Array(16));
      verifier = await derivePassword(password, toArrayBuffer(salt));
    } catch (error) {
      console.error("admin_setup_crypto_error", error);
      return { ok: false, status: 409, code: "admin_setup_crypto_failed" };
    }
    const now = new Date().toISOString();
    const adminId = crypto.randomUUID();

    let inserted = false;
    try {
      const result = await this.db.run("INSERT INTO admin_users (admin_id, username, email, password_salt, password_verifier, created_at) VALUES (?, ?, ?, ?, ?, ?)", adminId, username, email, b64(salt), b64(verifier), now);
      inserted = result.changes === 1;
    } catch (error) {
      console.error("admin_setup_database_error", error);
      return { ok: false, status: 409, code: "admin_setup_database_failed" };
    }
    if (!inserted) return { ok: false, status: 409, code: "admin_setup_conflict" };

    try {
      return await this.createSession(username, email);
    } catch (error) {
      console.error("admin_setup_session_error", error);
      try {
        await this.db.run("DELETE FROM admin_users WHERE admin_id = ?", adminId);
      } catch (rollbackError) {
        console.error("admin_setup_rollback_error", rollbackError);
      }
      return { ok: false, status: 409, code: "admin_setup_session_failed" };
    }
  }
  async login(username: string, password: string): Promise<AdminResult<{ username: string; email: string }>> {
    const row = await this.db.first<AdminRow>("SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE", username.trim());
    if (!row || !validPassword(password)) return { ok: false, status: 401, code: "invalid_credentials" };
    const candidate = await derivePassword(password, toArrayBuffer(fromB64(row.password_salt)));
    if (!safeEqual(candidate, fromB64(row.password_verifier))) return { ok: false, status: 401, code: "invalid_credentials" };
    try {
      return await this.createSession(row.username, row.email);
    } catch (error) {
      console.error("admin_login_session_error", error);
      return { ok: false, status: 401, code: "admin_session_failed" };
    }
  }
  async require(request: Request): Promise<AdminResult<{ username: string; email: string }>> {
    const token = cookieToken(request);
    if (!token) return { ok: false, status: 401, code: "admin_auth_required" };
    const value = await this.kv.get("admin/session/" + await tokenHash(token));
    if (!value) return { ok: false, status: 401, code: "admin_auth_required" };
    try { return { ok: true, data: JSON.parse(value) as { username: string; email: string } }; }
    catch { return { ok: false, status: 401, code: "admin_auth_required" }; }
  }
  async logout(request: Request): Promise<AdminResult<{ loggedOut: true }>> {
    const token = cookieToken(request);
    if (token) await this.kv.delete("admin/session/" + await tokenHash(token));
    return { ok: true, data: { loggedOut: true }, cookie: clearCookie() };
  }
  async configured(): Promise<boolean> {
    const row = await this.db.first<{ count: number }>("SELECT COUNT(*) as count FROM admin_users");
    return (row?.count || 0) > 0;
  }
}
