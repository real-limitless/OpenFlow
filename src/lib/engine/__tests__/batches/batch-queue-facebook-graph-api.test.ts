import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.facebookGraphApi";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue facebook-graph-api — n8n-nodes-base.facebookGraphApi", () => {
  beforeEach(() => {
    installFetch(mockResponse({ id: "12345", name: "Test User" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Facebook Graph API");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.facebookGraphApi")).toBe(getExecutor(TYPE));
  });

  describe("simple GET request", () => {
    it("sends GET to graph.facebook.com/me", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "GET",
          node: "me",
          edge: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "12345", name: "Test User" });
      const call = lastCall();
      expect(call.url).toBe("https://graph.facebook.com/me");
      expect(call.method).toBe("GET");
      expect(call.headers["Authorization"]).toBe("Bearer test-token");
    });
  });

  describe("POST with binary file", () => {
    it("sends POST to graph-video.facebook.com with binary body", async () => {
      installFetch(mockResponse({ id: "vid_001", success: true }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Video",
          method: "POST",
          node: "/my-page-id/videos",
          sendBinaryFile: true,
          inputBinaryField: "video",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{
          json: {},
          binary: {
            video: { data: Buffer.from("fake-video-data").toString("base64"), mimeType: "video/mp4", fileName: "intro.mp4" },
          },
        }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "vid_001", success: true });
      const call = lastCall();
      expect(call.url).toBe("https://graph-video.facebook.com/my-page-id/videos");
      expect(call.method).toBe("POST");
      expect(call.headers["Content-Type"]).toBe("video/mp4");
    });
  });

  describe("DELETE request", () => {
    it("sends DELETE to graph.facebook.com with object id", async () => {
      installFetch(mockResponse({ success: true }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "DELETE",
          node: "/12345",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ success: true });
      const call = lastCall();
      expect(call.url).toBe("https://graph.facebook.com/12345");
      expect(call.method).toBe("DELETE");
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
      installFetch(mockResponse({ error: { message: "not found" } }, { status: 404 }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "GET",
          node: "/nonexistent-resource",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 500 } });
    });
  });

  describe("missing required parameters", () => {
    it("throws when node is empty", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "GET",
          node: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow("node");
    });
  });

  describe("graphApiVersion", () => {
    it("appends version to URL when provided", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "GET",
          graphApiVersion: "v19.0",
          node: "me",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toBe("https://graph.facebook.com/v19.0/me");
    });
  });

  describe("edge parameter", () => {
    it("appends edge to URL when provided", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          host: "Default",
          method: "GET",
          node: "me",
          edge: "feed",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toBe("https://graph.facebook.com/me/feed");
    });
  });
});