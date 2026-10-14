/** Dev-only Postgres password. Production must not use this. */
export const DEV_DATABASE_PASSWORD = "openflow";

const WEAK_DATABASE_PASSWORDS = new Set([
  "",
  "openflow",
  "postgres",
  "password",
  "secret",
  "changeme",
  "change-me",
  "replace-me",
  "replace-with",
]);

export function isWeakDatabasePassword(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (WEAK_DATABASE_PASSWORDS.has(trimmed.toLowerCase())) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(trimmed);
}

export type PostgresEndpoint = {
  user: string;
  password: string;
  database: string;
  host: string;
  port: string;
};

/**
 * Endpoint parts for compose / local dev.
 * Password comes only from POSTGRES_PASSWORD (or the dev default). Never CREDENTIALS_KEY.
 */
export function postgresEndpointFromEnv(
  env: NodeJS.ProcessEnv,
  opts?: { devDefaultPassword?: boolean },
): PostgresEndpoint {
  const user = (env.POSTGRES_USER ?? "").trim() || "openflow";
  const database = (env.POSTGRES_DB ?? "").trim() || "openflow";
  const host = (env.POSTGRES_HOST ?? "").trim() || "db";
  const port = (env.POSTGRES_PORT ?? "").trim() || "5432";
  let password = env.POSTGRES_PASSWORD ?? "";
  const allowDevDefault = opts?.devDefaultPassword === true && env.NODE_ENV !== "production";
  if (!password && allowDevDefault) password = DEV_DATABASE_PASSWORD;
  return { user, password, database, host, port };
}

export function buildDatabaseUrl(endpoint: PostgresEndpoint): string {
  return `postgresql://${encodeURIComponent(endpoint.user)}:${encodeURIComponent(endpoint.password)}@${endpoint.host}:${endpoint.port}/${encodeURIComponent(endpoint.database)}`;
}

export function databasePassword(url: string | undefined): string | null {
  if (!url) return "";
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return null;
  }
}
