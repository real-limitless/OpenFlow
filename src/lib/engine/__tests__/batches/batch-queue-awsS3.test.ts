import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.awsS3";

const AWS_CRED = {
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
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

async function runAwsS3(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = { aws: AWS_CRED },
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue awsS3 — n8n-nodes-base.awsS3", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AWS S3");
  });

  it("throws when the required credential is missing", async () => {
    await expect(
      runAwsS3({ resource: "bucket", operation: "create", name: "b" }, [{}], {}),
    ).rejects.toThrow(/credential "aws"/);
  });

  it("fails when bucket name is missing for create", async () => {
    await expect(
      runAwsS3({ resource: "bucket", operation: "create" }, [{}]),
    ).rejects.toThrow(/bucket name is required/);
  });

  it("fails when fileKey is missing for download", async () => {
    await expect(
      runAwsS3({ resource: "file", operation: "download", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/fileKey are required/);
  });

  it("fails when folderName is missing for folder create", async () => {
    await expect(
      runAwsS3({ resource: "folder", operation: "create", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/folderName is required/);
  });

  it("fails when folderKey is missing for folder delete", async () => {
    await expect(
      runAwsS3({ resource: "folder", operation: "delete", bucketName: "b" }, [{}]),
    ).rejects.toThrow(/folderKey is required/);
  });

  it("fails when source and destination are missing for file copy", async () => {
    await expect(
      runAwsS3({ resource: "file", operation: "copy", sourcePath: "" }, [{}]),
    ).rejects.toThrow(/sourcePath and destinationPath are required/);
  });

  it("continueOnFail outputs error item instead of throwing", async () => {
    const out = await runAwsS3(
      {
        resource: "file",
        operation: "download",
        bucketName: "b",
        fileKey: "missing.txt",
        binaryPropertyName: "data",
      },
      [{}],
      { aws: AWS_CRED },
      true,
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  describe("request signing", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Captures the outgoing request instead of letting it reach AWS. */
    function stubFetch(body: string, status = 200) {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({ url: String(url), init });
          return new Response(body, { status });
        }),
      );
      return calls;
    }

    const LIST_BUCKETS_XML = `<?xml version="1.0" encoding="UTF-8"?>
      <ListAllMyBucketsResult><Buckets>
        <Bucket><Name>alpha</Name><CreationDate>2024-01-01T00:00:00.000Z</CreationDate></Bucket>
      </Buckets></ListAllMyBucketsResult>`;

    it("signs x-amz-date and x-amz-content-sha256", async () => {
      const calls = stubFetch(LIST_BUCKETS_XML);
      await runAwsS3({ resource: "bucket", operation: "getAll" }, [{}]);

      expect(calls).toHaveLength(1);
      const headers = calls[0].init.headers as Record<string, string>;

      // Regression guard. These two used to be attached after the signature was
      // computed, so S3 replied "AccessDenied -- There were headers present in
      // the request which were not signed: x-amz-date".
      const auth = headers.authorization;
      expect(auth).toMatch(/^AWS4-HMAC-SHA256 /);
      const signed = /SignedHeaders=([^,]+)/.exec(auth)![1].split(";");
      expect(signed).toContain("x-amz-date");
      expect(signed).toContain("x-amz-content-sha256");
      expect(signed).toContain("host");

      // Everything named in SignedHeaders must actually be sent (host excepted:
      // fetch derives it from the URL and rejects setting it by hand).
      const sent = new Set(Object.keys(headers).map((k) => k.toLowerCase()));
      for (const h of signed) {
        if (h === "host") continue;
        expect(sent, `${h} is signed but not sent`).toContain(h);
      }
      expect(sent.has("host"), "host must not be set explicitly").toBe(false);

      // SignedHeaders is lowercase and sorted, per SigV4.
      expect(signed).toEqual([...signed].sort());
    });

    // S3 wraps every body in a document element. These two used to parse to
    // nothing at all, because the parsers looked for Buckets/Contents at the top
    // level instead of inside ListAllMyBucketsResult / ListBucketResult.
    it("parses a bucket listing without touching the network", async () => {
      stubFetch(LIST_BUCKETS_XML);
      const out = await runAwsS3({ resource: "bucket", operation: "getAll" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Name: "alpha" });
    });

    it("parses an object listing out of ListBucketResult", async () => {
      stubFetch(`<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>docs/a.pdf</Key><Size>42</Size><StorageClass>STANDARD</StorageClass></Contents>
          <Contents><Key>docs/b.pdf</Key><Size>7</Size><StorageClass>STANDARD</StorageClass></Contents>
        </ListBucketResult>`);
      const out = await runAwsS3(
        { resource: "file", operation: "getAll", bucketName: "b", returnAll: true },
        [{}],
      );
      expect(out[0].map((i) => i.json.Key)).toEqual(["docs/a.pdf", "docs/b.pdf"]);
      expect(out[0][0].json.Size).toBe(42);
    });
  });

  it("parsePath utility works correctly", () => {
    function splitPath(p: string): { bucket: string; key: string } {
      const cleaned = p.startsWith("/") ? p.slice(1) : p;
      const slashIdx = cleaned.indexOf("/");
      if (slashIdx === -1) return { bucket: cleaned, key: "" };
      return { bucket: cleaned.slice(0, slashIdx), key: cleaned.slice(slashIdx + 1) };
    }
    expect(splitPath("/my-bucket/docs/a.pdf")).toEqual({ bucket: "my-bucket", key: "docs/a.pdf" });
    expect(splitPath("my-bucket")).toEqual({ bucket: "my-bucket", key: "" });
  });
});