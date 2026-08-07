import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.microsoftGraphSecurity";

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

function installFetch(result: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string) => mockResponse(result, status)),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { microsoftGraphSecurityOAuth2Api: { name: "microsoftGraphSecurityOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ accessToken: "test_token_123", baseUrl: "https://graph.microsoft.com/v1.0/security" }),
  });
  const { defaultExecutors } = await import("@/lib/engine/node-runtime");
  const executor = defaultExecutors[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("microsoftGraphSecurity", () => {
  it("secureScore - get by ID returns score data", async () => {
    installFetch({
      id: "test-score-id",
      azureTenantId: "tenant-1",
      currentScore: 72.5,
      maxScore: 100,
      activeUserCount: 1500,
      licensedUserCount: 2000,
      createdDateTime: "2025-01-15T00:00:00Z",
      enabledServices: ["Exchange", "SharePoint"],
    });
    const [out] = await run({
      resource: "secureScore",
      operation: "get",
      secureScoreId: "{{ $json.scoreId }}",
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.currentScore).toBe(72.5);
    expect(json.id).toBe("test-score-id");
    expect(json.azureTenantId).toBe("tenant-1");
  });

  it("secureScore - getAll with filter returns paginated scores", async () => {
    installFetch({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#Collection(microsoft.graph.secureScore)",
      value: [
        { id: "score-1", currentScore: 80, maxScore: 100, createdDateTime: "2025-02-01T00:00:00Z" },
        { id: "score-2", currentScore: 75, maxScore: 100, createdDateTime: "2025-02-02T00:00:00Z" },
      ],
    });
    const [out] = await run({
      resource: "secureScore",
      operation: "getAll",
      returnAll: true,
      filters: { filter: "createdDateTime ge 2025-01-01" },
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    const value = json.value as Array<Record<string, unknown>>;
    expect(value).toHaveLength(2);
    expect(value[0].currentScore).toBe(80);
    expect(value[1].currentScore).toBe(75);
  });

  it("secureScoreControlProfile - Update state", async () => {
    installFetch({
      id: "profile-1",
      vendorInformation: { provider: "SecureScore", vendor: "Microsoft" },
      state: "Ignored",
    });
    const [out] = await run({
      resource: "secureScoreControlProfile",
      operation: "update",
      secureScoreControlProfileId: "{{ $json.profileId }}",
      provider: "SecureScore",
      vendor: "Microsoft",
      updateFields: { state: "Ignored" },
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.state).toBe("Ignored");
    const vi = json.vendorInformation as Record<string, unknown>;
    expect(vi.provider).toBe("SecureScore");
    expect(vi.vendor).toBe("Microsoft");
  });

  it("missing secureScoreId throws validation error", async () => {
    await expect(
      run({
        resource: "secureScore",
        operation: "get",
      }),
    ).rejects.toThrow("secureScoreId is required");
  });

  it("continueOnFail - error produces error item", async () => {
    installFetch({ error: { code: "NotFound", message: "Resource not found" } }, 404);
    const [out] = await run(
      {
        resource: "secureScore",
        operation: "get",
        secureScoreId: "nonexistent-id",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toHaveProperty("error");
  });
});
