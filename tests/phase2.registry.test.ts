import { strict as assert } from "node:assert";
import { test } from "node:test";
import { InstallationRegistry, type InstallationStore } from "../src/server/registry";
import type { InstallationRecord } from "../src/server/contracts";

type Stored = InstallationRecord & { secretSalt: string; secretVerifier: string };
class MemoryStore implements InstallationStore {
  rows = new Map<string, Stored>();
  async get(id: string) { return this.rows.get(id) ?? null; }
  async insert(row: Stored) { if (this.rows.has(row.installationId)) return false; this.rows.set(row.installationId, structuredClone(row)); return true; }
  async update(row: Stored) { this.rows.set(row.installationId, structuredClone(row)); }
}
const fixedNow = { now: () => new Date("2026-09-27T12:00:00.000Z") };
const valid = { installationId: "inst_0123456789abcdef", installationSecret: "a".repeat(48), domain: "https://Music.Example.com/path", adminEmail: "ADMIN@EXAMPLE.COM" };

test("registers normalized metadata and stores only a salted verifier", async () => {
  const store = new MemoryStore();
  const registry = new InstallationRegistry(store, fixedNow);
  const result = await registry.register(valid);
  assert.equal(result.ok, true);
  const row = store.rows.get(valid.installationId)!;
  assert.equal(row.domain, "music.example.com");
  assert.equal(row.adminEmail, "admin@example.com");
  assert.notEqual(row.secretVerifier, valid.installationSecret);
  assert.equal(row.secretSalt.length > 0, true);
  assert.equal(row.state, "active");
});

test("rejects duplicate, weak secret, malformed email, and invalid domain", async () => {
  const store = new MemoryStore();
  const registry = new InstallationRegistry(store, fixedNow);
  assert.equal((await registry.register(valid)).ok, true);
  assert.equal((await registry.register(valid)).ok, false);
  assert.equal((await registry.register({ ...valid, installationId: "inst_abcdefghijklmno2", installationSecret: "weak" })).ok, false);
  assert.equal((await registry.register({ ...valid, installationId: "inst_abcdefghijklmno3", adminEmail: "bad" })).ok, false);
  assert.equal((await registry.register({ ...valid, installationId: "inst_abcdefghijklmno4", domain: "javascript:alert(1)" })).ok, false);
});

test("authenticates only correct secret and refreshes last-seen", async () => {
  const store = new MemoryStore();
  const registry = new InstallationRegistry(store, fixedNow);
  await registry.register(valid);
  assert.equal((await registry.authenticate(valid.installationId, "wrong secret")).ok, false);
  const auth = await registry.authenticate(valid.installationId, valid.installationSecret);
  assert.equal(auth.ok, true);
  assert.equal(store.rows.get(valid.installationId)!.lastSeenAt, fixedNow.now().toISOString());
});

test("metadata update normalizes domain; deactivation blocks future authentication", async () => {
  const store = new MemoryStore();
  const registry = new InstallationRegistry(store, fixedNow);
  await registry.register(valid);
  const changed = await registry.updateMetadata(valid.installationId, valid.installationSecret, "https://new.example.org", "ops@example.org");
  assert.equal(changed.ok, true);
  assert.equal(store.rows.get(valid.installationId)!.domain, "new.example.org");
  assert.equal((await registry.deactivate(valid.installationId, valid.installationSecret)).ok, true);
  assert.equal((await registry.authenticate(valid.installationId, valid.installationSecret)).ok, false);
});

test("deregistration disables credentials and records lifecycle timestamp", async () => {
  const store = new MemoryStore();
  const registry = new InstallationRegistry(store, fixedNow);
  await registry.register(valid);
  const result = await registry.deregister(valid.installationId, valid.installationSecret);
  assert.equal(result.ok, true);
  const row = store.rows.get(valid.installationId)!;
  assert.equal(row.state, "deregistered");
  assert.equal(row.secretVerifier, "");
  assert.equal(row.deregisteredAt, fixedNow.now().toISOString());
});
