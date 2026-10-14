import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildDatabaseUrl, isWeakDatabasePassword, postgresEndpointFromEnv } from "../database-url";

describe("buildDatabaseUrl", () => {
  it("percent-encodes the user and password", () => {
    const url = buildDatabaseUrl({
      user: "open flow",
      password: "p@ss:word",
      database: "openflow",
      host: "db",
      port: "5432",
    });
    expect(url).toBe("postgresql://open%20flow:p%40ss%3Aword@db:5432/openflow");
  });

  it("uses the dev default only outside production and never CREDENTIALS_KEY", () => {
    const key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const dev = postgresEndpointFromEnv(
      { NODE_ENV: "development", CREDENTIALS_KEY: key },
      { devDefaultPassword: true },
    );
    expect(dev.password).toBe("openflow");
    const prod = postgresEndpointFromEnv(
      { NODE_ENV: "production", CREDENTIALS_KEY: key },
      { devDefaultPassword: true },
    );
    expect(prod.password).toBe("");
  });

  it("treats default and placeholder passwords as weak", () => {
    for (const value of ["", "  ", "openflow", "Postgres", "change-me-set-postgres-password"]) {
      expect(isWeakDatabasePassword(value)).toBe(true);
    }
    expect(isWeakDatabasePassword("c8f1e0a9b7d64e21")).toBe(false);
  });
});

describe("openflow_prepare_database_url", () => {
  function run(env: Record<string, string>): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(
        "sh",
        [
          "-c",
          `
            set -e
            . ./scripts/lib/build-database-url.sh
            openflow_prepare_database_url
            printf '%s' "$DATABASE_URL"
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

  it("builds an encoded URL and ignores CREDENTIALS_KEY", () => {
    const key = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const result = run({
      OPENFLOW_BUILD_DATABASE_URL: "1",
      NODE_ENV: "development",
      POSTGRES_USER: "openflow",
      POSTGRES_PASSWORD: "p@ss:word",
      POSTGRES_DB: "openflow",
      POSTGRES_HOST: "db",
      POSTGRES_PORT: "5432",
      CREDENTIALS_KEY: key,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("postgresql://openflow:p%40ss%3Aword@db:5432/openflow");
    expect(result.stdout).not.toContain(key);
  });

  it("refuses the dev password in production", () => {
    const result = run({
      OPENFLOW_BUILD_DATABASE_URL: "1",
      NODE_ENV: "production",
      POSTGRES_PASSWORD: "openflow",
      POSTGRES_HOST: "db",
      CREDENTIALS_KEY: "cccccccccccccccccccccccccccccccc",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/POSTGRES_PASSWORD/);
    expect(result.stderr).not.toMatch(/CREDENTIALS_KEY=/);
  });

  it("accepts a strong password in production", () => {
    const result = run({
      OPENFLOW_BUILD_DATABASE_URL: "1",
      NODE_ENV: "production",
      POSTGRES_PASSWORD: "c8f1e0a9b7d64e21aa0099ff",
      POSTGRES_HOST: "db",
      CREDENTIALS_KEY: "dddddddddddddddddddddddddddddddd",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("c8f1e0a9b7d64e21aa0099ff");
  });

  it("allows a strong DATABASE_URL without POSTGRES_PASSWORD", () => {
    const result = run({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://openflow:c8f1e0a9b7d64e21@db:5432/openflow",
      CREDENTIALS_KEY: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    });
    expect(result.status).toBe(0);
  });
});
