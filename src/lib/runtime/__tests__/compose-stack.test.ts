import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function serviceBlock(src: string, name: string): string {
  const lines = src.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) throw new Error(`missing service ${name}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-zA-Z0-9-]+:/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

describe("single compose worker", () => {
  const compose = read("docker-compose.yml");
  const worker = serviceBlock(compose, "worker");

  it("starts with the default project and does not wait on api", () => {
    expect(worker).toMatch(/restart:\s*unless-stopped/);
    expect(worker).not.toMatch(/profiles:/);
    expect(worker).toMatch(/OPENFLOW_ROLE:\s*worker/);
    expect(worker).toMatch(/RUN_WORKER:\s*"true"/);
    expect(worker).toMatch(/db:\n\s+condition:\s*service_healthy/);
    expect(worker).toMatch(/redis:\n\s+condition:\s*service_healthy/);
    expect(worker).not.toMatch(/^\s+api:/m);
  });

  it("builds DATABASE_URL from POSTGRES_* and keeps the dev password off production mode", () => {
    expect(compose).not.toContain("postgresql://openflow:openflow@");
    expect(compose).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-openflow}");
    expect(compose).toContain('OPENFLOW_BUILD_DATABASE_URL: "1"');
    expect(compose).toContain("NODE_ENV: development");
    expect(compose).toContain("AUTH_DISABLED: ${AUTH_DISABLED:-false}");
    expect(compose).toContain("OPENFLOW_HOT_NODES: ${OPENFLOW_HOT_NODES:-false}");
    expect(compose).toContain("OPENFLOW_OPEN_REGISTER: ${OPENFLOW_OPEN_REGISTER:-false}");
    expect(compose).toContain("OPENFLOW_ALLOW_FIRST_OWNER: ${OPENFLOW_ALLOW_FIRST_OWNER:-false}");
    expect(compose).toContain("REDIS_PASSWORD: ${REDIS_PASSWORD:?Set REDIS_PASSWORD}");
    expect(compose).toContain("internal: true");
    expect(compose).not.toMatch(/^\s+-\s+"127\.0\.0\.1:/m);
    expect(worker).toContain("*postgres-app");
    expect(worker).toContain("image: openflow:local");
    expect(worker).not.toMatch(/^\s+build:/m);
  });
});

describe("production compose password", () => {
  const prod = read("docker-compose.prod.yml");

  it("requires POSTGRES_PASSWORD and does not take DATABASE_URL from the host", () => {
    expect(prod).toContain("POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD to a non-default value");
    expect(prod).not.toContain("${DATABASE_URL");
    expect(prod).toContain("NODE_ENV: production");
    expect(prod).toMatch(/openflow\|postgres\|password/);
    expect(prod).not.toMatch(/POSTGRES_PASSWORD:.*CREDENTIALS_KEY/);
    expect(prod).toContain("REDIS_PASSWORD:?Set REDIS_PASSWORD");
    expect(prod).toContain("Refusing to start Redis");
    expect(prod).not.toContain("127.0.0.1");
  });
});

describe("deploy compose", () => {
  const deploy = read("deploy/docker-compose.yml");
  const api = serviceBlock(deploy, "api");

  it("does not publish the API and requires a Redis password", () => {
    expect(api).not.toMatch(/^\s+ports:/m);
    expect(api).toContain("AUTH_DISABLED: ${AUTH_DISABLED:-false}");
    expect(api).toContain("OPENFLOW_OPEN_REGISTER: ${OPENFLOW_OPEN_REGISTER:-false}");
    expect(api).toContain("OPENFLOW_ALLOW_FIRST_OWNER: ${OPENFLOW_ALLOW_FIRST_OWNER:-false}");
    expect(api).toContain("OPENFLOW_HOT_NODES: ${OPENFLOW_HOT_NODES:-false}");
    expect(deploy).toContain("REDIS_PASSWORD: ${REDIS_PASSWORD:?Set REDIS_PASSWORD}");
    expect(deploy).toContain("internal: true");
    expect(read("deploy/docker-compose.local-ports.yml")).toContain("127.0.0.1:");
    expect(read("docker-compose.debug-ports.yml")).toContain("127.0.0.1:15432:5432");
  });
});

describe("entrypoint password source", () => {
  it("builds the URL in a helper that never reads CREDENTIALS_KEY", () => {
    const helper = read("scripts/lib/build-database-url.sh");
    const entry = read("scripts/docker-entrypoint.sh");
    expect(helper).not.toContain("process.env.CREDENTIALS_KEY");
    expect(helper).not.toContain("${CREDENTIALS_KEY");
    expect(helper).not.toContain("$CREDENTIALS_KEY");
    expect(helper).toContain("POSTGRES_PASSWORD");
    expect(entry).toContain("openflow_prepare_database_url");
    expect(read(".env.example")).toContain("POSTGRES_PASSWORD");
    expect(read("docs/install.md")).toContain("POSTGRES_PASSWORD");
  });
});
