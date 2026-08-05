import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow, makeCtx } from "../helpers";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { getExecutorMap } from "@/lib/engine/node-runtime";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hunterTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, _init?: RequestInit) => {
      const fullKey = String(url);
      calls.push({ url: fullKey });
      for (const [route, body] of Object.entries(routes)) {
        if (fullKey.startsWith(route)) {
          return mockJsonResponse(body);
        }
      }
      return mockJsonResponse({ errors: [{ detail: "Not found" }] }, 404);
    }),
  );
}

async function runHunter(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const map = getExecutorMap();
  const executor = map[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node = makeNode({ name: "N", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test-key-123" }),
  });
  return executor(ctx, node);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue hunterTool — n8n-nodes-base.hunterTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Hunter (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.hunterTool")).toBe(canonical);
  });

  it("domainSearch — returns emails when onlyEmails=true", async () => {
    const fakeResponse = {
      data: {
        domain: "stripe.com",
        emails: [
          { value: "ceo@stripe.com", type: "personal", confidence: 95 },
          { value: "support@stripe.com", type: "generic", confidence: 98 },
        ],
      },
    };
    installFetch({ "https://api.hunter.io/v2/domain-search": fakeResponse });
    const out = await runHunter(
      { operation: "domainSearch", domain: "stripe.com", onlyEmails: true, limit: 10 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect((result.emails as unknown[])).toHaveLength(2);
    expect((result.emails as Record<string, unknown>[])[0]).toHaveProperty("value");
    expect((result.emails as Record<string, unknown>[])[0]).toHaveProperty("type");
    expect(calls).toHaveLength(1);
  });

  it("emailFinder — returns email shape", async () => {
    const fakeResponse = {
      data: {
        email: "john.doe@stripe.com",
        score: 95,
        domain: "stripe.com",
        first_name: "John",
        last_name: "Doe",
        position: "Engineer",
        company: "Stripe",
        sources: [{ uri: "https://example.com" }],
      },
    };
    installFetch({ "https://api.hunter.io/v2/email-finder": fakeResponse });
    const out = await runHunter(
      { operation: "emailFinder", domain: "stripe.com", firstname: "John", lastname: "Doe" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(result.email).toBe("john.doe@stripe.com");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("first_name");
    expect(result).toHaveProperty("last_name");
    expect(result).toHaveProperty("sources");
    expect(calls).toHaveLength(1);
  });

  it("emailVerifier — returns verification result", async () => {
    const fakeResponse = {
      data: {
        email: "john.doe@stripe.com",
        result: "deliverable",
        score: 95,
      },
    };
    installFetch({ "https://api.hunter.io/v2/email-verifier": fakeResponse });
    const out = await runHunter(
      { operation: "emailVerifier", email: "john.doe@stripe.com" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(result.email).toBe("john.doe@stripe.com");
    expect(result.result).toBe("deliverable");
    expect(result).toHaveProperty("score");
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with unknown operation yields error item", async () => {
    installFetch({});
    const out = await runHunter(
      { operation: "nope" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).error).toBeTruthy();
  });

  it("fetch failure without continueOnFail throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }),
    );
    await expect(
      runHunter({ operation: "domainSearch", domain: "stripe.com" }, [{}]),
    ).rejects.toThrow();
  });

  it("handles multiple input items", async () => {
    const fakeResponse = {
      data: {
        domain: "stripe.com",
        emails: [{ value: "ceo@stripe.com", type: "personal", confidence: 95 }],
      },
    };
    installFetch({ "https://api.hunter.io/v2/domain-search": fakeResponse });
    const out = await runHunter(
      { operation: "domainSearch", domain: "stripe.com", onlyEmails: true, limit: 5 },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
  });
});
