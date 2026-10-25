import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../prisma/migrations");

function sql(name: string): string {
  return readFileSync(resolve(root, name), "utf8");
}

describe("audit log append-only migration", () => {
  const up = sql("20261023120000_audit_log_append_only/migration.sql");
  const down = sql("20261023120000_audit_log_append_only/down.sql");

  it("raises on update, delete, and truncate", () => {
    expect(up).toMatch(/BEFORE UPDATE OR DELETE ON audit_logs/);
    expect(up).toMatch(/BEFORE TRUNCATE ON audit_logs/);
    expect(up).toMatch(/RAISE EXCEPTION 'audit_logs is append-only/);
    expect(up).toMatch(/openflow_audit_maintenance/);
  });

  it("has a down migration that removes the triggers", () => {
    expect(down).toMatch(/DROP TRIGGER IF EXISTS audit_logs_append_only_row/);
    expect(down).toMatch(/DROP TRIGGER IF EXISTS audit_logs_append_only_truncate/);
    expect(down).toMatch(/DROP FUNCTION IF EXISTS openflow_audit_logs_append_only/);
  });
});

describe("api key owner and expiry migration", () => {
  const up = sql("20261023130000_api_key_owner_expiry/migration.sql");
  const down = sql("20261023130000_api_key_owner_expiry/down.sql");

  it("backfills expiry and owner, then requires expiresAt", () => {
    expect(up).toMatch(/ownerEmail/);
    expect(up).toMatch(/ownerName/);
    expect(up).toMatch(/INTERVAL '90 days'/);
    expect(up).toMatch(/SET "ownerEmail" = u\."email"/);
    expect(up).toMatch(/ALTER COLUMN "expiresAt" SET NOT NULL/);
  });

  it("reverses the columns and the not-null constraint", () => {
    expect(down).toMatch(/DROP NOT NULL/);
    expect(down).toMatch(/DROP COLUMN IF EXISTS "ownerEmail"/);
    expect(down).toMatch(/DROP COLUMN IF EXISTS "ownerName"/);
  });
});
