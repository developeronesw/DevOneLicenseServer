import type { LicenseDatabase } from "./runtime";
import type { LicenseAuthorityStore, LicenseRecord } from "./license-authority";

type DbRow = {
  license_id: string;
  key_hash: string;
  edition: "network";
  term: LicenseRecord["term"];
  state: LicenseRecord["state"];
  issued_at: string;
  expires_at: string;
  installation_id: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function mapRow(row: DbRow): LicenseRecord {
  return {
    licenseId: row.license_id,
    keyHash: row.key_hash,
    term: row.term,
    state: row.state,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    installationId: row.installation_id,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
  };
}

export class D1LicenseStore implements LicenseAuthorityStore {
  constructor(private readonly db: LicenseDatabase) {}

  async insert(record: LicenseRecord): Promise<boolean> {
    const result = await this.db.run(
      "INSERT OR IGNORE INTO licenses (license_id, key_hash, edition, term, state, issued_at, expires_at, installation_id, activated_at, revoked_at, created_at) VALUES (?, ?, 'network', ?, ?, ?, ?, ?, ?, ?, ?)",
      record.licenseId,
      record.keyHash,
      record.term,
      record.state,
      record.issuedAt,
      record.expiresAt,
      record.installationId,
      record.activatedAt,
      record.revokedAt,
      record.issuedAt,
    );
    return result.changes === 1;
  }

  async findByKeyHash(hash: string): Promise<LicenseRecord | null> {
    const row = await this.db.first<DbRow>(
      "SELECT * FROM licenses WHERE key_hash = ?",
      hash,
    );
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<LicenseRecord | null> {
    const row = await this.db.first<DbRow>(
      "SELECT * FROM licenses WHERE license_id = ?",
      id,
    );
    return row ? mapRow(row) : null;
  }

  async claimActivation(id: string, installationId: string, at: string): Promise<boolean> {
    const result = await this.db.run(
      "UPDATE licenses SET installation_id = ?, activated_at = ? WHERE license_id = ? AND state = 'active' AND installation_id IS NULL AND expires_at > ?",
      installationId,
      at,
      id,
      at,
    );
    return result.changes === 1;
  }

  async findByInstallationId(installationId: string): Promise<LicenseRecord | null> {
    const row = await this.db.first<DbRow>("SELECT * FROM licenses WHERE installation_id = ?", installationId);
    return row ? mapRow(row) : null;
  }

  async revoke(id: string, at: string): Promise<boolean> {
    const result = await this.db.run(
      "UPDATE licenses SET state = 'revoked', revoked_at = ? WHERE license_id = ? AND state = 'active'",
      at,
      id,
    );
    return result.changes === 1;
  }
}
