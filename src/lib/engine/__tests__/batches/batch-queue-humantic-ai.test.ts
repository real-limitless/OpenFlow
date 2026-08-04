import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, getExecutorMap, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.humanticAi";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string; method: string }> = [];

function installFetch(routes: Record<string, unknown | { body: unknown; status?: number }>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = String(url);
      const method = init?.method ?? "GET";
      calls.push({ url: key, method });

      const route = routes[key];
      if (route === undefined) {
        return mockJsonResponse({ error: "not_found" }, 404);
      }
      if (typeof route === "object" && route !== null && "body" in route) {
        const r = route as { body: unknown; status?: number };
        return mockJsonResponse(r.body, r.status ?? 200);
      }
      return mockJsonResponse(route);
    }),
  );
}

function makeCtx(
  items: Array<Record<string, unknown> | INodeExecutionData> = [],
  node: INode = makeNode(),
  continueOnFail = false,
): ExecutionContext {
  const normalized: INodeExecutionData[] = items.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async (_name: string) => ({ apiKey: "test-key" }),
  });
}

async function runNode(
  type: string,
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const map = getExecutorMap();
  const executor = map[type];
  if (!executor) {
    throw new Error(`No executor registered for ${type}`);
  }
  const node = makeNode({ name: "N", type, parameters });
  const ctx = makeCtx(inputItems, node, opts?.continueOnFail);
  return executor(ctx, node);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue humantic-ai — n8n-nodes-base.humanticAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Humantic AI");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.humanticAi")).toBe(canonical);
  });

  it("create profile from LinkedIn URL calls API and returns response", async () => {
    const fakeResponse = {
      metadata: { status: 1, analysis_status: "PROCESSING" },
      personality_analysis: { disc: { D: 50, I: 60, S: 40, C: 70 } },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/create?apikey=test-key&userId=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fexample&source=linkedin":
        fakeResponse,
    });
    const out = await runNode(
      TYPE,
      { resource: "profile", operation: "create", userId: "https://www.linkedin.com/in/example" },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(out[0]).toHaveLength(1);
    expect((json.metadata as Record<string, unknown>).status).toBe(1);
    expect(json.personality_analysis).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("get profile with persona returns persona data", async () => {
    const fakeResponse = {
      metadata: { analysis_status: "COMPLETE" },
      personality_analysis: { ocean: { O: 70, C: 80, E: 55, A: 65, S: 45 } },
      persona: { sales: "Direct and assertive communicator", hiring: "Collaborative team player" },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/get?apikey=test-key&userId=user-abc-123&persona=sales%2Chiring":
        fakeResponse,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "profile",
        operation: "get",
        userId: "user-abc-123",
        persona: ["sales", "hiring"],
      },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(out[0]).toHaveLength(1);
    expect((json.metadata as Record<string, unknown>).analysis_status).toBe("COMPLETE");
    expect(json.persona).toBeDefined();
    expect(json.personality_analysis).toBeDefined();
  });

  it("update profile with text returns update confirmation", async () => {
    const fakeResponse = {
      metadata: { status: 2 },
      personality_analysis: { disc: { D: 55, I: 65, S: 35, C: 75 } },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/update?apikey=test-key&userId=user-abc-123&text=simple+text":
        fakeResponse,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "profile",
        operation: "update",
        userId: "user-abc-123",
        sendResume: false,
        text: "simple text",
      },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(out[0]).toHaveLength(1);
    expect((json.metadata as Record<string, unknown>).status).toBe(2);
  });

  it("get profile without persona (default empty array)", async () => {
    const fakeResponse = {
      metadata: { analysis_status: "COMPLETE" },
      personality_analysis: { ocean: { O: 70, C: 80, E: 55, A: 65, S: 45 } },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/get?apikey=test-key&userId=user-xyz":
        fakeResponse,
    });
    const out = await runNode(
      TYPE,
      { resource: "profile", operation: "get", userId: "user-xyz" },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(out[0]).toHaveLength(1);
    expect((json.metadata as Record<string, unknown>).analysis_status).toBe("COMPLETE");
    expect(calls[0].url).not.toContain("persona");
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeResponse = {
      metadata: { status: 1 },
      personality_analysis: { disc: { D: 50, I: 60, S: 40, C: 70 } },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/create?apikey=test-key&userId=u1&source=linkedin":
        fakeResponse,
    });
    const out = await runNode(
      TYPE,
      { resource: "profile", operation: "create", userId: "u1" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("continueOnFail with invalid userId yields error item", async () => {
    const out = await runNode(
      TYPE,
      { resource: "profile", operation: "create", userId: "", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing userId without continueOnFail throws", async () => {
    await expect(
      runNode(TYPE, { resource: "profile", operation: "create", userId: "" }, [{}]),
    ).rejects.toThrow(/userId is required/i);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "profile", operation: "create", userId: "someone" }, [{}]),
    ).rejects.toThrow(/HTTP 404/i);
  });
});