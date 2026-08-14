import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const ENTRY = join(ROOT, "src/lib/runtime/index.ts");

const FORBIDDEN = [
  /src\/config(?:\.ts)?$/,
  /src\/server\//,
  /src\/lib\/engine\/index\.ts$/,
  /src\/lib\/engine\/binary(?:-fs|-s3)?\.ts$/,
  /src\/lib\/engine\/executors\/index\.ts$/,
  /node_modules\/@prisma\//,
  /node_modules\/prisma\//,
  /node_modules\/bullmq\//,
  /node_modules\/ioredis\//,
];

const IMPORT_RE = /(?:from|import)\s+["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g;

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    return join(ROOT, "src", spec.slice(2));
  }
  return resolve(dirname(fromFile), spec);
}

function withExt(path: string): string | null {
  const candidates = [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    join(path, "index.ts"),
    join(path, "index.tsx"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function walk(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of src.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(file, match[1]);
      if (!resolved) continue;
      const withFile = withExt(resolved);
      if (withFile && withFile.startsWith(join(ROOT, "src"))) {
        queue.push(withFile);
      } else if (resolved.includes("node_modules")) {
        seen.add(resolved);
      }
    }
  }
  return [...seen];
}

describe("lite runtime import graph", () => {
  it("does not pull product host, prisma, or the full executor registry", () => {
    const files = walk(ENTRY);
    expect(files.some((f) => f.endsWith("src/lib/runtime/index.ts"))).toBe(true);
    const hits = files.filter((f) => FORBIDDEN.some((re) => re.test(f.replaceAll("\\", "/"))));
    expect(hits).toEqual([]);
  });
});
