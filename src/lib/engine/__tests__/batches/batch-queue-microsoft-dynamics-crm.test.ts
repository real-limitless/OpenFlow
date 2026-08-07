import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../executors";
import { runNode, assertExecutorRegistered } from "../helpers";

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

function mockFetch(responseBody: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      text: vi.fn().mockResolvedValue(JSON.stringify(responseBody)),
    }),
  );
}

beforeEach(() => {
  seedBuiltinExecutors();
  vi.unstubAllGlobals();
});

const CREDS = {
  microsoftDynamicsOAuth2Api: {
    subdomain: "contoso",
    region: "crm.dynamics.com",
  },
};

describe("n8n-nodes-base.microsoftDynamicsCrmTool", () => {
  it("is registered as a builtin executor", () => {
    assertExecutorRegistered("n8n-nodes-base.microsoftDynamicsCrmTool");
  });

  it("creates an account with minimal fields", async () => {
    mockFetch({ accountid: "new-guid-001", name: "Test Company Inc" });
    const [output] = await runNode(
      "n8n-nodes-base.microsoftDynamicsCrmTool",
      { resource: "account", operation: "create", name: "Test Company Inc" },
      [{}],
      { credentials: CREDS },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json.name).toBe("Test Company Inc");
    expect(output[0].json.accountid).toBe("new-guid-001");
  });

  it("gets an account by ID", async () => {
    mockFetch({ accountid: ACCOUNT_ID, name: "Existing Account" });
    const [output] = await runNode(
      "n8n-nodes-base.microsoftDynamicsCrmTool",
      { resource: "account", operation: "get", accountId: ACCOUNT_ID },
      [{}],
      { credentials: CREDS },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json.accountid).toBe(ACCOUNT_ID);
    expect(output[0].json.name).toBe("Existing Account");
  });

  it("gets all accounts with pagination", async () => {
    mockFetch({
      value: [
        { accountid: "1", name: "Test Co A" },
        { accountid: "2", name: "Test Co B" },
      ],
    });
    const [output] = await runNode(
      "n8n-nodes-base.microsoftDynamicsCrmTool",
      {
        resource: "account",
        operation: "getAll",
        returnAll: true,
        filters: { query: "startswith(name, 'Test')" },
      },
      [{}],
      { credentials: CREDS },
    );
    expect(output).toHaveLength(2);
    expect(output[0].json.accountid).toBe("1");
    expect(output[1].json.name).toBe("Test Co B");
  });

  it("updates an account name", async () => {
    mockFetch({ accountid: ACCOUNT_ID, name: "Updated Company Name" });
    const [output] = await runNode(
      "n8n-nodes-base.microsoftDynamicsCrmTool",
      {
        resource: "account",
        operation: "update",
        accountId: ACCOUNT_ID,
        updateFields: { name: "Updated Company Name" },
      },
      [{}],
      { credentials: CREDS },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json.name).toBe("Updated Company Name");
    expect(output[0].json.accountid).toBe(ACCOUNT_ID);
  });

  it("deletes an account (pass-through)", async () => {
    mockFetch(null);
    const [output] = await runNode(
      "n8n-nodes-base.microsoftDynamicsCrmTool",
      { resource: "account", operation: "delete", accountId: ACCOUNT_ID },
      [{ foo: "bar" }],
      { credentials: CREDS },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json.foo).toBe("bar");
  });

  it("throws on unsupported resource", async () => {
    await expect(
      runNode(
        "n8n-nodes-base.microsoftDynamicsCrmTool",
        { resource: "contact", operation: "create" },
        [{}],
        { credentials: CREDS },
      ),
    ).rejects.toThrow('unsupported resource "contact"');
  });
});
