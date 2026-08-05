import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsDynamoDb";

const AWS_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
  continueOnFail = false,
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
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runDynamoDb(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = { aws: AWS_CRED },
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const MOCK_RESPONSE = '{"Attributes":{"pk":{"S":"abc"},"data":{"S":"hello"}}}';

describe("batch-queue awsDynamoDb — n8n-nodes-base.awsDynamoDb", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS DynamoDB");
  });

  it("throws when the required credential is missing", async () => {
    await expect(
      runDynamoDb(
        { resource: "item", operation: "upsert", tableName: "MyTable" },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "aws"/);
  });

  it("throws when tableName is missing", async () => {
    await expect(
      runDynamoDb({ resource: "item", operation: "upsert" }, [{}]),
    ).rejects.toThrow(/tableName is required/);
  });

  it("upsert with defineBelow builds correct DynamoDB request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "upsert",
          tableName: "MyTable",
          dataToSend: "defineBelow",
          fieldsUi: {
            fieldValues: [
              { fieldId: "pk", fieldValue: "abc" },
              { fieldId: "data", fieldValue: "hello" },
            ],
          },
        },
        [{}],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("success", true);
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.TableName).toBe("MyTable");
      expect(callBody.Item).toEqual({ pk: { S: "abc" }, data: { S: "hello" } });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("get builds correct GetItem request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Item: { pk: { S: "abc" } } }), { status: 200 }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "get",
          tableName: "MyTable",
          keysUi: {
            keyValues: [{ key: "pk", type: "S", value: "abc" }],
          },
        },
        [{}],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ data: { pk: "abc" } });
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.TableName).toBe("MyTable");
      expect(callBody.Key).toEqual({ pk: { S: "abc" } });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("get returns no output item when item not found", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "get",
          tableName: "MyTable",
          keysUi: {
            keyValues: [{ key: "pk", type: "S", value: "missing" }],
          },
        },
        [{}],
      );
      expect(out[0]).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getAll with scan=true builds Scan request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Items: [{ pk: { S: "a" } }, { pk: { S: "b" } }] }), { status: 200 }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "getAll",
          tableName: "MyTable",
          scan: true,
          returnAll: true,
        },
        [{}],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.data).toEqual([{ pk: "a" }, { pk: "b" }]);
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.TableName).toBe("MyTable");
      expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
        "x-amz-target": "DynamoDB_20120810.Scan",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("delete builds correct DeleteItem request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "delete",
          tableName: "MyTable",
          keysUi: {
            keyValues: [{ key: "pk", type: "S", value: "abc" }],
          },
        },
        [{}],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("success", true);
      const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(callBody.TableName).toBe("MyTable");
      expect(callBody.Key).toEqual({ pk: { S: "abc" } });
      expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
        "x-amz-target": "DynamoDB_20120810.DeleteItem",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("continueOnFail produces error output on ResourceNotFoundException", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("Resource not found"), { code: "ResourceNotFoundException", message: "Resource not found" }),
    );
    try {
      const out = await runDynamoDb(
        {
          resource: "item",
          operation: "get",
          tableName: "NonExistentTable",
          keysUi: { keyValues: [{ key: "pk", type: "S", value: "x" }] },
        },
        [{}],
        { aws: AWS_CRED },
        true,
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(out[0][0].json.error).toHaveProperty("code", "ResourceNotFoundException");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
