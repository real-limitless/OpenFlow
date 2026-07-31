import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleContacts";
const CREDS = { googleContactsOAuth2Api: { accessToken: "tok_contacts" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
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
      lastMethod = init?.method ?? "GET";
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
    credentials: { googleContactsOAuth2Api: { name: "googleContactsOAuth2Api" } },
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

describe("googleContacts executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a contact", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("createContact")) {
        return mockResponse({
          resourceName: "people/c12345",
          etag: "abc123",
          names: [{ displayName: "Alice Smith", givenName: "Alice", familyName: "Smith" }],
          emailAddresses: [{ value: "alice@example.com", type: "work", formattedType: "Work" }],
          phoneNumbers: [{ value: "+1-555-0100", type: "mobile", formattedType: "Mobile" }],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "contact",
      operation: "create",
      givenName: "Alice",
      familyName: "Smith",
      phoneNumbers: {
        phoneNumberValues: [{ type: "mobile", value: "+1-555-0100" }],
      },
      emailAddresses: {
        emailValues: [{ type: "work", value: "alice@example.com" }],
      },
    });

    expect(out[0][0].json).toMatchObject({
      resourceName: "people/c12345",
    });
    const names = (out[0][0].json as Record<string, unknown>).names as Array<Record<string, unknown>>;
    expect(names[0].givenName).toBe("Alice");
    expect(names[0].familyName).toBe("Smith");
    const emails = (out[0][0].json as Record<string, unknown>).emailAddresses as Array<Record<string, unknown>>;
    expect(emails[0].value).toBe("alice@example.com");
    expect(lastMethod).toBe("POST");
    expect(lastBody).toMatchObject({
      names: [{ givenName: "Alice", familyName: "Smith" }],
      emailAddresses: [{ type: "work", value: "alice@example.com" }],
      phoneNumbers: [{ type: "mobile", value: "+1-555-0100" }],
    });
  });

  it("get a contact by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("people%2Fc12345")) {
        return mockResponse({
          resourceName: "people/c12345",
          etag: "abc123",
          names: [{ displayName: "Alice Smith", givenName: "Alice", familyName: "Smith" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.contactId }}",
      },
      [{ contactId: "people/c12345" }],
    );

    expect(out[0][0].json).toMatchObject({
      resourceName: "people/c12345",
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("people%2Fc12345");
  });

  it("getAll contacts", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("people/me/connections")) {
        return mockResponse({
          connections: [
            { resourceName: "people/c1", names: [{ displayName: "Alice" }] },
            { resourceName: "people/c2", names: [{ displayName: "Bob" }] },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "contact",
      operation: "getAll",
      returnAll: true,
    });

    expect(out[0].length).toBe(2);
    expect((out[0][0].json as Record<string, unknown>).resourceName).toBe("people/c1");
    expect((out[0][1].json as Record<string, unknown>).resourceName).toBe("people/c2");
  });

  it("update a contact name", async () => {
    installFetch((url, method) => {
      if (method === "PATCH" && url.includes("people%2Fc12345")) {
        return mockResponse({
          resourceName: "people/c12345",
          etag: "def456",
          names: [{ displayName: "Alice Johnson", givenName: "Alice", familyName: "Johnson" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "contact",
        operation: "update",
        contactId: "={{ $json.contactId }}",
        givenName: "Alice",
        familyName: "Johnson",
      },
      [{ contactId: "people/c12345" }],
    );

    expect(out[0][0].json).toMatchObject({
      resourceName: "people/c12345",
    });
    const names = (out[0][0].json as Record<string, unknown>).names as Array<Record<string, unknown>>;
    expect(names[0].familyName).toBe("Johnson");
    expect(lastMethod).toBe("PATCH");
  });

  it("delete a contact", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("deleteContact")) {
        return mockResponse(null, 204);
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "contact",
        operation: "delete",
        contactId: "people/c12345",
      },
      [{}],
    );

    expect(out[0][0].json).toEqual({ success: true });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("people%2Fc12345");
  });

  it("continueOnFail returns error json on 404", async () => {
    installFetch(() => mockResponse({ error: { message: "Not Found" } }, 404));
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "people/missing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect((out[0][0].json as Record<string, unknown>).error).toContain("Not Found");
  });

  it("throws on missing contactId for get", async () => {
    await expect(
      run({
        resource: "contact",
        operation: "get",
        contactId: "",
      }),
    ).rejects.toThrow("Contact ID is required");
  });
});