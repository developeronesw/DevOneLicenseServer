export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface LicenseDatabase {
  first<T>(query: string, ...params: unknown[]): Promise<T | null>;
  all<T>(query: string, ...params: unknown[]): Promise<T[]>;
  run(query: string, ...params: unknown[]): Promise<{ changes: number; lastInsertId?: number }>;
  batch(statements: Array<{ query: string; params?: unknown[] }>): Promise<void>;
}

export interface SecretProvider {
  get(name: string): Promise<string | undefined>;
}

export interface LicenseRuntime {
  database: LicenseDatabase;
  cache: KeyValueStore;
  secrets: SecretProvider;
  now(): Date;
  runtimeName: "cloudflare" | "node";
}

export interface RuntimeEnvironment {
  database: LicenseDatabase;
  cache: KeyValueStore;
  secrets: SecretProvider;
}

export function createRuntime(
  runtimeName: LicenseRuntime["runtimeName"],
  environment: RuntimeEnvironment,
): LicenseRuntime {
  return { ...environment, runtimeName, now: () => new Date() };
}
