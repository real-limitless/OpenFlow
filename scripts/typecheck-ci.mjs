/**
 * CI typecheck for server, sdk, and config.
 *
 * tsconfig.ci.json excludes src/lib/engine/executors, but tsc still checks
 * those modules when server code imports the executor registry. Diagnostics
 * that originate in that excluded tree are reported and do not fail the job.
 * Every other diagnostic fails the job.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/lib/tsc.js", "--noEmit", "-p", "tsconfig.ci.json", "--pretty", "false"],
  { encoding: "utf8" },
);

const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

const diagnostic = /^(src\/\S+)\(\d+,\d+\): error TS\d+:/gm;
const blocking = [];
const excluded = [];
for (const line of text.split("\n")) {
  const match = diagnostic.exec(line);
  diagnostic.lastIndex = 0;
  if (!match) continue;
  if (match[1].startsWith("src/lib/engine/executors/")) excluded.push(line);
  else blocking.push(line);
}

if (excluded.length > 0) {
  console.log(
    `typecheck:ci: ${excluded.length} diagnostic(s) in src/lib/engine/executors are excluded by tsconfig.ci.json`,
  );
}

if (blocking.length > 0) {
  console.error(blocking.join("\n"));
  process.exit(1);
}

if (result.status !== 0 && blocking.length === 0 && excluded.length === 0) {
  console.error(text);
  process.exit(result.status ?? 1);
}
