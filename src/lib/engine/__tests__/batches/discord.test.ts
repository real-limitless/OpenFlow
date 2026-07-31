import { describe, it, expect } from "vitest";
import { createExecutionContext } from "@/sdk";
import { getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinExecutors } from "../../index";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();

describe("discordExecutor", () => {
  it("throws when required guildId is missing for channel create", async () => {
    const type = "n8n-nodes-base.discord";
    const node = makeNode({
      name: "N",
      type,
      typeVersion: 2,
      parameters: {
        authentication: "botToken",
        resource: "channel",
        operation: "create",
        name: "test",
        type: 0,
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
    });
    const executor = getExecutor(type)!;
    await expect(executor(ctx, node)).rejects.toThrow("Discord: guildId is required");
  });
});
