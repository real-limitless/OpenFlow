import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleDocsTool";
const CREDS = { googleDocsOAuth2Api: { accessToken: "tok_googledocs_tool" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(h: (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      return h(String(url), init?.method ?? "GET", body);
    }),
  );
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
    credentials: { googleDocsOAuth2Api: { name: "googleDocsOAuth2Api" } },
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
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  const out = await getExecutor(TYPE)!(ctx, node);
  return { out };
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleDocsTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("Create document with title and body content", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("drive/v3/files")) {
        return mockResponse({ id: "doc-tool-1", name: "Meeting notes", mimeType: "application/vnd.google-apps.document" });
      }
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({});
      }
      if (method === "GET" && url.includes("/documents/doc-tool-1")) {
        return mockResponse({
          documentId: "doc-tool-1",
          title: "Meeting notes",
          body: {
            content: [
              { startIndex: 1, endIndex: 9, paragraph: { elements: [{ startIndex: 1, endIndex: 9, textRun: { content: "Agenda:\n" } }] } },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const { out } = await run({
      resource: "document",
      operation: "create",
      title: "Meeting notes",
      bodyContent: "Agenda:\n",
    });
    expect(out[0][0].json).toMatchObject({
      documentId: "doc-tool-1",
      title: "Meeting notes",
    });
  });

  it("Get document by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/documents/1ABCxyz")) {
        return mockResponse({
          documentId: "1ABCxyz",
          title: "Meeting notes",
          body: {
            content: [
              { startIndex: 1, endIndex: 30, paragraph: { elements: [{ startIndex: 1, endIndex: 30, textRun: { content: "Agenda:\n- Review Q3 goals\n" } }] } },
            ],
          },
        });
      }
      return mockResponse({});
    });
    const { out } = await run({
      resource: "document",
      operation: "get",
      documentId: "1ABCxyz",
    });
    expect(out[0][0].json).toMatchObject({
      documentId: "1ABCxyz",
      title: "Meeting notes",
    });
  });

  it("Update document by appending content", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/documents/1ABCxyz") && !url.includes(":batchUpdate")) {
        return mockResponse({
          documentId: "1ABCxyz",
          title: "Meeting notes",
          body: {
            content: [
              { startIndex: 1, endIndex: 30, paragraph: { elements: [{ startIndex: 1, endIndex: 30, textRun: { content: "Agenda:\n- Review Q3 goals\n" } }] } },
              { startIndex: 31, endIndex: 46, paragraph: { elements: [{ startIndex: 31, endIndex: 46, textRun: { content: "Action item: ship milestone 1\n" } }] } },
            ],
          },
        });
      }
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const { out } = await run(
      {
        resource: "document",
        operation: "update",
        documentId: "={{ $json.docId }}",
        updateMode: "append",
        bodyContent: "={{ $json.note }}",
      },
      [{ docId: "1ABCxyz", note: "Action item: ship milestone 1" }],
    );
    expect(out[0][0].json).toMatchObject({
      documentId: "1ABCxyz",
      title: "Meeting notes",
    });
  });

  it("Update document by replacing content", async () => {
    let getCount = 0;
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/documents/1ABCxyz") && !url.includes(":batchUpdate")) {
        getCount++;
        if (getCount === 1) {
          return mockResponse({
            documentId: "1ABCxyz",
            title: "Meeting notes",
            body: {
              content: [
                { startIndex: 1, endIndex: 30, paragraph: { elements: [{ startIndex: 1, endIndex: 30, textRun: { content: "Agenda:\n- Review Q3 goals\n" } }] } },
              ],
            },
          });
        }
        return mockResponse({
          documentId: "1ABCxyz",
          title: "Meeting notes",
          body: {
            content: [
              { startIndex: 1, endIndex: 22, paragraph: { elements: [{ startIndex: 1, endIndex: 22, textRun: { content: "Completely new draft\n" } }] } },
            ],
          },
        });
      }
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const { out } = await run(
      {
        resource: "document",
        operation: "update",
        documentId: "={{ $json.docId }}",
        updateMode: "replace",
        bodyContent: "={{ $json.newText }}",
      },
      [{ docId: "1ABCxyz", newText: "Completely new draft\n" }],
    );
    expect(out[0][0].json).toMatchObject({
      documentId: "1ABCxyz",
    });
  });

  it("continueOnFail emits error item on API error", async () => {
    installFetch(() => mockResponse({ error: { message: "not found" } }, 404));
    const { out } = await run(
      { resource: "document", operation: "get", documentId: "missing" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("not found") });
  });
});
