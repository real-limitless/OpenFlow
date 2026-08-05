import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.goToWebinar";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get() { return null; },
      entries() { return new Map().entries(); },
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

function installFetch(response = mockResponse({ webinarKey: "w123", subject: "Test" })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
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
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) => ("json" in i ? i : { json: i }) as INodeExecutionData);
}

async function runExecutor(
  params: Record<string, unknown>,
  input: Array<Record<string, unknown>> = [{}],
  credentials?: Record<string, Record<string, unknown>>,
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters: params,
  });
  const items = toItems(input);
  const ctx = {
    node,
    getInputItems: () => items,
    getParam: (name: string, defaultVal?: unknown) => params[name] ?? defaultVal,
    getParams: () => params,
    getNode: () => node,
    getWorkflow: () => ({ id: "wf-test", name: "test", active: false, nodes: [node], connections: {}, settings: {} }),
    continueOnFail: () => false,
    getCredential: async (name: string) => {
      if (credentials && credentials[name]) return credentials[name] as any;
      if (name === "goToWebinarOAuth2Api") return { accessToken: "test-token" };
      return null;
    },
    evaluate: (expr: string) => expr,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
  } as any;

  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`Executor ${TYPE} not registered`);
  return executor(ctx, node);
}

describe("GoToWebinar executor", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered and has a description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("GoToWebinar");
  });

  describe("Webinar", () => {
    it("creates a webinar", async () => {
      const [output] = await runExecutor({
        resource: "webinar",
        operation: "create",
        subject: "={{ $json.subject }}",
        description: "={{ $json.description }}",
        times: '[{"startTime":"2026-08-06T14:00:00Z","endTime":"2026-08-06T15:00:00Z"}]',
        timeZone: "America/New_York",
      }, [{ json: { subject: "Test Webinar", description: "A test webinar" } }]);

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/organizers/self/webinars");
      const body = JSON.parse(calls[0].body!);
      expect(body.subject).toBe("Test Webinar");
      expect(body.description).toBe("A test webinar");
      expect(body.timeZone).toBe("America/New_York");
      expect(output).toHaveLength(1);
      expect(output[0].json).toHaveProperty("webinarKey");
    });

    it("gets all webinars with limit", async () => {
      installFetch(mockResponse([
        { webinarKey: "w1", subject: "Webinar 1" },
        { webinarKey: "w2", subject: "Webinar 2" },
      ]));

      const [output] = await runExecutor({
        resource: "webinar",
        operation: "getAll",
        returnAll: false,
        limit: 5,
      });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/organizers/self/webinars");
      expect(calls[0].url).toContain("page=0");
      expect(calls[0].url).toContain("size=5");
      expect(output).toHaveLength(2);
      expect(output[0].json.webinarKey).toBe("w1");
      expect(output[1].json.subject).toBe("Webinar 2");
    });
  });

  describe("Registrant", () => {
    it("creates a registrant", async () => {
      installFetch(mockResponse({ registrantKey: "r123", email: "test@example.com", status: "APPROVED" }));

      const [output] = await runExecutor({
        resource: "registrant",
        operation: "create",
        webinarKey: "w123",
        email: "test@example.com",
        firstName: "Jane",
        lastName: "Doe",
      });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/organizers/self/webinars/w123/registrants");
      const body = JSON.parse(calls[0].body!);
      expect(body.email).toBe("test@example.com");
      expect(output).toHaveLength(1);
      expect(output[0].json.registrantKey).toBe("r123");
      expect(output[0].json.email).toBe("test@example.com");
    });

    it("gets registrants for a webinar", async () => {
      installFetch(mockResponse([
        { registrantKey: "r1", email: "a@b.com" },
        { registrantKey: "r2", email: "c@d.com" },
      ]));

      const [output] = await runExecutor({
        resource: "registrant",
        operation: "getAll",
        webinarKey: "w123",
      });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/webinars/w123/registrants");
      expect(output).toHaveLength(2);
    });
  });

  describe("Panelist", () => {
    it("gets all panelists for a webinar", async () => {
      installFetch(mockResponse([
        { key: "p1", email: "panelist1@example.com", name: "Panelist One" },
      ]));

      const [output] = await runExecutor({
        resource: "panelist",
        operation: "getAll",
        webinarKey: "w123",
      });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/webinars/w123/panelists");
      expect(output).toHaveLength(1);
      expect(output[0].json.key).toBe("p1");
    });
  });

  describe("Error handling", () => {
    it("throws on API error when continueOnFail is false", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      await expect(runExecutor({
        resource: "webinar",
        operation: "get",
        webinarKey: "nonexistent",
      })).rejects.toThrow();
    });

    it("returns error item on API error when continueOnFail is true", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "webinar", operation: "get", webinarKey: "nonexistent" },
      });
      const executor = getExecutor(TYPE)!;
      const ctx = {
        node,
        getInputItems: () => [{ json: {} }],
        getParam: (name: string, defaultVal?: unknown) => node.parameters[name] ?? defaultVal,
        getParams: () => node.parameters,
        getNode: () => node,
        getWorkflow: () => ({ id: "wf-test", name: "test", active: false, nodes: [node], connections: {}, settings: {} }),
        continueOnFail: () => true,
        getCredential: async () => ({ accessToken: "test-token" }),
        evaluate: (expr: string) => expr,
        setCustomData: () => {},
        getCustomData: () => undefined,
        getAllCustomData: () => ({}),
      } as any;

      const [output] = await executor(ctx, node);
      expect(output).toHaveLength(1);
      const err = output[0].json as { error?: { code?: number } };
      expect(err.error).toBeDefined();
      expect(err.error!.code).toBe(404);
    });
  });
});
