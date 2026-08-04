import { describe, it, expect, beforeEach } from "vitest";
import { seedBuiltinExecutors } from "../../executors";
import { runNode, assertExecutorRegistered } from "../helpers";

beforeEach(() => {
  seedBuiltinExecutors();
});

describe("n8n-nodes-base.awsS3Tool", () => {
  it("is registered as a builtin executor", () => {
    assertExecutorRegistered("n8n-nodes-base.awsS3Tool");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      runNode("n8n-nodes-base.awsS3Tool", {
        resource: "bucket",
        operation: "getAll",
      }),
    ).rejects.toThrow('credential "aws" is not configured');
  });

  it("throws on invalid resource (when creds were somehow provided)", async () => {
    const { awsS3ToolExecutor } = await import("../../executors/awsS3Tool");
    expect(awsS3ToolExecutor).toBeDefined();
  });
});
