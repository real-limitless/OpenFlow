import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rundeck";

function mockRundeckResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return "application/json"; }, entries() { return new Map(); } },
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
let nextResponse: ReturnType<typeof mockRundeckResponse>;

beforeEach(() => {
  nextResponse = mockRundeckResponse({});
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: (init?.method ?? "GET").toUpperCase(),
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return nextResponse;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
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
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = {
  rundeckApi: { url: "https://rundeck.example.com", token: "abc123token" },
};

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue rundeck — n8n-nodes-base.rundeck", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Rundeck");
  });

  describe("executeJob", () => {
    it("posts to /api/17/job/{id}/run with minimal options", async () => {
      nextResponse = mockRundeckResponse({
        id: 1234,
        status: "running",
        job: { id: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a", name: "restart", group: "app2/dev", project: "test" },
        description: "restart",
      });
      const out = await run(
        { resource: "job", operation: "executeJob", jobId: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a" },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://rundeck.example.com/api/17/job/3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a/run");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].headers["X-Rundeck-Auth-Token"]).toBe("abc123token");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe(1234);
      expect(out[0][0].json.status).toBe("running");
    });

    it("sends node filter, log level, and options", async () => {
      nextResponse = mockRundeckResponse({
        id: 5678,
        status: "running",
        job: { id: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a", name: "restart", group: "app2/dev", project: "test" },
      });
      const out = await run(
        {
          resource: "job",
          operation: "executeJob",
          jobId: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
          nodeFilter: "name: web-*",
          logLevel: "VERBOSE",
          options: { options: [{ name: "timeout", value: "300" }, { name: "region", value: "us-east-1" }] },
        },
        [{}],
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.filter).toBe("name: web-*");
      expect(body.loglevel).toBe("VERBOSE");
      expect(body.options).toEqual({ timeout: "300", region: "us-east-1" });
      expect(out[0][0].json.id).toBe(5678);
    });
  });

  describe("getJobMetadata", () => {
    it("gets job definition from /api/17/job/{id}", async () => {
      nextResponse = mockRundeckResponse({
        href: "http://madmartigan.local:4440/api/17/job/3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
        id: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a",
        name: "restart",
        group: "app2/dev",
        project: "test",
        description: "",
        options: {},
      });
      const out = await run(
        { resource: "job", operation: "getJobMetadata", jobId: "3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a" },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://rundeck.example.com/api/17/job/3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a");
      expect(calls[0].method).toBe("GET");
      expect(out[0][0].json.id).toBe("3b6c19f6-41ee-475f-8fd0-8f1a26f27a9a");
      expect(out[0][0].json.name).toBe("restart");
    });
  });

  describe("validation", () => {
    it("throws on missing jobId", async () => {
      await expect(run(
        { resource: "job", operation: "executeJob", jobId: "" },
        [{}],
      )).rejects.toThrow("jobId is required");
    });

    it("throws on missing credentials", async () => {
      await expect(run(
        { resource: "job", operation: "executeJob", jobId: "abc-123" },
        [{}],
        { credentials: {} },
      )).rejects.toThrow("Rundeck credentials are required");
    });
  });

  describe("service failure", () => {
    it("throws on HTTP 401", async () => {
      nextResponse = mockRundeckResponse({ message: "Unauthorized" }, 401);
      await expect(run(
        { resource: "job", operation: "executeJob", jobId: "abc-123" },
        [{}],
      )).rejects.toThrow(/status 401/);
    });
  });
});