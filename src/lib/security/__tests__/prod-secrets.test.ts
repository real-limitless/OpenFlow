import { describe, expect, it } from "vitest";
import { buildDatabaseUrl, postgresEndpointFromEnv } from "../database-url";
import { assertProductionSecrets, productionSecretsIssues } from "../prod-secrets";

describe("productionSecretsIssues", () => {
  it("is a no-op outside production", () => {
    expect(
      productionSecretsIssues({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://openflow:openflow@db/openflow",
      }),
    ).toEqual([]);
  });

  it("rejects placeholder credentials key and default db password", () => {
    const issues = productionSecretsIssues({
      NODE_ENV: "production",
      CREDENTIALS_KEY: "replace-me",
      DATABASE_URL: "postgresql://openflow:openflow@db:5432/openflow",
    });
    expect(issues.length).toBe(2);
    expect(issues.join(" ")).toMatch(/CREDENTIALS_KEY/);
    expect(issues.join(" ")).toMatch(/DATABASE_URL/);
  });

  it("accepts a strong key and non-default password", () => {
    expect(
      productionSecretsIssues({
        NODE_ENV: "production",
        CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://openflow:s3cret-unique@db:5432/openflow",
      }),
    ).toEqual([]);
  });

  it("throws a boot error in production", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "production",
        CREDENTIALS_KEY: "",
        DATABASE_URL: "postgresql://openflow:openflow@localhost/openflow",
      }),
    ).toThrow(/Refusing to boot in production/);
  });

  it("rejects a default POSTGRES_PASSWORD even when DATABASE_URL is strong", () => {
    const issues = productionSecretsIssues({
      NODE_ENV: "production",
      CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef",
      POSTGRES_PASSWORD: "openflow",
      DATABASE_URL: "postgresql://openflow:s3cret-unique@db:5432/openflow",
    });
    expect(issues.join(" ")).toMatch(/POSTGRES_PASSWORD/);
  });

  it("accepts a strong DATABASE_URL when POSTGRES_PASSWORD is unset", () => {
    expect(
      productionSecretsIssues({
        NODE_ENV: "production",
        CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://openflow:s3cret-unique@db:5432/openflow",
      }),
    ).toEqual([]);
  });

  it("does not derive the database password from CREDENTIALS_KEY", () => {
    const key = "0123456789abcdef0123456789abcdef";
    const endpoint = postgresEndpointFromEnv(
      {
        NODE_ENV: "development",
        CREDENTIALS_KEY: key,
        POSTGRES_PASSWORD: "another-secret-value",
      },
      { devDefaultPassword: true },
    );
    expect(endpoint.password).toBe("another-secret-value");
    expect(buildDatabaseUrl(endpoint)).not.toContain(key);

    const fallback = postgresEndpointFromEnv(
      { NODE_ENV: "development", CREDENTIALS_KEY: key },
      { devDefaultPassword: true },
    );
    expect(fallback.password).toBe("openflow");
    expect(fallback.password).not.toBe(key);

    const issues = productionSecretsIssues({
      NODE_ENV: "production",
      CREDENTIALS_KEY: key,
      DATABASE_URL: "postgresql://openflow:openflow@db:5432/openflow",
    });
    expect(issues.join(" ")).toMatch(/DATABASE_URL/);
    expect(issues.join(" ")).not.toMatch(new RegExp(key));
  });
});
