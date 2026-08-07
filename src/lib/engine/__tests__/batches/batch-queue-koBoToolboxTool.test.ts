import { describe, it, expect, beforeAll, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.koBoToolboxTool";
const API_BASE = "https://kf.kobotoolbox.org/api/v2";

let mockFetch: ReturnType<typeof vi.fn>;

beforeAll(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
      entries() { return new Map([["content-type", "application/json"]]).entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  continueOnFail = false,
): ExecutionContext {
  const node = makeNode({ name: "KoBoToolboxTest", type: TYPE, parameters });
  return createExecutionContext({
    node,
    workflow: {
      id: "test",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => ({ token: "test-token" }),
  });
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, parameters, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue koBoToolboxTool — n8n-nodes-base.koBoToolboxTool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("KoboToolbox (AI Tool)");
  });

  it("tool: get form list", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ results: [{ formid: 1, title: "Survey A" }, { formid: 2, title: "Survey B" }] }),
    );
    const out = await runTool(
      { resource: "form", operation: "getMany" },
      [{}],
    );
    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/assets`, expect.any(Object));
    expect(Array.isArray(out[0][0].json.results)).toBe(true);
  });

  it("tool: get submissions with formId", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ results: [{ _id: 1, name: "Alice" }, { _id: 2, name: "Bob" }] }),
    );
    const out = await runTool(
      { resource: "submission", operation: "getMany", formId: "aBcDeFg", limit: 100 },
      [{}],
    );
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/assets/aBcDeFg/data?limit=100`,
      expect.any(Object),
    );
    expect(Array.isArray(out[0][0].json.results)).toBe(true);
  });

  it("tool: get single submission with reformatting", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ _id: "uuid:1234-5678", group_field: "value", number_field: "42" }),
    );
    const out = await runTool(
      {
        resource: "submission",
        operation: "get",
        formId: "aBcDeFg",
        submissionId: "uuid:1234-5678",
        reformat: true,
        numberMasks: "*_sqm",
      },
      [{}],
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`${API_BASE}/assets/aBcDeFg/data/uuid:1234-5678?format=json`),
      expect.any(Object),
    );
    expect(out[0][0].json._id).toBe("uuid:1234-5678");
  });

  it("tool: update submission validation status", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ validation_status: "approved" }),
    );
    const out = await runTool(
      {
        resource: "submission",
        operation: "updateValidationStatus",
        formId: "aBcDeFg",
        submissionId: "uuid:1234-5678",
        validationStatus: "approved",
      },
      [{}],
    );
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/assets/aBcDeFg/data/uuid:1234-5678/validation_status`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(out[0][0].json.validation_status).toBe("approved");
  });

  it("tool: recoverable error with continueOnFail", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ detail: "Invalid form ID" }, 400),
    );
    const out = await runTool(
      { resource: "form", operation: "get", formId: "invalid" },
      [{}],
      true,
    );
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws on missing formId for get operation", async () => {
    await expect(
      runTool({ resource: "form", operation: "get" }, [{}]),
    ).rejects.toThrow(/formId is required/);
  });

  it("handles multi-item input", async () => {
    mockFetch.mockResolvedValue(mockResponse({ results: [{ formid: 1, title: "S" }] }));
    const out = await runTool(
      { resource: "form", operation: "getMany" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
  });
});
