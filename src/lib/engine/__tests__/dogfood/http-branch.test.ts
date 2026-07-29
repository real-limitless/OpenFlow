import { describe, it, expect } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import { loadDogfoodFixture } from "./load-fixture";

describe("dogfood WF1 http-branch", () => {
  seedBuiltinExecutors();

  it("loads fixture and runs true branch with headline", async () => {
    const workflow = loadDogfoodFixture("http-branch");
    expect(workflow.nodes.length).toBeGreaterThanOrEqual(4);

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
    });

    expect(result.success).toBe(true);
    expect(result.runData["Fake API Response"]?.status).toBe("success");
    expect(result.runData["IF Stars"]?.status).toBe("success");

    const headlineItems = result.runData["Build Headline"]?.items?.[0] ?? [];
    expect(headlineItems.length).toBeGreaterThanOrEqual(1);
    expect(headlineItems[0].json.headline).toBe("openflow/demo is popular");
    expect(headlineItems[0].json.stargazers_count).toBe(5000);

    // IF false output has no starred items (NoOp may still emit a blank item on empty input)
    const ifFalse = result.runData["IF Stars"]?.items?.[1] ?? [];
    expect(ifFalse.length).toBe(0);
    const low = result.runData["Low Stars"]?.items?.[0] ?? [];
    expect(low.every((i) => i.json.stargazers_count == null)).toBe(true);
  });
});

