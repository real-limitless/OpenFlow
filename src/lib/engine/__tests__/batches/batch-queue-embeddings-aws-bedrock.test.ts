import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmbeddingsAwsBedrockHttpClient,
  type EmbeddingsAwsBedrockHandle,
} from "../../executors/embeddings-aws-bedrock";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock";

const AWS_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
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
  credentials: Record<string, Record<string, unknown>> = {
    aws: AWS_CRED,
  },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): EmbeddingsAwsBedrockHandle {
  return out[0][0].json as unknown as EmbeddingsAwsBedrockHandle;
}

function fakeVec(dim: number, seed: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    v.push((seed + i) * 0.001);
  }
  return v;
}

function titanEmbedResponse(embedding: number[]) {
  return {
    status: 200,
    body: { embedding },
  };
}

function cohereEmbedResponse(embeddings: number[][]) {
  return {
    status: 200,
    body: { embeddings },
  };
}

afterEach(() => setEmbeddingsAwsBedrockHttpClient(null));

describe("batch-queue embeddingsAwsBedrock — @n8n/n8n-nodes-langchain.embeddingsAwsBedrock", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Embeddings AWS Bedrock");
  });

  it("builds an embeddings handle with default model", async () => {
    const out = await runModel({});
    const handle = getHandle(out);

    expect(handle.type).toBe(TYPE);
    expect(handle.model).toBe("amazon.titan-embed-text-v2:0");
    expect(handle.region).toBe("us-east-1");
    expect(handle.customEndpoint).toBeNull();
    expect(typeof handle.embedQuery).toBe("function");
    expect(typeof handle.embedDocuments).toBe("function");
  });

  it("resolves model from expression against first item (sub-node rule)", async () => {
    const out = await runModel({ model: "={{ $json.customModel }}" }, [
      { customModel: "cohere.embed-english-v3" },
    ]);
    expect(getHandle(out).model).toBe("cohere.embed-english-v3");
  });

  it("throws when aws credential is missing", async () => {
    await expect(runModel({}, [{}], {})).rejects.toThrow(/credential "aws"/i);
  });

  it("throws when accessKeyId is empty", async () => {
    await expect(
      runModel({}, [{}], { aws: { region: "us-east-1", accessKeyId: "", secretAccessKey: "" } }),
    ).rejects.toThrow(/missing accessKeyId/i);
  });

  it("embedDocuments calls Bedrock InvokeModel once per text with Titan format and returns vectors", async () => {
    const captured: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];

    setEmbeddingsAwsBedrockHttpClient(async (url, opts) => {
      captured.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
      return titanEmbedResponse(fakeVec(1024, captured.length));
    });

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "Bedrock embeddings test"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1024);
    expect(vectors[1]).toHaveLength(1024);

    expect(captured).toHaveLength(2);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toMatch(
      /https:\/\/bedrock-runtime\.us-east-1\.amazonaws\.com\/model\/amazon\.titan-embed-text-v2:0\/invoke/,
    );
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["x-amz-date"]).toBeDefined();
    expect(captured[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);

    const body0 = JSON.parse(captured[0].body);
    expect(body0.inputText).toBe("Hello world");

    const body1 = JSON.parse(captured[1].body);
    expect(body1.inputText).toBe("Bedrock embeddings test");
  });

  it("embedQuery returns a single vector", async () => {
    setEmbeddingsAwsBedrockHttpClient(async () => titanEmbedResponse(fakeVec(1024, 7)));

    const out = await runModel({});
    const handle = getHandle(out);
    const vec = await handle.embedQuery("Hello world");

    expect(vec).toHaveLength(1024);
    expect(vec[0]).toBeCloseTo(0.007, 3);
  });

  it("uses Cohere model formatting when model starts with cohere.", async () => {
    const captured: Array<{ body: string }> = [];

    setEmbeddingsAwsBedrockHttpClient(async (_url, opts) => {
      captured.push({ body: opts.body });
      return cohereEmbedResponse([fakeVec(4096, 1), fakeVec(4096, 2)]);
    });

    const out = await runModel({ model: "cohere.embed-english-v3" });
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments(["Hello world", "Test"]);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(4096);

    const body = JSON.parse(captured[0].body);
    expect(body.texts).toEqual(["Hello world", "Test"]);
    expect(body.input_type).toBe("search_document");
  });

  it("uses custom endpoint when credential has bedrockRuntime custom endpoint", async () => {
    const captured: Array<{ url: string }> = [];

    setEmbeddingsAwsBedrockHttpClient(async (url, _opts) => {
      captured.push({ url });
      return titanEmbedResponse(fakeVec(8, 1));
    });

    const out = await runModel(
      {},
      [{}],
      {
        aws: {
          ...AWS_CRED,
          customEndpoints: {
            bedrockRuntime: "https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com",
          },
        },
      },
    );
    const handle = getHandle(out);
    expect(handle.customEndpoint).toBe(
      "https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com",
    );
    await handle.embedQuery("hi");

    expect(captured[0].url).toMatch(/^https:\/\/my-vpce\.bedrock-runtime/);
  });

  it("assume role: uses awsAssumeRole credential with STS", async () => {
    const callOrder: string[] = [];

    setEmbeddingsAwsBedrockHttpClient(async (url, _opts) => {
      if (url.includes("sts.")) {
        callOrder.push("sts");
        return {
          status: 200,
          body: `<?xml version="1.0"?>
<AssumeRoleResponse>
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIAIOSFODNN7EXAMPLE</AccessKeyId>
      <SecretAccessKey>wJalrXUtnFEMI/K7MDENG/bPxRfiCtempKEY</SecretAccessKey>
      <SessionToken>IQoJb3JpZ2luX2VjEA</SessionToken>
      <Expiration>2099-12-31T23:59:59Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>`,
        };
      }
      callOrder.push("bedrock");
      return titanEmbedResponse(fakeVec(8, 1));
    });

    const assumeRoleCred = {
      region: "us-west-2",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      roleArn: "arn:aws:iam::123456789012:role/bedrock-role",
      externalId: "ext-id-123",
      roleSessionName: "n8n-session",
      stsAccessKeyId: "AKIASTSEXAMPLE",
      stsSecretAccessKey: "stsSecretKeyExample",
    };

    const out = await runModel(
      { authentication: "assumeRole", model: "amazon.titan-embed-text-v2:0" },
      [{}],
      { awsAssumeRole: assumeRoleCred },
    );
    const handle = getHandle(out);
    expect(handle.region).toBe("us-west-2");
    await handle.embedQuery("test");

    expect(callOrder).toEqual(["sts", "bedrock"]);
  });

  it("empty input array returns empty vector list", async () => {
    setEmbeddingsAwsBedrockHttpClient(async () => titanEmbedResponse([]));

    const out = await runModel({});
    const handle = getHandle(out);
    const vectors = await handle.embedDocuments([]);

    expect(vectors).toEqual([]);
  });

  it("surfaces 403 errors clearly", async () => {
    setEmbeddingsAwsBedrockHttpClient(async () => ({
      status: 403,
      body: { message: "Access denied" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/403/i);
  });

  it("surfaces 429 rate-limit errors clearly", async () => {
    setEmbeddingsAwsBedrockHttpClient(async () => ({
      status: 429,
      body: { message: "Throttling" },
    }));

    const out = await runModel({});
    const handle = getHandle(out);
    await expect(handle.embedQuery("hi")).rejects.toThrow(/429/);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("assumeRole: throws when roleArn is missing", async () => {
    await expect(
      runModel(
        { authentication: "assumeRole" },
        [{}],
        {
          awsAssumeRole: {
            region: "us-east-1",
            stsAccessKeyId: "key",
            stsSecretAccessKey: "secret",
          },
        },
      ),
    ).rejects.toThrow(/roleArn/i);
  });
});
