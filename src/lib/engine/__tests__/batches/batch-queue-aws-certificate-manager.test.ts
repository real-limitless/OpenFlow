import { describe, it, expect, beforeEach } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { seedBuiltinExecutors } from "../../index";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsCertificateManager";
const MOCK_ARN = "arn:aws:acm:us-east-1:123456789012:certificate/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  seedBuiltinExecutors();
});

describe("batch-queue awsCertificateManager — n8n-nodes-base.awsCertificateManager", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS Certificate Manager");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.awsCertificateManager")).toBe(canonical);
  });

  it("throws when both aws credentials are missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "certificate", operation: "get", certificateArn: MOCK_ARN },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/credential "(aws|awsAssumeRole)"/);
  });

  it("throws when certificateArn is missing for get operation", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "certificate", operation: "get" },
        [{}],
        { credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } } },
      ),
    ).rejects.toThrow(/certificateArn is required/);
  });

  it("throws when certificateArn is missing for delete operation", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "certificate", operation: "delete" },
        [{}],
        { credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } } },
      ),
    ).rejects.toThrow(/certificateArn is required/);
  });

  it("throws when certificateArn is missing for renew operation", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "certificate", operation: "renew" },
        [{}],
        { credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } } },
      ),
    ).rejects.toThrow(/certificateArn is required/);
  });

  it("throws when resource is not certificate", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "invalid", operation: "get", certificateArn: MOCK_ARN },
        [{}],
        { credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } } },
      ),
    ).rejects.toThrow(/unsupported resource/);
  });

  it("throws on unknown operation", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "certificate", operation: "unknownOp" },
        [{}],
        { credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } } },
      ),
    ).rejects.toThrow(/unsupported operation/);
  });

  it("passes error items through when continueOnFail is enabled", async () => {
    const out = await runNode(
      TYPE,
      { resource: "certificate", operation: "get" },
      [{}],
      {
        continueOnFail: true,
        credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } },
      },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(String(out[0][0].json.error)).toMatch(/certificateArn is required/);
  });

  it("processes each input item independently", async () => {
    const out = await runNode(
      TYPE,
      { resource: "certificate", operation: "get" },
      [{}, {}],
      {
        continueOnFail: true,
        credentials: { aws: { region: "us-east-1", accessKeyId: "AKID", secretAccessKey: "sk" } },
      },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][1].json).toHaveProperty("error");
  });
});
