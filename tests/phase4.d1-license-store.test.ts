import { strict as assert } from "node:assert";
import { test } from "node:test";
import { D1LicenseStore } from "../src/server/d1-license-store";
import type { LicenseDatabase } from "../src/server/runtime";
import type { LicenseRecord } from "../src/server/license-authority";

class FakeDb implements LicenseDatabase {
  rows = new Map<string, LicenseRecord>();
  async first<T>(query: string, ...params: unknown[]): Promise<T | null> {
    const value = String(params[0] ?? "");
    if (query.includes("key_hash")) {
      return ([...this.rows.values()].find(r => r.keyHash === value) ?? null) as T | null;
    }
    return (this.rows.get(value) ?? null) as T | null;
  }
  async all<T>(): Promise<T[]> { return []; }
  async run(query: string, ...params: unknown[]): Promise<{ changes: number; lastInsertId?: number }> {
    if (query.startsWith("INSERT")) {
      const r: LicenseRecord = {
        licenseId: String(params[0]),
        keyHash: String(params[1]),
        term: params[2] as LicenseRecord["term"],
        state: params[3] as LicenseRecord["state"],
        issuedAt: String(params[4]),
        expiresAt: String(params[5]),
        installationId: params[6] as string | null,
        activatedAt: params[7] as string | null,
        revokedAt: params[8] as string | null,
      };
      if (this.rows.has(r.licenseId)) return { changes: 0 };
      this.rows.set(r.licenseId, structuredClone(r));
      return { changes: 1 };
    }
    if (query.startsWith("UPDATE licenses SET installation_id")) {
      const r = this.rows.get(String(params[2]));
      if (!r || r.state !== "active" || r.installationId !== null || Date.parse(r.expiresAt) <= Date.parse(String(params[3]))) return { changes: 0 };
      r.installationId = String(params[0]); r.activatedAt = String(params[1]); return { changes: 1 };
    }
    if (query.startsWith("UPDATE licenses SET state")) {
      const r = this.rows.get(String(params[1]));
      if (!r || r.state !== "active") return { changes: 0 };
      r.state = "revoked"; r.revokedAt = String(params[0]); return { changes: 1 };
    }
    throw new Error("Unexpected query");
  }
  async batch(): Promise<void> {}
}

const record: LicenseRecord = {
  licenseId: "00000000-0000-0000-0000-000000000001",
  keyHash: "hash",
  term: "annual",
  state: "active",
  issuedAt: "2026-09-27T12:00:00.000Z",
  expiresAt: "2027-09-27T12:00:00.000Z",
  installationId: null,
  activatedAt: null,
  revokedAt: null,
};

test("D1 license adapter preserves the authority storage contract", async () => {
  const db = new FakeDb();
  const store = new D1LicenseStore(db);
  assert.equal(await store.insert(record), true);
  assert.equal((await store.findByKeyHash("hash"))?.licenseId, record.licenseId);
  assert.equal(await store.claimActivation(record.licenseId, "inst_0123456789abcdef", "2026-09-27T13:00:00.000Z"), true);
  assert.equal(await store.claimActivation(record.licenseId, "inst_abcdef0123456789", "2026-09-27T13:01:00.000Z"), false);
  assert.equal(await store.revoke(record.licenseId, "2026-09-27T14:00:00.000Z"), true);
  assert.equal(await store.revoke(record.licenseId, "2026-09-27T15:00:00.000Z"), false);
});
