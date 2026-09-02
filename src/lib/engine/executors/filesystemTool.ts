import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { NodeExecutor } from "@/sdk";
import { emitMcpBundle, requireFsRoot, resolveJailPath } from "../tool-handle";

const TYPE = "openflow-node-base.filesystemTool";

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

export const filesystemToolExecutor: NodeExecutor = async (ctx) => {
  return emitMcpBundle(ctx, {
    type: TYPE,
    tools: [
      {
        name: "read_file",
        description: "Read a UTF-8 file under the workspace root",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Path relative to fsRoot" } },
          required: ["path"],
        },
      },
      {
        name: "list_directory",
        description: "List files under a directory (recursive, skips node_modules/.git)",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Directory relative to fsRoot" } },
        },
      },
      {
        name: "search_files",
        description: "Grep file contents under a path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            pattern: { type: "string", description: "JavaScript regex" },
          },
          required: ["pattern"],
        },
      },
    ],
    async invoke(toolName, args) {
      const fsRoot = requireFsRoot(ctx);
      const rel = String(args.path ?? ".");
      const target = resolveJailPath(fsRoot, rel);
      if (toolName === "read_file") {
        const info = await stat(target);
        if (!info.isFile()) throw new Error("read_file requires a file path");
        return { content: await readFile(target, "utf8") };
      }
      if (toolName === "list_directory") {
        const files = await walkFiles(target);
        return {
          content: JSON.stringify(files.map((f) => relative(fsRoot, f).replaceAll("\\", "/"))),
        };
      }
      if (toolName === "search_files") {
        const pattern = String(args.pattern ?? "");
        if (!pattern) throw new Error("pattern is required");
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
          const lines = text.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i]!)) {
              matches.push({
                path: relative(fsRoot, file).replaceAll("\\", "/"),
                line: i + 1,
                text: lines[i]!.slice(0, 240),
              });
              if (matches.length >= 80) break;
            }
          }
          if (matches.length >= 80) break;
        }
        return { content: JSON.stringify(matches) };
      }
      throw new Error(`Filesystem tool: unknown tool "${toolName}"`);
    },
  });
};
