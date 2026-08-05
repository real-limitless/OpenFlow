import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setCohereHttpClient,
  type CohereModelHandle,
  type CohereChatMessage,
  type CohereHttpClient,
} from "../../executors/lm-chat-cohere";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatCohere";

const COHERE_CRED = {
  apiKey: "cohere-test-key",
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
  credentials: Record<string, Record<string, unknown>> = { cohereApi: COHERE_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): CohereModelHandle {
  return out[0][0].json as unknown as CohereModelHandle;
}

afterEach(() => setCohereHttpClient(null));

describe("batch-queue lmChatCohere — @n8n/n8n-nodes-langchain.lmChatCohere", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Cohere Chat Model");
  });

  it("builds a handle with model + options", async () => {
    const out = await runModel({
      model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" },
      options: { temperature: 0.3, maxTokens: 1024, maxRetries: 2 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("command-a-plus-05-2026");
    expect(handle.options).toMatchObject({ temperature: 0.3, maxTokens: 1024, maxRetries: 2 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        model: { __rl: true, mode: "id", value: "={{ $json.cohere_model }}" },
        options: { temperature: 0.7 },
      },
      [{ cohere_model: "command-r-08-2024" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("command-r-08-2024");
  });

  it("accepts a plain string model (non resource-locator)", async () => {
    const out = await runModel({
      model: "command-a-plus-05-2026",
      options: {},
    });
    expect(getHandle(out).model).toBe("command-a-plus-05-2026");
  });

  it("throws when cohereApi credential is missing", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" }, options: {} },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "cohereApi"/i);
  });

  it("throws when apiKey is empty", async () => {
    await expect(
      runModel(
        { model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" }, options: {} },
        [{}],
        { cohereApi: { apiKey: "" } },
      ),
    ).rejects.toThrow(/missing apiKey/);
  });

  it("invoke calls Cohere chat endpoint with correct body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setCohereHttpClient(async (opts) => {
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
          id: "c14c80c3-18eb-4519-9460-6c92edd8cfb4",
          finish_reason: "COMPLETE",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hello from Cohere!" }],
          },
          usage: {
            billed_units: { input_tokens: 5, output_tokens: 418 },
            tokens: { input_tokens: 71, output_tokens: 418 },
          },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" },
      options: { temperature: 0.3, maxTokens: 1024 },
    });

    const handle = getHandle(out);
    const messages: CohereChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello from Cohere!");
    expect(result.usage).toEqual({
      promptTokens: 71,
      completionTokens: 418,
      totalTokens: 489,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.cohere.com/v2/chat");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers.authorization).toBe("Bearer cohere-test-key");
    expect(captured[0].body).toMatchObject({
      model: "command-a-plus-05-2026",
      messages,
      stream: false,
      temperature: 0.3,
      max_tokens: 1024,
    });
  });

  it("invoke multi-turn messages pass through", async () => {
    const captured: Array<{ body: unknown }> = [];
    setCohereHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Summary" }],
          },
          usage: { tokens: { input_tokens: 10, output_tokens: 5 } },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" },
      options: {},
    });

    const handle = getHandle(out);
    const messages: CohereChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Summarize the meeting." },
    ];
    await handle.invoke(messages);

    const body = captured[0].body as { messages: unknown[] };
    expect(body.messages).toEqual(messages);
  });

  it("surfaces unauthorized errors clearly", async () => {
    setCohereHttpClient(async () => ({
      status: 401,
      headers: {},
      body: { message: "unauthorized" },
    }));

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", content: "hi" }])).rejects.toThrow(/unauthorized/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setCohereHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { message: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
          usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
        },
      };
    });

    const out = await runModel({
      model: { __rl: true, mode: "list", value: "command-a-plus-05-2026" },
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
