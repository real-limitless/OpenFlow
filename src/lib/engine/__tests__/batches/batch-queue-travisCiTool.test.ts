import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.travisCiTool";

function mockTravisCiResponse(body: unknown, status = 200) {
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
let nextResponse: ReturnType<typeof mockTravisCiResponse>;

beforeEach(() => {
  nextResponse = mockTravisCiResponse({});
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
  travisCiApi: { apiToken: "abc123token" },
};

describe("batch-queue travisCiTool — n8n-nodes-base.travisCiTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Travis CI Tool");
  });

  describe("build — get", () => {
    it("retrieves a single build by id", async () => {
      const mockBuild = {
        id: 123456,
        number: "42",
        state: "passed",
        started_at: "2025-01-01T00:00:00Z",
        finished_at: "2025-01-01T00:05:00Z",
        duration: 300,
      };
      nextResponse = mockTravisCiResponse(mockBuild);

      const out = await runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "my-org/my-repo", buildId: "123456" },
        [{ json: {} }],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.travis-ci.org/api/v3/build/123456");
      expect(calls[0].method).toBe("GET");
      expect(calls[0].headers["Authorization"]).toBe("token abc123token");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe(123456);
      expect(out[0][0].json.state).toBe("passed");
    });
  });

  describe("build — getAll", () => {
    it("returns at most limit builds", async () => {
      nextResponse = mockTravisCiResponse({
        builds: [
          { id: 1, number: "1", state: "passed" },
          { id: 2, number: "2", state: "created" },
          { id: 3, number: "3", state: "started" },
        ],
      });

      const out = await runNode(
        TYPE,
        { resource: "build", operation: "getAll", slug: "my-org/my-repo", returnAll: false, limit: 2 },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.travis-ci.org/api/v3/repo/my-org%2Fmy-repo/builds");
      expect(calls[0].method).toBe("GET");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.id).toBe(1);
      expect(out[0][1].json.id).toBe(2);
    });

    it("adds branch filter as query parameter", async () => {
      nextResponse = mockTravisCiResponse({
        builds: [{ id: 1, number: "1", state: "passed" }],
      });

      await runNode(
        TYPE,
        { resource: "build", operation: "getAll", slug: "my-org/my-repo", returnAll: true, filters: { branch: "main" } },
        [{}],
        { credentials: CREDS },
      );

      expect(calls[0].url).toContain("branch=main");
    });
  });

  describe("build — cancel", () => {
    it("cancels a build by id", async () => {
      const mockBuild = { id: 123456, state: "canceled" };
      nextResponse = mockTravisCiResponse(mockBuild);

      const out = await runNode(
        TYPE,
        { resource: "build", operation: "cancel", slug: "my-org/my-repo", buildId: "123456" },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.travis-ci.org/api/v3/build/123456/cancel");
      expect(calls[0].method).toBe("POST");
      expect(out[0][0].json.state).toBe("canceled");
    });
  });

  describe("build — restart", () => {
    it("restarts a build by id", async () => {
      const mockBuild = { id: 123456, state: "created" };
      nextResponse = mockTravisCiResponse(mockBuild);

      const out = await runNode(
        TYPE,
        { resource: "build", operation: "restart", slug: "my-org/my-repo", buildId: "123456" },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.travis-ci.org/api/v3/build/123456/restart");
      expect(calls[0].method).toBe("POST");
      expect(out[0][0].json.state).toBe("created");
    });
  });

  describe("build — trigger", () => {
    it("triggers a build with branch and message", async () => {
      const mockResponse = {
        id: 789,
        repository_id: 456,
        created_at: "2025-01-01T00:00:00Z",
        result: "accepted",
        branch: "main",
        commit: { sha: "abc123", message: "Triggered from n8n" },
      };
      nextResponse = mockTravisCiResponse(mockResponse, 202);

      const out = await runNode(
        TYPE,
        { resource: "build", operation: "trigger", slug: "my-org/my-repo", additionalFields: { branch: "main", message: "Triggered from n8n" } },
        [{}],
        { credentials: CREDS },
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.travis-ci.org/api/v3/repo/my-org%2Fmy-repo/requests");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].body).toContain('"branch"');
      expect(calls[0].body).toContain('"main"');
      expect(calls[0].body).toContain('"message"');
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.result).toBe("accepted");
    });
  });

  describe("validation", () => {
    it("rejects missing slug", async () => {
      await expect(runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "", buildId: "123" },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("slug is required");
    });

    it("rejects missing buildId for get", async () => {
      await expect(runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "my-org/my-repo", buildId: "" },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("buildId is required on 'get' operation");
    });

    it("rejects missing credential", async () => {
      await expect(runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "my-org/my-repo", buildId: "123" },
        [{}],
        { credentials: {} },
      )).rejects.toThrow("travisCiApi credential is not configured");
    });
  });

  describe("service failure", () => {
    it("fails on HTTP 401", async () => {
      nextResponse = mockTravisCiResponse({ message: "Unauthorized" }, 401);
      await expect(runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "my-org/my-repo", buildId: "123" },
        [{}],
        { credentials: CREDS },
      )).rejects.toThrow("Travis CI API request failed");
    });

    it("produces error item with continueOnFail", async () => {
      nextResponse = mockTravisCiResponse({ message: "Not Found" }, 404);
      const out = await runNode(
        TYPE,
        { resource: "build", operation: "get", slug: "my-org/my-repo", buildId: "999" },
        [{}],
        { credentials: CREDS, continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toBeDefined();
      expect(out[0][0].json.error.code).toBe(404);
    });
  });
});
