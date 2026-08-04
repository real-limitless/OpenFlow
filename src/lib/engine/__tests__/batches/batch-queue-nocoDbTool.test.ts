import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor, registerExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx, runNode } from "../helpers";
import { nocoDbToolExecutor, setNocoDbToolClientFactory } from "../../executors/n8n-nodes-base.nocoDbTool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.nocoDbTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<{ status: number; body: unknown }>;

function installFetch(
  responses: { status?: number; body?: unknown } | Array<{ status?: number; body?: unknown }> = [{}],
) {
  const list = Array.isArray(responses) ? responses : [responses];
  responseQueue = list.map((r) => ({ status: r.status ?? 200, body: r.body ?? {} }));
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? { status: 200, body: {} };
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {});
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      headers: { get: () => "application/json", entries: () => new Map([["content-type", "application/json"]]).entries() },
      async json() { return JSON.parse(text); },
      async text() { return text; },
    };
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue nocoDbTool — n8n-nodes-base.nocoDbTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("NocoDB (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.nocoDbTool")).toBe(getExecutor(TYPE));
  });

  describe("create row with auto-map", () => {
    it("sends POST with auto-mapped json properties", async () => {
      const params = {
        operation: "create",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        dataToSend: "autoMapInputData",
        inputsToIgnore: "",
      };
      const inputItems = [{ json: { title: "Hello", status: "done" } }];
      const resp = { id: "row_1", title: "Hello", status: "done" };
      installFetch([{ body: resp }]);

      const [outputs] = await runNode(TYPE, params, inputItems);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].json).toMatchObject({ title: "Hello", status: "done", id: "row_1" });

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/api/v1/db/data/bulk/wksp_abc/tbl_tasks");
      expect(jsonBody(call)).toEqual({ title: "Hello", status: "done" });
    });
  });

  describe("create row with define-below fields", () => {
    it("sends POST with fields defined in fieldsUi", async () => {
      const params = {
        operation: "create",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        dataToSend: "defineBelow",
        fieldsUi: {
          fieldValues: [
            { fieldName: "name", fieldValue: "Test Task" },
          ],
        },
      };
      const resp = { id: "row_2", name: "Test Task" };
      installFetch([{ body: resp }]);

      const [outputs] = await runNode(TYPE, params, [{}]);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].json).toMatchObject({ name: "Test Task", id: "row_2" });

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(jsonBody(call)).toEqual({ name: "Test Task" });
    });
  });

  describe("get many rows with sort and filter", () => {
    it("sends GET with query params for sort, fields, limit", async () => {
      const params = {
        operation: "getAll",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        returnAll: false,
        limit: 10,
        options: {
          sort: {
            property: [{ field: "created_at", direction: "desc" }],
          },
          fields: ["name", "status"],
        },
      };
      const rows = [
        { id: "1", name: "Task A", status: "done" },
        { id: "2", name: "Task B", status: "pending" },
      ];
      installFetch([{ body: rows }]);

      const [outputs] = await runNode(TYPE, params, [{}]);
      expect(outputs).toHaveLength(1);
      expect((outputs[0].json as Record<string, unknown>).list).toEqual(rows);

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/api/v1/db/data/bulk/wksp_abc/tbl_tasks/list");
      expect(call.url).toContain("limit=10");
      expect(call.url).toContain("fields=name%2Cstatus");
      expect(call.url).toContain("sort=created_at%2Cdesc");
    });
  });

  describe("update existing row", () => {
    it("sends PATCH with row id and fields", async () => {
      const params = {
        operation: "update",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        id: "42",
        dataToSend: "defineBelow",
        fieldsUi: {
          fieldValues: [
            { fieldName: "status", fieldValue: "completed" },
          ],
        },
      };
      const resp = { id: "42", name: "Test", status: "completed" };
      installFetch([{ body: resp }]);

      const [outputs] = await runNode(TYPE, params, [{}]);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].json).toMatchObject({ id: "42", status: "completed" });

      const call = lastCall();
      expect(call.method).toBe("PATCH");
      expect(call.url).toContain("/api/v1/db/data/bulk/wksp_abc/tbl_tasks/42");
      expect(jsonBody(call)).toEqual({ status: "completed" });
    });
  });

  describe("delete row", () => {
    it("sends DELETE and returns success confirmation", async () => {
      const params = {
        operation: "delete",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        id: "99",
      };
      const resp = { success: true };
      installFetch([{ body: resp }]);

      const [outputs] = await runNode(TYPE, params, [{}]);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].json).toEqual({ success: true });

      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.url).toContain("/api/v1/db/data/bulk/wksp_abc/tbl_tasks/99");
    });
  });

  describe("error handling", () => {
    it("throws on missing projectId or table", async () => {
      await expect(runNode(TYPE, { operation: "create" }, [{}]))
        .rejects.toThrow("Project ID and table are required");
    });

    it("throws on missing row id for get operation", async () => {
      await expect(runNode(TYPE, { operation: "get", projectId: "p", table: "t" }, [{}]))
        .rejects.toThrow("Row ID is required");
    });

    it("returns error item on continueOnFail", async () => {
      const params = { operation: "create", projectId: "p", table: "t" };
      installFetch([{ status: 500, body: { message: "DB error" } }]);

      const [outputs] = await runNode(TYPE, params, [{}], { continueOnFail: true });
      expect(outputs).toHaveLength(1);
      expect((outputs[0].json as Record<string, unknown>).error).toContain("Create failed");
    });
  });
});
