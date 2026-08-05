import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mindee";

function makeMindeeCtx(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>> = {},
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
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function fakeBinaryData(
  overrides: Partial<{ mimeType: string; data: string }> = {},
): { mimeType: string; data: string } {
  return {
    mimeType: "application/pdf",
    data: Buffer.from("fake pdf content").toString("base64"),
    ...overrides,
  };
}

async function runMindee(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {},
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeMindeeCtx(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe("batch-queue mindee — n8n-nodes-base.mindee", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Mindee");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mindee")).toBe(canonical);
  });

  it("throws when binary data is missing", async () => {
    await expect(
      runMindee(
        { resource: "invoice", operation: "predict" },
        [{ json: { id: "1" } }],
      ),
    ).rejects.toThrow(/Missing binary data/);
  });

  it("predicts invoice from binary data and flattens prediction fields", async () => {
    const apiResponse = {
      document: {
        inference: {
          prediction: {
            supplier_name: { value: "ACME Inc." },
            invoice_number: { value: "INV-001" },
            total_amount: { value: 1250.0 },
            date: { value: "2024-01-15" },
            currency: { value: "USD" },
          },
        },
      },
    };

    mockFetchOnce(200, apiResponse);

    const out = await runMindee(
      { resource: "invoice", operation: "predict", binaryProperty: "data" },
      [
        {
          json: { documentId: "inv-001" },
          binary: { data: fakeBinaryData() },
        },
      ],
      { mindeeInvoiceApi: { apiKey: "test-key-123" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      documentId: "inv-001",
      supplier_name: "ACME Inc.",
      invoice_number: "INV-001",
      total_amount: 1250.0,
      date: "2024-01-15",
      currency: "USD",
    });
  });

  it("predicts receipt from binary data", async () => {
    const apiResponse = {
      document: {
        inference: {
          prediction: {
            supplier: { value: "Corner Store" },
            date: { value: "2024-03-20" },
            total_amount: { value: 42.99 },
            category: { value: "Food & Groceries" },
          },
        },
      },
    };

    mockFetchOnce(200, apiResponse);

    const out = await runMindee(
      { resource: "receipt", operation: "predict" },
      [
        {
          json: {},
          binary: { data: fakeBinaryData({ mimeType: "image/jpeg" }) },
        },
      ],
      { mindeeReceiptApi: { apiKey: "test-receipt-key" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.supplier).toBe("Corner Store");
    expect(out[0][0].json.date).toBe("2024-03-20");
    expect(out[0][0].json.total_amount).toBe(42.99);
    expect(out[0][0].json.category).toBe("Food & Groceries");
  });

  it("preserves binary data on output", async () => {
    mockFetchOnce(200, {
      document: { inference: { prediction: { supplier_name: { value: "Test" } } } },
    });

    const binary = { data: fakeBinaryData() };
    const out = await runMindee(
      { resource: "invoice", operation: "predict" },
      [{ json: {}, binary }],
      { mindeeInvoiceApi: { apiKey: "k" } },
    );

    expect(out[0][0].binary).toEqual(binary);
  });

  it("handles API error response", async () => {
    mockFetchOnce(401, { error: "Unauthorized" });

    await expect(
      runMindee(
        { resource: "invoice", operation: "predict" },
        [{ json: {}, binary: { data: fakeBinaryData() } }],
      ),
    ).rejects.toThrow(/Mindee API error: 401/);
  });

  it("processes multiple items independently", async () => {
    mockFetchOnce(200, {
      document: { inference: { prediction: { supplier_name: { value: "First" } } } },
    });
    mockFetchOnce(200, {
      document: { inference: { prediction: { supplier_name: { value: "Second" } } } },
    });

    const out = await runMindee(
      { resource: "invoice", operation: "predict" },
      [
        { json: { seq: 1 }, binary: { data: fakeBinaryData() } },
        { json: { seq: 2 }, binary: { data: fakeBinaryData() } },
      ],
      { mindeeInvoiceApi: { apiKey: "k" } },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.supplier_name).toBe("First");
    expect(out[0][1].json.supplier_name).toBe("Second");
  });
});
