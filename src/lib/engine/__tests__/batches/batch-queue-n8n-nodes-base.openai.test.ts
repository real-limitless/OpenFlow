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

const TYPE = "n8n-nodes-base.openAi";

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

describe("batch-queue openAi — n8n-nodes-base.openAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).name).toBe(TYPE);
  });

  it("throws when openAiApi credential is missing", async () => {
    await expect(
      runNode({ resource: "text", operation: "chatCompletion", model: "gpt-4o-mini" }, [{}], {}),
    ).rejects.toThrow(/credential "openAiApi"/i);
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
                message: { role: "assistant", content: "Paris" },
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
            messageValues: [{ role: "user", text: "What is the capital of France?" }],
          },
          simplifyOutput: true,
          options: { temperature: 0.7, maxTokens: 100 },
        },
        [{}],
      );

      expect(out[0][0].json).toEqual({
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Paris" },
          },
        ],
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/chat/completions");
      expect(captured[0].method).toBe("POST");
      expect(captured[0].body).toMatchObject({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "What is the capital of France?" }],
        temperature: 0.7,
        max_tokens: 100,
      });
    });
  });

  describe("text > moderation", () => {
    it("returns flagged + categories + category_scores", async () => {
      const captured: Array<{ url: string; body: unknown }> = [];

      setOpenAiAppHttpClient(async (opts) => {
        captured.push({ url: opts.url, body: opts.body });
        return {
          status: 200,
          headers: {},
          body: {
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
          textInput: "I want to hurt someone",
          useStableModel: false,
        },
        [{}],
      );

      expect(out[0][0].json).toEqual({
        flagged: true,
        categories: { violence: true, hate: false },
        category_scores: { violence: 0.99, hate: 0.01 },
      });

      expect(captured[0].url).toBe("https://api.openai.com/v1/moderations");
    });
  });

  describe("image > generate", () => {
    it("returns response with URLs when respondWithImageUrl is true", async () => {
      setOpenAiAppHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          created: 1712345678,
          data: [{ url: "https://example.com/image.png" }],
        },
      }));

      const out = await runNode(
        {
          resource: "image",
          operation: "generate",
          model: "dall-e-3",
          prompt: "A red apple on a white table",
          respondWithImageUrl: true,
          options: { quality: "hd", resolution: "1024x1024" },
        },
        [{}],
      );

      expect(out[0][0].json).toMatchObject({
        created: 1712345678,
        data: [{ url: "https://example.com/image.png" }],
      });
    });
  });

  describe("error handling", () => {
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
    });
  });
});
