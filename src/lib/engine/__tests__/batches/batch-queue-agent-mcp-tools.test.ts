import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getNodeType } from "@/lib/nodes/registry";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { resolve } from "node:path";
import { runNode, makeNode } from "../helpers";
import { createExecutionContext } from "@/sdk";
import { requireFsRoot } from "../../tool-handle";

seedBuiltinDescriptions();

describe("agent MCP tool nodes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers filesystem / git / web search tools", () => {
    for (const type of [
      "openflow-node-base.filesystemTool",
      "openflow-node-base.gitTool",
      "openflow-node-base.webSearchTool",
    ]) {
      expect(hasExecutor(type)).toBe(true);
      expect(getNodeType(type).outputs).toContain("ai_tool");
      expect(getNodeType(type).placeholder).not.toBe(true);
    }
  });

  it("filesystem tool exposes MCP tools and reads a jailed file", async () => {
    const root = await mkdtemp(join(tmpdir(), "of-fs-"));
    await writeFile(join(root, "readme.txt"), "hello mcp", "utf8");
    const out = await runNode("openflow-node-base.filesystemTool", { fsRoot: root }, []);
    const bundle = out[0]![0]!.json as {
      tools: Array<{ name: string }>;
      invoke: (name: string, args: Record<string, unknown>) => Promise<{ content: string }>;
    };
    expect(bundle.tools.map((t) => t.name)).toEqual([
      "read_file",
      "list_directory",
      "search_files",
    ]);
    const read = await bundle.invoke("read_file", { path: "readme.txt" });
    expect(read.content).toBe("hello mcp");
  });

  it("web search tool invokes duckduckgo and returns snippets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        RelatedTopics: [{ Text: "OpenFlow", FirstURL: "https://example.com" }],
      }),
    } as Response);
    const out = await runNode("openflow-node-base.webSearchTool", {}, []);
    const bundle = out[0]![0]!.json as {
      tools: Array<{ name: string }>;
      invoke: (name: string, args: Record<string, unknown>) => Promise<{ content: string }>;
    };
    expect(bundle.tools[0]?.name).toBe("web_search");
    const result = await bundle.invoke("web_search", { query: "openflow" });
    expect(result.content).toContain("example.com");
  });

  it("requireFsRoot prefers ctx.fsRoot over cwd", () => {
    const node = makeNode({ type: "openflow-node-base.filesystemTool" });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "t",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [],
      continueOnFail: false,
      fsRoot: "/tmp/of-jail",
    });
    expect(requireFsRoot(ctx)).toBe(resolve("/tmp/of-jail"));
  });
});
