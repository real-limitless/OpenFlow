import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildRedisUrl, isWeakRedisPassword, redisPasswordFromUrl } from "../redis-url";
import { productionSecretsIssues } from "../prod-secrets";

describe("buildRedisUrl", () => {
  it("percent-encodes the password and leaves no weak default", () => {
    expect(buildRedisUrl({ password: "p@ss:word", host: "redis", port: "6379" })).toBe(
      "redis://:p%40ss%3Aword@redis:6379",
    );
    expect(isWeakRedisPassword("")).toBe(true);
    expect(isWeakRedisPassword("redis")).toBe(true);
    expect(isWeakRedisPassword("openflow")).toBe(true);
    expect(isWeakRedisPassword("c8f1e0a9b7d64e21aa0099ff")).toBe(false);
    expect(redisPasswordFromUrl("redis://:p%40ss%3Aword@redis:6379")).toBe("p@ss:word");
    expect(redisPasswordFromUrl("redis://redis:6379")).toBe("");
  });
});

describe("production redis password", () => {
  const key = "0123456789abcdef0123456789abcdef";
  const db = "postgresql://openflow:s3cret-unique@db:5432/openflow";

  it("rejects a passwordless REDIS_URL in production", () => {
    const issues = productionSecretsIssues({
      NODE_ENV: "production",
      CREDENTIALS_KEY: key,
      DATABASE_URL: db,
      REDIS_URL: "redis://redis:6379",
    });
    expect(issues.join(" ")).toMatch(/REDIS_URL/);
  });

  it("rejects a default REDIS_PASSWORD in production", () => {
    const issues = productionSecretsIssues({
      NODE_ENV: "production",
      CREDENTIALS_KEY: key,
      DATABASE_URL: db,
      REDIS_PASSWORD: "redis",
      REDIS_URL: "redis://:c8f1e0a9b7d64e21aa0099ff@redis:6379",
    });
    expect(issues.join(" ")).toMatch(/REDIS_PASSWORD/);
  });

  it("accepts a dedicated REDIS_PASSWORD", () => {
    expect(
      productionSecretsIssues({
        NODE_ENV: "production",
        CREDENTIALS_KEY: key,
        DATABASE_URL: db,
        REDIS_PASSWORD: "c8f1e0a9b7d64e21aa0099ff",
        REDIS_URL: "redis://:c8f1e0a9b7d64e21aa0099ff@redis:6379",
      }),
    ).toEqual([]);
  });
});

describe("openflow_prepare_redis_url", () => {
  function run(env: Record<string, string>): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(
        "sh",
        [
          "-c",
          `
            set -e
            . ./scripts/lib/build-database-url.sh
            openflow_prepare_redis_url
            printf '%s' "$REDIS_URL"
          `,
        ],
        { encoding: "utf8", env: { ...process.env, ...env } },
      );
      return { status: 0, stdout, stderr: "" };
    } catch (err) {
      const error = err as { status?: number; stdout?: string; stderr?: string };
      return {
        status: error.status ?? 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
      };
    }
  }

  it("encodes REDIS_PASSWORD and does not invent a default", () => {
    const result = run({
      OPENFLOW_BUILD_REDIS_URL: "1",
      NODE_ENV: "development",
      REDIS_PASSWORD: "p@ss:word",
      REDIS_HOST: "redis",
      REDIS_PORT: "6379",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("redis://:p%40ss%3Aword@redis:6379");
  });

  it("refuses to boot when REDIS_PASSWORD is unset", () => {
    const result = run({
      OPENFLOW_BUILD_REDIS_URL: "1",
      NODE_ENV: "development",
      REDIS_PASSWORD: "",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/REDIS_PASSWORD/);
  });

  it("refuses a default password in production", () => {
    const result = run({
      OPENFLOW_BUILD_REDIS_URL: "1",
      NODE_ENV: "production",
      REDIS_PASSWORD: "redis",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/REDIS_PASSWORD/);
  });
});
