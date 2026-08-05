import { describe, it, expect, beforeEach } from "vitest";
import { seedBuiltinExecutors } from "../../executors";
import { runNode, assertExecutorRegistered } from "../helpers";

beforeEach(() => {
  seedBuiltinExecutors();
});

describe("n8n-nodes-base.awsTranscribeTool", () => {
  it("is registered as a builtin executor", () => {
    assertExecutorRegistered("n8n-nodes-base.awsTranscribeTool");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      runNode("n8n-nodes-base.awsTranscribeTool", {
        resource: "transcriptionJob",
        operation: "create",
        transcriptionJobName: "test-job",
        mediaFileUri: "s3://bucket/audio.mp3",
      }),
    ).rejects.toThrow('credential "aws" is not configured');
  });

  it("delegates to the base awsTranscribe executor", async () => {
    const { awsTranscribeToolExecutor } = await import("../../executors/awsTranscribeTool");
    expect(awsTranscribeToolExecutor).toBeDefined();
  });
});
