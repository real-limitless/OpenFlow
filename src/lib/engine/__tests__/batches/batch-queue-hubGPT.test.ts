import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions, getNodeType } from "@/lib/nodes/registry";
import { runNode, assertExecutorRegistered } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

describe("n8n-nodes-base.hubGPT", () => {
  it("registers executor and description", () => {
    assertExecutorRegistered("n8n-nodes-base.hubGPT");
    expect(getNodeType("n8n-nodes-base.hubGPT").placeholder).not.toBe(true);
  });

  describe("acceptance fixtures from spec", () => {
    it("empty prompt passes items through unchanged", async () => {
      const input = [{ json: { x: 1 } }, { json: { x: 2 } }];
      const out = await runNode("n8n-nodes-base.hubGPT", {}, input);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.x).toBe(1);
      expect(out[0][1].json.x).toBe(2);
    });

    it("resolves template expressions from input", async () => {
      const input = [{ json: { name: "Alice", topic: "AI" } }];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        { prompt: "Tell me about {{topic}} to {{name}}" },
        input,
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.hubGPT.prompt).toBe("Tell me about AI to Alice");
    });

    it("sets model and options metadata", async () => {
      const input = [{ json: {} }];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        {
          prompt: "Hello",
          model: "gpt-4",
          options: { temperature: 0.5, maxTokens: 1024 },
        },
        input,
      );
      expect(out[0][0].json.hubGPT.model).toBe("gpt-4");
      expect(out[0][0].json.hubGPT.temperature).toBe(0.5);
      expect(out[0][0].json.hubGPT.maxTokens).toBe(1024);
    });

    it("processes multiple input items", async () => {
      const input = [{ json: { id: 1 } }, { json: { id: 2 } }];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        { prompt: "Process {{id}}" },
        input,
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.hubGPT.prompt).toBe("Process 1");
      expect(out[0][1].json.hubGPT.prompt).toBe("Process 2");
      expect(out[0][0].json.hubGPT.response).toContain("HubGPT requires");
    });

    it("uses defaults when no options provided", async () => {
      const input = [{ json: {} }];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        { prompt: "Hi" },
        input,
      );
      expect(out[0][0].json.hubGPT.model).toBe("gpt-3.5-turbo");
      expect(out[0][0].json.hubGPT.temperature).toBe(0.7);
      expect(out[0][0].json.hubGPT.maxTokens).toBe(2048);
    });
  });

  describe("edge cases", () => {
    it("passes binary data through", async () => {
      const input = [
        {
          json: { note: "test" },
          binary: { file: { data: "abcd", mimeType: "text/plain" } },
        },
      ];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        { prompt: "Summarize" },
        input,
      );
      expect(out[0][0].json.note).toBe("test");
      expect(out[0][0].binary).toBeDefined();
    });

    it("preserves existing json fields", async () => {
      const input = [{ json: { original: "data", score: 42 } }];
      const out = await runNode(
        "n8n-nodes-base.hubGPT",
        { prompt: "Analyze" },
        input,
      );
      expect(out[0][0].json.original).toBe("data");
      expect(out[0][0].json.score).toBe(42);
      expect(out[0][0].json.hubGPT).toBeDefined();
    });
  });
});
