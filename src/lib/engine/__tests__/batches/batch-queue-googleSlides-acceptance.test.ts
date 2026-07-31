import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleSlides";
const CREDS = { googleSlidesOAuth2Api: { accessToken: "tok_slides" } };

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

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      return handler(String(url), init?.method ?? "GET", body);
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
    credentials: { googleSlidesOAuth2Api: { name: "googleSlidesOAuth2Api" } },
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
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleSlides executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("Create a presentation", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url === "https://slides.googleapis.com/v1/presentations") {
        return mockResponse({
          presentationId: "pres-new-1",
          title: "Q3 Report",
          slides: [{}],
          masters: [],
          layouts: [],
          revisionId: "r1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "create",
      title: "Q3 Report",
    });
    expect(out[0][0].json).toMatchObject({
      presentationId: "pres-new-1",
      title: "Q3 Report",
      slides: [{}],
      masters: [],
      layouts: [],
      revisionId: "r1",
    });
  });

  it("Get a presentation", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/presentations/abc123")) {
        return mockResponse({
          presentationId: "abc123",
          title: "Q3 Report",
          slides: [{ objectId: "s1" }],
          revisionId: "r1",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "get",
      presentationId: "abc123",
    });
    expect(out[0][0].json).toMatchObject({
      presentationId: "abc123",
      title: "Q3 Report",
      slides: [{ objectId: "s1" }],
      revisionId: "r1",
    });
  });

  it("Get presentation slides", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/presentations/abc123")) {
        return mockResponse({
          presentationId: "abc123",
          slides: [
            { objectId: "p1", pageElements: [], slideProperties: { layoutObjectId: "l1", masterObjectId: "m1" } },
            { objectId: "p2", pageElements: [], slideProperties: { layoutObjectId: "l2", masterObjectId: "m2" } },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "getSlides",
      presentationId: "abc123",
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ objectId: "p1", slideProperties: { layoutObjectId: "l1" } });
    expect(out[0][1].json).toMatchObject({ objectId: "p2", slideProperties: { layoutObjectId: "l2" } });
  });

  it("Replace text in a presentation", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({
          presentationId: "abc123",
          replies: [{ replaceAllText: { occurrencesChanged: 3 } }],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "replaceText",
      presentationId: "abc123",
      text: "TODO",
      replacement: "Done",
      replaceAllMatches: true,
    });
    expect(out[0][0].json).toMatchObject({
      presentationId: "abc123",
      replies: [{ replaceAllText: { occurrencesChanged: 3 } }],
    });
    expect(lastBody).toMatchObject({
      requests: [{ replaceAllText: { containsText: { text: "TODO" }, replaceText: "Done" } }],
    });
  });

  it("Get a page thumbnail", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/pages/p1/thumbnail")) {
        return mockResponse({
          contentUrl: "https://slides.googleapis.com/...",
          height: 200,
          width: 300,
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "page",
      operation: "getThumbnail",
      presentationId: "abc123",
      pageId: "p1",
    });
    expect(out[0][0].json).toMatchObject({
      contentUrl: "https://slides.googleapis.com/...",
      height: 200,
      width: 300,
    });
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "not found" } }, 404));
    const out = await run(
      {
        resource: "presentation",
        operation: "get",
        presentationId: "missing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("not found") });
  });
});