import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleSlidesTool";
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
let lastUrl: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
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
      lastUrl = String(url);
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

describe("googleSlidesTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("Create a presentation", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url === "https://slides.googleapis.com/v1/presentations") {
        const b = body as Record<string, unknown>;
        return mockResponse({
          presentationId: "pres-new-1",
          title: b.title ?? "Untitled",
          pageCount: 1,
          slides: [{ objectId: "slide1", pageType: "SLIDE", pageElements: [] }],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      resource: "presentation",
      operation: "create",
      title: "Q4 Review",
    });
    expect(out[0].json).toMatchObject({
      presentationId: "pres-new-1",
      title: "Q4 Review",
      pageCount: 1,
      slides: [{ objectId: "slide1", pageType: "SLIDE", pageElements: [] }],
    });
  });

  it("Get a presentation by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/presentations/1ABCxyz")) {
        return mockResponse({
          presentationId: "1ABCxyz",
          title: "Q4 Review",
          pageCount: 2,
          slides: [
            { objectId: "slide1", pageType: "SLIDE", pageElements: [] },
            { objectId: "slide2", pageType: "SLIDE", pageElements: [] },
          ],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      resource: "presentation",
      operation: "get",
      presentationId: "={{ $json.presentationId }}",
    }, [{ presentationId: "1ABCxyz" }]);
    expect(out[0].json).toMatchObject({
      presentationId: "1ABCxyz",
      title: "Q4 Review",
      pageCount: 2,
    });
  });

  it("Get presentation slides (list)", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/presentations/p1")) {
        return mockResponse({
          presentationId: "p1",
          slides: [
            { objectId: "slide1", pageType: "SLIDE", pageElements: [] },
          ],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      resource: "presentation",
      operation: "getSlides",
      presentationId: "={{ $json.presentationId }}",
    }, [{ presentationId: "p1" }]);
    expect(out[0].json).toEqual([
      { objectId: "slide1", pageType: "SLIDE", pageElements: [] },
    ]);
  });

  it("Replace text across all slides", async () => {
    let batchUpdateCalled = false;
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        batchUpdateCalled = true;
        const b = body as Record<string, unknown>;
        const requests = b.requests as Array<Record<string, unknown>>;
        expect(requests[0]).toMatchObject({
          replaceAllText: {
            containsText: { text: "{{Q3}}", matchCase: false },
            replaceText: "Q4",
          },
        });
        return mockResponse({ presentationId: "1ABCxyz", replies: [{}] });
      }
      if (method === "GET" && url.includes("/presentations/1ABCxyz")) {
        return mockResponse({
          presentationId: "1ABCxyz",
          title: "Q4 Review",
          revisionId: "rev-1",
          slides: [],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      resource: "presentation",
      operation: "replaceText",
      presentationId: "={{ $json.presentationId }}",
      oldText: "{{Q3}}",
      newText: "Q4",
    }, [{ presentationId: "1ABCxyz" }]);
    expect(batchUpdateCalled).toBe(true);
    expect(out[0].json).toMatchObject({
      presentationId: "1ABCxyz",
      title: "Q4 Review",
      revisionId: "rev-1",
    });
  });

  it("Get page thumbnail", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/pages/slide1/thumbnail")) {
        return mockResponse({
          contentUrl: "https://slides.googleapis.com/.../thumbnail",
          width: 1600,
          height: 900,
        });
      }
      return mockResponse({});
    });
    const [out] = await run({
      resource: "page",
      operation: "getThumbnail",
      presentationId: "={{ $json.presentationId }}",
      slideId: "={{ $json.slideId }}",
      thumbnailSize: "LARGE",
    }, [{ presentationId: "1ABCxyz", slideId: "slide1" }]);
    expect(out[0].json).toMatchObject({
      contentUrl: "https://slides.googleapis.com/.../thumbnail",
      width: 1600,
      height: 900,
    });
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "not found" } }, 404));
    const [out] = await run(
      {
        resource: "presentation",
        operation: "get",
        presentationId: "missing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0].json).toMatchObject({ error: expect.stringContaining("not found") });
  });
});
