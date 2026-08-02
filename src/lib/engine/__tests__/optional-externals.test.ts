import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `NODE_EXTERNALS` in vite.config.ts lists optional executor drivers that are
 * deliberately NOT declared dependencies -- the production image should not carry
 * them unless the feature is used. Externalizing keeps the build green when they
 * are absent from node_modules.
 *
 * That trade is only safe while every such module is reached through a dynamic
 * `await import()` inside the executor that needs it. A static top-level import
 * of an absent package fails when the module graph is first loaded, which takes
 * down the whole server rather than the single node that needed the driver.
 *
 * This test pins that invariant: undeclared externals must never be statically
 * imported.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

function readExternals(): string[] {
  const src = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
  const block = /NODE_EXTERNALS\s*=\s*\[([\s\S]*?)\]/.exec(src);
  expect(block, "NODE_EXTERNALS not found in vite.config.ts").toBeTruthy();
  return [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function declaredDependencies(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("optional externalized drivers", () => {
  const externals = readExternals();
  const declared = declaredDependencies();
  const undeclared = externals.filter((m) => !declared.has(m));
  const sources = walk(join(ROOT, "src"));

  it("never statically imports an undeclared external", () => {
    const offenders: string[] = [];

    for (const mod of undeclared) {
      // `import ... from "mod"` / `export ... from "mod"` at module scope.
      // `await import("mod")` is the safe form and is deliberately not matched.
      const staticImport = new RegExp(
        String.raw`(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      for (const file of sources) {
        if (staticImport.test(readFileSync(file, "utf8"))) {
          offenders.push(`${file.slice(ROOT.length + 1)} statically imports "${mod}"`);
        }
      }
    }

    expect(
      offenders,
      "these modules are externalized but not installed, so a static import " +
        "crashes the whole server at startup instead of failing just that node:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps the undeclared set to known optional drivers", () => {
    // Tightens the blast radius: a new undeclared external is a deliberate
    // decision (the feature degrades to a runtime "Cannot find module"), so it
    // should be added here consciously rather than inherited silently.
    expect(undeclared.sort()).toEqual(["@elastic/elasticsearch", "amqplib", "kafkajs"]);
  });
});
