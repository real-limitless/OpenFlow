import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setGeminiHttpClient,
  type GeminiModelHandle,
  type GeminiChatMessage,
  type GeminiHttpClient,
} from "../../executors/lm-chat-google-gemini";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatGoogleGemini";

const GEMINI_CRED = {
  apiKey: "AIza-test-key",
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    continueOnFail: false,
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

async function runModel(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { googleApi: GEMINI_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): GeminiModelHandle {
  return out[0][0].json as unknown as GeminiModelHandle;
}

afterEach(() => setGeminiHttpClient(null));

describe("batch-queue lmChatGoogleGemini — @n8n/n8n-nodes-langchain.lmChatGoogleGemini", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Gemini Chat Model");
  });

  it("builds a model handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gemini-1.5-flash" },
      options: { temperature: 0, maxOutputTokens: 1024, timeout: 120000 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("gemini-1.5-flash");
    expect(handle.options).toMatchObject({ temperature: 0, maxOutputTokens: 1024, timeout: 120000 });
    expect(handle.baseUrl).toBe("https://generativelanguage.googleapis.com");
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.gemini_model }}" },
        options: { temperature: 0.2, maxOutputTokens: 2000 },
      },
      [{ gemini_model: "gemini-1.5-pro" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("gemini-1.5-pro");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "gemini-2.0-flash",
      options: {},
    });
    expect(getHandle(out).model).toBe("gemini-2.0-flash");
  });

  it("uses custom host from credential when provided", async () => {
    const out = await runModel(
      { model: { __rl: true, mode: "list", value: "gemini-1.5-flash" }, options: {} },
      [{}],
      { googleApi: { apiKey: "AIza-test-key", host: "https://my-proxy.example.com" } },
    );

    const handle = getHandle(out);
    expect(handle.baseUrl).toBe("https://my-proxy.example.com");
  });

  it("throws when googleApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gemini-1.5-flash" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "googleApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "gemini-1.5-flash" }, options: {} },
        [{}],
        { googleApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("throws when model id is missing", async () => {
    await expect(
      runModel({ model: { __rl: true, mode: "list", value: "" }, options: {} }),
    ).rejects.toThrow(/model id is required/i);
  });

  it("invoke calls generateContent endpoint with correct body + auth header", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setGeminiHttpClient(async (opts) => {
      captured.push({
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "Hello!" }], role: "model" } }],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 2,
            totalTokenCount: 7,
          },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gemini-1.5-flash" },
      options: { temperature: 0, maxOutputTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: GeminiChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello!");
    expect(result.model).toBe("gemini-1.5-flash");
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://generativelanguage.googleapis.com/models/gemini-1.5-flash:generateContent",
    );
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["x-goog-api-key"]).toBe("AIza-test-key");
    expect(captured[0].body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      systemInstruction: { parts: [{ text: "You are helpful." }] },
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    });
  });

  it("maps assistant role to model and includes topP/topK in generationConfig", async () => {
    const captured: Array<{ body: unknown }> = [];

    setGeminiHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }], role: "model" } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gemini-1.5-pro" },
      options: { topP: 0.9, topK: 40 },
    });

    const handle = getHandle(out);
    await handle.invoke([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "Bye" },
    ]);

    expect(captured[0].body).toMatchObject({
      contents: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi there" }] },
        { role: "user", parts: [{ text: "Bye" }] },
      ],
      generationConfig: { topP: 0.9, topK: 40 },
    });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setGeminiHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gemini-1.5-flash" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/rate limit/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setGeminiHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }], role: "model" } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "gemini-1.5-flash" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});