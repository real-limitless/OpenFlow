import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = join(root, "prisma", "schema.prisma");

/**
 * When OpenFlow is installed as a GitHub / npm dependency (CleanFlow, etc.),
 * Prisma and dotenv are not present: they are OpenFlow devDependencies.
 * Running `npx prisma generate` then loads prisma.config.ts, which used to
 * `import "dotenv/config"` and fail the consumer's `npm install`.
 *
 * Generate only for a first-party OpenFlow checkout that already has Prisma.
 */
export function isInstalledAsDependency(pkgRoot = root) {
  const parts = pkgRoot.split(sep);
  const i = parts.lastIndexOf("node_modules");
  return i !== -1 && i < parts.length - 1;
}

export function canResolvePrisma(pkgRoot = root) {
  const require = createRequire(join(pkgRoot, "package.json"));
  try {
    require.resolve("prisma/package.json");
    return true;
  } catch {
    return false;
  }
}

export function shouldGeneratePrisma(pkgRoot = root) {
  if (!existsSync(join(pkgRoot, "prisma", "schema.prisma"))) return false;
  if (isInstalledAsDependency(pkgRoot)) return false;
  return canResolvePrisma(pkgRoot);
}

function runGenerate() {
  if (!shouldGeneratePrisma(root)) {
    process.exit(0);
  }
  if (!existsSync(schema)) {
    process.exit(0);
  }
  const result = spawnSync("npx", ["prisma", "generate"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runGenerate();
}
