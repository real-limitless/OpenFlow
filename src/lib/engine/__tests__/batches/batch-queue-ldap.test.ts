import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import {
  setLdapClientFactory,
  type LdapClient,
  type LdapEntry,
} from "../../executors/ldap";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.ldap";
const LDAP_CRED = {
  host: "ldap.example.com",
  port: 389,
  bindDn: "cn=admin,dc=example,dc=com",
  bindPassword: "secret",
  connectionSecurity: "none",
  connectionTimeout: 10,
};

function makeLdapCtx(
  items: Array<Record<string, unknown> | INodeExecutionData>,
  node: INode,
): ExecutionContext {
  const normalized: INodeExecutionData[] = items.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => normalized,
    continueOnFail: false,
    getCredential: async (name: string) =>
      name === "ldap" ? LDAP_CRED : null,
  });
}

function mockClient(impl: Partial<LdapClient> = {}): LdapClient {
  return {
    compare:
      impl.compare ?? (async () => false),
    create:
      impl.create ??
      (async () => ({ dn: "cn=test,dc=example,dc=com" })),
    delete: impl.delete ?? (async () => {}),
    rename:
      impl.rename ??
      (async () => ({ dn: "cn=renamed,dc=example,dc=com" })),
    search: impl.search ?? (async () => []),
    update:
      impl.update ??
      (async () => ({ dn: "cn=test,dc=example,dc=com" })),
    close: impl.close ?? (async () => {}),
  };
}

afterEach(() => setLdapClientFactory(null));

describe("batch-queue ldap — n8n-nodes-base.ldap", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("LDAP");
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "search", baseDn: "dc=example,dc=com", searchFor: "person", attribute: "cn", searchText: "*", returnAll: true },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential "ldap"/);
  });

  it("compare returns true when attribute matches", async () => {
    setLdapClientFactory(async () =>
      mockClient({ compare: async () => true }),
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "compare",
        dn: "cn=testuser,dc=example,dc=com",
        attributeId: "sn",
        value: "user",
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      attributeId: "sn",
      value: "user",
      result: true,
    });
  });

  it("compare returns false on mismatch", async () => {
    setLdapClientFactory(async () =>
      mockClient({ compare: async () => false }),
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "compare",
        dn: "cn=testuser,dc=example,dc=com",
        attributeId: "sn",
        value: "wrong",
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0][0].json.result).toBe(false);
  });

  it("create returns the created entry attributes", async () => {
    const created = { dn: "cn=newuser,dc=example,dc=com", cn: ["newuser"], objectClass: ["person"] };
    setLdapClientFactory(async () =>
      mockClient({ create: async () => created }),
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "create",
        dn: "cn=newuser,dc=example,dc=com",
        attributes: [
          { attributeId: "cn", value: "newuser" },
          { attributeId: "sn", value: "user" },
          { attributeId: "objectClass", value: "person" },
        ],
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.cn).toEqual(["newuser"]);
  });

  it("delete passes through input item", async () => {
    let deletedDn = "";
    setLdapClientFactory(async () =>
      mockClient({
        delete: async (dn) => {
          deletedDn = dn;
        },
      }),
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "delete",
        dn: "cn=todelete,dc=example,dc=com",
      },
    });
    const ctx = makeLdapCtx([{ json: { id: 42 } }], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(deletedDn).toBe("cn=todelete,dc=example,dc=com");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 42 });
  });

  it("rename outputs new DN", async () => {
    setLdapClientFactory(async () => mockClient({ rename: async () => ({ dn: "cn=renamed,dc=example,dc=com" }) }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "rename",
        dn: "cn=old,dc=example,dc=com",
        newDn: "cn=renamed,dc=example,dc=com",
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0][0].json).toEqual({ dn: "cn=renamed,dc=example,dc=com" });
  });

  it("search returns one item per matching entry", async () => {
    const entries: LdapEntry[] = [
      { dn: "cn=jdoe,dc=example,dc=com", attributes: { cn: ["jdoe"], mail: ["jdoe@example.com"] } },
      { dn: "cn=jane,dc=example,dc=com", attributes: { cn: ["jane"], mail: ["jane@example.com"] } },
    ];
    setLdapClientFactory(async () => mockClient({ search: async () => entries }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "search",
        baseDn: "dc=example,dc=com",
        searchFor: "person",
        attribute: "cn",
        searchText: "j*",
        returnAll: true,
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.cn).toEqual(["jdoe"]);
    expect(out[0][1].json.cn).toEqual(["jane"]);
  });

  it("search with limit respects max results", async () => {
    const entries: LdapEntry[] = [
      { dn: "cn=a,dc=example,dc=com", attributes: { cn: ["a"] } },
      { dn: "cn=b,dc=example,dc=com", attributes: { cn: ["b"] } },
      { dn: "cn=c,dc=example,dc=com", attributes: { cn: ["c"] } },
    ];
    setLdapClientFactory(async () => mockClient({ search: async () => entries.slice(0, 2) }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "search",
        baseDn: "dc=example,dc=com",
        searchFor: "person",
        attribute: "cn",
        searchText: "*",
        returnAll: false,
        limit: 2,
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(2);
  });

  it("search returns empty output when no matches", async () => {
    setLdapClientFactory(async () => mockClient({ search: async () => [] }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "search",
        baseDn: "dc=example,dc=com",
        searchFor: "person",
        attribute: "cn",
        searchText: "nonexistent*",
        returnAll: true,
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(0);
  });

  it("update returns updated attributes", async () => {
    const updated = { dn: "cn=test,dc=example,dc=com", cn: ["test"], mail: ["new@example.com"] };
    setLdapClientFactory(async () => mockClient({ update: async () => updated }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "update",
        dn: "cn=test,dc=example,dc=com",
        updateAttributes: "replace",
        attributes: [{ attributeId: "mail", value: "new@example.com" }],
      },
    });
    const ctx = makeLdapCtx([{}], node);
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.mail).toEqual(["new@example.com"]);
  });

  it("continueOnFail produces error item on failure", async () => {
    setLdapClientFactory(async () =>
      mockClient({
        search: async () => {
          throw new Error("Connection refused");
        },
      }),
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "search",
        baseDn: "dc=invalid,dc=com",
        searchFor: "person",
        attribute: "cn",
        searchText: "*",
        returnAll: true,
      },
    });
    const normalized = [{ json: {} }];
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => normalized,
      continueOnFail: true,
      getCredential: async (name: string) =>
        name === "ldap" ? LDAP_CRED : null,
    });
    const out = await getExecutor(TYPE)!(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(typeof out[0][0].json.error).toBe("string");
  });

  it("unknown operation throws", async () => {
    setLdapClientFactory(async () => mockClient());
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "invalidOp" },
    });
    const ctx = makeLdapCtx([{}], node);
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(
      'Unknown LDAP operation: "invalidOp"',
    );
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.ldap")).toBe(canonical);
  });
});