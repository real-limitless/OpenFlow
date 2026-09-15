import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../../../generated/prisma/client";
import {
  getTemplateSyncJobState,
  resetTemplateSyncJobState,
  runGit,
  startTemplateLibrarySyncBackground,
} from "../template-library-sync";

describe("runGit", () => {
  it("runs git asynchronously (does not use spawnSync)", async () => {
    await runGit(["--version"]);
  });

  it("does not call spawnSync (piped clone must not deadlock the API)", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../template-library-sync.ts", import.meta.url)),
      "utf8",
    );
    expect(src).toContain('import { spawn } from "node:child_process"');
    expect(src).not.toMatch(/spawnSync\s*\(/);
  });
});

describe("startTemplateLibrarySyncBackground", () => {
  beforeEach(() => {
    resetTemplateSyncJobState();
  });

  afterEach(async () => {
    if (getTemplateSyncJobState().running || getTemplateSyncJobState().startedAt) {
      await vi.waitFor(() => expect(getTemplateSyncJobState().running).toBe(false));
    }
    resetTemplateSyncJobState();
  });

  it("returns immediately and does not wait for clone/index work", async () => {
    const t0 = Date.now();
    const started = startTemplateLibrarySyncBackground({} as PrismaClient, {
      sourceId: "__no_such_template_source__",
    });
    const elapsed = Date.now() - t0;
    expect(started).toBe(true);
    expect(elapsed).toBeLessThan(50);
    expect(getTemplateSyncJobState().running).toBe(true);
    expect(getTemplateSyncJobState().finishedAt).toBeNull();

    await vi.waitFor(() => {
      expect(getTemplateSyncJobState().running).toBe(false);
    });
    expect(getTemplateSyncJobState().error).toMatch(/No enabled template sources/);
  });

  it("rejects a second start while a job is marked running", () => {
    const first = startTemplateLibrarySyncBackground({} as PrismaClient, {
      sourceId: "__no_such_template_source__",
    });
    const second = startTemplateLibrarySyncBackground({} as PrismaClient, {
      sourceId: "__no_such_template_source__",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
