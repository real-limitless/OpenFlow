import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setBedrockHttpClient, type BedrockModelHandle } from "../../executors/lm-chat-aws-bedrock";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.lmChatAwsBedrock";

const AWS_CRED = {
  region: "us-east-1",
  accessKeyId: "AKID",
  secretAccessKey: "secret",
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
  credentials: Record<string, Record<string, unknown>> = { aws: AWS_CRED },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): BedrockModelHandle {
  return out[0][0].json as unknown as BedrockModelHandle;
}

describe("batch-queue lmChatAwsBedrock — @n8n/n8n-nodes-langchain.lmChatAwsBedrock", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS Bedrock Chat Model");
  });

  it("builds a model handle with model + options (wire shape)", async () => {
    const out = await runModel({
      authentication: "aws",
      model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
      options: { maxTokens: 1024, temperature: 0.7 },
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("anthropic.claude-sonnet-4-20250514");
    expect(handle.authentication).toBe("aws");
    expect(handle.region).toBe("us-east-1");
    expect(handle.options).toMatchObject({ maxTokens: 1024, temperature: 0.7 });
    expect(typeof handle.invoke).toBe("function");
  });

  it("resolves model id from expression against first item (sub-node rule)", async () => {
    const out = await runModel(
      {
        authentication: "aws",
        model: { __rl: true, mode: "id", value: "={{ $json.bedrock_model }}" },
        options: { temperature: 0.2 },
      },
      [{ bedrock_model: "meta.llama3-2-11b-instruct-v1:0" }],
    );

    const handle = getHandle(out);
    expect(handle.model).toBe("meta.llama3-2-11b-instruct-v1:0");
    expect(handle.authentication).toBe("aws");
  });

  it("includes guardrail config in options when set", async () => {
    const out = await runModel({
      authentication: "aws",
      model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
      options: {
        guardrail: {
          guardrailIdentifier: "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
          guardrailVersion: "1",
        },
      },
    });

    const handle = getHandle(out);
    expect(handle.options.guardrail).toMatchObject({
      guardrailIdentifier: "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
      guardrailVersion: "1",
    });
  });

  it("handles awsAssumeRole authentication with sts creds", async () => {
    let callCount = 0;
    let stsUrl = "";
    let converseUrl = "";

    setBedrockHttpClient(async (opts) => {
      callCount++;
      if (callCount === 1) {
        stsUrl = opts.url;
        return {
          status: 200,
          headers: {},
          body: `<?xml version="1.0" encoding="UTF-8"?>
<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <AssumedRoleUser>
      <AssumedRoleId>AROAXYZ:test-session</AssumedRoleId>
      <Arn>arn:aws:sts::123456789012:assumed-role/test-role/test-session</Arn>
    </AssumedRoleUser>
    <Credentials>
      <AccessKeyId>TEMP_AKID</AccessKeyId>
      <SecretAccessKey>TEMP_SECRET</SecretAccessKey>
      <SessionToken>TEMP_SESSION_TOKEN</SessionToken>
      <Expiration>2026-12-31T23:59:59Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>`,
        };
      }
      converseUrl = opts.url;
      return { status: 200, headers: {}, body: { output: { message: { content: [{ text: "ok" }] } }, usage: {} } };
    });

    const assumeCred = {
      region: "us-west-2",
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      externalId: "ext-id-123",
      stsAccessKeyId: "STS_AKID",
      stsSecretAccessKey: "STS_SECRET",
    };

    const out = await runModel(
      {
        authentication: "awsAssumeRole",
        model: { __rl: true, mode: "list", value: "amazon.nova-pro-v1:0" },
        options: {},
      },
      [{}],
      { awsAssumeRole: assumeCred },
    );

    const handle = getHandle(out);
    expect(handle.authentication).toBe("awsAssumeRole");
    expect(handle.region).toBe("us-west-2");
    expect(handle.model).toBe("amazon.nova-pro-v1:0");
    expect(handle.accessKeyId).toBe("TEMP_AKID");
    expect(handle.sessionToken).toBe("TEMP_SESSION_TOKEN");
    expect(stsUrl).toContain("sts.us-west-2.amazonaws.com");
    expect(stsUrl).toContain("Action=AssumeRole");
    expect(stsUrl).toContain("RoleArn=arn%3Aaws%3Aiam%3A%3A123456789012%3Arole%2Ftest-role");
    expect(stsUrl).toContain("ExternalId=ext-id-123");

    const result = await handle.invoke([{ role: "user", content: "Hello" }]);
    expect(result.text).toBe("ok");
    expect(converseUrl).toContain("model/amazon.nova-pro-v1%3A0/converse");

    setBedrockHttpClient(null);
  });

  it("passes custom endpoint from credential", async () => {
    const credWithEndpoint = {
      ...AWS_CRED,
      customEndpoints: {
        bedrockRuntimeEndpoint: "https://bedrock-runtime.vpce.amazonaws.com",
      },
    };

    const out = await runModel(
      {
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {},
      },
      [{}],
      { aws: credWithEndpoint },
    );

    const handle = getHandle(out);
    expect(handle.customEndpoint).toBe("https://bedrock-runtime.vpce.amazonaws.com");
  });

  it("fails with missing model id", async () => {
    await expect(
      runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "" },
        options: {},
      }),
    ).rejects.toThrow("model id is required");
  });

  it("fails with missing credential", async () => {
    await expect(
      runModel(
        {
          authentication: "aws",
          model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
          options: {},
        },
        [{}],
        {},
      ),
    ).rejects.toThrow('Credential "aws" is not configured');
  });

  it("fails with missing region in credential", async () => {
    await expect(
      runModel(
        {
          authentication: "aws",
          model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
          options: {},
        },
        [{}],
        { aws: { accessKeyId: "AKID", secretAccessKey: "secret" } },
      ),
    ).rejects.toThrow('credential "aws" is missing region');
  });

  describe("invoke with http override", () => {
    afterEach(() => {
      setBedrockHttpClient(null);
    });

    it("sends Converse request with inferenceConfig", async () => {
      let capturedUrl = "";
      let capturedBody: unknown;

      setBedrockHttpClient(async (opts) => {
        capturedUrl = opts.url;
        capturedBody = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
        return {
          status: 200,
          headers: {},
          body: {
            output: { message: { content: [{ text: "Hello from Bedrock" }] } },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        };
      });

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: { maxTokens: 1024, temperature: 0.7 },
      });

      const handle = getHandle(out);
      const result = await handle.invoke([{ role: "user", content: "Hello" }]);

      expect(capturedUrl).toContain("bedrock-runtime.us-east-1.amazonaws.com");
      expect(capturedUrl).toContain("model/anthropic.claude-sonnet-4-20250514/converse");
      expect(capturedBody).toMatchObject({
        inferenceConfig: { maxTokens: 1024, temperature: 0.7 },
        messages: [{ role: "user", content: [{ text: "Hello" }] }],
      });
      expect(capturedBody).not.toHaveProperty("modelId");
      expect(result.text).toBe("Hello from Bedrock");
      expect(result.model).toBe("anthropic.claude-sonnet-4-20250514");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    });

    it("includes guardrailConfig in Converse body", async () => {
      let capturedBody: unknown;

      setBedrockHttpClient(async (opts) => {
        capturedBody = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
        return { status: 200, headers: {}, body: { output: { message: { content: [{ text: "ok" }] } }, usage: {} } };
      });

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {
          guardrail: {
            guardrailIdentifier: "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
            guardrailVersion: "1",
            trace: "Enabled",
          },
        },
      });

      const handle = getHandle(out);
      await handle.invoke([{ role: "user", content: "Hi" }]);

      expect(capturedBody).toMatchObject({
        guardrailConfig: {
          guardrailIdentifier: "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
          guardrailVersion: "1",
          trace: "Enabled",
        },
      });
    });

    it("returns blocked message on guardrail intervention", async () => {
      setBedrockHttpClient(async () => ({
        status: 200,
        headers: {},
        body: {
          guardrailAction: "INTERVENED",
          output: {},
          usage: {},
        },
      }));

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {
          guardrail: {
            guardrailIdentifier: "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
            guardrailVersion: "1",
          },
        },
      });

      const handle = getHandle(out);
      const result = await handle.invoke([{ role: "user", content: "bad input" }]);
      expect(result.text).toContain("blocked");
    });

    it("uses custom endpoint when set", async () => {
      let capturedUrl = "";

      setBedrockHttpClient(async (opts) => {
        capturedUrl = opts.url;
        return { status: 200, headers: {}, body: { output: { message: { content: [{ text: "ok" }] } }, usage: {} } };
      });

      const out = await runModel(
        {
          authentication: "aws",
          model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
          options: {},
        },
        [{}],
        {
          aws: {
            ...AWS_CRED,
            customEndpoints: { bedrockRuntimeEndpoint: "https://bedrock-runtime.vpce.amazonaws.com" },
          },
        },
      );

      const handle = getHandle(out);
      await handle.invoke([{ role: "user", content: "Hi" }]);
      expect(capturedUrl).toContain("bedrock-runtime.vpce.amazonaws.com");
      expect(capturedUrl).toContain("model/anthropic.claude-sonnet-4-20250514/converse");
    });

    it("maps system messages to Converse system array", async () => {
      let capturedBody: unknown;

      setBedrockHttpClient(async (opts) => {
        capturedBody = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
        return { status: 200, headers: {}, body: { output: { message: { content: [{ text: "ok" }] } }, usage: {} } };
      });

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {},
      });

      const handle = getHandle(out);
      await handle.invoke([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ]);

      expect(capturedBody).toMatchObject({
        system: [{ text: "You are a helpful assistant." }],
        messages: [{ role: "user", content: [{ text: "Hello" }] }],
      });
    });

    it("retries on 429 and 500", async () => {
      let attempts = 0;

      setBedrockHttpClient(async () => {
        attempts++;
        if (attempts <= 2) {
          return { status: 429, headers: {}, body: "rate limited" };
        }
        return { status: 200, headers: {}, body: { output: { message: { content: [{ text: "ok" }] } }, usage: {} } };
      });

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {},
      });

      const handle = getHandle(out);
      const result = await handle.invoke([{ role: "user", content: "Hi" }]);
      expect(result.text).toBe("ok");
      expect(attempts).toBe(3);
    });

    it("fails after exhausting retries", async () => {
      setBedrockHttpClient(async () => ({
        status: 500,
        headers: {},
        body: "server error",
      }));

      const out = await runModel({
        authentication: "aws",
        model: { __rl: true, mode: "list", value: "anthropic.claude-sonnet-4-20250514" },
        options: {},
      });

      const handle = getHandle(out);
      await expect(handle.invoke([{ role: "user", content: "Hi" }])).rejects.toThrow(
        "AWS Bedrock API error",
      );
    });
  });
});
