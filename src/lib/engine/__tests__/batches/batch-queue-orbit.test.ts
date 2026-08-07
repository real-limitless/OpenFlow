import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { runNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.orbit";

describe("batch-queue orbit — n8n-nodes-base.orbit", () => {
  it("throws deprecation error on execution", async () => {
    await expect(
      runNode(TYPE, { resource: "member", operation: "get", workspaceId: "test" }),
    ).rejects.toThrow(/shut down|deprecated|no longer functional/i);
  });

  it("returns error items when continueOnFail is enabled", async () => {
    const [output] = await runNode(
      TYPE,
      { resource: "member", operation: "get", workspaceId: "test" },
      [{}],
      { continueOnFail: true },
    );
    expect(output).toHaveLength(1);
    expect(output[0].json).toEqual({});
    expect(output[0].error).toBeDefined();
    expect(output[0].error?.message).toMatch(/shut down|deprecated|no longer functional/i);
  });
});
