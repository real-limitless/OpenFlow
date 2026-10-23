import { databasePassword, isWeakDatabasePassword } from "./database-url";
import { isWeakRedisPassword, redisPasswordFromUrl } from "./redis-url";

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(value.trim());
}

/** Production-only boot checks. Empty in non-production. */
export function productionSecretsIssues(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  const key = env.CREDENTIALS_KEY;
  if (isPlaceholderSecret(key) || (key != null && key.length < 16)) {
    issues.push("CREDENTIALS_KEY is missing, a placeholder, or shorter than 16 characters");
  }

  // Dedicated DB password. Absence is fine when DATABASE_URL already carries a strong
  // password (Helm). A present default is not. Never filled from CREDENTIALS_KEY.
  if (
    env.POSTGRES_PASSWORD != null &&
    env.POSTGRES_PASSWORD !== "" &&
    isWeakDatabasePassword(env.POSTGRES_PASSWORD)
  ) {
    issues.push(
      "POSTGRES_PASSWORD is missing or still a default. Set a dedicated password; do not reuse CREDENTIALS_KEY.",
    );
  }

  const pass = databasePassword(env.DATABASE_URL);
  if (pass === null) {
    issues.push("DATABASE_URL is invalid");
  } else if (isWeakDatabasePassword(pass)) {
    issues.push(
      "DATABASE_URL uses a missing or placeholder database password. Set POSTGRES_PASSWORD and build DATABASE_URL from it; do not reuse CREDENTIALS_KEY.",
    );
  }

  if (
    env.REDIS_PASSWORD != null &&
    env.REDIS_PASSWORD !== "" &&
    isWeakRedisPassword(env.REDIS_PASSWORD)
  ) {
    issues.push("REDIS_PASSWORD is missing or still a default. Set a dedicated password.");
  }
  if (env.REDIS_URL != null && env.REDIS_URL !== "") {
    const redisPass = redisPasswordFromUrl(env.REDIS_URL);
    if (redisPass === null) {
      issues.push("REDIS_URL is invalid");
    } else if (isWeakRedisPassword(redisPass)) {
      issues.push(
        "REDIS_URL has no password or a default password. Set REDIS_PASSWORD and build REDIS_URL from it.",
      );
    }
  }
  return issues;
}

export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const issues = productionSecretsIssues(env);
  if (issues.length === 0) return;
  throw new Error(`Refusing to boot in production:\n${issues.map((i) => `- ${i}`).join("\n")}`);
}
