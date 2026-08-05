import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsSnsTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runSnsTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({ name: "AWS SNS Trigger", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

const sampleEnvelope = {
  Type: "Notification",
  MessageId: "uuid-1234",
  TopicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
  Subject: "test subject",
  Message: '{"hello": "world"}',
  Timestamp: "2024-01-01T00:00:00.000Z",
  SignatureVersion: "1",
  Signature: "sig",
  SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
  UnsubscribeURL: "https://sns.us-east-1.amazonaws.com/unsub",
};

describe("batch-queue awsSnsTrigger — n8n-nodes-base.awsSnsTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS SNS Trigger");
  });

  it("emits full SNS envelope with JSON-parsed Message (happy path, defaults)", async () => {
    const { out } = await runSnsTrigger(
      { topic: "arn:aws:sns:us-east-1:123456789012:MyTopic" },
      [sampleEnvelope],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      Type: "Notification",
      MessageId: "uuid-1234",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
      Subject: "test subject",
      Message: { hello: "world" },
      Timestamp: "2024-01-01T00:00:00.000Z",
      SignatureVersion: "1",
      Signature: "sig",
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
      UnsubscribeURL: "https://sns.us-east-1.amazonaws.com/unsub",
    });
  });

  it("emits only Message when onlyMessage=true (with JSON parse)", async () => {
    const { out } = await runSnsTrigger(
      { topic: "arn:aws:sns:us-east-1:123456789012:MyTopic", onlyMessage: true },
      [sampleEnvelope],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ hello: "world" });
  });

  it("emits { message } object when onlyMessage=true and jsonParseBody=false", async () => {
    const { out } = await runSnsTrigger(
      {
        topic: "arn:aws:sns:us-east-1:123456789012:MyTopic",
        onlyMessage: true,
        jsonParseBody: false,
      },
      [sampleEnvelope],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ message: '{"hello": "world"}' });
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runSnsTrigger(
      { topic: "arn:aws:sns:us-east-1:123456789012:MyTopic" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("falls back to raw string when JSON parse fails with jsonParseBody=true", async () => {
    const brokenEnvelope = { ...sampleEnvelope, Message: "not valid json" };
    const { out } = await runSnsTrigger(
      { topic: "arn:aws:sns:us-east-1:123456789012:MyTopic" },
      [brokenEnvelope],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("Message", "not valid json");
  });
});
