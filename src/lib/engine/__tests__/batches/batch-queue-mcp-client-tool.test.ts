import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext, type SdkHttpResponse } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMcpHttpClient,
  type McpClientToolHandle,
} from "../../executors/mcp-client-tool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.mcpClientTool";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): McpClientToolHandle {
  return out[0][0].json as unknown as McpClientToolHandle;
}

function rpcResponse(id: number, result: unknown): SdkHttpResponse {
  return {
    status: 200,
    headers: {},
    body: { jsonrpc: "2.0", id, result },
  };
}

function rpcError(id: number, code: number, message: string): SdkHttpResponse {
  return {
    status: 200,
    headers: {},
    body: { jsonrpc: "2.0", id, error: { code, message } },
  };
}

function toolsListResult(tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>): unknown {
  return { tools };
}

function callResult(content: Array<{ type: string; text?: string }>, isError?: boolean): unknown {
  return { content, isError };
}

afterEach(() => setMcpHttpClient(null));

describe("batch-queue mcpClientTool — @n8n/n8n-nodes-langchain.mcpClientTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MCP Client Tool");
  });

  it("exposes all tools over SSE (legacy endpoint field)", async () => {
    const captured: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
    setMcpHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        body: opts.body,
        headers: opts.headers ?? {},
      });
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([
          { name: "alpha", description: "Alpha tool", inputSchema: { type: "object" } },
          { name: "beta", description: "Beta tool", inputSchema: { type: "object" } },
        ]));
      }
      if (body.method === "tools/call") {
        return rpcResponse(body.id, callResult([{ type: "text", text: "alpha result" }]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({ sseEndpoint: "https://mcp.example.test/sse" });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.endpoint).toBe("https://mcp.example.test/sse");
    expect(handle.transport).toBe("sse");
    expect(handle.tools.map((t) => t.name)).toEqual(["alpha", "beta"]);
    expect(handle.tools[0].description).toBe("Alpha tool");

    const result = await handle.invoke("alpha", { q: "1" });
    expect(result.content).toBe("alpha result");
    expect(result.isError).toBeFalsy();

    const callReq = captured[1].body as { method: string; params: { name: string; arguments: unknown } };
    expect(callReq.method).toBe("tools/call");
    expect(callReq.params.name).toBe("alpha");
    expect(callReq.params.arguments).toEqual({ q: "1" });
  });

  it("selected tools + header auth + timeout (v1.2 shape)", async () => {
    const captured: Array<{ headers: Record<string, string> }> = [];
    setMcpHttpClient(async (opts) => {
      captured.push({ headers: opts.headers ?? {} });
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([
          { name: "create_project" },
          { name: "get_project" },
          { name: "list_projects" },
        ]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool(
      {
        include: "selected",
        options: { timeout: 600000 },
        endpointUrl: "https://stitch.example/mcp",
        includeTools: ["create_project"],
        authentication: "headerAuth",
      },
      [{}],
      { httpHeaderAuth: { name: "X-Custom-Header", value: "secret-value" } },
    );

    const handle = getHandle(out);
    expect(handle.tools.map((t) => t.name)).toEqual(["create_project"]);
    expect(handle.timeoutMs).toBe(600000);
    expect(handle.transport).toBe("httpStreamable");

    expect(captured[0].headers["X-Custom-Header"]).toBe("secret-value");
  });

  it("allExcept filter excludes listed tools", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([
          { name: "a" },
          { name: "b" },
          { name: "c" },
        ]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({
      endpointUrl: "https://mcp.example.test/mcp",
      serverTransport: "httpStreamable",
      include: "allExcept",
      excludeTools: ["b"],
    });

    const handle = getHandle(out);
    expect(handle.tools.map((t) => t.name)).toEqual(["a", "c"]);
  });

  it("bearer auth sends Authorization: Bearer <token>", async () => {
    const captured: Array<{ headers: Record<string, string> }> = [];
    setMcpHttpClient(async (opts) => {
      captured.push({ headers: opts.headers ?? {} });
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "t" }]));
      }
      return rpcResponse(body.id, null);
    });

    await runTool(
      {
        endpointUrl: "http://n8n-mcp:3000/mcp",
        authentication: "bearerAuth",
        options: {},
      },
      [{}],
      { httpBearerAuth: { token: "secret-token" } },
    );

    expect(captured[0].headers.authorization).toBe("Bearer secret-token");
  });

  it("tool call error surfaces to agent as error observation", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "fail_me" }]));
      }
      if (body.method === "tools/call") {
        return rpcResponse(body.id, callResult(
          [{ type: "text", text: "Tool execution failed" }],
          true,
        ));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({ endpointUrl: "https://mcp.example.test/mcp" });
    const handle = getHandle(out);

    const result = await handle.invoke("fail_me", {});
    expect(result.isError).toBe(true);
    expect(result.content).toBe("Tool execution failed");
  });

  it("RPC error on tools/call throws", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "t" }]));
      }
      if (body.method === "tools/call") {
        return rpcError(body.id, -32602, "Invalid tool name");
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({ endpointUrl: "https://mcp.example.test/mcp" });
    const handle = getHandle(out);

    await expect(handle.invoke("t", {})).rejects.toThrow(/Invalid tool name/);
  });

  it("throws when endpoint is missing", async () => {
    await expect(runTool({})).rejects.toThrow(/endpoint is required/i);
  });

  it("throws when include is selected but no tools match", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "a" }, { name: "b" }]));
      }
      return rpcResponse(body.id, null);
    });

    await expect(
      runTool({
        endpointUrl: "https://mcp.example.test/mcp",
        include: "selected",
        includeTools: ["nonexistent"],
      }),
    ).rejects.toThrow(/no requested tools were found/i);
  });

  it("throws when bearerAuth credential is missing", async () => {
    await expect(
      runTool(
        { endpointUrl: "https://mcp.example.test/mcp", authentication: "bearerAuth" },
        [{}],
        {},
      ),
    ).rejects.toThrow(/httpBearerAuth.*required/i);
  });

  it("throws when headerAuth credential is missing", async () => {
    await expect(
      runTool(
        { endpointUrl: "https://mcp.example.test/mcp", authentication: "headerAuth" },
        [{}],
        {},
      ),
    ).rejects.toThrow(/httpHeaderAuth.*required/i);
  });

  it("endpointUrl wins over sseEndpoint when both present", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "t" }]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({
      endpointUrl: "https://primary.example/mcp",
      sseEndpoint: "https://legacy.example/sse",
    });

    const handle = getHandle(out);
    expect(handle.endpoint).toBe("https://primary.example/mcp");
    expect(handle.transport).toBe("httpStreamable");
  });

  it("resolves expression in endpointUrl", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "t" }]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool(
      { endpointUrl: "={{ $json.mcpUrl }}" },
      [{ mcpUrl: "https://expr.example/mcp" }],
    );

    const handle = getHandle(out);
    expect(handle.endpoint).toBe("https://expr.example/mcp");
  });

  it("uses default timeout of 60000ms when not specified", async () => {
    setMcpHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, toolsListResult([{ name: "t" }]));
      }
      return rpcResponse(body.id, null);
    });

    const out = await runTool({ endpointUrl: "https://mcp.example.test/mcp" });
    const handle = getHandle(out);
    expect(handle.timeoutMs).toBe(60000);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});