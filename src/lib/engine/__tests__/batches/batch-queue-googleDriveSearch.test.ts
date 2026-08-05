import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDriveSearch";
const CREDS = { googleDriveOAuth2Api: { accessToken: "tok_drive" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (url: string, method: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      handler(String(url), init?.method ?? "GET"),
    ),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleDriveOAuth2Api: { name: "googleDriveOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
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
    continueOnFail: false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleDriveSearch executor – acceptance tests", () => {
  it("search by name fragment", async () => {
    installFetch((url) => {
      if (url.includes("name+contains+'report'")) {
        return mockResponse({
          kind: "drive#fileList",
          incompleteSearch: false,
          files: [
            { id: "f1", name: "report-q1.pdf", mimeType: "application/pdf" },
            { id: "f2", name: "report-2024.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
          ],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      searchMode: "name",
      query: "report",
      returnAll: false,
      limit: 10,
      whatToSearch: "files",
    });
    expect(out.length).toBe(1);
    const json = out[0].json;
    expect(json.kind).toBe("drive#fileList");
    expect(json.incompleteSearch).toBe(false);
    expect(Array.isArray(json.files)).toBe(true);
    const files = json.files as Array<Record<string, unknown>>;
    expect(files.length).toBeLessThanOrEqual(10);
    for (const f of files) {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("name");
      expect(f).toHaveProperty("mimeType");
      expect(String(f.name).toLowerCase()).toContain("report");
    }
  });

  it("search with returnAll", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `file${i}`,
      name: `photo_${i}.jpg`,
      mimeType: "image/jpeg",
    }));
    const page2 = [{ id: "file100", name: "photo_100.jpg", mimeType: "image/jpeg" }];
    let callCount = 0;
    installFetch((url) => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({
          kind: "drive#fileList",
          incompleteSearch: false,
          files: page1,
          nextPageToken: "page2",
        });
      }
      return mockResponse({
        kind: "drive#fileList",
        incompleteSearch: false,
        files: page2,
      });
    });
    const [out] = await run({
      searchMode: "name",
      query: "photo",
      returnAll: true,
      whatToSearch: "filesFolders",
      includeTrashed: false,
    });
    expect(out.length).toBe(1);
    const files = out[0].json.files as Array<Record<string, unknown>>;
    expect(files.length).toBe(101);
    expect(callCount).toBeGreaterThan(1);
  });

  it("advanced query", async () => {
    installFetch((url) => {
      if (url.includes("mimeType")) {
        return mockResponse({
          kind: "drive#fileList",
          incompleteSearch: false,
          files: [
            { id: "folder1", name: "MyFolder", mimeType: "application/vnd.google-apps.folder", trashed: false },
          ],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      searchMode: "advanced",
      query: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      returnAll: false,
      limit: 5,
    });
    const files = out[0].json.files as Array<Record<string, unknown>>;
    expect(files.length).toBeLessThanOrEqual(5);
    for (const f of files) {
      expect(f.mimeType).toBe("application/vnd.google-apps.folder");
    }
  });

  it("scope to a specific folder", async () => {
    installFetch((url) => {
      if (url.includes("1abcFolderId")) {
        return mockResponse({
          kind: "drive#fileList",
          incompleteSearch: false,
          files: [
            { id: "n1", name: "notes.md", mimeType: "text/markdown" },
          ],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      searchMode: "name",
      query: "notes",
      folderId: "1abcFolderId",
      returnAll: false,
      limit: 10,
    });
    const files = out[0].json.files as Array<Record<string, unknown>>;
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(String(f.name).toLowerCase()).toContain("notes");
    }
  });

  it("include trashed items", async () => {
    installFetch(() => {
      return mockResponse({
        kind: "drive#fileList",
        incompleteSearch: false,
        files: [
          { id: "t1", name: "old-backup.zip", mimeType: "application/zip", trashed: true },
        ],
      });
    });
    const [out] = await run({
      searchMode: "name",
      query: "old",
      includeTrashed: true,
      returnAll: false,
      limit: 50,
    });
    const files = out[0].json.files as Array<Record<string, unknown>>;
    expect(files.some((f) => f.trashed === true)).toBe(true);
  });

  it("handles API error with continueOnFail", async () => {
    installFetch(() => mockResponse({ error: { message: "Rate limit exceeded" } }, 429));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { searchMode: "name", query: "test" },
      credentials: { googleDriveOAuth2Api: { name: "googleDriveOAuth2Api" } },
    });
    const ctx: ExecutionContext = createExecutionContext({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
    });
    const [out] = await getExecutor(TYPE)!(ctx, node);
    expect(out.length).toBe(1);
    expect(out[0].json).toHaveProperty("error");
    expect(String(out[0].json.error)).toContain("Rate limit exceeded");
  });
});
