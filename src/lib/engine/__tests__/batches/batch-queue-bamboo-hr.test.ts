import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bambooHr";
const CREDS = { bambooHrApi: { subdomain: "test", apiKey: "test-key" } };

interface FetchCall { url: string; method: string; headers: Record<string, string>; body?: unknown }

function mockJsonResponse(data: unknown, status = 200) {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    headers: new Map([["content-type", "application/json"]]),
    async json() { return JSON.parse(text); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text).buffer; },
  };
}

function mockBinaryResponse(buf: Buffer, contentType = "application/pdf") {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Map([["content-type", contentType]]),
    async json() { throw new Error("not json"); },
    async text() { return buf.toString("binary"); },
    async arrayBuffer() { return buf.buffer; },
  };
}

const fetchCalls: FetchCall[] = [];

function makeMockFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    fetchCalls.push({ url: urlStr, method: init?.method ?? "GET", headers, body: init?.body });

    if (urlStr.includes("nonexistent")) {
      return mockJsonResponse({ error: "Not found" }, 404);
    }
    if (urlStr.includes("/company/reports/5") && urlStr.includes("format=csv")) {
      return mockBinaryResponse(Buffer.from("name,title\nJohn,Engineer"), "text/csv");
    }
    if (urlStr.includes("/company/reports/5")) {
      return mockJsonResponse({ title: "Employee Report", data: { rows: [{ name: "John" }] } });
    }
    if (urlStr.includes("/employees/directory")) {
      return mockJsonResponse({
        employees: [
          { id: 1, firstName: "John", lastName: "Doe" },
          { id: 2, firstName: "Jane", lastName: "Smith" },
        ],
      });
    }
    if (urlStr.includes("/employees/42/files/view")) {
      return mockJsonResponse({ documents: [{ id: 101, name: "Contract.pdf" }] });
    }
    if (urlStr.includes("/employees/42/files/") && urlStr.includes("/download")) {
      return mockBinaryResponse(Buffer.from("fake-pdf-content"), "application/pdf");
    }
    if (urlStr.includes("/employees/42")) {
      return mockJsonResponse({ id: 42, firstName: "John", lastName: "Doe", jobTitle: "Engineer" });
    }
    if (urlStr.includes("/employees") && init?.method === "POST") {
      return mockJsonResponse({ id: 101, firstName: "Jane", lastName: "Doe", hireDate: "2026-01-15", department: "Engineering" });
    }
    if (urlStr.includes("/files") && urlStr.includes("/download")) {
      return mockBinaryResponse(Buffer.from("fake-file-content"), "application/octet-stream");
    }
    if (urlStr.includes("/files")) {
      return mockJsonResponse({ files: [{ id: 201, name: "Policy.pdf" }] });
    }
    return mockJsonResponse({});
  });
}

function makeCtx(
  items: INodeExecutionData[],
  node: { parameters: Record<string, unknown> },
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node: { ...makeNode({ name: "N", type: TYPE, parameters: node.parameters }), type: TYPE } as any,
    workflow: { id: "wf", name: "Test", active: false, nodes: [], connections: {}, settings: {} } as any,
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name: string) => CREDS[name as keyof typeof CREDS] ?? null,
  });
}

async function runBambooHr(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const executor = getExecutor(TYPE)!;
  const items = inputItems.map((i) => ({ json: i }));
  const ctx = makeCtx(items, { parameters }, continueOnFail);
  return executor(ctx, ctx.node);
}

describe("n8n-nodes-base.bambooHr", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    vi.stubGlobal("fetch", makeMockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("employee get returns employee record", async () => {
    const [results] = await runBambooHr({
      resource: "employee",
      operation: "get",
      employeeId: "42",
    });

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ id: 42, firstName: "John", lastName: "Doe" });
  });

  it("employee getAll returns employees array", async () => {
    const [results] = await runBambooHr({
      resource: "employee",
      operation: "getAll",
      returnAll: false,
      limit: 10,
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.employees as unknown[])).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it("employee create returns new employee", async () => {
    const [results] = await runBambooHr({
      resource: "employee",
      operation: "create",
      firstName: "Jane",
      lastName: "Doe",
      synced: false,
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.id).toBeDefined();
    expect(data.firstName).toBe("Jane");
  });

  it("companyReport get JSON returns report data", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "JSON",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.reportId).toBe("5");
    expect(data.format).toBe("JSON");
    expect(data.data).toBeDefined();
  });

  it("companyReport get CSV+File attaches binary data", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "CSV",
      output: "File",
    });

    expect(results).toHaveLength(1);
    expect(results[0].binary).toBeDefined();
    expect(results[0].binary!.data).toBeDefined();
    expect(results[0].binary!.data.mimeType).toBe("text/csv");
    const data = results[0].json as Record<string, unknown>;
    expect(data.reportId).toBe("5");
    expect((data as any).fileSize).toBeGreaterThan(0);
  });

  it("companyReport get CSV+URL returns URL", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "CSV",
      output: "URL",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.url).toBeDefined();
    expect(typeof data.url).toBe("string");
  });

  it("companyReport get CSV+Id returns fileId", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "CSV",
      output: "Id",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.fileId).toBe("5");
  });

  it("employeeDocument download File attaches binary", async () => {
    const [results] = await runBambooHr({
      resource: "employeeDocument",
      operation: "download",
      employeeId: "42",
      fileId: "101",
      output: "File",
    });

    expect(results).toHaveLength(1);
    expect(results[0].binary).toBeDefined();
    expect(results[0].binary!.data.mimeType).toBe("application/pdf");
    const data = results[0].json as Record<string, unknown>;
    expect(data.fileId).toBe("101");
  });

  it("employeeDocument download URL returns URL", async () => {
    const [results] = await runBambooHr({
      resource: "employeeDocument",
      operation: "download",
      employeeId: "42",
      fileId: "101",
      output: "URL",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.url).toContain("bamboohr.com");
  });

  it("employeeDocument download Id returns fileId", async () => {
    const [results] = await runBambooHr({
      resource: "employeeDocument",
      operation: "download",
      employeeId: "42",
      fileId: "101",
      output: "Id",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.fileId).toBe("101");
  });

  it("file download File attaches binary", async () => {
    const [results] = await runBambooHr({
      resource: "file",
      operation: "download",
      fileId: "201",
      output: "File",
    });

    expect(results).toHaveLength(1);
    expect(results[0].binary).toBeDefined();
    expect(results[0].binary!.data.mimeType).toBe("application/octet-stream");
  });

  it("file download URL returns URL", async () => {
    const [results] = await runBambooHr({
      resource: "file",
      operation: "download",
      fileId: "201",
      output: "URL",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.url).toContain("bamboohr.com");
  });

  it("file download Id returns fileId", async () => {
    const [results] = await runBambooHr({
      resource: "file",
      operation: "download",
      fileId: "201",
      output: "Id",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.fileId).toBe("201");
  });

  it("employeeDocument delete passes through input json", async () => {
    const [results] = await runBambooHr(
      {
        resource: "employeeDocument",
        operation: "delete",
        employeeId: "42",
        fileId: "101",
      },
      [{ foo: "bar" }],
    );

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.foo).toBe("bar");
    expect(data.success).toBe(true);
  });

  it("file delete passes through input json", async () => {
    const [results] = await runBambooHr(
      {
        resource: "file",
        operation: "delete",
        fileId: "201",
      },
      [{ baz: "qux" }],
    );

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.baz).toBe("qux");
    expect(data.success).toBe(true);
  });

  it("throws on HTTP 404 without continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: {} }];
    const ctx = makeCtx(items, { parameters: { resource: "employee", operation: "get", employeeId: "nonexistent" } }, false);

    await expect(executor(ctx, ctx.node)).rejects.toThrow(/404|Not found/i);
  });

  it("returns error item with continueOnFail on HTTP 404", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: { inputVal: 1 } }];
    const ctx = makeCtx(items, { parameters: { resource: "employee", operation: "get", employeeId: "nonexistent" } }, true);

    const [results] = await executor(ctx, ctx.node);
    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.error as any).message).toMatch(/404|Not found/i);
    expect(data.inputVal).toBe(1);
  });

  it("employee update returns API response body", async () => {
    const [results] = await runBambooHr({
      resource: "employee",
      operation: "update",
      employeeId: "42",
      synced: false,
      updateFields: { jobTitle: "Senior Engineer" },
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect(data.id).toBeDefined();
  });

  it("handles missing credential gracefully", async () => {
    const executor = getExecutor(TYPE)!;
    const ctx = createExecutionContext({
      node: makeNode({ name: "N", type: TYPE, parameters: { resource: "employee", operation: "get", employeeId: "1" } }),
      workflow: { id: "wf", name: "Test", active: false, nodes: [], connections: {}, settings: {} } as any,
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });

    await expect(executor(ctx, ctx.node)).rejects.toThrow(/credential/i);
  });

  it("employeeDocument getAll returns documents", async () => {
    const [results] = await runBambooHr({
      resource: "employeeDocument",
      operation: "getAll",
      employeeId: "42",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.documents as unknown[])).toHaveLength(1);
  });

  it("file getAll returns files", async () => {
    const [results] = await runBambooHr({
      resource: "file",
      operation: "getAll",
    });

    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.files as unknown[])).toHaveLength(1);
  });

  it("companyReport File with 404 throws without continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: {} }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "companyReport",
        operation: "get",
        reportId: "nonexistent",
        format: "CSV",
        output: "File",
      },
    }, false);

    await expect(executor(ctx, ctx.node)).rejects.toThrow(/404|Not found/i);
  });

  it("companyReport File with 404 pushes error item with continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: { inputVal: 2 } }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "companyReport",
        operation: "get",
        reportId: "nonexistent",
        format: "CSV",
        output: "File",
      },
    }, true);

    const [results] = await executor(ctx, ctx.node);
    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.error as any).message).toMatch(/404|Not found/i);
    expect(data.inputVal).toBe(2);
  });

  it("employeeDocument download File with 404 throws without continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: {} }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "employeeDocument",
        operation: "download",
        employeeId: "42",
        fileId: "nonexistent",
        output: "File",
      },
    }, false);

    await expect(executor(ctx, ctx.node)).rejects.toThrow(/404|Not found/i);
  });

  it("employeeDocument download File with 404 pushes error item with continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: { inputVal: 3 } }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "employeeDocument",
        operation: "download",
        employeeId: "42",
        fileId: "nonexistent",
        output: "File",
      },
    }, true);

    const [results] = await executor(ctx, ctx.node);
    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.error as any).message).toMatch(/404|Not found/i);
    expect(data.inputVal).toBe(3);
  });

  it("file download File with 404 throws without continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: {} }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "file",
        operation: "download",
        fileId: "nonexistent",
        output: "File",
      },
    }, false);

    await expect(executor(ctx, ctx.node)).rejects.toThrow(/404|Not found/i);
  });

  it("file download File with 404 pushes error item with continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const items = [{ json: { inputVal: 4 } }];
    const ctx = makeCtx(items, {
      parameters: {
        resource: "file",
        operation: "download",
        fileId: "nonexistent",
        output: "File",
      },
    }, true);

    const [results] = await executor(ctx, ctx.node);
    expect(results).toHaveLength(1);
    const data = results[0].json as Record<string, unknown>;
    expect((data.error as any).message).toMatch(/404|Not found/i);
    expect(data.inputVal).toBe(4);
  });

  it("companyReport CSV+URL with empty filters requests ?format= in path", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "CSV",
      output: "URL",
    });

    expect(results).toHaveLength(1);
    const call = fetchCalls.find((c) => c.url.includes("/company/reports/5"));
    expect(call).toBeDefined();
    expect(call!.url).toContain("?format=");
  });

  it("companyReport CSV+File with empty filters requests ?format= in path", async () => {
    const [results] = await runBambooHr({
      resource: "companyReport",
      operation: "get",
      reportId: "5",
      format: "CSV",
      output: "File",
    });

    expect(results).toHaveLength(1);
    const call = fetchCalls.find((c) => c.url.includes("/company/reports/5"));
    expect(call).toBeDefined();
    expect(call!.url).toContain("?format=");
  });
});
