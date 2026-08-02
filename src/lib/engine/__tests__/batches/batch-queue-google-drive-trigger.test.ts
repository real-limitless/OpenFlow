import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { _clearPollStatesForTest } from "../../executors/google-drive-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleDriveTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
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

function stubStartPageToken() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("startPageToken")) {
      return mockResponse({ startPageToken: "100" });
    }
    return mockResponse({ changes: [], newStartPageToken: "100" });
  }));
}

const defaultParams = {
  event: "fileCreated",
  triggerOn: "specificFolder",
  folderToWatch: "1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb",
  options: { fileType: "all" },
  pollTimes: { item: [{ mode: "everyMinute" }] },
};

describe("googleDriveTrigger", () => {
  beforeEach(() => {
    _clearPollStatesForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("returns empty output when no changes match", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "101" });
      }
      return mockResponse({ changes: [], newStartPageToken: "101" });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("emits an item for a file created in the watched folder", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "200" });
      }
      return mockResponse({
        changes: [
          {
            type: "create",
            fileId: "file1",
            file: {
              id: "file1",
              name: "report.pdf",
              mimeType: "application/pdf",
              parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"],
              modifiedTime: "2026-08-01T10:00:00.000Z",
            },
          },
        ],
        newStartPageToken: "201",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("file1");
    expect(result[0][0].json.name).toBe("report.pdf");
  });

  it("deduplicates across consecutive polls", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "300" });
      }
      return mockResponse({
        changes: [
          {
            type: "create",
            fileId: "file1",
            file: {
              id: "file1",
              name: "doc.txt",
              mimeType: "text/plain",
              parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"],
            },
          },
        ],
        newStartPageToken: "301",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });

    const result1 = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result1[0]).toHaveLength(1);

    const result2 = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result2[0]).toHaveLength(0);
  });

  it("emits multiple items for multiple changes in one interval", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "400" });
      }
      return mockResponse({
        changes: [
          {
            type: "create",
            fileId: "a1",
            file: { id: "a1", name: "a.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
          {
            type: "create",
            fileId: "b2",
            file: { id: "b2", name: "b.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
          {
            type: "create",
            fileId: "c3",
            file: { id: "c3", name: "c.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
        ],
        newStartPageToken: "401",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(3);
    expect(result[0][0].json.id).toBe("a1");
    expect(result[0][1].json.id).toBe("b2");
    expect(result[0][2].json.id).toBe("c3");
  });

  it("filters by fileType option", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "500" });
      }
      return mockResponse({
        changes: [
          {
            type: "create",
            fileId: "audio1",
            file: { id: "audio1", name: "song.mp3", mimeType: "application/vnd.google-apps.audio", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
          {
            type: "create",
            fileId: "text1",
            file: { id: "text1", name: "notes.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
        ],
        newStartPageToken: "501",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: {
      ...defaultParams,
      options: { fileType: "application/vnd.google-apps.audio" },
    } });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("audio1");
  });

  it("emits for fileUpdated event", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "600" });
      }
      return mockResponse({
        changes: [
          {
            type: "edit",
            fileId: "edited1",
            file: { id: "edited1", name: "updated.pdf", mimeType: "application/pdf", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
        ],
        newStartPageToken: "601",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: {
      ...defaultParams,
      event: "fileUpdated",
    } });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("edited1");
  });

  it("emits for fileDeleted event with removed flag", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "700" });
      }
      return mockResponse({
        changes: [
          {
            type: "delete",
            fileId: "deleted1",
            removed: true,
            file: { id: "deleted1", name: "gone.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
        ],
        newStartPageToken: "701",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: {
      ...defaultParams,
      event: "fileDeleted",
    } });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("deleted1");
    expect(result[0][0].json.removed).toBe(true);
  });

  it("throws on missing credential", async () => {
    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
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

  it("manual mode with no matching changes throws an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "800" });
      }
      return mockResponse({ changes: [], newStartPageToken: "800" });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: (name: string, def?: unknown) => {
        const val = (n.parameters as Record<string, unknown>)[name];
        return val !== undefined ? val : def;
      },
      getParams: () => n.parameters as Record<string, unknown>,
      getCredential: async () => ({ accessToken: "test-token" }),
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

    await expect(executor(ctx, node)).rejects.toThrow("no matching event was found");
  });

  it("manual mode with matching history returns only the most recent matching file", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("startPageToken")) {
        return mockResponse({ startPageToken: "900" });
      }
      return mockResponse({
        changes: [
          {
            type: "create",
            fileId: "old1",
            file: { id: "old1", name: "old.txt", mimeType: "text/plain", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
          {
            type: "create",
            fileId: "new1",
            file: { id: "new1", name: "new.pdf", mimeType: "application/pdf", parents: ["1HwOAKkkgveLji8vVpW9Xrg1EsBskwMNb"] },
          },
        ],
        newStartPageToken: "901",
      });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Google Drive Trigger", type: TYPE, parameters: defaultParams });
    const n = makeNode(node);
    const ctx = {
      node: n,
      getParam: (name: string, def?: unknown) => {
        const val = (n.parameters as Record<string, unknown>)[name];
        return val !== undefined ? val : def;
      },
      getParams: () => n.parameters as Record<string, unknown>,
      getCredential: async () => ({ accessToken: "test-token" }),
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

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("new1");
    expect(result[0][0].json.name).toBe("new.pdf");
  });
});
