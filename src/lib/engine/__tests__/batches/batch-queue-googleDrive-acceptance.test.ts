import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDrive";
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

describe("googleDrive executor – acceptance tests", () => {
  it("file create (text)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://www.googleapis.com/drive/v3/files") {
        return mockResponse({
          id: "file1",
          name: "notes.txt",
          mimeType: "text/plain",
          parents: ["root"],
          webViewLink: "https://drive.google.com/file/d/file1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "create",
      fileName: "notes.txt",
      content: "hello",
      folderId: "root",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("notes.txt");
    expect(json.id).toBeTruthy();
    expect(json.mimeType).toBe("text/plain");
    expect(json.parents).toContain("root");
  });

  it("file create (google doc)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://www.googleapis.com/drive/v3/files") {
        return mockResponse({
          id: "doc1",
          name: "report",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://docs.google.com/document/d/doc1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "create",
      fileName: "report",
      content: "body",
      convertToGoogleDocument: true,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.mimeType).toBe("application/vnd.google-apps.document");
  });

  it("file delete (trash)", async () => {
    installFetch((url, method) => {
      if (
        method === "PATCH" &&
        url === "https://www.googleapis.com/drive/v3/files/abc123"
      ) {
        return mockResponse({ id: "abc123", trashed: true });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      fileId: "abc123",
      deletePermanently: false,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.trashed).toBe(true);
    expect(json.permanent).toBe(false);
  });

  it("file delete (permanent)", async () => {
    installFetch((url, method) => {
      if (
        method === "DELETE" &&
        url === "https://www.googleapis.com/drive/v3/files/abc123"
      ) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "delete",
      fileId: "abc123",
      deletePermanently: true,
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.permanent).toBe(true);
    expect(json.deleted).toBe(true);
  });

  it("file upload into folder", async () => {
    installFetch((url, method) => {
      if (
        method === "POST" &&
        url.includes("uploadType=multipart")
      ) {
        return mockResponse({
          id: "up1",
          name: "report.pdf",
          mimeType: "application/pdf",
          parents: ["1abcFolder"],
          webViewLink: "https://drive.google.com/file/d/up1",
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "file",
        operation: "upload",
        binaryField: "file",
        fileName: "report.pdf",
        folderId: "1abcFolder",
      },
      [
        {
          json: {},
          binary: {
            file: { fileName: "report.pdf", mimeType: "application/pdf", data: "base64data" },
          },
        } as unknown as INodeExecutionData,
      ],
    );
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("report.pdf");
    expect(json.mimeType).toBe("application/pdf");
    expect(json.parents).toContain("1abcFolder");
  });

  it("file copy", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/abc123/copy")) {
        return mockResponse({
          id: "copy1",
          name: "Copy of doc",
          mimeType: "text/plain",
          parents: ["root"],
          webViewLink: "https://drive.google.com/file/d/copy1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "copy",
      fileId: "abc123",
      newName: "Copy of doc",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("copy1");
    expect(json.name).toBe("Copy of doc");
  });

  it("file move between folders", async () => {
    let getCount = 0;
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/abc123?fields=parents")) {
        getCount++;
        return mockResponse({ parents: ["1oldFolder"] });
      }
      if (method === "PATCH" && url.includes("addParents=2targetFolder")) {
        return mockResponse({
          id: "abc123",
          name: "file.txt",
          mimeType: "text/plain",
          parents: ["2targetFolder"],
          webViewLink: "https://drive.google.com/file/d/abc123",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "move",
      fileId: "abc123",
      parentId: "2targetFolder",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.parents).toEqual(["2targetFolder"]);
    expect(getCount).toBe(1);
  });

  it("file share with user", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/abc123/permissions")) {
        return mockResponse({
          id: "perm1",
          role: "reader",
          type: "user",
          emailAddress: "alice@example.com",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "share",
      fileId: "abc123",
      permissions: [{ role: "reader", type: "user", email: "alice@example.com" }],
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.role).toBe("reader");
    expect(json.emailAddress).toBe("alice@example.com");
  });

  it("file share with wrapped permissions (permissionValues)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/abc123/permissions")) {
        return mockResponse({
          id: "perm2",
          role: "writer",
          type: "domain",
          domain: "example.com",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "file",
      operation: "share",
      fileId: "abc123",
      permissions: {
        permissionValues: [{ role: "writer", type: "domain", domain: "example.com" }],
      },
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.role).toBe("writer");
    expect(json.domain).toBe("example.com");
  });

  it("folder create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://www.googleapis.com/drive/v3/files") {
        return mockResponse({
          id: "folder1",
          name: "My Folder",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["root"],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "folder",
      operation: "create",
      folderName: "My Folder",
      parentId: "root",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.mimeType).toBe("application/vnd.google-apps.folder");
    expect(json.name).toBe("My Folder");
  });

  it("search by name", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("q=") && url.includes("contains")) {
        return mockResponse({
          files: [
            { id: "f1", name: "notes-1.txt", mimeType: "text/plain" },
            { id: "f2", name: "notes-2.txt", mimeType: "text/plain" },
          ],
        });
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
    expect(out[0].length).toBe(2);
    expect((out[0][0].json as Record<string, unknown>).name).toMatch(/notes/);
    expect((out[0][1].json as Record<string, unknown>).name).toMatch(/notes/);
  });

  it("drive create", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/drives")) {
        return mockResponse({
          id: "drive1",
          name: "Team Space",
          kind: "drive#drive",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "drive",
      operation: "create",
      name: "Team Space",
    });
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.name).toBe("Team Space");
    expect(json.id).toBeTruthy();
  });

  it("drive getAll", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("https://www.googleapis.com/drive/v3/drives")) {
        return mockResponse({
          drives: [
            { id: "d1", name: "Team Space", kind: "drive#drive" },
            { id: "d2", name: "Shared", kind: "drive#drive" },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "drive",
      operation: "getAll",
      returnAll: true,
    });
    expect(out[0].length).toBe(2);
    expect((out[0][0].json as Record<string, unknown>).name).toBe("Team Space");
    expect((out[0][1].json as Record<string, unknown>).name).toBe("Shared");
  });
});
