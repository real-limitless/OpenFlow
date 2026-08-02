import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setOpenAiAppHttpClient } from "../../executors/openai";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.openAi";

const OPENAI_CRED = {
  apiKey: "sk-test-key",
  organizationId: "org-test",
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
  credentials: Record<string, Record<string, unknown>> = { openAiApi: OPENAI_CRED },
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => setOpenAiAppHttpClient(null));

describe("batch-queue openAi — @n8n/n8n-nodes-langchain.openAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenAI");
  });

  it("throws when openAiApi credential is missing", async () => {
    await expect(
      runNode({ resource: "text", operation: "chatCompletion", model: "gpt-4o-mini" }, [{}], {}),
    ).rejects.toThrow(/credential "openAiApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runNode({ resource: "text", operation: "chatCompletion", model: "gpt-4o-mini" }, [{}], {
        openAiApi: { apiKey: "" },
      }),
    ).rejects.toThrow(/missing apiKey/);
  });

  describe("text > chat completion (simplified)", () => {
    it("returns simplified output with model + choices", async () => {
      const captured: Array<{ url: string; method: string; body: unknown }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({
          url: opts.url,
          method: opts.method ?? "GET",
          body: opts.body,
        });
        return {
          status: 200,
          headers: {},
          body: {
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "4" },
              },
            ],
          },
        };
      });

      const out = await runNode(
        {
          resource: "text",
          operation: "chatCompletion",
          model: "gpt-4o-mini",
          messages: {
            messageValues: [{ role: "user", text: "={{ $json.question }}" }],
          },
          simplifyOutput: true,
          options: { temperature: 0.7, maxTokens: 100 },
        },
        [{ question: "What is 2+2?" }],
      );

      expect(out[0][0].json).toEqual({
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "4" },
          },
        ],
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/chat/completions");
      expect(captured[0].method).toBe("POST");
      expect(captured[0].body).toMatchObject({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "What is 2+2?" }],
        temperature: 0.7,
        max_tokens: 100,
      });
    });

    it("returns raw response when simplifyOutput is false", async () => {
      setOpenAiAppHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          id: "chatcmpl-1",
          model: "gpt-4o-mini",
          choices: [{ index: 0, message: { role: "assistant", content: "hi" } }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      }));

      const out = await runNode({
        resource: "text",
        operation: "chatCompletion",
        model: "gpt-4o-mini",
        messages: { messageValues: [{ role: "user", text: "hi" }] },
        simplifyOutput: false,
      });

      expect(out[0][0].json).toMatchObject({
        id: "chatcmpl-1",
        model: "gpt-4o-mini",
      });
    });

    it("sets response_format when outputContentAsJson is true", async () => {
      const captured: Array<{ body: unknown }> = [];
      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
            model: "gpt-4o",
            choices: [{ index: 0, message: { role: "assistant", content: '{"a":1}' } }],
          },
        };
      });

      await runNode({
        resource: "text",
        operation: "chatCompletion",
        model: "gpt-4o",
        messages: { messageValues: [{ role: "user", text: "return json" }] },
        outputContentAsJson: true,
      });

      expect(captured[0].body).toMatchObject({
        response_format: { type: "json_object" },
      });
    });
  });

  describe("text > moderation", () => {
    it("returns flagged + categories + category_scores from results[0]", async () => {
      const captured: Array<{ url: string; body: unknown }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
            id: "modr-1",
            model: "text-moderation-latest",
            results: [
              {
                flagged: true,
                categories: { violence: true, hate: false },
                category_scores: { violence: 0.99, hate: 0.01 },
              },
            ],
          },
        };
      });

      const out = await runNode(
        {
          resource: "text",
          operation: "moderation",
          textInput: "={{ $json.text }}",
          useStableModel: false,
        },
        [{ text: "I want to hurt someone" }],
      );

      expect(out[0][0].json).toEqual({
        flagged: true,
        categories: { violence: true, hate: false },
        category_scores: { violence: 0.99, hate: 0.01 },
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/moderations");
      expect(captured[0].body).toMatchObject({
        input: "I want to hurt someone",
        model: "text-moderation-latest",
      });
    });

    it("uses stable model when useStableModel is true", async () => {
      const captured: Array<{ body: unknown }> = [];
      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ body: opts.body });
        return {
          status: 200,
          headers: {},
          body: { results: [{ flagged: false, categories: {}, category_scores: {} }] },
        };
      });

      await runNode({
        resource: "text",
        operation: "moderation",
        textInput: "hello",
        useStableModel: true,
      });

      expect(captured[0].body).toMatchObject({ model: "text-moderation-stable" });
    });
  });

  describe("audio > transcribe", () => {
    it("transcribes audio from binary data", async () => {
      const captured: Array<{ url: string; method: string }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, method: opts.method ?? "GET" });
        return {
          status: 200,
          headers: {},
          body: { text: "Hello, this is a test recording." },
        };
      });

      const out = await runNode(
        {
          resource: "audio",
          operation: "transcribe",
          inputDataFieldName: "data",
          options: { temperature: 0.0 },
        },
        [
          {
            json: {},
            binary: {
              data: {
                data: "dGVzdC1hdWRpbw==",
                mimeType: "audio/mp3",
                fileName: "recording.mp3",
              },
            },
          },
        ],
      );

      expect(out[0][0].json).toEqual({ text: "Hello, this is a test recording." });
      expect(captured[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(captured[0].method).toBe("POST");
    });

    it("throws when binary property is missing", async () => {
      await expect(
        runNode(
          {
            resource: "audio",
            operation: "transcribe",
            inputDataFieldName: "data",
          },
          [{ json: {} }],
        ),
      ).rejects.toThrow(/binary property "data" not found/);
    });
  });

  describe("audio > translate", () => {
    it("translates audio from binary data", async () => {
      const captured: Array<{ url: string }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url });
        return {
          status: 200,
          headers: {},
          body: { text: "Hello, this is a translated recording." },
        };
      });

      const out = await runNode(
        {
          resource: "audio",
          operation: "translate",
          inputDataFieldName: "data",
        },
        [
          {
            json: {},
            binary: {
              data: {
                data: "dGVzdC1hdWRpbw==",
                mimeType: "audio/mp3",
                fileName: "recording.mp3",
              },
            },
          },
        ],
      );

      expect(out[0][0].json).toEqual({ text: "Hello, this is a translated recording." });
      expect(captured[0].url).toBe("https://api.openai.com/v1/audio/translations");
    });
  });

  describe("image > generate", () => {
    it("returns raw API response with URLs when respondWithImageUrl is true", async () => {
      const captured: Array<{ url: string; body: unknown }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
            created: 1712345678,
            data: [
              {
                url: "https://oaidalleapiprodscus.blob.core.windows.net/...",
                revised_prompt: "A cute cat on a laptop",
              },
            ],
          },
        };
      });

      const out = await runNode({
        resource: "image",
        operation: "generate",
        model: "dall-e-3",
        prompt: "A cute cat sitting on a laptop",
        options: {
          quality: "standard",
          resolution: "1024x1024",
          style: "vivid",
        },
        respondWithImageUrl: true,
      });

      expect(out[0][0].json).toEqual({
        created: 1712345678,
        data: [
          {
            url: "https://oaidalleapiprodscus.blob.core.windows.net/...",
            revised_prompt: "A cute cat on a laptop",
          },
        ],
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/images/generations");
      expect(captured[0].body).toMatchObject({
        model: "dall-e-3",
        prompt: "A cute cat sitting on a laptop",
        quality: "standard",
        size: "1024x1024",
        style: "vivid",
        response_format: "url",
      });
    });
  });

  describe("file > upload", () => {
    it("uploads file and returns metadata", async () => {
      const captured: Array<{ url: string; method: string }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, method: opts.method ?? "GET" });
        return {
          status: 200,
          headers: {},
          body: {
            id: "file-abc123",
            object: "file",
            bytes: 1234,
            created_at: 1712345678,
            filename: "training.jsonl",
            purpose: "fine-tune",
          },
        };
      });

      const out = await runNode(
        {
          resource: "file",
          operation: "upload",
          inputDataFieldName: "data",
          options: { purpose: "fine-tune" },
        },
        [
          {
            json: {},
            binary: {
              data: {
                data: "eyJwcm9tcHQiOiAiaGkifQ==",
                mimeType: "application/jsonl",
                fileName: "training.jsonl",
              },
            },
          },
        ],
      );

      expect(out[0][0].json).toEqual({
        id: "file-abc123",
        object: "file",
        bytes: 1234,
        created_at: 1712345678,
        filename: "training.jsonl",
        purpose: "fine-tune",
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/files");
      expect(captured[0].method).toBe("POST");
    });
  });

  describe("file > list", () => {
    it("lists files", async () => {
      setOpenAiAppHttpClient(async (opts) => {
        expect(opts.method).toBe("GET");
        expect(opts.url).toBe("https://api.openai.com/v1/files");
        return {
          status: 200,
          headers: {},
          body: {
            object: "list",
            data: [{ id: "file-1", object: "file", purpose: "fine-tune" }],
          },
        };
      });

      const out = await runNode({
        resource: "file",
        operation: "list",
      });

      expect(out[0][0].json).toMatchObject({ object: "list" });
    });
  });

  describe("file > delete", () => {
    it("deletes a file by id", async () => {
      const captured: Array<{ url: string; method: string }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, method: opts.method ?? "GET" });
        return {
          status: 200,
          headers: {},
          body: { id: "file-abc", object: "file", deleted: true },
        };
      });

      const out = await runNode({
        resource: "file",
        operation: "delete",
        fileId: "file-abc",
      });

      expect(out[0][0].json).toMatchObject({ deleted: true });
      expect(captured[0].url).toBe("https://api.openai.com/v1/files/file-abc");
      expect(captured[0].method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("surfaces rate-limit errors", async () => {
      setOpenAiAppHttpClient(async () => ({
        status: 429,
        headers: {},
        body: { error: { message: "Rate limit" } },
      }));

      await expect(
        runNode({
          resource: "text",
          operation: "chatCompletion",
          model: "gpt-4o-mini",
          messages: { messageValues: [{ role: "user", text: "hi" }] },
        }),
      ).rejects.toThrow(/rate limit/i);
    });

    it("surfaces insufficient-quota errors", async () => {
      setOpenAiAppHttpClient(async () => ({
        status: 402,
        headers: {},
        body: { error: { code: "insufficient_quota" } },
      }));

      await expect(
        runNode({
          resource: "text",
          operation: "chatCompletion",
          model: "gpt-4o-mini",
          messages: { messageValues: [{ role: "user", text: "hi" }] },
        }),
      ).rejects.toThrow(/insufficient quota/i);
    });

    it("emits error item when continueOnFail is true", async () => {
      setOpenAiAppHttpClient(async () => ({
        status: 500,
        headers: {},
        body: { error: "server error" },
      }));

      const out = await runNode(
        {
          resource: "text",
          operation: "chatCompletion",
          model: "gpt-4o-mini",
          messages: { messageValues: [{ role: "user", text: "hi" }] },
        },
        [{}],
        { openAiApi: OPENAI_CRED },
        true,
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toMatch(/OpenAI API error/i);
    });
  });

  describe("not-yet-implemented operations", () => {
    it("throws for text > modelResponse", async () => {
      await expect(
        runNode({
          resource: "text",
          operation: "modelResponse",
          model: "gpt-4o",
          messages: { messageValues: [{ role: "user", text: "hi" }] },
        }),
      ).rejects.toThrow(/modelResponse.*not yet implemented/i);
    });

    it("throws for image > analyze", async () => {
      await expect(
        runNode({
          resource: "image",
          operation: "analyze",
          model: "gpt-4o",
          textInput: "what is this?",
        }),
      ).rejects.toThrow(/analyze.*not yet implemented/i);
    });

    it("throws for video > generate", async () => {
      await expect(
        runNode({
          resource: "video",
          operation: "generate",
          model: "sora-2",
          prompt: "test",
          seconds: 5,
          size: "1024x1792",
        }),
      ).rejects.toThrow(/video.*not yet implemented/i);
    });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
