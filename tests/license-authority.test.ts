import test from "node:test";
import assert from "node:assert/strict";
import { LicenseAuthority, type LicenseRecord, type LicenseAuthorityStore } from "../src/server/license-authority";

class Store implements LicenseAuthorityStore {
  records = new Map<string, LicenseRecord>();
  async insert(record: LicenseRecord) { this.records.set(record.licenseId, record); return true; }
  async findByKeyHash(hash: string) { return [...this.records.values()].find(r => r.keyHash === hash) ?? null; }
  async findById(id: string) { return this.records.get(id) ?? null; }
  async findByInstallationId(id: string) { return [...this.records.values()].find(r => r.installationId === id) ?? null; }
  async claimActivation(id: string, installationId: string, at: string) { const r=this.records.get(id); if(!r||r.installationId||r.state!=="active"||r.expiresAt<=at)return false; r.installationId=installationId;r.activatedAt=at;return true; }
  async revoke(id: string, at: string) { const r=this.records.get(id); if(!r||r.state==="revoked")return false; r.state="revoked";r.revokedAt=at;return true; }
}

const signingKey = await crypto.subtle.generateKey({name:"Ed25519"}, true, ["sign","verify"]) as CryptoKeyPair;
const fixedNow = new Date("2026-09-27T00:00:00.000Z");
const authority = () => new LicenseAuthority(new Store(), () => new Date(fixedNow), signingKey.privateKey);

test("issues an annual key and returns cleartext only at issuance", async () => {
  const a=authority(); const result=await a.issue("annual");
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.match(result.data.licenseKey,/^D1N-[A-Za-z0-9_-]{40,60}$/);
  assert.equal(Date.parse(result.data.expiresAt),Date.parse("2027-09-27T00:00:00.000Z"));
});

test("issues a lifetime key with the far-future expiry", async () => {
  const a=authority(); const result=await a.issue("lifetime");
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(result.data.expiresAt,"9999-12-31T23:59:59.999Z");
});
