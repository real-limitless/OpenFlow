import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsSqs";

describe("batch-queue awsSqs — n8n-nodes-base.awsSqs", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS SQS");
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(TYPE, { queue: "https://sqs.us-east-1.amazonaws.com/123/MyQueue" }, [{}]),
    ).rejects.toThrow(/credential.*aws.*not configured/i);
  });

  it("throws when queue URL is empty", async () => {
    await expect(
      runNode(TYPE, {}, [{}], { credentials: { aws: { region: "us-east-1", accessKeyId: "x", secretAccessKey: "y" } } }),
    ).rejects.toThrow(/queue URL is required/i);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.awsSqs")).toBe(canonical);
  });

  it("accepts the definition test fixture parameters", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    const queueProp = desc.properties?.find((p: any) => p.name === "queue") as any;
    expect(queueProp).toBeDefined();
    expect(queueProp!.required).toBe(true);
    const queueTypeProp = desc.properties?.find((p: any) => p.name === "queueType") as any;
    expect(queueTypeProp).toBeDefined();
    expect(queueTypeProp!.default).toBe("standard");
  });
});
