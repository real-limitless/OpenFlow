import { describe, it, expect, beforeEach } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import {
  getWebhookResponse,
  clearAllWebhookResponses,
} from "../../executors/respond-to-webhook";
import { loadDogfoodFixture } from "./load-fixture";

describe("dogfood WF2 webhook-pipeline", () => {
  seedBuiltinExecutors();

  beforeEach(() => {
    clearAllWebhookResponses();
  });

  it("tags payload, limits, and stores webhook response", async () => {
    const workflow = loadDogfoodFixture("webhook-pipeline");
    (workflow as Record<string, unknown>).__executionId = "dogfood-wp-exec";

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Webhook: [
          { json: { event: "ping", id: 1 } },
          { json: { event: "ping", id: 2 } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Tag Payload"]?.status).toBe("success");
    expect(result.runData.Limit?.status).toBe("success");
    expect(result.runData.Respond?.status).toBe("success");

    const limited = result.runData.Limit?.items?.[0] ?? [];
    expect(limited.length).toBe(2);
    expect(limited[0].json.source).toBe("dogfood");
    expect(limited[0].json.processed).toBe(true);

    const res = getWebhookResponse("dogfood-wp-exec");
    expect(res?.status).toBe(200);
    expect(res?.body).toMatchObject({
      event: "ping",
      id: 1,
      source: "dogfood",
      processed: true,
    });
  });
});
