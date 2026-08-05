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
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
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
        return mockResponse({
          presentationId: "new-pres-1",
          title: (body as Record<string, unknown>)?.title ?? "",
          slides: [{ objectId: "p", pageType: "SLIDE", pageElements: [] }],
          pageSize: { width: { magnitude: 9600000, unit: "EMU" }, height: { magnitude: 5400000, unit: "EMU" } },
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "create",
      title: "Sales Deck Q4",
    });
    expect(out[0][0].json).toMatchObject({
      presentationId: "new-pres-1",
      title: "Sales Deck Q4",
      slides: [{ objectId: "p", pageType: "SLIDE", pageElements: [] }],
    });
  });

  it("Get a presentation", async () => {
    installFetch((url) => {
      if (url.includes("/presentations/1XYZabc")) {
        return mockResponse({
          presentationId: "1XYZabc",
          title: "Sales Deck Q4",
          slides: [
            { objectId: "p", pageType: "SLIDE", pageElements: [{ objectId: "g1", shape: { shapeType: "TEXT_BOX", text: { textElements: [{ textRun: { content: "Welcome\n" } }] } } }] },
            { objectId: "slide2", pageType: "SLIDE", pageElements: [] },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "get",
      presentationId: "1XYZabc",
    });
    expect(out[0][0].json).toMatchObject({
      presentationId: "1XYZabc",
      title: "Sales Deck Q4",
    });
  });

  it("Get presentation slides", async () => {
    installFetch((url) => {
      if (url.includes("/presentations/1XYZabc")) {
        return mockResponse({
          presentationId: "1XYZabc",
          slides: [
            { objectId: "p", pageType: "SLIDE", pageElements: [] },
            { objectId: "slide2", pageType: "SLIDE", pageElements: [] },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "getSlides",
      presentationId: "1XYZabc",
    });
    // Per spec, getSlides emits a single item whose json is the slides array.
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual([
      { objectId: "p", pageType: "SLIDE", pageElements: [] },
      { objectId: "slide2", pageType: "SLIDE", pageElements: [] },
    ]);
  });

  it("Replace text across all slides", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        const requests = (body as Record<string, unknown>).requests as Array<Record<string, unknown>>;
        expect(requests[0]).toMatchObject({
          replaceAllText: {
            containsText: { text: "{{CompanyName}}", matchCase: false },
            replaceText: "Acme Corp",
          },
        });
        return mockResponse({
          presentationId: "1XYZabc",
          replies: [{ replaceAllText: { occurrencesChanged: 3 } }],
        });
      }
      if (method === "GET" && url.includes("/presentations/1XYZabc")) {
        return mockResponse({
          presentationId: "1XYZabc",
          title: "Sales Deck Q4",
          revisionId: "rev-9",
          slides: [],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "presentation",
      operation: "replaceText",
      presentationId: "1XYZabc",
      oldText: "{{CompanyName}}",
      newText: "Acme Corp",
    });
    // Spec: Replace text returns the presentation object after the replacement.
    expect(out[0][0].json).toMatchObject({
      presentationId: "1XYZabc",
      title: "Sales Deck Q4",
      revisionId: "rev-9",
    });
  });

  it("Get a page thumbnail", async () => {
    installFetch((url) => {
      if (url.includes("/thumbnail")) {
        return mockResponse({
          contentUrl: "https://slides.googleapis.com/v1/presentations/1XYZabc/pages/g1/thumbnail?access_token=tok_slides",
          contentHeight: 540,
          contentWidth: 960,
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "page",
      operation: "getThumbnail",
      presentationId: "1XYZabc",
      slideId: "g1",
    });
    expect(out[0][0].json).toMatchObject({
      contentUrl: expect.stringContaining("thumbnail"),
      contentHeight: 540,
      contentWidth: 960,
    });
  });

  it("Get a page", async () => {
    installFetch((url) => {
      if (url.includes("/pages/g1")) {
        return mockResponse({
          objectId: "g1",
          pageType: "SLIDE",
          pageElements: [],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "page",
      operation: "get",
      presentationId: "1XYZabc",
      slideId: "g1",
    });
    expect(out[0][0].json).toMatchObject({
      objectId: "g1",
      pageType: "SLIDE",
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
