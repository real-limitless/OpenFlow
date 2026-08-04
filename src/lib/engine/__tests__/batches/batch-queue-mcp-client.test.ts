import { describe, it, expect, afterEach, vi } from "vitest";
import type { SdkHttpRequestOptions, SdkHttpResponse } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.mcpClient";

vi.mock("@/sdk/helpers/http", () => ({
  sdkHttpRequest: vi.fn(),
}));

import { sdkHttpRequest } from "@/sdk/helpers/http";

const mockHttp = sdkHttpRequest as ReturnType<typeof vi.fn>;

function rpcResponse(id: number, result: unknown): SdkHttpResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id, result },
  };
}

function rpcError(id: number, code: number, message: string): SdkHttpResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id, error: { code, message } },
  };
}

async function runMcpClient(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const executor = getExecutor(TYPE)!;
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      inputItems.map((item) =>
        item && typeof item === "object" && "json" in item
          ? (item as INodeExecutionData)
          : { json: item as Record<string, unknown> },
      ),
    continueOnFail: false,
    getCredential: async () => null,
  });
  return executor(ctx, node);
}

describe("batch-queue mcpClient — @n8n/n8n-nodes-langchain.mcpClient", () => {
  afterEach(() => {
    mockHttp.mockReset();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("MCP Client");
    expect(desc.inputs).toEqual(["main"]);
    expect(desc.outputs).toEqual(["main"]);
  });

  it("execute a tool with manual parameters", async () => {
    mockHttp.mockResolvedValue(
      rpcResponse(1, { content: [{ type: "text", text: "Hello, Alice!" }] }),
    );

    const out = await runMcpClient(
      {
        mcpEndpointUrl: "https://mcp.example.com/sse",
        authentication: "none",
        toolName: "greet",
        inputMode: "manual",
      },
      [{ input: "Alice" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.toolName).toBe("greet");
    expect(out[0][0].json.content).toEqual([{ type: "text", text: "Hello, Alice!" }]);

    const callArgs = mockHttp.mock.calls[0][0] as SdkHttpRequestOptions;
    expect(callArgs.url).toBe("https://mcp.example.com/sse");
    expect(callArgs.method).toBe("POST");
    const body = callArgs.body as { method: string; params: Record<string, unknown> };
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("greet");
    expect(body.params.arguments).toEqual({ input: "Alice" });
  });

  it("execute a tool with JSON parameters", async () => {
    mockHttp.mockResolvedValue(
      rpcResponse(1, { content: [{ type: "text", text: "8" }] }),
    );

    const out = await runMcpClient(
      {
        mcpEndpointUrl: "https://mcp.example.com/sse",
        authentication: "none",
        toolName: "math",
        inputMode: "json",
        jsonParameters: '{"op":"add","a":3,"b":5}',
      },
      [{}],
    );

    expect(out[0][0].json.toolName).toBe("math");
    expect(out[0][0].json.content).toEqual([{ type: "text", text: "8" }]);

    const body = mockHttp.mock.calls[0][0].body as { params: Record<string, unknown> };
    expect(body.params.arguments).toEqual({ op: "add", a: 3, b: 5 });
  });

  it("tool returns image content with convertToBinary", async () => {
    mockHttp.mockResolvedValue(
      rpcResponse(1, {
        content: [
          { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
        ],
      }),
    );

    const out = await runMcpClient(
      {
        mcpEndpointUrl: "https://mcp.example.com/sse",
        authentication: "none",
        toolName: "render",
        inputMode: "json",
        jsonParameters: '{"chart":"pie"}',
        options: { convertToBinary: true },
      },
      [{}],
    );

    expect(out[0][0].json.toolName).toBe("render");
    expect(out[0][0].json.content).toEqual([
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ]);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!["image_0"]).toBeDefined();
    expect(out[0][0].binary!["image_0"].data).toBe("iVBORw0KGgo=");
    expect(out[0][0].binary!["image_0"].mimeType).toBe("image/png");
  });

  it("connection failure throws", async () => {
    mockHttp.mockRejectedValue(new Error("Connection refused"));

    await expect(
      runMcpClient(
        {
          mcpEndpointUrl: "https://mcp.example.com:9999/sse",
          authentication: "none",
          toolName: "greet",
        },
        [{}],
      ),
    ).rejects.toThrow();
  });

  it("connection failure with continueOnFail emits error item", async () => {
    mockHttp.mockRejectedValue(new Error("Connection refused"));

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        mcpEndpointUrl: "https://mcp.example.com:9999/sse",
        authentication: "none",
        toolName: "greet",
      },
    });
    const executor = getExecutor(TYPE)!;
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });

    const out = await executor(ctx, node);
    expect(out[0][0].json.isError).toBe(true);
  });

  it("throws when endpoint is missing", async () => {
    await expect(
      runMcpClient({ authentication: "none", toolName: "greet" }, [{}]),
    ).rejects.toThrow(/mcpEndpointUrl is required/i);
  });

  it("throws when toolName is missing", async () => {
    await expect(
      runMcpClient({ mcpEndpointUrl: "https://mcp.example.com/sse", authentication: "none" }, [{}]),
    ).rejects.toThrow(/toolName is required/i);
  });

  it("throws on invalid JSON parameters", async () => {
    await expect(
      runMcpClient(
        {
          mcpEndpointUrl: "https://mcp.example.com/sse",
          authentication: "none",
          toolName: "test",
          inputMode: "json",
          jsonParameters: "not-json",
        },
        [{}],
      ),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("RPC error from server throws", async () => {
    mockHttp.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid tool name" } },
    });

    await expect(
      runMcpClient(
        {
          mcpEndpointUrl: "https://mcp.example.com/sse",
          authentication: "none",
          toolName: "nonexistent",
        },
        [{}],
      ),
    ).rejects.toThrow(/Invalid tool name/i);
  });

  it("HTTP error from server throws", async () => {
    mockHttp.mockResolvedValue({
      status: 500,
      headers: {},
      body: "Internal Server Error",
    });

    await expect(
      runMcpClient(
        {
          mcpEndpointUrl: "https://mcp.example.com/sse",
          authentication: "none",
          toolName: "greet",
        },
        [{}],
      ),
    ).rejects.toThrow(/500/);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
