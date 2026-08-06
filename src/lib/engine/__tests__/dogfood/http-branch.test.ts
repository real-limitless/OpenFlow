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

    // False branch must stay empty and must not execute downstream nodes
    const ifFalse = result.runData["IF Stars"]?.items?.[1] ?? [];
    expect(ifFalse.length).toBe(0);
    expect(result.runData["Low Stars"]?.status).toBe("skipped");
    expect(result.runData["Build Headline"]?.status).toBe("success");
  });
});

