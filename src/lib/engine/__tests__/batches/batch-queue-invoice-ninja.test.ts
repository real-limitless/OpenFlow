import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.invoiceNinja";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let calls: FetchCall[];
let responseQueue: Response[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>();
  map.set("content-type", "application/json");
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  } as Response;
}

function installFetch(...responses: Response[]) {
  responseQueue = responses.length > 0 ? responses : [mockResponse({ ok: true })];
  calls = [];
  let idx = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
    });
    const resp = responseQueue[Math.min(idx++, responseQueue.length - 1)];
    return resp;
  }));
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function makeCtx(items: INodeExecutionData[], node: INode, continueOnFail = false): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name: string) => {
      if (name === "invoiceNinjaApi") return { url: "https://ninja.example.com", apiToken: "test-token" };
      return null;
    },
  });
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
    credentials: { invoiceNinjaApi: { name: "invoiceNinjaApi" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ data: { id: 1, name: "Test" } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue invoiceNinja — n8n-nodes-base.invoiceNinja", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Invoice Ninja");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.invoiceNinja")).toBe(canonical);
  });

  // --- Client: Create (acceptance) ---

  it("creates a client", async () => {
    const clientData = {
      id: 42,
      name: "Acme Corp",
      contacts: [{ first_name: "John", last_name: "Doe", email: "john@acme.com" }],
    };
    installFetch(mockResponse({ data: clientData }));

    const out = await run({
      resource: "client",
      operation: "create",
      name: "Acme Corp",
      contacts: JSON.stringify([{ first_name: "John", last_name: "Doe", email: "john@acme.com" }]),
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/clients");
    expect(out[0][0].json).toMatchObject({
      id: 42,
      name: "Acme Corp",
    });
  });

  // --- Invoice: getAll (acceptance) ---

  it("gets all invoices", async () => {
    const invoicesData = {
      data: [
        { id: 1, number: "INV-001", client_id: "10" },
        { id: 2, number: "INV-002", client_id: "20" },
      ],
    };
    installFetch(mockResponse(invoicesData));

    const out = await run({
      resource: "invoice",
      operation: "getAll",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/invoices");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1, number: "INV-001" });
    expect(out[0][1].json).toMatchObject({ id: 2, number: "INV-002" });
  });

  // --- Expense: Delete (acceptance) ---

  it("deletes an expense with expression-bound expense_id", async () => {
    const deleteData = { data: { id: "123", deleted: true } };
    installFetch(mockResponse(deleteData));

    const out = await run({
      resource: "expense",
      operation: "delete",
      expense_id: "={{ $json.expense_id }}",
    }, [{ expense_id: "123" }]);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/expenses/123");
    expect(out[0][0].json).toMatchObject({ id: "123" });
  });

  // --- Invoice: Email (acceptance) ---

  it("emails an invoice", async () => {
    const emailData = { data: { success: true, message: "Email sent" } };
    installFetch(mockResponse(emailData));

    const out = await run({
      resource: "invoice",
      operation: "email",
      invoice_id: "={{ $json.invoice_id }}",
    }, [{ invoice_id: "456" }]);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/invoices/456/email");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  // --- Invoice: Create with line items (acceptance) ---

  it("creates an invoice with line items", async () => {
    const invoiceData = {
      data: {
        id: "789",
        client_id: "1",
        line_items: [{ product_key: "Consulting", cost: 150, qty: 10 }],
      },
    };
    installFetch(mockResponse(invoiceData));

    const out = await run({
      resource: "invoice",
      operation: "create",
      client_id: "1",
      line_items: JSON.stringify([{ product_key: "Consulting", cost: 150, qty: 10 }]),
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/invoices");
    expect(out[0][0].json).toMatchObject({
      client_id: "1",
      line_items: [{ product_key: "Consulting", cost: 150, qty: 10 }],
    });
  });

  // --- Quote: Get (acceptance) ---

  it("gets a single quote by quote_id", async () => {
    installFetch(mockResponse({ data: { id: "100", number: "Q-001", client_id: "5" } }));

    const out = await run({
      resource: "quote",
      operation: "get",
      quote_id: "100",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://ninja.example.com/api/v1/quotes/100");
    expect(out[0][0].json).toMatchObject({ id: "100", number: "Q-001" });
  });

  // --- Error handling ---

  it("throws when required id is missing for get", async () => {
    await expect(run({
      resource: "client",
      operation: "get",
    })).rejects.toThrow(/Invoice Ninja/);
  });

  it("returns error item when continueOnFail is true", async () => {
    installFetch(mockResponse({ error: "Not Found" }, 404));
    const out = await run({
      resource: "invoice",
      operation: "get",
      invoice_id: "9999",
    }, [{}], { continueOnFail: true });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
