import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const JS = resolve(ROOT, "dist/runtime/index.js");
const DTS = resolve(ROOT, "dist/runtime/index.d.ts");
const MAX_BYTES = 1_200_000;
const FORBIDDEN = [
  "prisma",
  "bullmq",
  "ioredis",
  "createFsBinaryStore",
  "seedBuiltinExecutors",
  "src/server",
];

describe("lite runtime bundle", () => {
  it("builds a small ESM entry without product-host deps", async () => {
    const built = spawnSync(process.execPath, ["scripts/build-runtime.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(built.status, built.stderr || built.stdout).toBe(0);

    const bytes = statSync(JS).size;
    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThan(MAX_BYTES);

    const src = readFileSync(JS, "utf8");
    for (const needle of FORBIDDEN) {
      expect(src.includes(needle), `bundle must not contain ${needle}`).toBe(false);
    }
    expect(src).toMatch(/isolated-vm/);
    expect(readFileSync(DTS, "utf8")).toMatch(/types\/lib\/runtime/);
    const publicDts = readFileSync(
      resolve(ROOT, "dist/runtime/types/lib/runtime/index.d.ts"),
      "utf8",
    );
    expect(publicDts).toMatch(/createRuntime/);

    const mod = await import(JS);
    expect(typeof mod.createRuntime).toBe("function");
    const runtime = mod.createRuntime();
    const result = await runtime.run({
      id: "bundle-smoke",
      name: "smoke",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Pass",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {
        Start: { main: [[{ node: "Pass", type: "main", index: 0 }]] },
      },
      settings: {},
    });
    expect(result.success).toBe(true);
  });
});
