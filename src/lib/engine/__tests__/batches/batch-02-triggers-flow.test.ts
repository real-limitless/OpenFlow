import { describe, it, expect, beforeEach } from "vitest";
import { hasExecutor, seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";
import { getWebhookResponse, clearAllWebhookResponses } from "../../executors/respond-to-webhook";
import { executeWorkflow } from "../../runner";
import { createExecutionContext } from "@/sdk";

const BATCH_TYPES = [
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.respondToWebhook",
  "n8n-nodes-base.code",
  "n8n-nodes-base.splitInBatches",
] as const;

describe("batch-02 triggers-flow", () => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();

  beforeEach(() => {
    clearAllWebhookResponses();
  });

  it("registers all four batch types", () => {
    for (const t of BATCH_TYPES) {
      expect(hasExecutor(t), t).toBe(true);
      expect(getNodeType(t).placeholder).not.toBe(true);
    }
  });

  describe("scheduleTrigger", () => {
    it("emits a timestamp item for a minutes rule", async () => {
      const out = await runNode("n8n-nodes-base.scheduleTrigger", {
        rule: { interval: [{ field: "minutes", minutesInterval: 5 }] },
      });
      expect(out[0]).toHaveLength(1);
      expect(typeof out[0][0].json.timestamp).toBe("string");
    });

    it("starts a workflow as trigger", async () => {
      const wf = makeWorkflow(
        [
          makeNode({
            id: "1",
            name: "Sched",
            type: "n8n-nodes-base.scheduleTrigger",
            parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
          }),
          makeNode({ id: "2", name: "Pass", type: "n8n-nodes-base.noOp" }),
        ],
        {
          Sched: { main: [[{ node: "Pass", type: "main", index: 0 }]] },
        },
      );
      const result = await runWorkflowFixture(wf);
      expect(result.success).toBe(true);
      expect(result.runData.Pass?.status).toBe("success");
      expect(result.runData.Sched?.items?.[0]?.[0]?.json.timestamp).toBeTruthy();
    });
  });

  describe("respondToWebhook", () => {
    it("stores first incoming item as response body", async () => {
      const node = makeNode({
        name: "Respond",
        type: "n8n-nodes-base.respondToWebhook",
        parameters: { respondWith: "firstIncomingItem" },
      });
      const wf = makeWorkflow([node]);
      (wf as Record<string, unknown>).__executionId = "exec-batch-02-a";

      const ctx = createExecutionContext({
        node,
        workflow: wf,
        getNodeInputItems: () => [{ json: { hello: "world" } }],
        continueOnFail: false,
      });
      const exec = getExecutorMap()["n8n-nodes-base.respondToWebhook"]!;
      await exec(ctx, node);

      const res = getWebhookResponse("exec-batch-02-a");
      expect(res?.statusCode).toBe(200);
      expect(res?.body).toEqual({ hello: "world" });
    });

    it("stores JSON response body", async () => {
      const node = makeNode({
        name: "Respond",
        type: "n8n-nodes-base.respondToWebhook",
        parameters: {
          respondWith: "json",
          responseBody: { ok: true, n: 1 },
          options: { responseCode: 201 },
        },
      });
      const wf = makeWorkflow([node]);
      (wf as Record<string, unknown>).__executionId = "exec-batch-02-b";

      const ctx = createExecutionContext({
        node,
        workflow: wf,
        getNodeInputItems: () => [],
        continueOnFail: false,
      });
      await getExecutorMap()["n8n-nodes-base.respondToWebhook"]!(ctx, node);

      const res = getWebhookResponse("exec-batch-02-b");
      expect(res?.statusCode).toBe(201);
      expect(res?.body).toEqual({ ok: true, n: 1 });
    });

    it("noData returns 200 with empty body", async () => {
      const node = makeNode({
        name: "Respond",
        type: "n8n-nodes-base.respondToWebhook",
        parameters: { respondWith: "noData" },
      });
      const wf = makeWorkflow([node]);
      (wf as Record<string, unknown>).__executionId = "exec-batch-02-c";
      const ctx = createExecutionContext({
        node,
        workflow: wf,
        getNodeInputItems: () => [{ json: { a: 1 } }],
        continueOnFail: false,
      });
      await getExecutorMap()["n8n-nodes-base.respondToWebhook"]!(ctx, node);
      expect(getWebhookResponse("exec-batch-02-c")?.statusCode).toBe(200);
    });
  });

  describe("code", () => {
    it("runOnceForAllItems maps items", async () => {
      const out = await runNode(
        "n8n-nodes-base.code",
        {
          mode: "runOnceForAllItems",
          jsCode: `return $input.all().map(i => ({ json: { n: i.json.x } }));`,
        },
        [{ x: 1 }, { x: 2 }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.n).toBe(2);
    });

    it("runOnceForEachItem doubles values", async () => {
      const out = await runNode(
        "n8n-nodes-base.code",
        {
          mode: "runOnceForEachItem",
          jsCode: `return { json: { doubled: $json.v * 2 } };`,
        },
        [{ v: 3 }, { v: 5 }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.doubled).toBe(6);
      expect(out[0][1].json.doubled).toBe(10);
    });

    it("synthesizes items from scratch (all-items)", async () => {
      const out = await runNode(
        "n8n-nodes-base.code",
        {
          mode: "runOnceForAllItems",
          jsCode: `return [1, 2, 3].map(n => ({ json: { n } }));`,
        },
        [{}],
      );
      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.n).toBe(2);
      expect(out[0][2].json.n).toBe(3);
    });

    it("errors when json property is an array", async () => {
      await expect(
        runNode(
          "n8n-nodes-base.code",
          {
            mode: "runOnceForAllItems",
            jsCode: `return [{ json: [1, 2, 3] }];`,
          },
          [{ a: 1 }],
        ),
      ).rejects.toThrow(/json.*object/i);
    });

    it("errors on undefined return (all-items)", async () => {
      await expect(
        runNode(
          "n8n-nodes-base.code",
          {
            mode: "runOnceForAllItems",
            jsCode: `// no return`,
          },
          [{ a: 1 }],
        ),
      ).rejects.toThrow(/doesn't return/i);
    });

    it("supports Promise return (all-items)", async () => {
      const out = await runNode(
        "n8n-nodes-base.code",
        {
          mode: "runOnceForAllItems",
          jsCode: `return Promise.resolve($input.all().map(i => ({ json: { n: i.json.x } })));`,
        },
        [{ x: 1 }, { x: 2 }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.n).toBe(2);
    });

    it("supports legacy items alias for $input.all()", async () => {
      const out = await runNode(
        "n8n-nodes-base.code",
        {
          mode: "runOnceForAllItems",
          jsCode: `return items.map(i => ({ json: { n: i.json.x } }));`,
        },
        [{ x: 1 }, { x: 2 }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.n).toBe(2);
    });

    it("errors on unsupported pythonNative language", async () => {
      await expect(
        runNode(
          "n8n-nodes-base.code",
          {
            mode: "runOnceForAllItems",
            language: "pythonNative",
            pythonCode: `return []`,
          },
          [{ x: 1 }],
        ),
      ).rejects.toThrow(/pythonNative.*not supported/i);
    });
  });

  describe("splitInBatches", () => {
    it("splits 5 items with batch size 2 (v3 order: done=0, loop=1)", async () => {
      const out = await runNode("n8n-nodes-base.splitInBatches", { batchSize: 2 }, [
        { i: 1 },
        { i: 2 },
        { i: 3 },
        { i: 4 },
        { i: 5 },
      ]);
      // done (output[0]) is empty while iterations remain; loop (output[1]) has the batch
      expect(out[0]).toHaveLength(0);
      expect(out[1]).toHaveLength(2);
      expect(out[1][0].json.i).toBe(1);
      expect(out[1][1].json.i).toBe(2);
    });

    it("single batch when exact fit: loop gets all, done empty", async () => {
      const out = await runNode("n8n-nodes-base.splitInBatches", { batchSize: 3 }, [
        { i: 1 },
        { i: 2 },
        { i: 3 },
      ]);
      expect(out[0]).toHaveLength(0);
      expect(out[1]).toHaveLength(3);
    });

    it("empty input yields empty outputs", async () => {
      const out = await runNode("n8n-nodes-base.splitInBatches", { batchSize: 2 }, []);
      // ensureItems not used — empty input
      expect(out[0]).toHaveLength(0);
      expect(out[1]).toHaveLength(0);
    });
  });

  it("code + splitInBatches workflow chain", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Code",
          type: "n8n-nodes-base.code",
          parameters: {
            mode: "runOnceForAllItems",
            jsCode: `return [1,2,3,4].map(n => ({ json: { n } }));`,
          },
        }),
        makeNode({
          id: "3",
          name: "Batch",
          type: "n8n-nodes-base.splitInBatches",
          typeVersion: 3,
          parameters: { batchSize: 2 },
        }),
      ],
      {
        Start: { main: [[{ node: "Code", type: "main", index: 0 }]] },
        Code: { main: [[{ node: "Batch", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
    });
    expect(result.success).toBe(true);
    // v3 order: done (output[0]) empty, loop (output[1]) has first batch of 2
    expect(result.runData.Batch?.items?.[0]).toHaveLength(0);
    expect(result.runData.Batch?.items?.[1]).toHaveLength(2);
  });
});
