import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { createExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.circleCi";

function mockCircleCiResponse(body: unknown, status = 200) {
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
let nextResponse: ReturnType<typeof mockCircleCiResponse>;

beforeEach(() => {
  nextResponse = mockCircleCiResponse({});
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
  circleCiApi: { apiKey: "abc123token" },
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

describe("batch-queue circle-ci — n8n-nodes-base.circleCi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("CircleCI");
  });

  describe("pipeline — get one", () => {
    it("retrieves a single pipeline by number", async () => {
      const mockPipeline = {
        id: "pipeline-42",
        project_slug: "gh/acme/widget",
        number: 42,
        state: "created",
      };
      nextResponse = mockCircleCiResponse(mockPipeline);

      const out = await run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "acme/widget", pipelineNumber: "42" },
        [{ json: { slug: "acme/widget", number: 42 } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/github/acme/widget/pipeline/42");
      expect(calls[0].method).toBe("GET");
      expect(calls[0].headers["Circleci-Token"]).toBe("abc123token");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe("pipeline-42");
    });
  });

  describe("pipeline — get many", () => {
    it("returns at most limit pipelines", async () => {
      nextResponse = mockCircleCiResponse({
        items: [
          { id: "pipeline-1", number: 1 },
          { id: "pipeline-2", number: 2 },
          { id: "pipeline-3", number: 3 },
        ],
      });

      const out = await run(
        { resource: "pipeline", operation: "getAll", provider: "bitbucket", projectSlug: "acme/widget", returnAll: false, limit: 2 },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/bitbucket/acme/widget/pipeline");
      expect(calls[0].method).toBe("GET");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.id).toBe("pipeline-1");
      expect(out[0][1].json.id).toBe("pipeline-2");
    });
  });

  describe("pipeline — trigger", () => {
    it("triggers a pipeline with branch", async () => {
      const mockTriggerResponse = {
        id: "pipeline-triggered",
        number: 43,
        state: "created",
        project_slug: "gh/acme/widget",
      };
      nextResponse = mockCircleCiResponse(mockTriggerResponse, 201);

      const out = await run(
        { resource: "pipeline", operation: "trigger", provider: "github", projectSlug: "acme/widget", branch: "main" },
        [{ json: { branch: "main" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/github/acme/widget/pipeline");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].body).toContain('"branch"');
      expect(calls[0].body).toContain('"main"');
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe("pipeline-triggered");
    });
  });

  describe("validation", () => {
    it("rejects missing project slug", async () => {
      await expect(run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "", pipelineNumber: "42" },
        [{}],
      )).rejects.toThrow("project slug is required");
    });

    it("rejects missing pipeline number for get", async () => {
      await expect(run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "acme/widget", pipelineNumber: "" },
        [{}],
      )).rejects.toThrow("pipeline number is required");
    });

    it("rejects missing credential", async () => {
      await expect(run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "acme/widget", pipelineNumber: "1" },
        [{}],
        { credentials: {} },
      )).rejects.toThrow("circleCiApi credential is not configured");
    });
  });

  describe("service failure", () => {
    it("fails on HTTP 401", async () => {
      nextResponse = mockCircleCiResponse({ message: "Unauthorized" }, 401);
      await expect(run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "acme/widget", pipelineNumber: "1" },
        [{}],
      )).rejects.toThrow(/Unauthorized|status 401/);
    });

    it("produces error item with continueOnFail", async () => {
      nextResponse = mockCircleCiResponse({ message: "Not Found" }, 404);
      const out = await run(
        { resource: "pipeline", operation: "get", provider: "github", projectSlug: "acme/widget", pipelineNumber: "999" },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
      expect(out[0][0].json.error.code).toBe(404);
    });
  });
});