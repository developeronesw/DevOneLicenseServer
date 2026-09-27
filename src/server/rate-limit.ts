import type { LicenseDatabase } from "./runtime";

const WINDOW_MS = 60_000;
const LIMIT = 10;

export class D1RateLimiter {
  constructor(private readonly db: LicenseDatabase) {}

  async allow(key: string, nowMs: number): Promise<boolean> {
    const windowStart = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
    await this.db.run(
      `INSERT INTO api_rate_limits (rate_key, window_start, request_count) VALUES (?, ?, 1)
       ON CONFLICT(rate_key) DO UPDATE SET
         request_count = CASE WHEN window_start = ? THEN request_count + 1 ELSE 1 END,
         window_start = CASE WHEN window_start = ? THEN window_start ELSE ? END`,
      key, windowStart, windowStart, windowStart, windowStart,
    );
    const row = await this.db.first<{request_count:number}>(
      "SELECT request_count FROM api_rate_limits WHERE rate_key = ?",
      key,
    );
    return (row?.request_count ?? LIMIT + 1) <= LIMIT;
  }
}
