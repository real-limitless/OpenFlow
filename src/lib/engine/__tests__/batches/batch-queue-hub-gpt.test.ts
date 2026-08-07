import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hubGPT";

describe("batch-queue hub-gpt — n8n-nodes-base.hubGPT", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HubGPT");
  });

  it("passes through items when prompt is empty", async () => {
    const out = await runNode(TYPE, {}, [{ id: 1, name: "Alice" }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(1);
  });

  it("annotates each item with hubGPT metadata when prompt is set", async () => {
    const out = await runNode(
      TYPE,
      { prompt: "Summarize this", model: "gpt-3.5-turbo", options: { temperature: 0.5, maxTokens: 512 } },
      [{ text: "hello" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.hubGPT).toBeDefined();
    expect(out[0][0].json.hubGPT.prompt).toBe("Summarize this");
    expect(out[0][0].json.hubGPT.model).toBe("gpt-3.5-turbo");
    expect(out[0][0].json.hubGPT.temperature).toBe(0.5);
    expect(out[0][0].json.hubGPT.maxTokens).toBe(512);
  });

  it("resolves template expressions with item fields", async () => {
    const out = await runNode(
      TYPE,
      { prompt: "Name: {{name}}, role: {{role}}" },
      [{ name: "Alice", role: "engineer" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.hubGPT.prompt).toBe("Name: Alice, role: engineer");
  });

  it("produces one output per input item", async () => {
    const out = await runNode(TYPE, { prompt: "Hi" }, [{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json.hubGPT).toBeDefined();
    expect(out[0][1].json.hubGPT).toBeDefined();
    expect(out[0][2].json.hubGPT).toBeDefined();
  });

  it("defaults model to gpt-3.5-turbo", async () => {
    const out = await runNode(TYPE, { prompt: "Hi" }, [{}]);
    expect(out[0][0].json.hubGPT.model).toBe("gpt-3.5-turbo");
  });
});
