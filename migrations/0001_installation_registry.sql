PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installations (
  installation_id TEXT PRIMARY KEY NOT NULL,
  domain TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'deactivated', 'deregistered', 'recovery')),
  registered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deregistered_at TEXT,
  license_id TEXT,
  secret_salt TEXT NOT NULL,
  secret_verifier TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installations_state ON installations(state);
CREATE INDEX IF NOT EXISTS idx_installations_domain ON installations(domain);
