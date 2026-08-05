import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsSnsTrigger";

function makeSnsEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Type: "Notification",
    MessageId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
    Message: "hello",
    Timestamp: "2024-01-15T10:30:00.000Z",
    SignatureVersion: "1",
    Signature: "...",
    SigningCertUrl: "https://sns.us-east-1.amazonaws.com/...",
    UnsubscribeUrl: "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&...",
    ...overrides,
  };
}

describe("batch-queue awsSnsTrigger — n8n-nodes-base.awsSnsTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS SNS Trigger");
  });

  it("emits full SNS envelope with JSON-parsed Message by default (happy path)", async () => {
    const envelope = makeSnsEnvelope({
      MessageId: "uuid-123",
      Subject: "test",
      Message: JSON.stringify({ hello: "world" }),
    });
    const out = await runNode(TYPE, { jsonParseBody: true, onlyMessage: false }, [envelope]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      Type: "Notification",
      MessageId: "uuid-123",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
      Subject: "test",
      Message: { hello: "world" },
      Timestamp: "2024-01-15T10:30:00.000Z",
      SignatureVersion: "1",
      Signature: "...",
      SigningCertUrl: "https://sns.us-east-1.amazonaws.com/...",
      UnsubscribeUrl: "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&...",
    });
  });

  it("emits only message body when onlyMessage=true with JSON parse", async () => {
    const envelope = makeSnsEnvelope({
      MessageId: "uuid-456",
      Message: JSON.stringify({ hello: "world" }),
    });
    const out = await runNode(TYPE, { jsonParseBody: true, onlyMessage: true }, [envelope]);
    expect(out[0][0].json).toEqual({ hello: "world" });
  });

  it("emits { message } object when jsonParseBody=false and onlyMessage=true", async () => {
    const envelope = makeSnsEnvelope({
      MessageId: "uuid-789",
      Message: JSON.stringify({ hello: "world" }),
    });
    const out = await runNode(TYPE, { jsonParseBody: false, onlyMessage: true }, [envelope]);
    expect(out[0][0].json).toEqual({ message: '{"hello":"world"}' });
  });

  it("handles non-JSON body gracefully (edge)", async () => {
    const out = await runNode(TYPE, {}, [{ json: "not-json" }]);
    expect(out[0][0].json).toEqual({ raw: "not-json" });
  });
});
