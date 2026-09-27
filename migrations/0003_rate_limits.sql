CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);
