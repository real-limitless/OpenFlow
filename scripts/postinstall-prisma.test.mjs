import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canResolvePrisma,
  isInstalledAsDependency,
  shouldGeneratePrisma,
} from "./postinstall-prisma.mjs";

describe("postinstall prisma generate gate", () => {
  it("skips when OpenFlow lives under node_modules", () => {
    expect(
      isInstalledAsDependency("/tmp/app/node_modules/openflow"),
    ).toBe(true);
    expect(shouldGeneratePrisma("/tmp/app/node_modules/openflow")).toBe(false);
  });

  it("runs only when this checkout can resolve prisma", () => {
    expect(isInstalledAsDependency(join(import.meta.dirname, ".."))).toBe(false);
    expect(canResolvePrisma(join(import.meta.dirname, ".."))).toBe(true);
    expect(shouldGeneratePrisma(join(import.meta.dirname, ".."))).toBe(true);
  });

  it("skips a consumer tree that has schema but no prisma package", () => {
    const dir = mkdtempSync(join(tmpdir(), "openflow-postinstall-"));
    mkdirSync(join(dir, "prisma"));
    writeFileSync(join(dir, "prisma", "schema.prisma"), "generator client {}\n");
    writeFileSync(join(dir, "package.json"), '{"name":"openflow-fixture"}\n');
    expect(shouldGeneratePrisma(dir)).toBe(false);
  });
});
