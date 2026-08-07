import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.humanticAi";
const TOOL_TYPE = "n8n-nodes-base.humanticAiTool";

const CREDS = { humanticAiApi: { apiKey: "test-api-key" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse({ error: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

const fakeProfile = {
  metadata: { status: 2, analysis_status: "COMPLETE", confidence: 0.92 },
  personality_analysis: {
    disc: { d: 45, i: 30, s: 15, c: 10 },
    ocean: { openness: 70, conscientiousness: 60, extraversion: 50, agreeableness: 65, neuroticism: 30 },
  },
  persona: {
    sales: { advice: "Be direct and data-driven" },
    hiring: { advice: "Focus on structured tasks" },
  },
};

const fakeCreateResponse = {
  metadata: { status: 2, analysis_status: "PENDING" },
  personality_analysis: fakeProfile.personality_analysis,
};

const fakeUpdateResponse = {
  metadata: { status: 2, analysis_status: "UPDATED" },
};

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue humanticAiTool — n8n-nodes-base.humanticAiTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(hasExecutor(TOOL_TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Humantic AI");
    expect(getNodeType(TOOL_TYPE).name).toBe(TYPE);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor(TOOL_TYPE)).toBe(canonical);
  });

  it("create — profile with userId returns personality analysis", async () => {
    const createUrl = "https://api.humantic.ai/v1/user-profile/create?apikey=test-api-key&userId=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fexample&source=linkedin";
    installFetch({
      [createUrl]: fakeCreateResponse,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "create", userId: "https://www.linkedin.com/in/example",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.metadata).toBeDefined();
    expect((json.metadata as Record<string, unknown>).status).toBe(2);
    expect(json.personality_analysis).toBeDefined();
  });

  it("get — profile with persona returns analysis + persona advice", async () => {
    const getUrl = "https://api.humantic.ai/v1/user-profile/get?apikey=test-api-key&userId=user%40example.com&persona=sales%2Chiring";
    installFetch({
      [getUrl]: fakeProfile,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "get", userId: "user@example.com", persona: ["sales", "hiring"],
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.personality_analysis).toBeDefined();
    expect(json.persona).toBeDefined();
    expect((json.metadata as Record<string, unknown>).analysis_status).toBe("COMPLETE");
  });

  it("update — profile with text returns acceptance status", async () => {
    const updateUrl = "https://api.humantic.ai/v1/user-profile/update?apikey=test-api-key&userId=user%40example.com&text=Additional+info";
    installFetch({
      [updateUrl]: fakeUpdateResponse,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "update", userId: "user@example.com", sendResume: false, text: "Additional info",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.metadata).toBeDefined();
    expect((json.metadata as Record<string, unknown>).status).toBe(2);
  });

  it("throws on missing credential", async () => {
    await expect(
      runNode(TYPE, { resource: "profile", operation: "create", userId: "test" }, [{}]),
    ).rejects.toThrow(/humanticAiApi/i);
  });

  it("throws on missing userId", async () => {
    await expect(
      runNode(TYPE, { resource: "profile", operation: "create" }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/userId/i);
  });

  it("continueOnFail — emits error item instead of throwing", async () => {
    const { out } = await runNodeWithCtx(TYPE, {
      resource: "profile", operation: "create",
    }, [{}], { continueOnFail: true, credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.error).toContain("userId");
  });
});
