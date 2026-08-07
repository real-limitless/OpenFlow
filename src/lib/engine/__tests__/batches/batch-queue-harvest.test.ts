import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.harvest";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

let calls: FetchCall[];
let responseQueue: Response[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>();
  map.set("content-type", "application/json");
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
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
    let body: string | undefined;
    if (init?.body) body = String(init.body);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body,
    });
    const resp = responseQueue[Math.min(idx++, responseQueue.length - 1)];
    return resp;
  }));
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async () => ({
      accessToken: "harvest-token-456",
      accountId: "12345",
    }),
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { harvestApi: { name: "harvestApi" } },
  });
  const ctx = makeCtx(toItems(inputItems), node);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue harvest — n8n-nodes-base.harvest", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Harvest");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.harvest")).toBe(canonical);
  });

  // --- Get All Clients (acceptance) ---

  it("gets all clients with returnAll", async () => {
    installFetch(mockResponse({
      clients: [
        { id: 1, name: "Acme Corp", is_active: true, currency: "USD", created_at: "2024-01-01", updated_at: "2024-01-01" },
        { id: 2, name: "Globex Inc", is_active: true, currency: "USD", created_at: "2024-02-01", updated_at: "2024-02-01" },
      ],
      total_pages: 1,
      per_page: 100,
      total_entries: 2,
    }));

    const out = await run({
      resource: "Client",
      operation: "getAll",
      returnAll: true,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/v2/clients");
    expect(out[0][0].json).toMatchObject({
      results: [
        { id: 1, name: "Acme Corp" },
        { id: 2, name: "Globex Inc" },
      ],
      pageCount: 1,
    });
  });

  // --- Create a time entry by duration (acceptance) ---

  it("creates a time entry by duration", async () => {
    installFetch(mockResponse({
      id: 42,
      project: { id: 123, name: "Project A" },
      task: { id: 456, name: "Task B" },
      spent_date: "2025-01-15",
      hours: 3.5,
      is_running: false,
    }));

    const out = await run({
      resource: "Time Entry",
      operation: "create",
      project_id: 123,
      task_id: 456,
      spent_date: "2025-01-15",
      hours: 3.5,
    }, [{ json: { projectId: 123, taskId: 456 } }]);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/v2/time_entries");
    expect(out[0][0].json).toMatchObject({
      id: 42,
      project: { id: 123, name: "Project A" },
      task: { id: 456, name: "Task B" },
      spent_date: "2025-01-15",
      hours: 3.5,
      is_running: false,
    });
  });

  // --- Get authenticated user (acceptance) ---

  it("gets authenticated user via getMe", async () => {
    installFetch(mockResponse({
      id: 99,
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      timezone: "America/New_York",
    }));

    const out = await run({
      resource: "User",
      operation: "getMe",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.harvestapp.com/v2/users/me");
    expect(out[0][0].json).toMatchObject({
      id: 99,
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      timezone: "America/New_York",
    });
  });

  // --- Delete a client (acceptance) ---

  it("deletes a client", async () => {
    installFetch(mockResponse(null, 200));

    const out = await run({
      resource: "Client",
      operation: "delete",
      client_id: 789,
    }, [{ json: { clientId: 789 } }]);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/v2/clients/789");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // --- Company Get (acceptance) ---

  it("gets company profile", async () => {
    installFetch(mockResponse({
      base_uri: "https://acme.harvest.com",
      full_domain: "acme.harvest.com",
      name: "Acme Corp",
      is_active: true,
      week_start_day: "Monday",
      time_format: "hours_minutes",
    }));

    const out = await run({
      resource: "Company",
      operation: "get",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/v2/company");
    expect(out[0][0].json).toMatchObject({
      base_uri: "https://acme.harvest.com",
      full_domain: "acme.harvest.com",
      name: "Acme Corp",
    });
  });

  // --- Expression-based time entry create ---

  it("creates a time entry with expression-based project_id and task_id", async () => {
    installFetch(mockResponse({
      id: 100,
      project: { id: 777, name: "ExprProject" },
      task: { id: 888, name: "ExprTask" },
      spent_date: "2025-06-01",
      hours: 2.0,
      is_running: false,
    }));

    const out = await run({
      resource: "Time Entry",
      operation: "create",
      project_id: "={{ $json.projectId }}",
      task_id: "={{ $json.taskId }}",
      spent_date: "2025-06-01",
      hours: 2.0,
    }, [{ projectId: 777, taskId: 888 }]);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.harvestapp.com/v2/time_entries");
    expect(JSON.parse(calls[0].body ?? "{}")).toMatchObject({
      project_id: 777,
      task_id: 888,
      spent_date: "2025-06-01",
      hours: 2.0,
    });
    expect(out[0][0].json).toMatchObject({
      id: 100,
      project: { id: 777, name: "ExprProject" },
      task: { id: 888, name: "ExprTask" },
    });
  });

  // --- Delete non-Client resource ---

  it("deletes a contact", async () => {
    installFetch(mockResponse(null, 200));

    const out = await run({
      resource: "Contact",
      operation: "delete",
      contact_id: 333,
    }, [{ json: { contactId: 333 } }]);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.harvestapp.com/v2/contacts/333");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("deletes a time entry", async () => {
    installFetch(mockResponse(null, 200));

    const out = await run({
      resource: "Time Entry",
      operation: "delete",
      timeEntryId: 555,
    }, [{ json: { timeEntryId: 555 } }]);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.harvestapp.com/v2/time_entries/555");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // --- Error handling ---

  it("throws on 401 unauthorized", async () => {
    installFetch(mockResponse({ error: "Unauthorized" }, 401));
    await expect(run({
      resource: "Client",
      operation: "getAll",
    })).rejects.toThrow(/Harvest API/);
  });
});
