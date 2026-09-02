import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { INode, IWorkflow } from "../../workflow/types";
import { createRuntime } from "../index";
import { httpRequestToolExecutor } from "../../engine/executors/httpRequestTool";
import { filesystemToolExecutor } from "../../engine/executors/filesystemTool";
import { setOpenRouterHttpClient } from "../../engine/executors/lm-chat-open-router";
import { createExecutionContext } from "@/sdk";
import { getNodeType, seedBuiltinDescriptions } from "../../nodes/registry";

seedBuiltinDescriptions();

function node(partial: Partial<INode> & Pick<INode, "name" | "type">): INode {
  return {
    id: partial.id ?? partial.name,
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...partial,
  };
}

function wf(nodes: INode[], connections: IWorkflow["connections"] = {}): IWorkflow {
  return {
    id: "wf-harness",
    name: "harness",
    active: false,
    nodes,
    connections,
    settings: {},
  };
}

function makeCtx(
  n: INode,
  items: Array<Record<string, unknown>> = [],
  extras: Record<string, unknown> = {},
) {
  return createExecutionContext({
    node: n,
    workflow: wf([n]),
    getNodeInputItems: () => items.map((json) => ({ json })),
    continueOnFail: false,
    ...extras,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setOpenRouterHttpClient(null);
});

const agentGraph = wf(
  [
    node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
    node({
      name: "Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      parameters: { promptType: "auto", options: { systemMessage: "Be brief", maxIterations: 3 } },
    }),
    node({
      name: "Model",
      type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter",
      parameters: { model: "openai/gpt-4o-mini" },
      credentials: { openRouterApi: { name: "or" } },
    }),
    node({
      name: "HTTP",
      type: "n8n-nodes-base.httpRequestTool",
      parameters: { method: "GET", url: "https://example.com/doc" },
    }),
  ],
  {
    Start: { main: [[{ node: "Agent", type: "main", index: 0 }]] },
    Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] },
    HTTP: { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]] },
  },
);

describe("harness runtime", () => {
  it("validates the checked-in harness fixture", async () => {
    const raw = await readFile(
      fileURLToPath(
        new URL(
          "../../../../workflows/harness/agent-openrouter-http.runtime.json",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const report = createRuntime({ preset: "harness" }).validate(raw);
    expect(report.unsupportedNodes).toEqual([]);
  });

  it("validate accepts the agent cluster under preset harness", () => {
    const report = createRuntime({ preset: "harness" }).validate(agentGraph);
    expect(report.unsupportedNodes).toEqual([]);
    expect(report.requiredCredentials.some((c) => c.slot === "openRouterApi")).toBe(true);
  });

  it("accepts openflow-node-langchain aliases", () => {
    const aliased = wf([
      node({ name: "Start", type: "openflow-node-base.manualTrigger" }),
      node({ name: "Agent", type: "openflow-node-langchain.agent" }),
      node({ name: "Model", type: "openflow-node-langchain.lmChatOpenRouter" }),
    ]);
    expect(createRuntime({ preset: "harness" }).validate(aliased).unsupportedNodes).toEqual([]);
  });

  it("still rejects Slack under harness", async () => {
    const slack = wf([
      node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
      node({ name: "Slack", type: "n8n-nodes-base.slack" }),
    ]);
    await expect(createRuntime({ preset: "harness" }).run(slack)).rejects.toMatchObject({
      code: "unsupported_nodes",
    });
  });

  it("githubTool palette is not a placeholder", () => {
    const desc = getNodeType("n8n-nodes-base.githubTool");
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("GitHub Tool");
    expect(desc.properties.length).toBeGreaterThan(3);
  });

  it("runs Agent with userPrompt and a mocked OpenRouter + HTTP tool", async () => {
    setOpenRouterHttpClient(async () => ({
      status: 200,
      headers: {},
      body: { choices: [{ message: { content: "done" } }] },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "doc-body",
        json: async () => ({ ok: true }),
      })),
    );
    const result = await createRuntime({
      preset: "harness",
      credentials: { openRouterApi: { apiKey: "sk-test" } },
      allowUrl: () => true,
    }).run(agentGraph, { input: { userPrompt: "Summarize the doc" } });
    expect(result.success).toBe(true);
    expect(result.runData.Agent.status).toBe("success");
    expect(String(result.runData.Agent.items?.[0]?.[0]?.json.output ?? "")).toContain("done");
  });

  it("clean allowedTools rejects Git / Search / Command", async () => {
    const dirty = wf([
      node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
      node({ name: "Git", type: "n8n-nodes-base.gitTool" }),
      node({ name: "Search", type: "n8n-nodes-base.webSearchTool" }),
      node({ name: "Bash", type: "n8n-nodes-base.executeCommandTool" }),
    ]);
    await expect(
      createRuntime({ preset: "harness", allowedTools: [] }).run(dirty),
    ).rejects.toMatchObject({ code: "tool_policy" });
  });
});

describe("httpRequestTool handle", () => {
  it("emits an invoke handle with no main items and honors allowUrl", async () => {
    const n = node({
      name: "HTTP",
      type: "n8n-nodes-base.httpRequestTool",
      parameters: { url: "http://127.0.0.1/x", method: "GET" },
    });
    const ctx = makeCtx(n, [], { allowUrl: () => false });
    const [out] = await httpRequestToolExecutor(ctx, n);
    const handle = out[0].json as { invoke: (a: Record<string, unknown>) => Promise<unknown> };
    expect(typeof handle.invoke).toBe("function");
    await expect(handle.invoke({})).rejects.toThrow(/allowUrl policy/);
  });
});

describe("filesystem tool jail", () => {
  it("refuses paths outside fsRoot", async () => {
    const root = await mkdtemp(join(tmpdir(), "of-fs-"));
    await writeFile(join(root, "ok.txt"), "hello");
    const n = node({ name: "FS", type: "n8n-nodes-base.filesystemTool" });
    const ctx = makeCtx(n, [], { fsRoot: root });
    const [out] = await filesystemToolExecutor(ctx, n);
    const bundle = out[0].json as {
      tools: Array<{ name: string }>;
      invoke: (name: string, args: Record<string, unknown>) => Promise<{ content: string }>;
    };
    expect(bundle.tools.map((t) => t.name)).toContain("read_file");
    const ok = await bundle.invoke("read_file", { path: "ok.txt" });
    expect(ok.content).toBe("hello");
    await expect(bundle.invoke("read_file", { path: "../secret" })).rejects.toThrow(
      /escapes fsRoot/,
    );
  });
});
