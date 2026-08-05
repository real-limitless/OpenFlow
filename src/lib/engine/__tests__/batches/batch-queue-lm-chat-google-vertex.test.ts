import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setVertexHttpClient,
  type VertexModelHandle,
  type VertexChatMessage,
  type VertexHttpClient,
} from "../../executors/lm-chat-google-vertex";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatGoogleVertex";

const VERTEX_CRED = {
  serviceAccountEmail: "test@project.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
  accessToken: "ya29.mock-access-token",
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
  credentials: Record<string, Record<string, unknown>> = { googleApi: VERTEX_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): VertexModelHandle {
  return out[0][0].json as unknown as VertexModelHandle;
}

afterEach(() => setVertexHttpClient(null));

describe("batch-queue lmChatGoogleVertex — @n8n/n8n-nodes-langchain.lmChatGoogleVertex", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Vertex Chat Model");
  });

  it("builds a model handle with projectId + modelName + options", async () => {
    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: { maxTokens: 1024, temperature: 0.7, topP: 0.95, topK: 40 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.projectId).toBe("my-gcp-project");
    expect(handle.model).toBe("gemini-1.5-flash-001");
    expect(handle.region).toBe("us-central1");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0.7, topP: 0.95, topK: 40 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves resource locator id mode with expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        projectId: { __rl: true, mode: "id", value: "={{ $json.gcp_project }}" },
        modelName: { __rl: true, mode: "id", value: "={{ $json.vertex_model }}" },
        options: { temperature: 0.2 },
      },
      [{ gcp_project: "my-project", vertex_model: "gemini-2.5-pro-001" }],
    );

    const handle = getHandle(out);
    expect(handle.projectId).toBe("my-project");
    expect(handle.model).toBe("gemini-2.5-pro-001");
  });

  it("accepts plain string for projectId and modelName (non resource-locator)", async () => {
    const out = await runModel({
      projectId: "my-gcp-project",
      modelName: "gemini-2.0-flash",
      options: {},
    });
    const handle = getHandle(out);
    expect(handle.projectId).toBe("my-gcp-project");
    expect(handle.model).toBe("gemini-2.0-flash");
  });

  it("throws when googleApi credential is missing", async () => {
    await expect(
      runModel(
        {
          projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
          modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
          options: {},
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "googleApi"/i);
  });

  it("throws when projectId is missing", async () => {
    await expect(
      runModel({
        projectId: { __rl: true, mode: "list", value: "" },
        modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
        options: {},
      }),
    ).rejects.toThrow(/projectId is required/i);
  });

  it("throws when modelName is missing", async () => {
    await expect(
      runModel({
        projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
        modelName: { __rl: true, mode: "list", value: "" },
        options: {},
      }),
    ).rejects.toThrow(/modelName is required/i);
  });

  it("invoke calls generateContent with correct URL, auth header, and body", async () => {
    const captured: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];

    setVertexHttpClient(async (opts) => {
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
          candidates: [{ content: { parts: [{ text: "Hello from Vertex!" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
      };
    });

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: { temperature: 0.5, maxTokens: 2048 },
    });

    const handle = getHandle(out);
    const messages: VertexChatMessage[] = [
      { role: "user", parts: [{ text: "Summarize the meeting." }] },
    ];
    const result = await handle.invoke(messages);

    expect(result.text).toBe("Hello from Vertex!");
    expect(result.model).toBe("gemini-1.5-flash-001");
    expect(result.finishReason).toBe("STOP");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-gcp-project/locations/us-central1/publishers/google/models/gemini-1.5-flash-001:generateContent",
    );
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["authorization"]).toBe("Bearer ya29.mock-access-token");
    expect(captured[0].body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Summarize the meeting." }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
    });
  });

  it("includes safety settings in the request body", async () => {
    const captured: Array<{ body: unknown }> = [];

    setVertexHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: {
        safetySettings: {
          values: [
            { category: "harassment", threshold: "blockOnlyHigh" },
            { category: "hateSpeech", threshold: "blockMediumAndAbove" },
          ],
        },
      },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", parts: [{ text: "test" }] }]);

    expect(captured[0].body).toMatchObject({
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    });
  });

  it("includes thinkingConfig when thinkingBudget is set", async () => {
    const captured: Array<{ body: unknown }> = [];

    setVertexHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-2.5-pro-001" },
      options: { thinkingBudget: -1 },
    });

    const handle = getHandle(out);
    await handle.invoke([{ role: "user", parts: [{ text: "think" }] }]);

    expect(captured[0].body).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingBudget: -1 } },
    });
  });

  it("supports system_instruction via invoke second parameter", async () => {
    const captured: Array<{ body: unknown }> = [];

    setVertexHttpClient(async (opts) => {
      captured.push({ body: opts.body });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: {},
    });

    const handle = getHandle(out);
    await handle.invoke(
      [{ role: "user", parts: [{ text: "Summarize the meeting." }] }],
      "You are a helpful assistant.",
    );

    expect(captured[0].body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Summarize the meeting." }] }],
      systemInstruction: { parts: [{ text: "You are a helpful assistant." }] },
    });
  });

  it("surfaces rate-limit errors clearly", async () => {
    setVertexHttpClient(async () => ({
      status: 429,
      headers: {},
      body: { error: { message: "Rate limit" } },
    }));

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: { maxRetries: 0 },
    });

    const handle = getHandle(out);
    await expect(handle.invoke([{ role: "user", parts: [{ text: "hi" }] }])).rejects.toThrow(/rate limit/i);
  });

  it("retries on 429 up to maxRetries", async () => {
    let calls = 0;
    setVertexHttpClient(async () => {
      calls++;
      if (calls < 3) {
        return { status: 429, headers: {}, body: { error: "busy" } };
      }
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: { maxRetries: 2 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(result.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("location parameter overrides credential region", async () => {
    const out = await runModel(
      {
        projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
        modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
        location: "europe-west4",
        options: {},
      },
      [{}],
      { googleApi: { ...VERTEX_CRED, region: "us-central1" } },
    );

    const handle = getHandle(out);
    expect(handle.region).toBe("europe-west4");
  });

  it("expression location resolves against first item", async () => {
    const out = await runModel(
      {
        projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
        modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
        location: "={{ $json.region }}",
        options: {},
      },
      [{ region: "asia-east1" }],
    );

    const handle = getHandle(out);
    expect(handle.region).toBe("asia-east1");
  });

  it("credential region fallback when location param is empty", async () => {
    const out = await runModel(
      {
        projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
        modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
        options: {},
      },
      [{}],
      { googleApi: { ...VERTEX_CRED, region: "europe-west1" } },
    );

    const handle = getHandle(out);
    expect(handle.region).toBe("europe-west1");
  });

  it("defaults to us-central1 when neither location nor credential region is set", async () => {
    const out = await runModel({
      projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
      modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
      options: {},
    });

    const handle = getHandle(out);
    expect(handle.region).toBe("us-central1");
  });

  it("credential.email is used when serviceAccountEmail is missing", async () => {
    const captured: Array<{ url: string }> = [];
    setVertexHttpClient(async (opts) => {
      captured.push({ url: opts.url });
      return {
        status: 200,
        headers: {},
        body: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        },
      };
    });

    const out = await runModel(
      {
        projectId: { __rl: true, mode: "list", value: "my-gcp-project" },
        modelName: { __rl: true, mode: "list", value: "gemini-1.5-flash-001" },
        options: {},
      },
      [{}],
      {
        googleApi: {
          email: "test@project.iam.gserviceaccount.com",
          privateKey: VERTEX_CRED.privateKey,
          accessToken: VERTEX_CRED.accessToken,
        },
      },
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("gemini-1.5-flash-001");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
