import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleBusinessProfile";
const CREDS = { googleBusinessProfileOAuth2Api: { accessToken: "tok_gbp" } };

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
        try { body = JSON.parse(init.body); } catch { body = init.body; }
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
    credentials: { googleBusinessProfileOAuth2Api: { name: "googleBusinessProfileOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
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

describe("googleBusinessProfile executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a standard post", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/localPosts")) {
        return mockResponse({
          name: "accounts/123/locations/456/localPosts/p789",
          topicType: "STANDARD",
          summary: "Spring cleaning sale this week!",
          state: "LIVE",
          createTime: "2026-07-31T12:00:00Z",
          updateTime: "2026-07-31T12:00:00Z",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "post",
      operation: "create",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      postType: "STANDARD",
      summary: "Spring cleaning sale this week!",
    });
    expect(out[0][0].json).toMatchObject({
      name: expect.any(String),
      topicType: "STANDARD",
      summary: "Spring cleaning sale this week!",
      state: expect.any(String),
      createTime: expect.any(String),
    });
  });

  it("create an event post with call-to-action", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/localPosts")) {
        return mockResponse({
          name: "accounts/123/locations/456/localPosts/p789",
          topicType: "EVENT",
          summary: "Join us for our anniversary party",
          event: { title: "Anniversary Party", schedule: { startDate: { year: 2026, month: 9, day: 1 } } },
          callToAction: { actionType: "BOOK", url: "https://example.com/reserve" },
          state: "LIVE",
          createTime: "2026-07-31T12:00:00Z",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "post",
      operation: "create",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      postType: "EVENT",
      summary: "Join us for our anniversary party",
      title: "Anniversary Party",
      startDateTime: "2026-09-01T18:00:00Z",
      endDateTime: "2026-09-01T22:00:00Z",
      options: { callToActionType: "BOOK", url: "https://example.com/reserve" },
    });
    expect(out[0][0].json).toMatchObject({
      topicType: "EVENT",
      summary: "Join us for our anniversary party",
      event: { title: "Anniversary Party", schedule: expect.any(Object) },
      callToAction: { actionType: "BOOK", url: "https://example.com/reserve" },
    });
  });

  it("get a post by resource name", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("localPosts/789")) {
        return mockResponse({
          name: "accounts/123/locations/456/localPosts/789",
          topicType: "STANDARD",
          summary: "Test post",
          state: "LIVE",
          createTime: "2026-07-31T12:00:00Z",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "post",
      operation: "get",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      post: { mode: "name", value: "accounts/123/locations/456/localPosts/789" },
    });
    expect(out[0][0].json).toMatchObject({
      name: "accounts/123/locations/456/localPosts/789",
    });
  });

  it("reply to a review", async () => {
    installFetch((url, method, body) => {
      if (method === "PUT" && url.includes("/reply")) {
        return mockResponse({
          comment: "Thank you for your feedback!",
          updateTime: "2026-07-31T12:00:00Z",
          reviewReplyState: "PUBLISHED",
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "review",
      operation: "reply",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      review: { mode: "id", value: "review-abc-123" },
      reply: "Thank you for your feedback!",
    });
    expect(out[0][0].json).toMatchObject({
      comment: "Thank you for your feedback!",
      reviewReplyState: expect.any(String),
      updateTime: expect.any(String),
    });
  });

  it("list reviews with a limit", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/reviews")) {
        return mockResponse({
          reviews: [
            { name: "r1", reviewId: "r1", starRating: "FIVE", comment: "Great!" },
            { name: "r2", reviewId: "r2", starRating: "FOUR", comment: "Good" },
            { name: "r3", reviewId: "r3", starRating: "THREE", comment: "OK" },
            { name: "r4", reviewId: "r4", starRating: "TWO", comment: "Meh" },
            { name: "r5", reviewId: "r5", starRating: "ONE", comment: "Bad" },
            { name: "r6", reviewId: "r6", starRating: "FIVE", comment: "Extra" },
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "review",
      operation: "getAll",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      returnAll: false,
      limit: 5,
    });
    expect(out[0]).toHaveLength(5);
    expect(out[0][0].json).toMatchObject({ name: "r1", reviewId: "r1", starRating: "FIVE", comment: "Great!" });
    expect(out[0][4].json).toMatchObject({ name: "r5", reviewId: "r5", starRating: "ONE", comment: "Bad" });
  });

  it("delete a post", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("localPosts/789")) {
        return mockResponse(null);
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "post",
      operation: "delete",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      post: { mode: "name", value: "accounts/123/locations/456/localPosts/789" },
    });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("delete a review reply", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/reply")) {
        return mockResponse(null);
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "review",
      operation: "delete",
      account: { mode: "name", value: "accounts/123" },
      location: { mode: "name", value: "accounts/123/locations/456" },
      review: { mode: "id", value: "review-abc-123" },
    });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("continueOnFail emits error item", async () => {
    installFetch(() => mockResponse({ error: { message: "not found" } }, 404));
    const out = await run(
      {
        resource: "post",
        operation: "get",
        account: { mode: "name", value: "accounts/123" },
        location: { mode: "name", value: "accounts/123/locations/456" },
        post: { mode: "name", value: "accounts/123/locations/456/localPosts/missing" },
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("not found") });
  });
});