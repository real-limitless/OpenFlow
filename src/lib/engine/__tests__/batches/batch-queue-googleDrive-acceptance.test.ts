import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDrive";

const CREDS = {
  googleApi: { accessToken: "tok_drive" },
  googleDriveOAuth2Api: { accessToken: "tok_drive" },
};

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: new Map(Object.entries({ "content-type": "application/json" })),
    get(name: string) {
      return name === "content-type" ? "application/json" : null;
    },
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
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleApi: { name: "googleApi" } },
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

describe("googleDrive executor – acceptance tests", () => {
  it("File Create (text file)", async () => {
    const fileId = "file_abc123";
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/drive/v3/files") && !url.includes("upload")) {
        return mockResponse({ id: fileId, name: "notes.txt", mimeType: "text/plain", parents: ["root"], webViewLink: "https://drive.google.com/file/d/file_abc123" });
      }
      if (method === "PATCH" && url.includes("upload")) {
        return mockResponse({});
      }
      if (url.includes(`/files/${fileId}?fields=`)) {
        return mockResponse({ id: fileId, name: "notes.txt", mimeType: "text/plain", parents: ["root"], webViewLink: "https://drive.google.com/file/d/file_abc123" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "create",
      fileName: "notes.txt",
      content: "hello",
      convertToGoogleDocument: false,
      parentId: "root",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("notes.txt");
    expect(json.id).toBe(fileId);
    expect(json.mimeType).toBe("text/plain");
    expect(json.parents).toContain("root");
  });

  it("File/Folder Search by name", async () => {
    const files = [
      { id: "f1", name: "notes_1.txt", mimeType: "text/plain" },
      { id: "f2", name: "notes_2.txt", mimeType: "text/plain" },
    ];
    installFetch((url) => {
      if (url.includes("/drive/v3/files?")) {
        return mockResponse({ files, nextPageToken: null });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "fileFolder",
      operation: "search",
      searchMode: "name",
      query: "notes",
      returnAll: false,
      limit: 5,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.files as Array<Record<string, unknown>>)).toHaveLength(2);
    expect((json.files as Array<Record<string, unknown>>)[0]).toHaveProperty("id");
    expect((json.files as Array<Record<string, unknown>>)[0]).toHaveProperty("name");
    expect((json.files as Array<Record<string, unknown>>)[0]).toHaveProperty("mimeType");
  });

  it("File Download", async () => {
    const fileId = "abc123";
    installFetch((url, method) => {
      if (url.includes(`/files/${fileId}?fields=`)) {
        return mockResponse({ id: fileId, name: "report.pdf", mimeType: "application/pdf" });
      }
      if (url.includes("alt=media") || url.includes("export")) {
        return {
          status: 200,
          ok: true,
          statusText: "OK",
          headers: new Map(Object.entries({ "content-type": "application/pdf" })),
          get(name: string) {
            return name === "content-type" ? "application/pdf" : null;
          },
          async json() {
            return {};
          },
          async text() {
            return "%PDF-dummy";
          },
          async arrayBuffer() {
            return new TextEncoder().encode("%PDF-dummy").buffer;
          },
        };
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "download",
      fileId: `=${fileId}`,
      outputField: "data",
    }, [{ fileId }]);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe(fileId);
    const binary = out[0][0].binary as Record<string, unknown> | undefined;
    expect(binary).toBeDefined();
    expect((binary as Record<string, unknown>).data).toBeDefined();
  });

  it("File Share", async () => {
    const fileId = "abc123";
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/permissions")) {
        return mockResponse({ id: "perm1", role: "reader", type: "user", emailAddress: "alice@example.com" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "share",
      fileId,
      permissions: {
        permissionValues: [
          { role: "reader", type: "user", email: "alice@example.com" },
        ],
      },
    });
    const json = out[0][0].json as Record<string, unknown>;
    const perms = json.permissions as Array<Record<string, unknown>>;
    expect(perms).toHaveLength(1);
    expect(perms[0].role).toBe("reader");
    expect(perms[0].emailAddress).toBe("alice@example.com");
  });

  it("Folder Create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/drive/v3/files")) {
        return mockResponse({ id: "folder1", name: "My Folder", mimeType: "application/vnd.google-apps.folder" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      folderName: "My Folder",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("My Folder");
    expect(json.mimeType).toBe("application/vnd.google-apps.folder");
    expect(json.id).toBe("folder1");
  });

  it("Shared Drive Create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/drive/v3/drives")) {
        return mockResponse({ id: "drive1", name: "Team Space" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "drive",
      operation: "create",
      driveName: "Team Space",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("Team Space");
    expect(json.id).toBe("drive1");
  });

  it("Shared Drive list (getAll)", async () => {
    installFetch((url) => {
      if (url.includes("/drive/v3/drives")) {
        return mockResponse({
          drives: [
            { id: "d1", name: "Team Space" },
            { id: "d2", name: "Research" },
          ],
          nextPageToken: null,
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "drive",
      operation: "getAll",
      returnAll: true,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.drives as Array<Record<string, unknown>>)).toHaveLength(2);
    expect((json.drives as Array<Record<string, unknown>>)[0].name).toBe("Team Space");
  });

  it("File Delete", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/files/file123")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      fileId: "file123",
      deletePermanently: false,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("file123");
    expect(json.deleted).toBe(true);
  });

  it("File Copy", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/copy")) {
        return mockResponse({ id: "copy1", name: "Copy of notes.txt", mimeType: "text/plain" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "copy",
      fileId: "orig123",
      newName: "Copy of notes.txt",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("copy1");
    expect(json.name).toBe("Copy of notes.txt");
  });

  it("File Update (rename)", async () => {
    installFetch((url, method) => {
      if (method === "PATCH" && url.includes("/files/file123")) {
        return mockResponse({ id: "file123", name: "renamed.txt", mimeType: "text/plain" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "update",
      fileId: "file123",
      newFileName: "renamed.txt",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("file123");
    expect(json.name).toBe("renamed.txt");
  });

  it("File Move", async () => {
    installFetch((url, method) => {
      if (method === "PATCH" && url.includes("addParents")) {
        return mockResponse({ id: "file123" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "move",
      fileId: "file123",
      parentId: "newFolder123",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("file123");
    expect(json.moved).toBe(true);
  });

  it("Folder Delete", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/files/folder123")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "folder",
      operation: "delete",
      folderId: "folder123",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("folder123");
    expect(json.deleted).toBe(true);
  });

  it("Folder Share", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/permissions")) {
        return mockResponse({ id: "perm2", role: "writer", type: "user", emailAddress: "bob@example.com" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "folder",
      operation: "share",
      folderId: "folder123",
      permissions: {
        permissionValues: [
          { role: "writer", type: "user", email: "bob@example.com" },
        ],
      },
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.permissions as Array<Record<string, unknown>>)[0].role).toBe("writer");
    expect((json.permissions as Array<Record<string, unknown>>)[0].emailAddress).toBe("bob@example.com");
  });

  it("throws on missing credential", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "file", operation: "create" },
    });
    const ctx: ExecutionContext = createExecutionContext({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(/credential/i);
  });
});
