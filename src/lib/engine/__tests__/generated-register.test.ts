import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { loadModules, renderRegister, outPath } from "../../../../scripts/generate-executor-register.mjs";

/**
 * Guards `register-builtins.ts` against drifting from BUILTIN_EXECUTOR_MODULES.
 *
 * The register is generated: adding a manifest entry without re-running
 * `npm run generate:executors` leaves the executor unregistered at runtime while
 * the build stays perfectly green. This has happened repeatedly -- executors for
 * quickbooks, awsS3 and a batch of 21 langchain/google nodes all shipped to main
 * missing their registration line.
 *
 * node-breadth-gate catches the symptom (a manifest type with no executor), but
 * only once someone runs the suite. This test states the cause directly, so the
 * failure message names the fix.
 *
 * The generator is imported rather than reimplemented, so this can never drift
 * from the real emit logic. Importing it is side-effect free: the script only
 * writes when invoked as a CLI.
 */
describe("generated executor register", () => {
  it("matches what the generator would emit", () => {
    const expected = renderRegister(loadModules());
    const actual = readFileSync(outPath, "utf8");

    if (actual !== expected) {
      // Report the drifting types rather than diffing ~700 lines of imports.
      const types = (s: string) =>
        new Set([...s.matchAll(/registerExecutor\("([^"]+)"/g)].map((m) => m[1]));
      const inExpected = types(expected);
      const inActual = types(actual);
      const missing = [...inExpected].filter((t) => !inActual.has(t));
      const extra = [...inActual].filter((t) => !inExpected.has(t));

      expect.fail(
        "register-builtins.ts is stale -- run `npm run generate:executors`.\n" +
          (missing.length ? `  in the manifest but NOT registered: ${missing.join(", ")}\n` : "") +
          (extra.length ? `  registered but NOT in the manifest: ${extra.join(", ")}\n` : "") +
          (!missing.length && !extra.length
            ? "  same executor set, but the emitted text differs (ordering or formatting).\n"
            : ""),
      );
    }
  });

  it("registers every manifest entry exactly once", () => {
    const modules = loadModules();
    const seen = new Map<string, number>();
    for (const m of modules) seen.set(m.type, (seen.get(m.type) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
    expect(duplicates, `duplicate manifest types: ${duplicates.join(", ")}`).toEqual([]);
  });
});
