import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";
import {
  setGoogleGeminiToolHttpClient,
} from "../../executors/n8n-nodes-langchain.googleGeminiTool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.googleGeminiTool";

const CRED = { googlePalmApi: { apiKey: "AIza-test-key" } };

afterEach(() => setGoogleGeminiToolHttpClient(null));

describe("batch-queue googleGeminiTool — @n8n/n8n-nodes-langchain.googleGeminiTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Gemini Tool");
  });

  it("tool-text-message: sends generateContent and returns simplified text", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    setGoogleGeminiToolHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "Paris is the capital of France." }], role: "model" } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6, totalTokenCount: 11 },
        },
      };
    });

    const out = await runNode(
      TYPE,
      { resource: "text" },
      [{ resource: "text", operation: "message", modelId: { mode: "id", value: "gemini-2.0-flash" }, messages: { values: [{ content: "What is the capital of France?", role: "user" }] }, simplify: true }],
      { credentials: CRED },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.candidates).toBeDefined();
    expect((json.candidates as Array<unknown>).length).toBeGreaterThan(0);
    expect(json.text).toContain("Paris");

    expect(captured).toHaveLength(1);
    const body = captured[0].body as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
    expect(body.contents[0].parts[0].text).toBe("What is the capital of France?");
  });

  it("tool-image-analyze: includes image from binaryPropertyName as inlineData", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    setGoogleGeminiToolHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "A beautiful sunset over mountains." }], role: "model" } }],
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 8, totalTokenCount: 16 },
        },
      };
    });

    const out = await runNode(
      TYPE,
      { resource: "image", operation: "analyze" },
      [{
        json: {
          resource: "image",
          operation: "analyze",
          modelId: { mode: "id", value: "gemini-2.0-flash" },
          text: "Describe this image in one sentence.",
          simplify: true,
          binaryPropertyName: "data.image",
        },
        binary: {
          "data.image": {
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            mimeType: "image/png",
            fileName: "test.png",
          },
        },
      }],
      { credentials: CRED },
    );

    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.candidates).toBeDefined();
    expect(json.text).toContain("sunset");

    expect(captured).toHaveLength(1);
    const body = captured[0].body as { contents: Array<{ role: string; parts: Array<unknown> }> };
    const parts = body.contents[0].parts as Array<Record<string, unknown>>;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const inlinePart = parts.find((p) => p.inlineData) as { inlineData: { data: string; mimeType: string } } | undefined;
    expect(inlinePart).toBeDefined();
    expect(inlinePart!.inlineData.data).toBe("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    expect(inlinePart!.inlineData.mimeType).toBe("image/png");
  });

  it("tool-audio-transcribe: includes binary data as inlineData with correct mimeType", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    setGoogleGeminiToolHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "This is a transcription of the audio recording." }], role: "model" } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 8, totalTokenCount: 13 },
        },
      };
    });

    const out = await runNode(
      TYPE,
      { resource: "audio" },
      [{
        json: {
          resource: "audio",
          operation: "transcribe",
          modelId: { mode: "id", value: "gemini-2.0-flash" },
          binaryPropertyName: "data.audio",
          prompt: "Transcribe this recording.",
          simplify: true,
        },
        binary: {
          "data.audio": {
            data: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAA//QkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAP8AAAD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            mimeType: "audio/mpeg",
            fileName: "test.mp3",
          },
        },
      }],
      { credentials: CRED },
    );

    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.text).toContain("transcription");

    expect(captured).toHaveLength(1);
    const body = captured[0].body as { contents: Array<{ role: string; parts: Array<unknown> }> };
    const parts = body.contents[0].parts as Array<Record<string, unknown>>;
    const inlinePart = parts.find((p) => p.inlineData) as { inlineData: { data: string; mimeType: string } } | undefined;
    expect(inlinePart).toBeDefined();
    expect(inlinePart!.inlineData.mimeType).toBe("audio/mpeg");
  });

  it("tool-generate-image: returns binary attachment and json with uri + mimeType", async () => {
    const fakeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const captured: Array<{ url: string; body: unknown }> = [];
    setGoogleGeminiToolHttpClient(async (opts) => {
      captured.push({ url: opts.url, body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          predictions: [
            { mimeType: "image/png", bytesBase64Encoded: fakeBase64 },
          ],
        },
      };
    });

    const out = await runNode(
      TYPE,
      { resource: "image", operation: "generate" },
      [{ resource: "image", operation: "generate", modelId: { mode: "id", value: "imagen-3.0-generate-001" }, prompt: "a red apple on a white background" }],
      { credentials: CRED },
    );

    expect(out[0]).toHaveLength(1);
    const item = out[0][0];
    const json = item.json as Record<string, unknown>;

    expect(json.predictions).toBeDefined();
    expect((json.predictions as Array<unknown>).length).toBe(1);

    expect(item.binary).toBeDefined();
    const binKeys = Object.keys(item.binary!);
    expect(binKeys.length).toBeGreaterThan(0);

    const imageKey = binKeys[0];
    expect(item.binary![imageKey].data).toBe(fakeBase64);
    expect(item.binary![imageKey].mimeType).toBe("image/png");

    const jsonRef = json[imageKey] as { uri?: string; mimeType?: string } | undefined;
    expect(jsonRef).toBeDefined();
    expect(jsonRef!.uri).toContain("data:image/png;base64,");
    expect(jsonRef!.mimeType).toBe("image/png");

    expect(captured).toHaveLength(1);
    const predictBody = captured[0].body as { instances: Array<{ prompt: string }> };
    expect(predictBody.instances[0].prompt).toBe("a red apple on a white background");
  });

  it("throws error when credential is missing", async () => {
    await expect(runNode(TYPE, { resource: "text" }, [{}], { credentials: {} }))
      .rejects.toThrow(/googlePalmApi/i);
  });

  it("handles unknown resource gracefully with continueOnFail", async () => {
    const out = await runNode(TYPE, { resource: "text" }, [{ resource: "unknownResource" }], { continueOnFail: true, credentials: CRED });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
