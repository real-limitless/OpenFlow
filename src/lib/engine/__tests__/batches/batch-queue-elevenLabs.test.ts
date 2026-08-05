import { describe, it, expect, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.elevenLabs";

describe("batch-queue elevenLabs — n8n-nodes-base.elevenLabs", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ElevenLabs");
  });

  it("rejects missing credential", async () => {
    await expect(
      runNode(TYPE, { resource: "textToSpeech", operation: "convert", voiceId: "test", text: "hello" }),
    ).rejects.toThrow(/elevenLabsApi credential/);
  });

  it("rejects empty text", async () => {
    await expect(
      runNode(TYPE, { resource: "textToSpeech", operation: "convert", voiceId: "test", text: "" }, [{}], {
        credentials: { elevenLabsApi: { apiKey: "test-key" } },
      }),
    ).rejects.toThrow(/text is required/);
  });

  it("passes through with error on API failure when continueOnFail is enabled", async () => {
    const out = await runNode(
      TYPE,
      { resource: "textToSpeech", operation: "convert", voiceId: "nonexistent", text: "Hello" },
      [{}],
      {
        continueOnFail: true,
        credentials: { elevenLabsApi: { apiKey: "test-key" } },
      },
    );
    expect(out[0][0].json).toHaveProperty("error", true);
    expect(out[0][0].json.errorMessage).toContain("ElevenLabs");
  });

  it("resolves text expression using shared evaluator", async () => {
    const input = [{ json: { myText: "Hello resolved", extraField: 42 } }];
    await expect(
      runNodeWithCtx(
        TYPE,
        {
          resource: "textToSpeech",
          operation: "convert",
          voiceId: "JBFqnCBsd6RMkjVDRZzb",
          text: "={{ $json.myText }}",
        },
        input,
        {
          credentials: { elevenLabsApi: { apiKey: "test-key" } },
        },
      ),
    ).rejects.toThrow(/ElevenLabs/);
  });
});
