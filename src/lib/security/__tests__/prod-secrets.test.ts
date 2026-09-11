import { describe, expect, it } from "vitest";
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
});
