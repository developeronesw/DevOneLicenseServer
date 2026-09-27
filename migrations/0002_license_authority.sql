PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS licenses (
  license_id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  edition TEXT NOT NULL CHECK (edition = 'network'),
  term TEXT NOT NULL CHECK (term IN ('annual', '99-year')),
  state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  installation_id TEXT,
  activated_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_installation ON licenses(installation_id);
CREATE INDEX IF NOT EXISTS idx_licenses_state_expiry ON licenses(state, expires_at);
