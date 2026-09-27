import type { InstallationRecord } from "./contracts";
import type { InstallationStore } from "./registry";
import type { LicenseDatabase } from "./runtime";

type DbRow = {
  installation_id: string;
  domain: string;
  admin_email: string;
  state: InstallationRecord["state"];
  registered_at: string;
  last_seen_at: string;
  deregistered_at: string | null;
  license_id: string | null;
  secret_salt: string;
  secret_verifier: string;
};

function mapRow(row: DbRow): InstallationRecord & { secretSalt: string; secretVerifier: string } {
  return {
    installationId: row.installation_id,
    domain: row.domain,
    adminEmail: row.admin_email,
    state: row.state,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    deregisteredAt: row.deregistered_at,
    licenseId: row.license_id,
    secretSalt: row.secret_salt,
    secretVerifier: row.secret_verifier,
  };
}

export class D1InstallationStore implements InstallationStore {
  constructor(private readonly db: LicenseDatabase) {}

  async get(id: string) {
    const row = await this.db.first<DbRow>(
      "SELECT * FROM installations WHERE installation_id = ?",
      id,
    );
    return row ? mapRow(row) : null;
  }

  async insert(record: InstallationRecord & { secretSalt: string; secretVerifier: string }): Promise<boolean> {
    const result = await this.db.run(
      "INSERT OR IGNORE INTO installations (installation_id, domain, admin_email, state, registered_at, last_seen_at, deregistered_at, license_id, secret_salt, secret_verifier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      record.installationId, record.domain, record.adminEmail, record.state,
      record.registeredAt, record.lastSeenAt, record.deregisteredAt, record.licenseId,
      record.secretSalt, record.secretVerifier,
    );
    return result.changes === 1;
  }

  async update(record: InstallationRecord & { secretSalt: string; secretVerifier: string }): Promise<void> {
    await this.db.run(
      "UPDATE installations SET domain = ?, admin_email = ?, state = ?, last_seen_at = ?, deregistered_at = ?, license_id = ?, secret_salt = ?, secret_verifier = ? WHERE installation_id = ?",
      record.domain, record.adminEmail, record.state, record.lastSeenAt,
      record.deregisteredAt, record.licenseId, record.secretSalt, record.secretVerifier,
      record.installationId,
    );
  }
}
