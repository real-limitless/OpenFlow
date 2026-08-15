import { describe, it, expect, afterEach, vi } from "vitest";
import type { INode, IWorkflow } from "../../workflow/types";
import {
  createRuntime,
  assertLiteCompatible,
  serializeForRuntime,
  LiteRuntimeError,
  isBlockedPrivateUrl,
  LITE_NODE_TYPES,
} from "../index";

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
    id: "wf-lite",
    name: "lite",
    active: false,
    nodes,
    connections,
    settings: {},
  };
}

function mockFetch(body: unknown = { ok: true }, status = 200) {
  const text = JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status,
      statusText: "OK",
      ok: status >= 200 && status < 300,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
        entries: () => [["content-type", "application/json"]].values(),
      },
      json: async () => body,
      text: async () => text,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lite runtime", () => {
  it("lists supported types", () => {
    const runtime = createRuntime();
    expect(runtime.supportedTypes()).toContain("n8n-nodes-base.httpRequest");
    expect(runtime.supportedTypes()).toEqual(LITE_NODE_TYPES);
  });

  it("rejects unsupported node types before run", async () => {
    const workflow = wf([
      node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
      node({ name: "Slack", type: "n8n-nodes-base.slack" }),
    ]);
    expect(() => assertLiteCompatible(workflow)).toThrow(LiteRuntimeError);
    const runtime = createRuntime();
    await expect(runtime.run(workflow)).rejects.toMatchObject({
      code: "unsupported_nodes",
    });
  });

  it("runs Set → IF and pins trigger input", async () => {
    const workflow = wf(
      [
        node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        node({
          name: "Set",
          type: "n8n-nodes-base.set",
          parameters: {
            assignments: {
              assignments: [{ name: "greet", type: "string", value: "={{ $json.name }}" }],
            },
          },
        }),
        node({
          name: "IF",
          type: "n8n-nodes-base.if",
          parameters: {
            conditions: {
              conditions: [
                {
                  leftValue: "={{ $json.greet }}",
                  rightValue: "Ada",
                  operator: { type: "string", operation: "equals" },
                },
              ],
            },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "IF", type: "main", index: 0 }]] },
      },
    );
    const result = await createRuntime().run(workflow, { input: { name: "Ada" } });
    expect(result.success).toBe(true);
    expect(result.runData.IF.status).toBe("success");
    expect(result.runData.IF.items?.[0]?.[0]?.json).toMatchObject({ greet: "Ada" });
  });

  it("runs HTTP via fetch and applies host credentials", async () => {
    mockFetch({ hello: "world" });
    const workflow = wf(
      [
        node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        node({
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          parameters: { method: "GET", url: "https://example.com/api" },
          credentials: { httpHeaderAuth: { name: "Api" } },
        }),
      ],
      { Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] } },
    );
    const result = await createRuntime({
      credentials: {
        httpHeaderAuth: { name: "X-Api-Key", value: "secret" },
      },
    }).run(workflow);
    expect(result.success).toBe(true);
    expect(result.runData.HTTP.items?.[0]?.[0]?.json).toMatchObject({ hello: "world" });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0]?.[0]).toBe("https://example.com/api");
    expect((calls[0]?.[1] as RequestInit).headers).toMatchObject({ "X-Api-Key": "secret" });
  });

  it("blocks private HTTP URLs by default", async () => {
    mockFetch({ leaked: true });
    const workflow = wf(
      [
        node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        node({
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          parameters: { method: "GET", url: "http://127.0.0.1/admin" },
        }),
      ],
      { Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] } },
    );
    const result = await createRuntime().run(workflow);
    expect(result.success).toBe(false);
    expect(result.runData.HTTP.error).toMatch(/allowUrl policy/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not leak process.env through $env by default", async () => {
    mockFetch({ ok: true });
    const prev = process.env.OPENFLOW_LITE_LEAK_TEST;
    process.env.OPENFLOW_LITE_LEAK_TEST = "should-not-appear";
    try {
      const workflow = wf(
        [
          node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
          node({
            name: "HTTP",
            type: "n8n-nodes-base.httpRequest",
            parameters: { method: "GET", url: "={{ $env.OPENFLOW_LITE_LEAK_TEST }}" },
          }),
        ],
        { Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] } },
      );
      await createRuntime({ allowUrl: () => true }).run(workflow);
      const requested = String(vi.mocked(fetch).mock.calls[0]?.[0] ?? "");
      expect(requested).not.toContain("should-not-appear");
    } finally {
      if (prev === undefined) delete process.env.OPENFLOW_LITE_LEAK_TEST;
      else process.env.OPENFLOW_LITE_LEAK_TEST = prev;
    }
  });

  it("exposes only the provided env map", async () => {
    mockFetch({ ok: true });
    const workflow = wf(
      [
        node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        node({
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          parameters: { method: "GET", url: "={{ $env.MODE }}" },
        }),
      ],
      { Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] } },
    );
    await createRuntime({
      env: { MODE: "https://example.com/from-env" },
      allowUrl: () => true,
    }).run(workflow);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://example.com/from-env");
  });

  it("runs a JavaScript Code node", async () => {
    const workflow = wf(
      [
        node({ name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        node({
          name: "Code",
          type: "n8n-nodes-base.code",
          parameters: {
            language: "javaScript",
            jsCode: "return [{ json: { n: ($input.item.json.n ?? 0) + 1 } }]",
          },
        }),
      ],
      { Start: { main: [[{ node: "Code", type: "main", index: 0 }]] } },
    );
    const result = await createRuntime().run(workflow, { input: { n: 1 } });
    expect(result.success).toBe(true);
    expect(result.runData.Code.items?.[0]?.[0]?.json.n).toBe(2);
  });

  it("serializeForRuntime strips credential ids and lists slots", () => {
    const workflow = wf([
      node({
        name: "HTTP",
        type: "n8n-nodes-base.httpRequest",
        credentials: { httpHeaderAuth: { id: "cred-1", name: "Prod API" } },
      }),
    ]);
    const report = serializeForRuntime(workflow);
    expect(report.workflow.nodes[0].credentials?.httpHeaderAuth).toEqual({ name: "Prod API" });
    expect(report.requiredCredentials).toEqual([
      { slot: "httpHeaderAuth", name: "Prod API", node: "HTTP", id: "cred-1" },
    ]);
  });

  it("validate reports unsupported nodes without throwing", () => {
    const report = createRuntime().validate(
      wf([node({ name: "Slack", type: "n8n-nodes-base.slack" })]),
    );
    expect(report.unsupportedNodes).toEqual([{ name: "Slack", type: "n8n-nodes-base.slack" }]);
  });
});

describe("url policy", () => {
  it("blocks loopback and metadata hosts", () => {
    expect(isBlockedPrivateUrl("http://127.0.0.1/x")).toBe(true);
    expect(isBlockedPrivateUrl("http://169.254.169.254/latest")).toBe(true);
    expect(isBlockedPrivateUrl("https://example.com/ok")).toBe(false);
  });
});
