import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.iterableTool";
const CREDS = { iterableApi: { apiKey: "test-key", region: "USDC" } };

interface FetchCall { url: string; method: string; body: string | undefined }

let calls: FetchCall[];

function installFetch(responseBody: unknown = {}, status = 200) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const text = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Map([["content-type", "application/json"]]),
      async text() { return text; },
    };
  }));
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue iterableTool — n8n-nodes-base.iterableTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Iterable (AI Tool)");
  });

  describe("event:track", () => {
    it("sends POST to /events/trackBulk with email", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await runNode(TYPE, {
        resource: "event",
        operation: "track",
        name: "purchase",
        additionalFields: { email: "user@example.com" },
      }, [{}], { credentials: CREDS });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/events/trackBulk");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({
        events: [{ eventName: "purchase", email: "user@example.com" }],
      });
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ code: "Success" });
    });
  });

  describe("user:upsert", () => {
    it("sends POST to /users/update with email", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await runNode(TYPE, {
        resource: "user",
        operation: "upsert",
        identifier: "email",
        value: "user@example.com",
      }, [{}], { credentials: CREDS });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/users/update");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ email: "user@example.com", preferUserId: true });
    });
  });

  describe("userList:add batching", () => {
    it("batches all items into single POST to /lists/subscribe", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await runNode(TYPE, {
        resource: "userList",
        operation: "add",
        listId: 42,
        identifier: "email",
        value: "",
      }, [
        { email: "a@example.com" },
        { email: "b@example.com" },
      ], { credentials: CREDS });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/lists/subscribe");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({
        listId: 42,
        subscribers: [{ email: "a@example.com" }, { email: "b@example.com" }],
      });
    });
  });
});
