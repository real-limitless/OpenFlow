import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { NodeExecutor } from "@/sdk";
import { emitToolHandle, requireFsRoot, resolveJailPath } from "../tool-handle";

const TYPE = "n8n-nodes-base.filesystemTool";

async function walkFiles(root: string, max = 500): Promise<string[]> {
  const out: string[] = [];
  const queue = [root];
  while (queue.length && out.length < max) {
    const dir = queue.pop()!;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        queue.push(full);
      } else if (e.isFile()) {
        out.push(full);
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DS::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DS::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export const filesystemToolExecutor: NodeExecutor = async (ctx) => {
  return emitToolHandle(ctx, {
    type: TYPE,
    name: String(ctx.getParam("toolName", "filesystem")),
    description: String(
      ctx.getParam("description", "Read, glob, or grep files in the project workspace"),
    ),
    schema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "read | glob | grep" },
        path: { type: "string", description: "File or directory relative to fsRoot" },
        pattern: { type: "string", description: "Glob or grep pattern" },
      },
      required: ["operation"],
    },
    async invoke(args) {
      const fsRoot = requireFsRoot(ctx);
      const operation = String(args.operation ?? "read");
      const rel = String(args.path ?? ".");
      const target = resolveJailPath(fsRoot, rel);
      if (operation === "read") {
        const info = await stat(target);
        if (!info.isFile()) throw new Error("read requires a file path");
        return { content: await readFile(target, "utf8") };
      }
      if (operation === "glob") {
        const pattern = String(args.pattern ?? "**/*");
        const re = globToRegExp(pattern);
        const files = await walkFiles(target);
        const hits = files
          .map((f) => relative(fsRoot, f).replaceAll("\\", "/"))
          .filter((p) => re.test(p) || re.test(p.split("/").pop() ?? p));
        return { content: JSON.stringify(hits) };
      }
      if (operation === "grep") {
        const pattern = String(args.pattern ?? "");
        if (!pattern) throw new Error("pattern is required for grep");
        const re = new RegExp(pattern, "i");
        const files = await walkFiles(target);
        const matches: Array<{ path: string; line: number; text: string }> = [];
        for (const file of files) {
          let text: string;
          try {
            text = await readFile(file, "utf8");
          } catch {
            continue;
          }
          const lines = text.split(/\r?\n/);
          lines.forEach((line, i) => {
            if (re.test(line) && matches.length < 100) {
              matches.push({
                path: relative(fsRoot, file).replaceAll("\\", "/"),
                line: i + 1,
                text: line.slice(0, 240),
              });
            }
          });
          if (matches.length >= 100) break;
        }
        return { content: JSON.stringify(matches) };
      }
      throw new Error(`Filesystem tool: unsupported operation "${operation}"`);
    },
  });
};
