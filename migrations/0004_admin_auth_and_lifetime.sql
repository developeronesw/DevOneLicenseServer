PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
  admin_id TEXT PRIMARY KEY NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_salt TEXT NOT NULL,
  password_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

CREATE TABLE IF NOT EXISTS licenses_v2 (
  license_id TEXT PRIMARY KEY NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  edition TEXT NOT NULL CHECK (edition = 'network'),
  term TEXT NOT NULL CHECK (term IN ('annual', 'lifetime')),
  state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  installation_id TEXT,
  activated_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO licenses_v2
  (license_id,key_hash,edition,term,state,issued_at,expires_at,installation_id,activated_at,revoked_at,created_at)
SELECT
  license_id,key_hash,edition,
  CASE WHEN term = '99-year' THEN 'lifetime' ELSE term END,
  state,issued_at,
  CASE WHEN term = '99-year' THEN '9999-12-31T23:59:59.999Z' ELSE expires_at END,
  installation_id,activated_at,revoked_at,created_at
FROM licenses;

DROP TABLE licenses;
ALTER TABLE licenses_v2 RENAME TO licenses;

CREATE INDEX IF NOT EXISTS idx_licenses_installation ON licenses(installation_id);
CREATE INDEX IF NOT EXISTS idx_licenses_state_expiry ON licenses(state, expires_at);
