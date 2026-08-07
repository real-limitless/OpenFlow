import { describe, it, expect, beforeEach, vi } from "vitest";
import { getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinExecutors } from "../../index";
import { makeNode, makeCtx } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.iterable";

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

const CREDS = {
  iterableApi: { apiKey: "test-api-key-123", region: "USDC" },
};

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters, credentials: { iterableApi: { name: "iterableApi" } } });
  const ctx = makeCtx(
    inputItems.map((i) => ({ json: i })),
    node,
    opts?.continueOnFail ?? false,
    CREDS,
  );
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("n8n-nodes-base.iterable", () => {
  describe("event:track", () => {
    it("sends POST to /events/trackBulk with email", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await run({
        resource: "event",
        operation: "track",
        name: "purchase",
        additionalFields: {
          email: "user@example.com",
          campaignId: "123",
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/events/trackBulk");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({
        events: [{
          eventName: "purchase",
          email: "user@example.com",
          campaignId: "123",
        }],
      });
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ code: "Success" });
    });

    it("throws when neither email nor userId is provided", async () => {
      installFetch();

      await expect(run({
        resource: "event",
        operation: "track",
        name: "purchase",
        additionalFields: {},
      })).rejects.toThrow("either email or userId must be provided");
    });
  });

  describe("user:upsert", () => {
    it("sends POST to /users/update with email", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await run({
        resource: "user",
        operation: "upsert",
        identifier: "email",
        value: "user@example.com",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/api/users/update");
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ email: "user@example.com", preferUserId: true });
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject({ code: "Success" });
    });

    it("throws when API code is not Success", async () => {
      installFetch({ code: "Fail", msg: "error" });

      await expect(run({
        resource: "user",
        operation: "upsert",
        identifier: "email",
        value: "user@example.com",
      })).rejects.toThrow('with code "Fail"');
    });
  });

  describe("user:delete", () => {
    it("sends DELETE to /users/{email}", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await run({
        resource: "user",
        operation: "delete",
        by: "email",
        email: "user@example.com",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/api/users/user%40example.com");
    });

    it("sends DELETE to /users/byUserId/{userId}", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await run({
        resource: "user",
        operation: "delete",
        by: "userId",
        userId: "abc-123",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/api/users/byUserId/abc-123");
    });
  });

  describe("user:get", () => {
    it("sends GET to /users/getByEmail and unwraps user envelope", async () => {
      installFetch({ user: { email: "user@example.com", userId: "123" } });

      const [out] = await run({
        resource: "user",
        operation: "get",
        by: "email",
        email: "user@example.com",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/api/users/getByEmail?email=user%40example.com");
      expect(out).toHaveLength(1);
      expect(out[0].json).toEqual({ email: "user@example.com", userId: "123" });
    });

    it("throws 404 when user not found", async () => {
      installFetch({}, 404);

      await expect(run({
        resource: "user",
        operation: "get",
        by: "email",
        email: "nonexistent@example.com",
      })).rejects.toThrow("User not found");
    });
  });

  describe("userList:add", () => {
    it("batches all items into single POST to /lists/subscribe", async () => {
      installFetch({ code: "Success", msg: "" });

      const [out] = await run(
        {
          resource: "userList",
          operation: "add",
          listId: 42,
          identifier: "email",
          value: "",
        },
        [{ email: "a@example.com" }, { email: "b@example.com" }],
      );

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
