import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rolldown } from "rolldown";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "src/lib/runtime/index.ts");
const outFile = resolve(root, "dist/runtime/index.js");

const bundle = await rolldown({
  input: entry,
  platform: "node",
  external: ["isolated-vm"],
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
    tsconfigFilename: resolve(root, "tsconfig.json"),
  },
});

await bundle.write({
  file: outFile,
  format: "esm",
  sourcemap: true,
  codeSplitting: false,
});
await bundle.close();

const tsc = resolve(root, "node_modules/typescript/bin/tsc");
const dts = spawnSync(process.execPath, [tsc, "-p", "tsconfig.runtime.json"], {
  cwd: root,
  stdio: "inherit",
});
if (dts.status !== 0) {
  process.exit(dts.status ?? 1);
}

mkdirSync(resolve(root, "dist/runtime"), { recursive: true });
writeFileSync(
  resolve(root, "dist/runtime/package.json"),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
);
writeFileSync(
  resolve(root, "dist/runtime/index.d.ts"),
  `export * from "./types/lib/runtime/index.js";\n`,
);

console.log(`wrote ${outFile}`);
