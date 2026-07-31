import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jenkins";

function mockJenkinsResponse(body: unknown, status = 200) {
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
let nextResponse: ReturnType<typeof mockJenkinsResponse>;

beforeEach(() => {
  nextResponse = mockJenkinsResponse({});
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
  jenkinsApi: { url: "https://jenkins.example.com", username: "admin", token: "abc123token" },
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

describe("batch-queue jenkins — n8n-nodes-base.jenkins", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Jenkins");
  });

  describe("build — list builds", () => {
    it("returns builds for a job", async () => {
      nextResponse = mockJenkinsResponse({
        builds: [
          { number: 1, url: "https://jenkins.example.com/job/release/1/", result: "SUCCESS" },
          { number: 2, url: "https://jenkins.example.com/job/release/2/", result: "SUCCESS" },
        ],
      });
      const out = await run(
        { resource: "build", operation: "list", job: "release" },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://jenkins.example.com/job/release/api/json?tree=builds[*]");
      expect(calls[0].method).toBe("GET");
      expect(calls[0].headers).toHaveProperty("Authorization");
      expect(calls[0].headers.Authorization).toMatch(/^Basic /);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.number).toBe(1);
    });

    it("rejects missing job", async () => {
      await expect(run({ resource: "build", operation: "list", job: "" })).rejects.toThrow("job is required");
    });
  });

  describe("job — trigger without parameters", () => {
    it("posts to job build action", async () => {
      nextResponse = mockJenkinsResponse({}, 201);
      const out = await run(
        { resource: "job", operation: "trigger", job: "release" },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://jenkins.example.com/job/release/build");
      expect(calls[0].method).toBe("POST");
      expect(out[0][0].json.success).toBe(true);
    });
  });

  describe("job — trigger with parameters", () => {
    it("sends build parameters preserving false value", async () => {
      nextResponse = mockJenkinsResponse({}, 201);
      const buildParameters = { parameters: [{ name: "environment", value: "staging" }, { name: "dryRun", value: "false" }] };
      const out = await run(
        { resource: "job", operation: "triggerWithParameters", job: "release", buildParameters },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://jenkins.example.com/job/release/buildWithParameters");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].headers["Content-Type"]).toContain("application/x-www-form-urlencoded");
      expect(calls[0].body).toContain("environment=staging");
      expect(calls[0].body).toContain("dryRun=false");
      expect(out[0][0].json.success).toBe(true);
    });
  });

  describe("instance — safe restart", () => {
    it("posts to safeRestart", async () => {
      nextResponse = mockJenkinsResponse({});
      const out = await run(
        { resource: "instance", operation: "safeRestart" },
        [{}],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://jenkins.example.com/safeRestart");
      expect(calls[0].method).toBe("POST");
      expect(out[0][0].json.operation).toBe("safeRestart");
    });
  });

  describe("service failure", () => {
    it("fails on HTTP 401", async () => {
      nextResponse = mockJenkinsResponse({ message: "Unauthorized" }, 401);
      await expect(run(
        { resource: "instance", operation: "quietDown" },
        [{}],
      )).rejects.toThrow(/Unauthorized|status 401/);
    });

    it("produces error item with continueOnFail", async () => {
      nextResponse = mockJenkinsResponse({ message: "Not Found" }, 404);
      const out = await run(
        { resource: "job", operation: "trigger", job: "nonexistent" },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
      expect(out[0][0].json.error.code).toBe(404);
    });
  });
});