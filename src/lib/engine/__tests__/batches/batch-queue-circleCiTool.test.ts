import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.circleCiTool";

function mockCircleCiResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map([["content-type", "application/json"]]),
    get() { return "application/json"; },
    entries() { return new Map(); },
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

const CREDS = {
  circleCiApi: { apiKey: "abc123token" },
};

describe("batch-queue circleCiTool — n8n-nodes-base.circleCiTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("CircleCI Tool");
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

      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "gh/acme/widget", pipelineNumber: 42 },
        [{ json: {} }],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/github/gh/acme/widget/pipeline/42");
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

      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "getAll", vcs: "bitbucket", projectSlug: "bb/acme/widget", returnAll: false, limit: 2 },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/bitbucket/bb/acme/widget/pipeline");
      expect(calls[0].method).toBe("GET");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.id).toBe("pipeline-1");
      expect(out[0][1].json.id).toBe("pipeline-2");
    });
  });

  describe("pipeline — trigger", () => {
    it("triggers a pipeline with branch", async () => {
      const mockTriggerResponse = {
        number: 43,
        state: "created",
        id: "pipeline-triggered",
        created_at: "2025-01-01T00:00:00Z",
      };
      nextResponse = mockCircleCiResponse(mockTriggerResponse, 201);

      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "trigger", vcs: "github", projectSlug: "gh/my-org/my-repo", additionalFields: { branch: "main" } },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://circleci.com/api/v2/project/github/gh/my-org/my-repo/pipeline");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].body).toContain('"branch"');
      expect(calls[0].body).toContain('"main"');
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe("pipeline-triggered");
    });

    it("triggers a pipeline with tag", async () => {
      nextResponse = mockCircleCiResponse({ number: 44, state: "created", id: "pipeline-44" }, 201);

      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "trigger", vcs: "github", projectSlug: "gh/my-org/my-repo", additionalFields: { tag: "v1.0" } },
        [{}],
        { credentials: CREDS },
      );

      expect(calls[0].body).toContain('"tag"');
      expect(calls[0].body).toContain('"v1.0"');
      expect(out[0][0].json.number).toBe(44);
    });
  });

  describe("getAll with branch filter", () => {
    it("adds branch query parameter when filter is set", async () => {
      nextResponse = mockCircleCiResponse({
        items: [
          { id: "pipeline-1", number: 1, state: "created" },
          { id: "pipeline-2", number: 2, state: "created" },
        ],
      });

      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "getAll", vcs: "github", projectSlug: "gh/my-org/my-repo", returnAll: true, filters: { branch: "main" } },
        [{}],
        { credentials: CREDS },
      );

      expect(calls[0].url).toContain("branch=main");
      expect(out[0]).toHaveLength(2);
    });
  });

  describe("validation", () => {
    it("rejects missing project slug", async () => {
      await expect(runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "", pipelineNumber: 42 },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("project slug is required");
    });

    it("rejects missing pipeline number for get", async () => {
      await expect(runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "gh/acme/widget", pipelineNumber: 0 },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("pipeline number is required");
    });

    it("rejects missing credential", async () => {
      await expect(runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "gh/acme/widget", pipelineNumber: 1 },
        [{}],
        { credentials: {} },
      )).rejects.toThrow("circleCiApi credential is not configured");
    });
  });

  describe("service failure", () => {
    it("fails on HTTP 401", async () => {
      nextResponse = mockCircleCiResponse({ message: "Unauthorized" }, 401);
      await expect(runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "gh/acme/widget", pipelineNumber: 1 },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("CircleCI API request failed");
    });

    it("produces error item with continueOnFail", async () => {
      nextResponse = mockCircleCiResponse({ message: "Not Found" }, 404);
      const out = await runNode(
        TYPE,
        { resource: "pipeline", operation: "get", vcs: "github", projectSlug: "gh/acme/widget", pipelineNumber: 999 },
        [{}],
        { credentials: CREDS, continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
      expect(out[0][0].json.error.code).toBe(404);
    });
  });
});
