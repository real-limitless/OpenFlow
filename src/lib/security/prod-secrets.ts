const WEAK_PASSWORDS = new Set([
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

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(value.trim());
}

function databasePassword(url: string | undefined): string | null {
  if (!url) return "";
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return null;
  }
}

/** Production-only boot checks. Empty in non-production. */
export function productionSecretsIssues(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  const key = env.CREDENTIALS_KEY;
  if (isPlaceholderSecret(key) || (key != null && key.length < 16)) {
    issues.push("CREDENTIALS_KEY is missing, a placeholder, or shorter than 16 characters");
  }
  const pass = databasePassword(env.DATABASE_URL);
  if (pass === null) {
    issues.push("DATABASE_URL is invalid");
  } else if (WEAK_PASSWORDS.has(pass.toLowerCase()) || isPlaceholderSecret(pass)) {
    issues.push("DATABASE_URL uses a missing or placeholder database password");
  }
  return issues;
}

export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const issues = productionSecretsIssues(env);
  if (issues.length === 0) return;
  throw new Error(`Refusing to boot in production:\n${issues.map((i) => `- ${i}`).join("\n")}`);
}
