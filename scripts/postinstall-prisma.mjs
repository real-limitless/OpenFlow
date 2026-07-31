import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = join(root, "prisma", "schema.prisma");

if (!existsSync(schema)) {
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
