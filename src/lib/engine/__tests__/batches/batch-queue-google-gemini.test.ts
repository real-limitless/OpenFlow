import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setGoogleGeminiHttpClient } from "../../executors/google-gemini";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.googleGemini";

const GOOGLE_CRED = {
  apiKey: "test-api-key",
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runNode(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { googlePalmApi: GOOGLE_CRED },
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => setGoogleGeminiHttpClient(null));

describe("batch-queue googleGemini — @n8n/n8n-nodes-langchain.googleGemini", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Gemini");
  });

  it("throws when googlePalmApi credential is missing", async () => {
    await expect(
      runNode({ resource: "text", operation: "message", model: "gemini-2.0-flash" }, [{}], {}),
    ).rejects.toThrow(/credential "googlePalmApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runNode({ resource: "text", operation: "message", model: "gemini-2.0-flash" }, [{}], {
        googlePalmApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  describe("text > message (simplified)", () => {
    it("returns simplified output with candidates + text", async () => {
      const captured: Array<{ url: string; method: string; body: unknown }> = [];

      setGoogleGeminiHttpClient(async (opts) => {
        captured.push({ url: opts.url, method: opts.method ?? "GET", body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
            candidates: [
              {
                content: { parts: [{ text: "Paris is the capital of France." }] },
              },
            ],
          },
        };
      });

      const out = await runNode(
        {
          resource: "text",
          operation: "message",
          model: "gemini-2.0-flash",
          prompt: "={{ $json.prompt }}",
          options: { temperature: 0.7 },
          simplify: true,
        },
        [{ prompt: "What is the capital of France?" }],
      );

      expect(out[0][0].json).toMatchObject({
        candidates: [{ content: { parts: [{ text: "Paris is the capital of France." }] } }],
        text: "Paris is the capital of France.",
      });
      expect(captured[0].url).toContain(":generateContent");
      expect(captured[0].body).toMatchObject({
        contents: [{ role: "user", parts: [{ text: "What is the capital of France?" }] }],
        generationConfig: { temperature: 0.7 },
      });
    });

    it("returns raw response when simplify is false", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "Hello" }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
        },
      }));

      const out = await runNode({
        resource: "text",
        operation: "message",
        model: "gemini-2.0-flash",
        prompt: "Say hello",
        simplify: false,
      });

      expect(out[0][0].json).toMatchObject({
        usageMetadata: { promptTokenCount: 5 },
      });
      expect(out[0][0].json).not.toHaveProperty("text");
    });
  });

  describe("image > generate", () => {
    it("returns predictions with binary data", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          predictions: [
            {
              mimeType: "image/png",
              bytesBase64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
            },
          ],
        },
      }));

      const out = await runNode({
        resource: "image",
        operation: "generate",
        model: "imagen-3.0-generate-001",
        prompt: "a red apple on a white background",
        options: { aspectRatio: "1:1" },
      });

      expect(out[0][0].json).toMatchObject({
        predictions: [{ mimeType: "image/png" }],
      });
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!["image_0_0"]).toBeDefined();
      expect(out[0][0].binary!["image_0_0"].mimeType).toBe("image/png");
    });
  });

  describe("image > analyze", () => {
    it("analyzes image from binary data", async () => {
      const captured: Array<{ url: string }> = [];

      setGoogleGeminiHttpClient(async (opts) => {
        captured.push({ url: opts.url });
        return {
          status: 200,
          headers: {},
          body: {
            candidates: [
              { content: { parts: [{ text: "This is a test image." }] } },
            ],
          },
        };
      });

      const out = await runNode(
        {
          resource: "image",
          operation: "analyze",
          model: "gemini-2.0-flash",
          prompt: "Describe this image in one sentence.",
          binaryData: { property: "data.image" },
        },
        [
          {
            json: {},
            binary: {
              "data.image": {
                data: "dGVzdC1pbWFnZQ==",
                mimeType: "image/png",
                fileName: "test.png",
              },
            },
          },
        ],
      );

      expect(out[0][0].json).toMatchObject({
        candidates: [{ content: { parts: [{ text: "This is a test image." }] } }],
      });
      expect(captured[0].url).toContain(":generateContent");
    });
  });

  describe("audio > transcribe", () => {
    it("transcribes audio from binary data", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "This is a test transcription." }] } }],
        },
      }));

      const out = await runNode(
        {
          resource: "audio",
          operation: "transcribe",
          model: "gemini-2.0-flash",
          prompt: "Transcribe the audio.",
          binaryData: { property: "data" },
        },
        [
          {
            json: {},
            binary: {
              data: {
                data: "dGVzdC1hdWRpbw==",
                mimeType: "audio/mpeg",
                fileName: "test.mp3",
              },
            },
          },
        ],
      );

      const text = extractText(out[0][0].json);
      expect(text).toContain("test transcription");
    });
  });

  describe("document > analyze", () => {
    it("analyzes a document from binary data", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "Document analysis result." }] } }],
        },
      }));

      const out = await runNode(
        {
          resource: "document",
          operation: "analyze",
          model: "gemini-2.0-flash",
          prompt: "Summarize this document.",
          binaryData: { property: "data" },
        },
        [
          {
            json: {},
            binary: {
              data: {
                data: "JSFBREZTREZTREZT",
                mimeType: "application/pdf",
                fileName: "doc.pdf",
              },
            },
          },
        ],
      );

      const text = extractText(out[0][0].json);
      expect(text).toContain("Document analysis");
    });
  });

  describe("fileSearch > createStore", () => {
    it("creates a file search store", async () => {
      const captured: Array<{ url: string; body: unknown }> = [];

      setGoogleGeminiHttpClient(async (opts) => {
        captured.push({ url: opts.url, body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
            name: "fileSearchStores/abc123",
            displayName: "my-store",
          },
        };
      });

      const out = await runNode(
        {
          resource: "fileSearch",
          operation: "createStore",
          storeName: "={{ $json.name }}",
        },
        [{ name: "my-store" }],
      );

      expect(out[0][0].json).toMatchObject({
        name: "fileSearchStores/abc123",
        displayName: "my-store",
      });
      expect(captured[0].url).toContain("/fileSearchStores");
      expect(captured[0].body).toMatchObject({ displayName: "my-store" });
    });
  });

  describe("fileSearch > listStores", () => {
    it("lists file search stores", async () => {
      setGoogleGeminiHttpClient(async (opts) => {
        expect(opts.method).toBe("GET");
        expect(opts.url).toContain("/fileSearchStores");
        return {
          status: 200,
          headers: {},
          body: {
            fileSearchStores: [
              { name: "fileSearchStores/1", displayName: "Store 1" },
            ],
          },
        };
      });

      const out = await runNode({
        resource: "fileSearch",
        operation: "listStores",
      });

      expect(out[0][0].json).toMatchObject({
        fileSearchStores: [{ name: "fileSearchStores/1" }],
      });
    });
  });

  describe("fileSearch > deleteStore", () => {
    it("deletes a file search store", async () => {
      const captured: Array<{ url: string; method: string }> = [];

      setGoogleGeminiHttpClient(async (opts) => {
        captured.push({ url: opts.url, method: opts.method ?? "GET" });
        return {
          status: 200,
          headers: {},
          body: {},
        };
      });

      const out = await runNode(
        {
          resource: "fileSearch",
          operation: "deleteStore",
          storeId: "abc123",
        },
        [{}],
      );

      expect(captured[0].url).toContain("fileSearchStores/abc123");
      expect(captured[0].method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("surfaces rate-limit errors", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 429,
        headers: {},
        body: { error: { message: "Rate limit exceeded" } },
      }));

      await expect(
        runNode({
          resource: "text",
          operation: "message",
          model: "gemini-2.0-flash",
          prompt: "hi",
        }),
      ).rejects.toThrow(/rate limit/i);
    });

    it("emits error item when continueOnFail is true", async () => {
      setGoogleGeminiHttpClient(async () => ({
        status: 500,
        headers: {},
        body: { error: "server error" },
      }));

      const out = await runNode(
        {
          resource: "text",
          operation: "message",
          model: "gemini-2.0-flash",
          prompt: "hi",
        },
        [{}],
        { googlePalmApi: GOOGLE_CRED },
        true,
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toMatch(/Google Gemini API error/i);
    });
  });

  describe("not-yet-implemented operations", () => {
    it("throws for image > edit", async () => {
      await expect(
        runNode({
          resource: "image",
          operation: "edit",
          model: "imagen-3.0-generate-001",
          prompt: "edit this",
        }),
      ).rejects.toThrow(/edit.*not yet implemented/i);
    });

    it("throws for video > generate", async () => {
      await expect(
        runNode({
          resource: "video",
          operation: "generate",
          model: "veo-2.0",
          prompt: "test",
        }),
      ).rejects.toThrow(/generate.*not yet implemented/i);
    });

    it("throws for fileSearch > uploadToStore", async () => {
      await expect(
        runNode({
          resource: "fileSearch",
          operation: "uploadToStore",
          storeName: "test",
        }),
      ).rejects.toThrow(/uploadToStore.*not yet implemented/i);
    });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

function extractText(json: Record<string, unknown>): string {
  const candidates = json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  if (!candidates) return "";
  return candidates
    .map((c) => c.content?.parts?.map((p) => p.text ?? "").join("") ?? "")
    .join("\n");
}
