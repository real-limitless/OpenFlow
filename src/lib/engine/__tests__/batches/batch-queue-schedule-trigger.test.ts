import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.scheduleTrigger";

function rule(...interval: Record<string, unknown>[]) {
  return { rule: { interval } };
}

function expectTimestampItem(out: ReturnType<typeof runNode> extends Promise<infer R> ? R : never) {
  expect(out).toHaveLength(1);
  expect(out[0]).toHaveLength(1);
  const ts = out[0][0].json.timestamp;
  expect(typeof ts).toBe("string");
  expect(new Date(ts as string).toISOString()).toBe(ts);
}

describe("batch-queue scheduleTrigger — n8n-nodes-base.scheduleTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Schedule Trigger");
  });

  it("emits one timestamp item for the default days rule (happy path)", async () => {
    const out = await runNode(
      TYPE,
      rule({ field: "days", daysInterval: 1, triggerAtHour: 0, triggerAtMinute: 0 }),
      [],
    );
    expectTimestampItem(out);
  });

  it("emits one timestamp item for an hours interval with minute offset", async () => {
    const out = await runNode(
      TYPE,
      rule({ field: "hours", hoursInterval: 6, triggerAtMinute: 30 }),
      [],
    );
    expectTimestampItem(out);
  });

  it("emits one timestamp item for a weekly multi-day rule", async () => {
    const out = await runNode(
      TYPE,
      rule({
        field: "weeks",
        weeksInterval: 1,
        triggerAtDay: [1, 3, 5],
        triggerAtHour: 9,
        triggerAtMinute: 0,
      }),
      [],
    );
    expectTimestampItem(out);
  });

  it("emits one timestamp item for a 5-field cron expression", async () => {
    const out = await runNode(TYPE, rule({ field: "cronExpression", expression: "0 6 * * *" }), []);
    expectTimestampItem(out);
  });

  it("emits one timestamp item for a 6-field cron expression with seconds", async () => {
    const out = await runNode(
      TYPE,
      rule({ field: "cronExpression", expression: "*/10 * * * * *" }),
      [],
    );
    expectTimestampItem(out);
  });

  it("registers each rule independently (multiple rules) and emits one item on manual invoke", async () => {
    const out = await runNode(
      TYPE,
      rule(
        { field: "minutes", minutesInterval: 15 },
        { field: "cronExpression", expression: "0 0 * * 0" },
      ),
      [],
    );
    expectTimestampItem(out);
  });

  it("throws on an invalid cron expression (edge)", async () => {
    await expect(
      runNode(TYPE, rule({ field: "cronExpression", expression: "not a cron" }), []),
    ).rejects.toThrow(/Invalid cron expression/);
  });

  it("throws on an out-of-range cron field (edge)", async () => {
    await expect(
      runNode(TYPE, rule({ field: "cronExpression", expression: "99 * * * *" }), []),
    ).rejects.toThrow(/Invalid cron expression/);
  });

  it("falls back to the default days rule when rule.interval is absent", async () => {
    const out = await runNode(TYPE, {}, []);
    expectTimestampItem(out);
  });

  it("includes readable date parts in the effective timezone", async () => {
    const out = await runNode(TYPE, rule({ field: "days" }), []);
    const json = out[0][0].json;
    expect(typeof json["Readable date"]).toBe("string");
    expect(typeof json["Day of week"]).toBe("string");
    expect(typeof json.Timezone).toBe("string");
  });

  it("uses the workflow timezone when set", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: rule({ field: "days" }),
    });
    const wf = makeWorkflow([node]);
    wf.settings.timezone = "Asia/Tokyo";
    const map = getExecutorMap();
    const ctx = {
      node,
      getParam: <T = unknown>(name: string, d?: T) => (node.parameters[name] ?? d) as T,
      getWorkflow: () => wf,
    } as unknown as Parameters<(typeof map)[typeof TYPE]>[0];
    const out = await map[TYPE]!(ctx, node);
    expect(out[0][0].json.Timezone).toBe("Asia/Tokyo");
  });

  it("starts a downstream chain and feeds NoOp the timestamp item", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Schedule",
          type: TYPE,
          typeVersion: 1.2,
          parameters: rule({ field: "days", daysInterval: 1 }),
        }),
        makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      { Schedule: { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
    expect(typeof result.runData.Schedule?.items?.[0][0].json.timestamp).toBe("string");
  });

  it("uses pin data instead of the generated timestamp when pinned (edge)", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Start",
          type: TYPE,
          typeVersion: 1.2,
          parameters: rule({ field: "days" }),
        }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      { Start: { main: [[{ node: "Pass", type: "main", index: 0 }]] } },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: { Start: [{ json: { hello: "pinned" } }] },
    });
    expect(result.success).toBe(true);
    expect(result.runData.Start?.items?.[0]).toEqual([{ json: { hello: "pinned" } }]);
    expect(result.runData.Pass?.items?.[0][0].json).toEqual({ hello: "pinned" });
  });
});
