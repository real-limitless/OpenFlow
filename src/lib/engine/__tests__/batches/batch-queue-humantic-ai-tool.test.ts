import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, getExecutorMap, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TOOL_TYPE = "n8n-nodes-base.humanticAiTool";
const BASE_TYPE = "n8n-nodes-base.humanticAi";

function mockJsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return text;
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
  const executor = getExecutor(type);
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

describe("batch-queue humantic-ai-tool — n8n-nodes-base.humanticAiTool", () => {
  it("alias resolves to the same executor as the base node", () => {
    expect(hasExecutor(TOOL_TYPE)).toBe(true);
    const toolExec = getExecutor(TOOL_TYPE);
    const baseExec = getExecutor(BASE_TYPE);
    expect(toolExec).toBe(baseExec);
  });

  it("getNodeType resolves tool type via alias to base description", () => {
    const desc = getNodeType(TOOL_TYPE);
    expect(desc).toBeDefined();
    expect(desc.name).toBe(BASE_TYPE);
  });

  it("create profile via tool type calls API and returns response", async () => {
    const fakeResponse = {
      metadata: { status: 1, analysis_status: "PROCESSING" },
      personality_analysis: { disc: { D: 50, I: 60, S: 40, C: 70 } },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/create?apikey=test-key&userId=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fexample&source=linkedin":
        fakeResponse,
    });
    const out = await runNode(
      TOOL_TYPE,
      { resource: "profile", operation: "create", userId: "https://www.linkedin.com/in/example" },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(out[0]).toHaveLength(1);
    expect((json.metadata as Record<string, unknown>).status).toBe(1);
    expect(json.personality_analysis).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("get profile via tool type works with persona", async () => {
    const fakeResponse = {
      metadata: { analysis_status: "COMPLETE" },
      personality_analysis: { ocean: { O: 70, C: 80 } },
      persona: { sales: "Direct communicator" },
    };
    installFetch({
      "https://api.humantic.ai/v1/user-profile/get?apikey=test-key&userId=user-abc&persona=sales":
        fakeResponse,
    });
    const out = await runNode(
      TOOL_TYPE,
      { resource: "profile", operation: "get", userId: "user-abc", persona: ["sales"] },
      [{}],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.metadata as Record<string, unknown>).analysis_status).toBe("COMPLETE");
    expect(json.persona).toBeDefined();
  });

  it("continueOnFail with invalid userId emits error item", async () => {
    const out = await runNode(
      TOOL_TYPE,
      { resource: "profile", operation: "create", userId: "", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});
