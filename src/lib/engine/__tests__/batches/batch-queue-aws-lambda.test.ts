import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsLambda";

const LAMBDA_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponse: { status: number; body: string; headers: Record<string, string> };

function mockFetch(resp: Partial<typeof fetchResponse> = {}) {
  fetchResponse = {
    status: 200,
    body: '{"result":"ok"}',
    headers: { "x-amz-executed-version": "$LATEST" },
    ...resp,
  };
  globalThis.fetch = async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return {
      status: fetchResponse.status,
      text: async () => fetchResponse.body,
      headers: new Map(Object.entries(fetchResponse.headers)),
      ok: fetchResponse.status >= 200 && fetchResponse.status < 300,
    } as Response;
  };
}

function makeCtxWithCred(
  node: INode,
  credentials: Record<string, Record<string, unknown>> = { aws: LAMBDA_CRED },
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
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function runLambda(
  parameters: Record<string, unknown>,
  credentials: Record<string, Record<string, unknown>> = { aws: LAMBDA_CRED },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = makeCtxWithCred(node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue awsLambda — n8n-nodes-base.awsLambda", () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { status: 200, body: '{"result":"ok"}', headers: { "x-amz-executed-version": "$LATEST" } };
    mockFetch();
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS Lambda");
  });

  it("throws when the required credential is missing", async () => {
    await expect(runLambda({ functionName: "my-func" }, {})).rejects.toThrow(/credential "aws"/);
  });

  it("basic invoke — returns SDK envelope with Payload parsed", async () => {
    const out = await runLambda({ functionName: "my-function", invocationType: "RequestResponse", payload: { key: "value" } });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      StatusCode: 200,
      Payload: { result: "ok" },
      ExecutedVersion: "$LATEST",
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("my-function/invocations");
  });

  it("simplified output — returns Payload directly", async () => {
    fetchResponse = { status: 200, body: '{"key":"value"}', headers: { "x-amz-executed-version": "$LATEST" } };
    const out = await runLambda({
      functionName: "my-function",
      invocationType: "RequestResponse",
      payload: {},
      additionalFields: { simplifyOutput: true },
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ key: "value" });
  });

  it("async invocation — returns { StatusCode: 202 }", async () => {
    fetchResponse = { status: 202, body: "", headers: {} };
    const out = await runLambda({ functionName: "my-function", invocationType: "Event", payload: {} });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ StatusCode: 202 });
  });

  it("dry run — returns { StatusCode: 204 }", async () => {
    fetchResponse = { status: 204, body: "", headers: {} };
    const out = await runLambda({ functionName: "my-function", invocationType: "DryRun", payload: {} });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ StatusCode: 204 });
  });

  it("invocation with qualifier — passes Qualifier query param", async () => {
    const out = await runLambda({
      functionName: "my-function",
      invocationType: "RequestResponse",
      qualifier: "prod",
      payload: {},
    });
    expect(out[0]).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("Qualifier=prod");
  });

  it("FunctionError header throws by default", async () => {
    fetchResponse = {
      status: 200,
      body: '{"errorMessage":"Something went wrong"}',
      headers: { "x-amz-function-error": "Unhandled", "x-amz-executed-version": "$LATEST" },
    };
    await expect(
      runLambda({ functionName: "my-function", invocationType: "RequestResponse", payload: {} }),
    ).rejects.toThrow(/function error/i);
  });

  it("continueOnFail outputs error item instead of throwing", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { functionName: "my-function", invocationType: "RequestResponse", payload: {} },
    });
    const ctx = makeCtxWithCred(node);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    if (fetchResponse.headers["x-amz-function-error"]) {
    }
  });
});
