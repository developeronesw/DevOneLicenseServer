import type { InstallationRecord, RegisterInstallationRequest, RegistrationReceipt } from "./contracts";
import type { LicenseRuntime } from "./runtime";
import { isValidEmail, isValidInstallationId } from "./contracts";

const ITERATIONS = 210_000;
const PROOF_WINDOW_MS = 5 * 60_000;
const encoder = new TextEncoder();

export interface InstallationStore {
  get(installationId: string): Promise<(InstallationRecord & { secretSalt: string; secretVerifier: string }) | null>;
  insert(record: InstallationRecord & { secretSalt: string; secretVerifier: string }): Promise<boolean>;
  update(record: InstallationRecord & { secretSalt: string; secretVerifier: string }): Promise<void>;
}

export type RegistryResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 401 | 409 | 404; code: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveVerifier(secret: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer, iterations: ITERATIONS },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

function canonicalDomain(input: string): string | null {
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/\\.$/, "");
  } catch {
    return null;
  }
}

export class InstallationRegistry {
  constructor(private readonly store: InstallationStore, private readonly runtime: Pick<LicenseRuntime, "now">) {}

  async register(input: RegisterInstallationRequest): Promise<RegistryResult<RegistrationReceipt>> {
    if (!input || typeof input !== "object" || !isValidInstallationId(input.installationId)
      || typeof input.installationSecret !== "string"
      || input.installationSecret.length < 32
      || input.installationSecret.length > 256
      || !isValidEmail(input.adminEmail)
      || typeof input.domain !== "string") {
      return { ok: false, status: 400, code: "invalid_registration" };
    }
    const domain = canonicalDomain(input.domain);
    if (!domain) return { ok: false, status: 400, code: "invalid_registration" };

    const existing = await this.store.get(input.installationId);
    if (existing) return { ok: false, status: 409, code: "registration_conflict" };

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await deriveVerifier(input.installationSecret, salt);
    const now = this.runtime.now().toISOString();
    const record: InstallationRecord & { secretSalt: string; secretVerifier: string } = {
      installationId: input.installationId,
      domain,
      adminEmail: input.adminEmail.trim().toLowerCase(),
      state: "active",
      registeredAt: now,
      lastSeenAt: now,
      deregisteredAt: null,
      licenseId: null,
      secretSalt: toBase64(salt),
      secretVerifier: toBase64(verifier),
    };
    if (!(await this.store.insert(record))) return { ok: false, status: 409, code: "registration_conflict" };
    return { ok: true, data: { installationId: record.installationId, registeredAt: now, serverVersion: "0.2.0" } };
  }

  async authenticate(installationId: string, installationSecret: string): Promise<RegistryResult<{ installationId: string; authenticated: true; expiresAt: string }>> {
    if (!isValidInstallationId(installationId) || typeof installationSecret !== "string") {
      return { ok: false, status: 401, code: "authentication_failed" };
    }
    const record = await this.store.get(installationId);
    if (!record || record.state !== "active") return { ok: false, status: 401, code: "authentication_failed" };
    const candidate = await deriveVerifier(installationSecret, fromBase64(record.secretSalt));
    if (!safeEqual(candidate, fromBase64(record.secretVerifier))) {
      return { ok: false, status: 401, code: "authentication_failed" };
    }
    record.lastSeenAt = this.runtime.now().toISOString();
    await this.store.update(record);
    return { ok: true, data: { installationId, authenticated: true, expiresAt: new Date(this.runtime.now().getTime() + 5 * 60_000).toISOString() } };
  }

  async verifyProof(installationId: string, proof: string, timestamp: string): Promise<RegistryResult<{ installationId: string; authenticated: true }>> {
    if (!isValidInstallationId(installationId) || typeof proof !== "string" || typeof timestamp !== "string") return { ok: false, status: 401, code: "proof_invalid" };
    const parsed = Date.parse(timestamp);
    const now = this.runtime.now().getTime();
    if (!Number.isFinite(parsed) || Math.abs(now - parsed) > PROOF_WINDOW_MS) return { ok: false, status: 401, code: "proof_expired" };
    const auth = await this.authenticate(installationId, proof);
    return auth.ok ? { ok: true, data: { installationId, authenticated: true } } : { ok: false, status: 401, code: "proof_invalid" };
  }

  async updateMetadata(installationId: string, installationSecret: string, domainInput: string, adminEmail: string): Promise<RegistryResult<{ installationId: string; domain: string; adminEmail: string }>> {
    const auth = await this.authenticate(installationId, installationSecret);
    if (!auth.ok) return auth;
    const domain = canonicalDomain(domainInput);
    if (!domain || !isValidEmail(adminEmail)) return { ok: false, status: 400, code: "invalid_metadata" };
    const record = await this.store.get(installationId);
    if (!record || record.state !== "active") return { ok: false, status: 404, code: "installation_not_found" };
    record.domain = domain;
    record.adminEmail = adminEmail.trim().toLowerCase();
    await this.store.update(record);
    return { ok: true, data: { installationId, domain, adminEmail: record.adminEmail } };
  }

  async deactivate(installationId: string, installationSecret: string): Promise<RegistryResult<{ installationId: string; state: "deactivated" }>> {
    const auth = await this.authenticate(installationId, installationSecret);
    if (!auth.ok) return auth;
    const record = await this.store.get(installationId);
    if (!record) return { ok: false, status: 404, code: "installation_not_found" };
    record.state = "deactivated";
    await this.store.update(record);
    return { ok: true, data: { installationId, state: "deactivated" } };
  }

  async deregister(installationId: string, installationSecret: string): Promise<RegistryResult<{ installationId: string; state: "deregistered" }>> {
    const auth = await this.authenticate(installationId, installationSecret);
    if (!auth.ok) return auth;
    const record = await this.store.get(installationId);
    if (!record) return { ok: false, status: 404, code: "installation_not_found" };
    record.state = "deregistered";
    record.deregisteredAt = this.runtime.now().toISOString();
    record.secretSalt = "";
    record.secretVerifier = "";
    await this.store.update(record);
    return { ok: true, data: { installationId, state: "deregistered" } };
  }
}
