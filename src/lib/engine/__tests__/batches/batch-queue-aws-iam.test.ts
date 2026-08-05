import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsIam";

const IAM_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];

function mockFetch(body: string, status = 200) {
  globalThis.fetch = async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return {
      status,
      text: async () => body,
      headers: new Map(),
      ok: status >= 200 && status < 300,
    } as Response;
  };
}

function makeCtxWithCred(
  node: INode,
  credentials: Record<string, Record<string, unknown>> = { aws: IAM_CRED },
): ExecutionContext {
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
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runIam(
  parameters: Record<string, unknown>,
  credentials: Record<string, Record<string, unknown>> = { aws: IAM_CRED },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = makeCtxWithCred(node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const EMPTY_SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<SomeResponse><ResponseMetadata><RequestId>req</RequestId></ResponseMetadata></SomeResponse>`;

describe("batch-queue awsIam — n8n-nodes-base.awsIam", () => {
  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS IAM");
  });

  it("throws when the required credential is missing", async () => {
    mockFetch("");
    await expect(runIam({ resource: "user", operation: "getAll" }, {}))
      .rejects.toThrow(/credential/);
  });

  it("user create — sends CreateUser and returns result", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<CreateUserResponse>
  <CreateUserResult>
    <User><Path>/</Path><UserName>alice-dev</UserName><UserId>AIDAIOSFODNN7EXAMPLE</UserId><Arn>arn:aws:iam::123456789012:user/alice-dev</Arn><CreateDate>2024-01-15T10:00:00Z</CreateDate></User>
  </CreateUserResult>
  <ResponseMetadata><RequestId>r1</RequestId></ResponseMetadata>
</CreateUserResponse>`,
    );

    const out = await runIam({ resource: "user", operation: "create", userName: "alice-dev" });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=CreateUser");
    expect(body).toContain("UserName=alice-dev");
    expect(out[0][0].json).toBeDefined();
  });

  it("user get — sends GetUser", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<GetUserResponse>
  <GetUserResult>
    <User><Path>/</Path><UserName>alice-dev</UserName><UserId>AIDAIOSFODNN7EXAMPLE</UserId><Arn>arn:aws:iam::123456789012:user/alice-dev</Arn><CreateDate>2024-01-15T10:00:00Z</CreateDate></User>
  </GetUserResult>
</GetUserResponse>`,
    );

    const out = await runIam({
      resource: "user",
      operation: "get",
      user: { mode: "id", value: "alice-dev" },
    });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=GetUser");
    expect(body).toContain("UserName=alice-dev");
    expect(out[0][0].json).toBeDefined();
  });

  it("user addToGroup — sends AddUserToGroup with userName and groupName", async () => {
    mockFetch(EMPTY_SUCCESS_XML);

    const out = await runIam({
      resource: "user",
      operation: "addToGroup",
      user: { mode: "id", value: "alice-dev" },
      group: { mode: "id", value: "Developers" },
    });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=AddUserToGroup");
    expect(body).toContain("UserName=alice-dev");
    expect(body).toContain("GroupName=Developers");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("group create — sends CreateGroup", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<CreateGroupResponse>
  <CreateGroupResult>
    <Group><Path>/</Path><GroupName>Developers</GroupName><GroupId>AGPAIEXAMPLEID123</GroupId><Arn>arn:aws:iam::123456789012:group/Developers</Arn><CreateDate>2024-01-15T10:00:00Z</CreateDate></Group>
  </CreateGroupResult>
  <ResponseMetadata><RequestId>r1</RequestId></ResponseMetadata>
</CreateGroupResponse>`,
    );

    const out = await runIam({ resource: "group", operation: "create", groupName: "Developers" });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=CreateGroup");
    expect(body).toContain("GroupName=Developers");
    expect(out[0][0].json).toBeDefined();
  });

  it("group getAll with includeUsers — sends ListGroups", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<ListGroupsResponse>
  <ListGroupsResult>
    <Groups>
      <member><Path>/</Path><GroupName>Developers</GroupName><GroupId>AGPAIEXAMPLEID123</GroupId><Arn>arn:aws:iam::123456789012:group/Developers</Arn><CreateDate>2024-01-15T10:00:00Z</CreateDate></member>
    </Groups>
    <IsTruncated>false</IsTruncated>
  </ListGroupsResult>
</ListGroupsResponse>`,
    );

    const out = await runIam({
      resource: "group",
      operation: "getAll",
      returnAll: true,
      includeUsers: true,
    });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=ListGroups");
    expect(out[0]).toBeDefined();
    expect(out[0].length).toBeGreaterThanOrEqual(0);
  });

  it("user delete — sends DeleteUser", async () => {
    mockFetch(EMPTY_SUCCESS_XML);

    const out = await runIam({
      resource: "user",
      operation: "delete",
      user: { mode: "id", value: "alice-dev" },
    });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=DeleteUser");
    expect(body).toContain("UserName=alice-dev");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("group get via resource locator — sends GetGroup with GroupName", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<GetGroupResponse>
  <GetGroupResult>
    <Group><Path>/</Path><GroupName>Developers</GroupName><GroupId>AGPAIEXAMPLEID123</GroupId></Group>
    <Users><member><UserName>alice</UserName></member></Users>
  </GetGroupResult>
</GetGroupResponse>`,
    );

    const out = await runIam({
      resource: "group",
      operation: "get",
      group: { mode: "id", value: "Developers" },
      includeUsers: true,
    });

    const body = typeof fetchCalls[0].init.body === "string" ? fetchCalls[0].init.body : "";
    expect(body).toContain("Action=GetGroup");
    expect(body).toContain("GroupName=Developers");
    expect(out[0][0].json).toBeDefined();
  });

  it("reports error as item when continueOnFail is on", async () => {
    mockFetch(
      `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Error><Type>Sender</Type><Code>NoSuchEntity</Code><Message>The user cannot be found.</Message></Error>
  <RequestId>r1</RequestId>
</ErrorResponse>`,
      404,
    );

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "user",
        operation: "delete",
        user: { mode: "id", value: "nonexistent" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async (name) => ({ aws: IAM_CRED })[name] ?? null,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
    expect(String(out[0][0].json.error)).toContain("NoSuchEntity");
  });
});
