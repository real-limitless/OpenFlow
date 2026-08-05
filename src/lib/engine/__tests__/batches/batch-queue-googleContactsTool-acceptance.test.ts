import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleContactsTool";

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

function installFetch(result: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, _init?: RequestInit) => mockResponse(result, status)),
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
    getCredential: async () => ({ accessToken: "tok_contacts" }),
  });
  const { defaultExecutors } = await import("@/lib/engine/node-runtime");
  const executor = defaultExecutors[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("googleContactsTool", () => {
  it("creates a contact", async () => {
    installFetch({
      resourceName: "people/c12345",
      etag: "%EgE=",
      names: [{ displayName: "Jane Doe", givenName: "Jane", familyName: "Doe" }],
      emailAddresses: [{ value: "jane.doe@example.com", type: "work" }],
    });
    const [out] = await run({
      resource: "contact",
      operation: "create",
      names: [{ givenName: "Jane", familyName: "Doe" }],
      emailAddresses: [{ value: "jane.doe@example.com" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].json.resourceName).toBe("people/c12345");
    expect(out[0].json.names[0].displayName).toBe("Jane Doe");
    expect(out[0].json.emailAddresses[0].value).toBe("jane.doe@example.com");
  });

  it("gets all contacts", async () => {
    installFetch({
      connections: [
        {
          resourceName: "people/c12345",
          names: [{ displayName: "Jane Doe" }],
          emailAddresses: [{ value: "jane.doe@example.com" }],
        },
        {
          resourceName: "people/c67890",
          names: [{ displayName: "John Smith" }],
          emailAddresses: [{ value: "john.smith@example.com" }],
        },
      ],
    });
    const [out] = await run({
      resource: "contact",
      operation: "getAll",
      returnAll: true,
      personFields: "names,emailAddresses",
    });
    expect(out).toHaveLength(2);
    expect(out[0].json.resourceName).toBe("people/c12345");
    expect(out[1].json.resourceName).toBe("people/c67890");
  });

  it("gets a single contact", async () => {
    installFetch({
      resourceName: "people/c12345",
      names: [{ displayName: "Jane Doe" }],
      emailAddresses: [{ value: "jane.doe@example.com" }],
      phoneNumbers: [{ value: "+15551234567" }],
    });
    const [out] = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.contactId }}",
        personFields: "names,emailAddresses,phoneNumbers",
      },
      [{ contactId: "people/c12345" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].json.resourceName).toBe("people/c12345");
    expect(out[0].json.names[0].displayName).toBe("Jane Doe");
  });

  it("deletes a contact", async () => {
    installFetch({});
    const [out] = await run(
      {
        resource: "contact",
        operation: "delete",
        contactId: "={{ $json.contactId }}",
      },
      [{ contactId: "people/c12345" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({});
  });

  it("updates a contact email", async () => {
    installFetch({
      resourceName: "people/c12345",
      etag: "%EgE=",
      emailAddresses: [{ value: "jane.doe@newdomain.com" }],
    });
    const [out] = await run(
      {
        resource: "contact",
        operation: "update",
        contactId: "={{ $json.contactId }}",
        emailAddresses: [{ value: "jane.doe@newdomain.com" }],
        personFields: "emailAddresses",
      },
      [{ contactId: "people/c12345" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].json.resourceName).toBe("people/c12345");
    expect(out[0].json.emailAddresses[0].value).toBe("jane.doe@newdomain.com");
  });
});
