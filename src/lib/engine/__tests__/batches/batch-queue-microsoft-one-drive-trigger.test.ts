import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { _clearPollStatesForTest } from "../../executors/microsoft-one-drive-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftOneDriveTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headers = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 410 ? "Gone" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return headers.get(name.toLowerCase()) ?? null; },
      entries() { return headers.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeCtxWithCred(node: Parameters<typeof makeNode>[0], token: string, active = true): ExecutionContext {
  const n = makeNode(node);
  return {
    node: n,
    getParam: (name: string, def?: unknown) => {
      const val = (n.parameters as Record<string, unknown>)[name];
      return val !== undefined ? val : def;
    },
    getParams: () => n.parameters as Record<string, unknown>,
    getCredential: async () => ({ accessToken: token }),
    getInputItems: () => [],
    getNode: () => n,
    getWorkflow: () => ({ id: "test", name: "test", active, nodes: [n], connections: {}, settings: {} }),
    continueOnFail: () => false,
    evaluate: (expr: string) => expr,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
    getNodeInputItems: () => [],
  } as unknown as ExecutionContext;
}

function stubFirstDelta(initialItems: unknown[], deltaLink: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("@odata.deltaLink") || url.includes("delta?token")) {
      return mockResponse({ value: initialItems, "@odata.deltaLink": deltaLink });
    }
    return mockResponse({ value: initialItems, "@odata.deltaLink": deltaLink });
  }));
}

const defaultParams = {
  event: "fileCreated",
  events: ["fileCreated"],
  pollTimes: { item: [{ field: "minutes", minutesInterval: 1 }] },
};

describe("microsoftOneDriveTrigger", () => {
  beforeEach(() => {
    _clearPollStatesForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("cold start seeds state, emits nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        value: [
          { id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("single new file triggers fileCreated", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [{ id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" }],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "file-002", name: "new.docx", file: {}, lastModifiedDateTime: "2025-01-02T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("file-002");
  });

  it("updated file triggers fileUpdated, not fileCreated", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [
            { id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "file-001", name: "report.pdf", file: {}, lastModifiedDateTime: "2025-01-02T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: { ...defaultParams, events: ["fileUpdated"] } });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("file-001");
  });

  it("folder created triggers folderCreated", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "folder-001", name: "NewFolder", folder: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: { ...defaultParams, events: ["folderCreated"] } });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("folder-001");
    expect(result[0][0].json.folder).toEqual({});
  });

  it("410 Gone resets deltaLink (cold re-seed)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      if (callCount === 2) {
        return mockResponse(null, 410);
      }
      return mockResponse({
        value: [
          { id: "file-003", name: "after-410.pdf", file: {}, lastModifiedDateTime: "2025-01-03T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=xyz",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    await executor(ctx2, node);

    const ctx3 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx3, node);
    expect(result).toEqual([[]]);
  });

  it("multiple new files in one poll", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "a", name: "a.txt", file: {}, lastModifiedDateTime: "2025-02-01T00:00:00Z" },
          { id: "b", name: "b.txt", file: {}, lastModifiedDateTime: "2025-02-01T00:00:01Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result[0]).toHaveLength(2);
  });

  it("deleted items are skipped", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "del-001", name: "gone.txt", file: {}, deleted: {}}, 
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result).toEqual([[]]);
  });

  it("throws on missing credential", async () => {
    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: () => undefined,
      getParams: () => ({}),
      getCredential: async () => null,
      getInputItems: () => [],
      getNode: () => n,
      getWorkflow: () => ({ id: "test", name: "test", active: false, nodes: [n], connections: {}, settings: {} }),
      continueOnFail: () => false,
      evaluate: (expr: string) => expr,
      setCustomData: () => {},
      getCustomData: () => undefined,
      getAllCustomData: () => ({}),
      getNodeInputItems: () => [],
    } as unknown as ExecutionContext;

    await expect(executor(ctx, node)).rejects.toThrow("credential");
  });

  it("folderUpdated triggers on previously seen folder with new lastModified", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "folder-001", name: "UpdatedFolder", folder: {}, lastModifiedDateTime: "2025-03-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: { ...defaultParams, events: ["folderUpdated"] } });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    // re-seed with the folder so it's "known"
    vi.stubGlobal("fetch", vi.fn(async () => {
      return mockResponse({
        value: [
          { id: "folder-001", name: "OldFolder", folder: {}, lastModifiedDateTime: "2025-02-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=ghi",
      });
    }));
    _clearPollStatesForTest();
    const ctxSeed = makeCtxWithCred(node, "test-token");
    await executor(ctxSeed, node);

    callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      return mockResponse({
        value: [
          { id: "folder-001", name: "UpdatedFolder", folder: {}, lastModifiedDateTime: "2025-03-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=jkl",
      });
    }));

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("folder-001");
    expect(result[0][0].json.folder).toEqual({});
  });

  it("fileCreated with known id and unchanged lastModified emits nothing", async () => {
    _clearPollStatesForTest();
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [
            { id: "file-001", name: "existing.docx", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "file-001", name: "existing.docx", file: {}, lastModifiedDateTime: "2025-01-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: defaultParams });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node); // cold start seeds file-001

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node); // known + same lastModified
    expect(result).toEqual([[]]);
  });

  it("fileUpdated with brand-new id emits nothing (event mismatch)", async () => {
    _clearPollStatesForTest();
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=abc",
        });
      }
      return mockResponse({
        value: [
          { id: "brand-new", name: "new.docx", file: {}, lastModifiedDateTime: "2025-02-01T00:00:00Z" },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=def",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Microsoft OneDrive Trigger", type: TYPE, parameters: { ...defaultParams, events: ["fileUpdated"] } });
    const ctx1 = makeCtxWithCred(node, "test-token");
    await executor(ctx1, node);

    const ctx2 = makeCtxWithCred(node, "test-token");
    const result = await executor(ctx2, node);
    expect(result).toEqual([[]]);
  });
});
