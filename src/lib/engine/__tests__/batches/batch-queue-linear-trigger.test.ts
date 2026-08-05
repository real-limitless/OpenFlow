import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";

describe("n8n-nodes-base.linearTrigger", () => {
  it("is registered", () => {
    assertExecutorRegistered("n8n-nodes-base.linearTrigger");
  });

  it("emits default payload when no input items", async () => {
    const [result] = await runNode("n8n-nodes-base.linearTrigger", { event: "Issue" }, []);
    expect(result).toHaveLength(1);
    expect(result[0].json.event).toBe("Issue");
    expect(result[0].json.timestamp).toBeDefined();
  });

  it("wraps input items as webhook delivery payload", async () => {
    const input = [{ id: "123", title: "Test Issue", state: "inProgress" }];
    const [result] = await runNode("n8n-nodes-base.linearTrigger", { event: "Issue" }, input);
    expect(result).toHaveLength(1);
    const json = result[0].json;
    expect(json.body).toEqual(input[0]);
    expect(json.event).toBe("Issue");
    expect(json.timestamp).toBeDefined();
    expect(json.webhookId).toBe("");
  });

  it("respects continueOnFail and emits error item when webhook registration fails", async () => {
    const [result] = await runNode(
      "n8n-nodes-base.linearTrigger",
      { event: "Issue", webhookUrl: "https://example.com/hook" },
      [],
      { continueOnFail: true },
    );
    expect(result).toHaveLength(1);
    expect(result[0].json.error).toBe(true);
    expect(typeof result[0].json.message).toBe("string");
  });

  it("drops items that do not match filter conditions", async () => {
    const input = [
      { id: "1", priority: 1 },
      { id: "2", priority: 5 },
      { id: "3", priority: 3 },
    ];
    const filter = JSON.stringify([
      { field: "priority", operator: "greaterThan", value: 1 },
    ]);
    const [result] = await runNode(
      "n8n-nodes-base.linearTrigger",
      {
        event: "Issue",
        additionalFields: { filter },
      },
      input,
    );
    expect(result).toHaveLength(2);
    expect(result[0].json.body.id).toBe("2");
    expect(result[1].json.body.id).toBe("3");
  });

  it("emits event-category metadata for Issue event", async () => {
    const input = [{ id: "i-1", title: "Bug", description: "crash" }];
    const [result] = await runNode("n8n-nodes-base.linearTrigger", { event: "Issue" }, input);
    expect(result[0].json.body).toHaveProperty("id");
    expect(result[0].json.body).toHaveProperty("title");
    expect(result[0].json.event).toBe("Issue");
  });

  it("handles empty filter field gracefully", async () => {
    const input = [{ id: "1" }];
    const [result] = await runNode(
      "n8n-nodes-base.linearTrigger",
      { event: "Cycle", additionalFields: {} },
      input,
    );
    expect(result).toHaveLength(1);
    expect(result[0].json.event).toBe("Cycle");
  });

  it("applies equals filter on dot-path field", async () => {
    const input = [
      { id: "1", data: { team: { name: "Platform" } } },
      { id: "2", data: { team: { name: "Mobile" } } },
    ];
    const filter = JSON.stringify([
      { field: "data.team.name", operator: "equals", value: "Platform" },
    ]);
    const [result] = await runNode(
      "n8n-nodes-base.linearTrigger",
      { event: "Issue", additionalFields: { filter } },
      input,
    );
    expect(result).toHaveLength(1);
    expect(result[0].json.body.id).toBe("1");
  });
});
