import { describe, it, expect } from "vitest";
import { runNodeWithCtx } from "../helpers";

describe("nextCloud executor", () => {
  it("should register the executor", async () => {
    const { hasExecutor } = await import("../../node-runtime");
    expect(hasExecutor("n8n-nodes-base.nextCloud")).toBe(true);
  });

  it("should throw on missing credential (no mock credentials configured)", async () => {
    await expect(
      runNodeWithCtx("n8n-nodes-base.nextCloud", {
        resource: "file",
        operation: "list",
      }),
    ).rejects.toThrow("Nextcloud: credential is not configured");
  });

  it("should accept a continueOnFail scenario without config (error output)", async () => {
    const { out } = await runNodeWithCtx(
      "n8n-nodes-base.nextCloud",
      {
        resource: "file",
        operation: "list",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
