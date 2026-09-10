import { afterEach, describe, expect, it } from "vitest";
import type { SdkHttpResponse } from "@/sdk";
import {
  filterToolsForBackends,
  mcpFlowMcpUrl,
  mergeToolCatalogs,
  normalizeBackends,
  parseJsonRpcBody,
  parseMcpToolContentJson,
  setMcpFlowGatewayHttpClient,
  toolBelongsToBackend,
  connectMcpFlow,
} from "../gateway";

afterEach(() => setMcpFlowGatewayHttpClient(null));

function rpcResult(
  id: number,
  result: unknown,
  headers: Record<string, string> = {},
): SdkHttpResponse {
  return {
    status: 200,
    headers,
    body: { jsonrpc: "2.0", id, result },
  };
}

function toolContent(obj: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

describe("mcp-flow gateway helpers", () => {
  it("normalizes gateway URLs to /mcp", () => {
    expect(mcpFlowMcpUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787/mcp");
    expect(mcpFlowMcpUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787/mcp");
    expect(mcpFlowMcpUrl("http://127.0.0.1:8787/mcp")).toBe("http://127.0.0.1:8787/mcp");
  });

  it("parses SSE JSON-RPC bodies", () => {
    const parsed = parseJsonRpcBody(
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n',
    );
    expect(parsed.result).toEqual({ ok: true });
  });

  it("parses tools/call text JSON", () => {
    const parsed = parseMcpToolContentJson(
      toolContent({ backends: [{ slug: "deepwiki", title: "DeepWiki" }] }),
    );
    expect(normalizeBackends(parsed)[0]?.slug).toBe("deepwiki");
  });

  it("filters tools by backend slug prefix", () => {
    expect(toolBelongsToBackend("deepwiki__search", "deepwiki")).toBe(true);
    expect(toolBelongsToBackend("other__search", "deepwiki")).toBe(false);
    const filtered = filterToolsForBackends(
      [{ name: "mf_status" }, { name: "deepwiki__search" }, { name: "yh-finance__quote" }],
      ["deepwiki"],
      false,
    );
    expect(filtered.map((t) => t.name)).toEqual(["deepwiki__search"]);
  });

  it("merges tools/list schemas over mf_list_tools names", () => {
    const merged = mergeToolCatalogs(
      [{ name: "deepwiki__search", description: "from list", inputSchema: { type: "object" } }],
      [{ name: "deepwiki__search", description: "from mf" }, { name: "deepwiki__read" }],
    );
    expect(merged.find((t) => t.name === "deepwiki__search")?.inputSchema).toEqual({
      type: "object",
    });
    expect(merged.map((t) => t.name).sort()).toEqual(["deepwiki__read", "deepwiki__search"]);
  });
});

describe("mcp-flow session", () => {
  it("initializes, lists backends, and discovers namespaced tools missing from tools/list", async () => {
    const methods: string[] = [];
    setMcpFlowGatewayHttpClient(async (opts) => {
      const body = opts.body as { id?: number; method: string; params?: Record<string, unknown> };
      methods.push(body.method);
      const id = body.id ?? 0;
      if (body.method === "initialize") {
        return rpcResult(id, { protocolVersion: "2024-11-05" }, { "mcp-session-id": "sess-1" });
      }
      if (body.method === "notifications/initialized") {
        return { status: 202, headers: {}, body: null };
      }
      if (body.method === "tools/list") {
        return rpcResult(id, {
          tools: [{ name: "mf_status", description: "status" }],
        });
      }
      if (body.method === "tools/call" && body.params?.name === "mf_list_tools") {
        return rpcResult(
          id,
          toolContent({
            tools: [
              { name: "deepwiki__search", description: "Search wiki", backend: "deepwiki" },
              { name: "yh-finance__quote", backend: "yh-finance" },
            ],
          }),
        );
      }
      if (body.method === "tools/call" && body.params?.name === "mf_list_backends") {
        return rpcResult(
          id,
          toolContent({
            backends: [
              { slug: "deepwiki", title: "DeepWiki", enabled: true, transport: "streamable-http" },
              { slug: "yh-finance", title: "Yahoo", enabled: false },
            ],
          }),
        );
      }
      return rpcResult(id, null);
    });

    const session = await connectMcpFlow({
      url: "http://gw.test",
      apiKey: "mf_test",
    });
    expect(session.endpoint).toBe("http://gw.test/mcp");
    expect(session.sessionId).toBe("sess-1");

    const listed = await session.mfListBackends();
    expect(listed.backends.map((b) => b.slug)).toEqual(["deepwiki", "yh-finance"]);

    const tools = await session.discoverTools({ backends: ["deepwiki"] });
    expect(tools.map((t) => t.name)).toEqual(["deepwiki__search"]);
    expect(methods).toContain("initialize");
    expect(methods).toContain("tools/list");
  });

  it("mf_status parses JSON content and empty backends uses enabled slugs", async () => {
    setMcpFlowGatewayHttpClient(async (opts) => {
      const body = opts.body as { id?: number; method: string; params?: Record<string, unknown> };
      expect(String(opts.headers?.authorization ?? "")).toMatch(/^Bearer mf_test$/);
      const id = body.id ?? 0;
      if (body.method === "initialize") {
        return rpcResult(id, { protocolVersion: "2024-11-05" });
      }
      if (body.method === "tools/list") {
        return rpcResult(id, { tools: [{ name: "mf_status" }] });
      }
      if (body.method === "tools/call" && body.params?.name === "mf_status") {
        return rpcResult(id, toolContent({ ok: true, project: "default" }));
      }
      if (body.method === "tools/call" && body.params?.name === "mf_list_tools") {
        return rpcResult(
          id,
          toolContent({
            tools: [
              { name: "deepwiki__search", backend: "deepwiki" },
              { name: "yh-finance__quote", backend: "yh-finance" },
            ],
          }),
        );
      }
      if (body.method === "tools/call" && body.params?.name === "mf_list_backends") {
        return rpcResult(
          id,
          toolContent({
            backends: [
              { slug: "deepwiki", enabled: true },
              { slug: "yh-finance", enabled: false },
            ],
          }),
        );
      }
      return rpcResult(id, null);
    });

    const session = await connectMcpFlow({ url: "http://gw.test/mcp", apiKey: "mf_test" });
    const status = await session.mfStatus();
    expect(status).toEqual({ ok: true, project: "default" });

    const tools = await session.discoverTools();
    expect(tools.map((t) => t.name)).toEqual(["deepwiki__search"]);
  });
});
