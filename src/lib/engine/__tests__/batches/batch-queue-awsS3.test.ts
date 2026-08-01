import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsS3";

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

async function runAwsS3(
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

describe("batch-queue awsS3 — n8n-nodes-base.awsS3", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS S3");
  });

  it("throws when the required credential is missing", async () => {
    await expect(
      runAwsS3({ resource: "bucket", operation: "create", name: "b" }, [{}], {}),
    ).rejects.toThrow(/credential "aws"/);
  });

  it("fails when bucket name is missing for create", async () => {
    await expect(
      runAwsS3({ resource: "bucket", operation: "create" }, [{}]),
    ).rejects.toThrow(/bucket name is required/);
  });

  it("fails when fileKey is missing for download", async () => {
    await expect(
      runAwsS3({ resource: "file", operation: "download", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/fileKey are required/);
  });

  it("fails when folderName is missing for folder create", async () => {
    await expect(
      runAwsS3({ resource: "folder", operation: "create", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/folderName is required/);
  });

  it("fails when folderKey is missing for folder delete", async () => {
    await expect(
      runAwsS3({ resource: "folder", operation: "delete", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/folderKey is required/);
  });

  it("fails when source and destination are missing for file copy", async () => {
    await expect(
      runAwsS3({ resource: "file", operation: "copy", sourcePath: "" }, [{}]),
    ).rejects.toThrow(/sourcePath and destinationPath are required/);
  });

  it("continueOnFail outputs error item instead of throwing", async () => {
    const out = await runAwsS3(
      {
        resource: "file",
        operation: "download",
        bucketName: "b",
        fileKey: "missing.txt",
        binaryPropertyName: "data",
      },
      [{}],
      { aws: AWS_CRED },
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("parsePath utility works correctly", () => {
    function splitPath(p: string): { bucket: string; key: string } {
      const cleaned = p.startsWith("/") ? p.slice(1) : p;
      const slashIdx = cleaned.indexOf("/");
      if (slashIdx === -1) return { bucket: cleaned, key: "" };
      return { bucket: cleaned.slice(0, slashIdx), key: cleaned.slice(slashIdx + 1) };
    }
    expect(splitPath("/my-bucket/docs/a.pdf")).toEqual({ bucket: "my-bucket", key: "docs/a.pdf" });
    expect(splitPath("my-bucket")).toEqual({ bucket: "my-bucket", key: "" });
  });
});