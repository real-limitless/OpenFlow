import { readFile } from "node:fs/promises";
import type { NodeExecutor } from "@/sdk";
import { emitMcpBundle, requireFsRoot, resolveJailPath } from "../tool-handle";
import { defaultGitClientFactory } from "./git-transport";

const TYPE = "openflow-node-base.gitTool";

async function getClient(ctx: Parameters<NodeExecutor>[0]) {
  const credentials =
    (await ctx.getCredential("gitPassword").catch(() => null)) ??
    (await ctx.getCredential("sshPrivateKey").catch(() => null));
  return defaultGitClientFactory(credentials, { timeout: 30000 });
}

export const gitToolExecutor: NodeExecutor = async (ctx) => {
  return emitMcpBundle(ctx, {
    type: TYPE,
    tools: [
      {
        name: "git_clone",
        description: "Clone a git repository into a path under the workspace root",
        inputSchema: {
          type: "object",
          properties: {
            repository: { type: "string", description: "Remote URL" },
            path: { type: "string", description: "Destination relative to fsRoot" },
            branch: { type: "string" },
          },
          required: ["repository"],
        },
      },
      {
        name: "git_show",
        description: "Read a file from a cloned repo (working tree)",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Repo directory relative to fsRoot" },
            filePath: { type: "string", description: "File inside the repo" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "git_log",
        description: "List recent commits in a local repo",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            maxCommits: { type: "number" },
          },
        },
      },
    ],
    async invoke(toolName, args) {
      const fsRoot = requireFsRoot(ctx);
      const rel = String(args.path ?? "repo");
      const dest = resolveJailPath(fsRoot, rel);
      if (toolName === "git_clone") {
        const repository = String(args.repository ?? "");
        if (!repository) throw new Error("repository is required");
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
      if (toolName === "git_show") {
        const filePath = String(args.filePath ?? "");
        if (!filePath) throw new Error("filePath is required");
        const abs = resolveJailPath(dest, filePath);
        return { content: await readFile(abs, "utf8") };
      }
      if (toolName === "git_log") {
        const client = await getClient(ctx);
        try {
          const entries = await client.log(dest, Number(args.maxCommits ?? 20) || 20);
          return { content: JSON.stringify(entries) };
        } finally {
          await client.close().catch(() => {});
        }
      }
      throw new Error(`Git tool: unknown tool "${toolName}"`);
    },
  });
};
