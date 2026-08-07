import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.philipsHue";

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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
  nextResponse = response;
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
    return nextResponse;
  }));
}

function restoreFetch() {
  vi.unstubAllGlobals();
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    continueOnFail,
    getCredential: async (name: string) => credentials?.[name] ?? null,
  });
}

async function run(
  params: Record<string, unknown>,
  input: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
): Promise<{ result: INodeExecutionData[][]; ctx: ExecutionContext }> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`Executor ${TYPE} not registered`);
  const node = makeNode({ name: "Philips Hue", type: TYPE, parameters: params });
  const items: INodeExecutionData[] = input.map((j) => ({ json: j }));
  const credentials = opts?.credentials ?? {
    philipsHueOAuth2Api: { accessToken: "test-token", baseUrl: "https://bridge.example.com" },
  };
  const ctx = makeCtx(items, node, opts?.continueOnFail, credentials);
  const result = await executor(ctx, node);
  return { result, ctx };
}

describe("philipsHue", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a node description", () => {
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Philips Hue");
  });

  describe("getAll", () => {
    it("returns all lights from the Hue API", async () => {
      const hueData = {
        data: [
          { id: "1", type: "light", metadata: { name: "Living Room" }, on: { on: true }, dimming: { brightness: 80 } },
          { id: "2", type: "light", metadata: { name: "Kitchen" }, on: { on: false }, dimming: { brightness: 0 } },
        ],
      };
      nextResponse = mockResponse(hueData);

      const { result } = await run({ resource: "light", operation: "getAll" });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/resource/light");

      expect(result[0].length).toBe(2);
      expect(result[0][0].json.id).toBe("1");
      expect(result[0][0].json.metadata?.name).toBe("Living Room");
      expect(result[0][1].json.id).toBe("2");
    });
  });

  describe("get", () => {
    it("fetches a single light by ID", async () => {
      const light = { id: "7a345bcd", type: "light", metadata: { name: "Test Light" }, on: { on: true } };
      nextResponse = mockResponse(light);

      const { result } = await run({ resource: "light", operation: "get", lightId: "7a345bcd" });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/resource/light/7a345bcd");

      expect(result[0][0].json.id).toBe("7a345bcd");
    });
  });

  describe("delete", () => {
    it("deletes a light by ID", async () => {
      nextResponse = mockResponse({ success: true });

      const { result } = await run({ resource: "light", operation: "delete", lightId: "7a345bcd" });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/resource/light/7a345bcd");

      expect(result[0][0].json).toEqual({ success: true });
    });
  });

  describe("update", () => {
    it("turns a light on with transition time", async () => {
      nextResponse = mockResponse({ data: [{ id: "7a345bcd", type: "light" }] });

      const { result } = await run({
        resource: "light",
        operation: "update",
        lightId: "7a345bcd",
        on: true,
        transitionTime: 400,
      });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/resource/light/7a345bcd");

      const body = calls[0].body ? JSON.parse(calls[0].body) : {};
      expect(body.on).toEqual({ on: true });
      expect(body.dynamics).toEqual({ duration: 400 });

      expect(result[0][0].json).toBeDefined();
    });

    it("updates brightness", async () => {
      nextResponse = mockResponse({ data: [{ id: "7a345bcd" }] });

      await run({
        resource: "light",
        operation: "update",
        lightId: "7a345bcd",
        brightness: 75,
      });

      const body = JSON.parse(calls[0].body!);
      expect(body.dimming).toEqual({ brightness: 75 });
    });
  });

  describe("validation", () => {
    it("throws when lightId is missing for get", async () => {
      await expect(run({ resource: "light", operation: "get", lightId: "" })).rejects.toThrow("lightId is required");
    });

    it("throws when lightId is missing for delete", async () => {
      await expect(run({ resource: "light", operation: "delete", lightId: "" })).rejects.toThrow("lightId is required");
    });

    it("throws when lightId is missing for update", async () => {
      await expect(run({ resource: "light", operation: "update", lightId: "" })).rejects.toThrow("lightId is required");
    });
  });

  describe("continueOnFail", () => {
    it("emits error item when credentials are missing and continueOnFail is true", async () => {
      const { result } = await run(
        { resource: "light", operation: "getAll" },
        [{}],
        { continueOnFail: true, credentials: {} },
      );
      expect(result[0].length).toBe(1);
      expect(result[0][0].json).toHaveProperty("error");
      expect(typeof result[0][0].json.error).toBe("string");
    });
  });
});
