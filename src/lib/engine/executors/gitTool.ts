import { readFile } from "node:fs/promises";
import type { NodeExecutor } from "@/sdk";
import { assertAllowUrl, emitToolHandle, requireFsRoot, resolveJailPath } from "../tool-handle";
import { createGitClient } from "./git";

const TYPE = "n8n-nodes-base.gitTool";

async function getClient(ctx: Parameters<NodeExecutor>[0]) {
  const credentials =
    (await ctx.getCredential("gitPassword").catch(() => null)) ??
    (await ctx.getCredential("sshPrivateKey").catch(() => null));
  return createGitClient(credentials, { timeout: 30000 });
}

export const gitToolExecutor: NodeExecutor = async (ctx) => {
  return emitToolHandle(ctx, {
    type: TYPE,
    name: String(ctx.getParam("toolName", "git")),
    description: String(
      ctx.getParam("description", "Clone a git repository, show a file, or list recent commits"),
    ),
    schema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "clone | showFile | log",
        },
        repository: { type: "string", description: "Remote URL (clone)" },
        path: { type: "string", description: "Local path under fsRoot" },
        filePath: { type: "string", description: "File to read (showFile)" },
        branch: { type: "string" },
        maxCommits: { type: "number" },
      },
      required: ["operation"],
    },
    async invoke(args) {
      const fsRoot = requireFsRoot(ctx);
      const operation = String(args.operation ?? "clone");
      const rel = String(args.path ?? "repo");
      const dest = resolveJailPath(fsRoot, rel);
      if (operation === "clone") {
        const repository = String(args.repository ?? "");
        if (!repository) throw new Error("repository is required for clone");
        assertAllowUrl(ctx, repository);
        const client = await getClient(ctx);
        try {
          await client.clone(repository, dest, {
            branch: args.branch ? String(args.branch) : undefined,
          });
        } finally {
          await client.close().catch(() => {});
        }
        return { content: JSON.stringify({ cloned: dest, repository }) };
      }
      if (operation === "showFile") {
        const filePath = String(args.filePath ?? "");
        if (!filePath) throw new Error("filePath is required for showFile");
        const abs = resolveJailPath(dest, filePath);
        const data = await readFile(abs, "utf8");
        return { content: data };
      }
      if (operation === "log") {
        const client = await getClient(ctx);
        try {
          const entries = await client.log(dest, Number(args.maxCommits ?? 20) || 20);
          return { content: JSON.stringify(entries) };
        } finally {
          await client.close().catch(() => {});
        }
      }
      throw new Error(`Git tool: unsupported operation "${operation}"`);
    },
  });
};
