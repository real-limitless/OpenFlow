import { describe, it, expect, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsSns";

const AWS_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
};

const SNS_XML_OK =
  '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><PublishResult><MessageId>d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f</MessageId></PublishResult><ResponseMetadata><RequestId>a1b2c3d4-5678-90ab-cdef-1234567890ab</RequestId></ResponseMetadata></PublishResponse>';

const SNS_XML_FIFO_OK =
  '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><PublishResult><MessageId>d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f</MessageId><SequenceNumber>10000000000000001000</SequenceNumber></PublishResult><ResponseMetadata><RequestId>a1b2c3d4-5678-90ab-cdef-1234567890ab</RequestId></ResponseMetadata></PublishResponse>';

let origFetch: ((url: string | URL, init?: RequestInit) => Promise<Response>) | undefined;

afterEach(() => {
  if (origFetch !== undefined) {
    globalThis.fetch = origFetch;
    origFetch = undefined;
  }
});

function mockFetch(status: number, body: string): void {
  origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const headers = new Headers();
    return {
      status,
      ok: status >= 200 && status < 300,
      headers,
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({}),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      body: null,
      bodyUsed: false,
      redirect: false,
      statusText: status === 200 ? "OK" : "Error",
      type: "basic" as ResponseType,
      url: "",
      clone: () => {
        throw new Error("not implemented");
      },
      formData: () => Promise.resolve(new FormData()),
    } as Response;
  };
}

describe("batch-queue awsSns — n8n-nodes-base.awsSns", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS SNS");
  });

  it("produces messageId with publish to topicArn", async () => {
    mockFetch(200, SNS_XML_OK);
    const result = await runNode(TYPE, {
      topicType: "topicArn",
      topicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
      message: "Hello from n8n",
      subject: "Test Alert",
    }, [{}], { credentials: { aws: AWS_CRED } });

    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output).toHaveLength(1);
    expect(output[0].json.messageId).toBe("d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f");
  });

  it("produces messageId with publish to phoneNumber", async () => {
    mockFetch(200, SNS_XML_OK);
    const result = await runNode(TYPE, {
      topicType: "phoneNumber",
      phoneNumber: "+12065551234",
      message: "Your code is 8675309",
    }, [{}], { credentials: { aws: AWS_CRED } });

    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output).toHaveLength(1);
    expect(output[0].json.messageId).toBe("d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f");
  });

  it("produces messageId with per-protocol JSON message", async () => {
    mockFetch(200, SNS_XML_OK);
    const result = await runNode(TYPE, {
      topicType: "topicArn",
      topicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
      message: '{"default":"Fallback message","email":"Long email body here","sms":"Short SMS"}',
      messageStructure: "json",
    }, [{}], { credentials: { aws: AWS_CRED } });

    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output).toHaveLength(1);
    expect(output[0].json.messageId).toBe("d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f");
  });

  it("produces messageId with publish to targetArn", async () => {
    mockFetch(200, SNS_XML_OK);
    const result = await runNode(TYPE, {
      topicType: "targetArn",
      targetArn: "arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/d618d310",
      message: '{"GCM":"{\\"notification\\":{\\"title\\":\\"Alert\\",\\"body\\":\\"Hello\\"}}"}',
      messageStructure: "json",
    }, [{}], { credentials: { aws: AWS_CRED } });

    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output).toHaveLength(1);
    expect(output[0].json.messageId).toBe("d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f");
  });

  it("produces messageId and sequenceNumber for FIFO topic", async () => {
    mockFetch(200, SNS_XML_FIFO_OK);
    const result = await runNode(TYPE, {
      topicType: "topicArn",
      topicArn: "arn:aws:sns:us-east-1:123456789012:MyFifoTopic.fifo",
      message: "Order processed",
      messageDeduplicationId: "order-123-abc",
      messageGroupId: "orders",
    }, [{}], { credentials: { aws: AWS_CRED } });

    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output).toHaveLength(1);
    expect(output[0].json.messageId).toBe("d83c7b3c-3f5c-5a9f-8b2c-1a2b3c4d5e6f");
    expect(output[0].json.sequenceNumber).toBe("10000000000000001000");
  });

  it("throws on missing message", async () => {
    await expect(runNode(TYPE, {
      topicType: "topicArn",
      topicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
    }, [{}], { credentials: { aws: AWS_CRED } })).rejects.toThrow("message is required");
  });

  it("throws on missing topicArn when topicType is topicArn", async () => {
    await expect(runNode(TYPE, {
      topicType: "topicArn",
      message: "Hello",
    }, [{}], { credentials: { aws: AWS_CRED } })).rejects.toThrow("topicArn is required");
  });

  it("throws on missing credentials", async () => {
    await expect(runNode(TYPE, {
      topicType: "topicArn",
      topicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic",
      message: "Hello",
    }, [{}])).rejects.toThrow("credential");
  });
});
