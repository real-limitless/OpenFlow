import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type SdkHttpResponse } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setMcpCommunityHttpClient } from "../../executors/mcp-community-client";

const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual("node:child_process");
  return { ...actual, spawn: mockSpawn };
});

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-mcp.mcpClientTool";

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

async function runNode(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = {},
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = {
    ...makeCtxWithCred(items, node, credentials),
    continueOnFail: () => continueOnFail,
  };
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function rpcResponse(id: number, result: unknown): SdkHttpResponse {
  return {
    status: 200,
    headers: {},
    body: { jsonrpc: "2.0", id, result },
  };
}

function rpcErrorStatus(id: number, code: number, message: string): SdkHttpResponse {
  return {
    status: 200,
    headers: {},
    body: { jsonrpc: "2.0", id, error: { code, message } },
  };
}

afterEach(() => {
  setMcpCommunityHttpClient(null);
  mockSpawn.mockReset();
});

describe("batch-queue mcpCommunityClient — n8n-nodes-mcp.mcpClientTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("MCP Client");
    expect(desc.name).toBe(TYPE);
  });

  it("listTools via HTTP Streamable returns one item per tool", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    setMcpCommunityHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, {
          tools: [
            {
              name: "search",
              description: "Search the web",
              inputSchema: { type: "object", properties: { query: { type: "string" } } },
            },
            {
              name: "fetch",
              description: "Fetch a URL",
              inputSchema: { type: "object", properties: { url: { type: "string" } } },
            },
          ],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode({ operation: "listTools", connectionType: "httpStreamable" }, [{}], {
      mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" },
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      name: "search",
      description: "Search the web",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    });
    expect(out[0][1].json).toEqual({
      name: "fetch",
      description: "Fetch a URL",
      inputSchema: { type: "object", properties: { url: { type: "string" } } },
    });
    expect(captured[0].url).toBe("http://localhost:3001/stream");
    const req = captured[0].body as { method: string };
    expect(req.method).toBe("tools/list");
  });

  it("executeTool via HTTP Streamable returns tool result", async () => {
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, {
          tools: [{ name: "add", description: "Add two numbers", inputSchema: { type: "object" } }],
        });
      }
      if (body.method === "tools/call") {
        return rpcResponse(body.id, {
          content: [{ type: "text", text: "8" }],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode(
      {
        operation: "executeTool",
        connectionType: "httpStreamable",
        toolName: "add",
        toolParameters: { a: 3, b: 5 },
      },
      [{}],
      { mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      content: [{ type: "text", text: "8" }],
    });
  });

  it("executeTool with JSON-string toolParameters passes correct arguments", async () => {
    let callBody: unknown = null;
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "tools/list") {
        return rpcResponse(body.id, {
          tools: [{ name: "add", description: "Add two numbers", inputSchema: { type: "object" } }],
        });
      }
      if (body.method === "tools/call") {
        callBody = opts.body;
        return rpcResponse(body.id, {
          content: [{ type: "text", text: "8" }],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode(
      {
        operation: "executeTool",
        connectionType: "httpStreamable",
        toolName: "add",
        toolParameters: '{"a":3,"b":5}',
      },
      [{}],
      { mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" } },
    );

    expect(out[0]).toHaveLength(1);
    const call = callBody as { params: { name: string; arguments: unknown } };
    expect(call.params.name).toBe("add");
    expect(call.params.arguments).toEqual({ a: 3, b: 5 });
  });

  it("executeTool via STDIO returns tool result", async () => {
    const mockStdout: EventTarget & {
      setEncoding: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    } = {
      on: vi.fn(),
      setEncoding: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as typeof mockStdout;

    const mockStdin = { write: vi.fn() };
    const mockProc: Record<string, unknown> = {
      pid: 1234,
      killed: false,
      stdout: mockStdout,
      stderr: { on: vi.fn(), setEncoding: vi.fn() },
      stdin: mockStdin,
      kill: vi.fn(),
      on: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockProc);

    mockStdin.write = vi.fn((data: string, cb?: (err?: Error) => void) => {
      const parsed = JSON.parse(data);
      if (parsed.method === "tools/list") {
        const response =
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            result: { tools: [{ name: "add", description: "Add two numbers", inputSchema: {} }] },
          }) + "\n";
        const onData = mockStdout.on.mock.calls.find((c: unknown[]) => c[0] === "data");
        if (onData) onData[1](response);
      } else if (parsed.method === "tools/call") {
        const response =
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            result: { content: [{ type: "text", text: "8" }] },
          }) + "\n";
        const onData = mockStdout.on.mock.calls.find((c: unknown[]) => c[0] === "data");
        if (onData) onData[1](response);
      }
      cb?.();
    });

    const out = await runNode(
      {
        operation: "executeTool",
        connectionType: "stdio",
        toolName: "add",
        toolParameters: { a: 3, b: 5 },
      },
      [{}],
      { mcpClientApi: { command: "node", arguments: "./mock-server.js" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      content: [{ type: "text", text: "8" }],
    });

    mockSpawn.mockReset();
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode({ operation: "listTools", connectionType: "httpStreamable" }, [{}], {}),
    ).rejects.toThrow(/credential.*mcpClientHttpApi.*required/i);
  });

  it("connection failure with continueOnFail emits error item", async () => {
    setMcpCommunityHttpClient(async () => {
      throw new Error("connect ECONNREFUSED http://localhost:9999/stream");
    });

    const out = await runNode(
      { operation: "listTools", connectionType: "httpStreamable" },
      [{}],
      { mcpClientHttpApi: { httpStreamableUrl: "http://localhost:9999/stream" } },
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/ECONNREFUSED/i);
  });

  it("RPC error throws descriptive error", async () => {
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      return rpcErrorStatus(body.id, -32602, "Invalid tool name");
    });

    await expect(
      runNode({ operation: "listTools", connectionType: "httpStreamable" }, [{}], {
        mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" },
      }),
    ).rejects.toThrow(/Invalid tool name/);
  });

  it("listResources via SSE returns one item per resource", async () => {
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "resources/list") {
        return rpcResponse(body.id, {
          resources: [
            {
              uri: "file://docs/readme",
              name: "README",
              description: "Project readme",
              mimeType: "text/markdown",
            },
            {
              uri: "file://docs/api",
              name: "API Docs",
              description: "API documentation",
              mimeType: "text/html",
            },
          ],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode({ operation: "listResources", connectionType: "sse" }, [{}], {
      mcpClientSseApi: { sseUrl: "http://localhost:3001/sse" },
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.uri).toBe("file://docs/readme");
    expect(out[0][1].json.uri).toBe("file://docs/api");
  });

  it("readResource via HTTP Streamable returns resource contents", async () => {
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "resources/read") {
        return rpcResponse(body.id, {
          contents: [{ uri: "file://data/config.json", text: '{"key": "value"}' }],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode(
      {
        operation: "readResource",
        connectionType: "httpStreamable",
        resourceUri: "file://data/config.json",
      },
      [{}],
      { mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      contents: [{ uri: "file://data/config.json", text: '{"key": "value"}' }],
    });
  });

  it("getPrompt via HTTP Streamable returns prompt result", async () => {
    setMcpCommunityHttpClient(async (opts) => {
      const body = opts.body as { id: number; method: string };
      if (body.method === "prompts/get") {
        return rpcResponse(body.id, {
          name: "greeting",
          messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
        });
      }
      return rpcResponse(body.id, null);
    });

    const out = await runNode(
      {
        operation: "getPrompt",
        connectionType: "httpStreamable",
        promptName: "greeting",
      },
      [{}],
      { mcpClientHttpApi: { httpStreamableUrl: "http://localhost:3001/stream" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("greeting");
  });
});
