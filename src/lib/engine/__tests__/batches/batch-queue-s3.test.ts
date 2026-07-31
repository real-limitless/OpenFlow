import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setS3ClientFactory,
  parseS3Path,
  type S3Client,
  type S3ObjectInfo,
  type S3BucketInfo,
  type S3FolderInfo,
  type S3DownloadResult,
  type S3ListObjectsResult,
} from "../../executors/s3";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.s3";

const S3_CRED = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
  forcePathStyle: true,
  ignoreSSLIssues: false,
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

async function runS3(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = { s3: S3_CRED },
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockClient(impl: Partial<S3Client> = {}): S3Client {
  return {
    createBucket: impl.createBucket ?? (async () => {}),
    deleteBucket: impl.deleteBucket ?? (async () => {}),
    listBuckets: impl.listBuckets ?? (async () => []),
    listObjects:
      impl.listObjects ??
      (async (): Promise<S3ListObjectsResult> => ({ objects: [], folders: [] })),
    putObject: impl.putObject ?? (async () => {}),
    getObject:
      impl.getObject ??
      (async (): Promise<S3DownloadResult> => ({ body: Buffer.alloc(0) })),
    deleteObject: impl.deleteObject ?? (async () => {}),
    copyObject: impl.copyObject ?? (async () => {}),
    close: impl.close ?? (async () => {}),
  };
}

afterEach(() => setS3ClientFactory(null));

describe("batch-queue s3 — n8n-nodes-base.s3", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("S3");
  });

  it("throws when the required credential is missing", async () => {
    setS3ClientFactory(async () => mockClient());
    await expect(
      runS3({ resource: "bucket", operation: "create", name: "b" }, [{}], {}),
    ).rejects.toThrow(/credential "s3"/);
  });

  it("bucket create — returns { success: true }", async () => {
    const created: Array<{ name: string; opts?: Record<string, unknown> }> = [];
    setS3ClientFactory(async () =>
      mockClient({
        createBucket: async (name, options) => {
          created.push({ name, opts: options as Record<string, unknown> });
        },
      }),
    );

    const out = await runS3(
      {
        resource: "bucket",
        operation: "create",
        name: "test-bucket-{{ $json.id }}",
        additionalFields: { acl: "publicRead", region: "us-east-1" },
      },
      [{ id: "42" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(created).toEqual([
      {
        name: "test-bucket-42",
        opts: expect.objectContaining({ acl: "publicRead", region: "us-east-1" }),
      },
    ]);
  });

  it("file upload (binary) — stores at bucket/fileName", async () => {
    const puts: Array<{ bucket: string; key: string; body: Buffer; opts?: Record<string, unknown> }> =
      [];
    setS3ClientFactory(async () =>
      mockClient({
        putObject: async (bucket, key, body, options) => {
          puts.push({ bucket, key, body, opts: options as Record<string, unknown> });
        },
      }),
    );

    const out = await runS3(
      {
        resource: "file",
        operation: "upload",
        bucketName: "my-bucket",
        fileName: "hello.txt",
        binaryData: true,
        binaryPropertyName: "data",
        additionalFields: { acl: "private", storageClass: "standard" },
      },
      [
        {
          json: { id: "doc1" },
          binary: {
            data: {
              mimeType: "text/plain",
              data: "SGVsbG8gV29ybGQ=",
            },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(puts).toHaveLength(1);
    expect(puts[0].bucket).toBe("my-bucket");
    expect(puts[0].key).toBe("hello.txt");
    expect(puts[0].body.toString("utf8")).toBe("Hello World");
    expect(puts[0].opts).toMatchObject({ acl: "private", storageClass: "standard" });
  });

  it("file download — json passthrough + binary field", async () => {
    setS3ClientFactory(async () =>
      mockClient({
        getObject: async () => ({
          body: Buffer.from("%PDF-1.4 mock", "utf8"),
          contentType: "application/pdf",
        }),
      }),
    );

    const out = await runS3(
      {
        resource: "file",
        operation: "download",
        bucketName: "my-bucket",
        fileKey: "documents/{{ $json.fileId }}.pdf",
        binaryPropertyName: "data",
      },
      [{ fileId: "123" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ fileId: "123" });
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(Buffer.from(bin!.data, "base64").toString("utf8")).toBe("%PDF-1.4 mock");
    expect(bin!.fileName).toBe("123.pdf");
    expect(bin!.mimeType).toBe("application/pdf");
  });

  it("file getAll with pagination — returns descriptors", async () => {
    const page1: S3ObjectInfo[] = [
      { key: "subfolder/a.txt", lastModified: "2024-01-01T00:00:00Z", size: 10, eTag: '"a"' },
      { key: "subfolder/b.txt", lastModified: "2024-01-02T00:00:00Z", size: 20, eTag: '"b"' },
    ];
    const page2: S3ObjectInfo[] = [
      {
        key: "subfolder/c.txt",
        lastModified: "2024-01-03T00:00:00Z",
        size: 30,
        eTag: '"c"',
        owner: { id: "o1", displayName: "owner" },
      },
    ];
    let calls = 0;
    setS3ClientFactory(async () =>
      mockClient({
        listObjects: async (_bucket, options) => {
          calls += 1;
          if (calls === 1) {
            return {
              objects: page1,
              isTruncated: true,
              nextContinuationToken: "tok-2",
            };
          }
          expect(options?.continuationToken).toBe("tok-2");
          expect(options?.prefix).toBe("subfolder/");
          expect(options?.fetchOwner).toBe(true);
          return { objects: page2, isTruncated: false };
        },
      }),
    );

    const out = await runS3(
      {
        resource: "file",
        operation: "getAll",
        bucketName: "my-bucket",
        returnAll: true,
        options: { fetchOwner: true, folderKey: "subfolder/" },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({
      key: "subfolder/a.txt",
      lastModified: "2024-01-01T00:00:00Z",
      size: 10,
      eTag: '"a"',
    });
    expect(out[0][2].json).toMatchObject({
      key: "subfolder/c.txt",
      size: 30,
      eTag: '"c"',
      owner: { id: "o1", displayName: "owner" },
    });
  });

  it("folder create — puts zero-byte marker under parent", async () => {
    const puts: Array<{ bucket: string; key: string; body: Buffer }> = [];
    setS3ClientFactory(async () =>
      mockClient({
        putObject: async (bucket, key, body) => {
          puts.push({ bucket, key, body });
        },
      }),
    );

    const out = await runS3(
      {
        resource: "folder",
        operation: "create",
        bucketName: "my-bucket",
        folderName: "new-folder",
        additionalFields: { parentFolderKey: "parent/path/" },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(puts).toEqual([
      { bucket: "my-bucket", key: "parent/path/new-folder/", body: Buffer.alloc(0) },
    ]);
  });

  it("continueOnFail outputs error item instead of throwing", async () => {
    setS3ClientFactory(async () =>
      mockClient({
        getObject: async () => {
          throw new Error("NoSuchKey");
        },
      }),
    );

    const out = await runS3(
      {
        resource: "file",
        operation: "download",
        bucketName: "my-bucket",
        fileKey: "missing.txt",
        binaryPropertyName: "data",
      },
      [{}],
      { s3: S3_CRED },
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ error: "NoSuchKey" });
  });

  it("parseS3Path splits /bucket/key", () => {
    expect(parseS3Path("/my-bucket/docs/a.pdf")).toEqual({
      bucket: "my-bucket",
      key: "docs/a.pdf",
    });
  });

  it("file copy uses source and destination paths", async () => {
    const copies: Array<{
      srcB: string;
      srcK: string;
      dstB: string;
      dstK: string;
    }> = [];
    setS3ClientFactory(async () =>
      mockClient({
        copyObject: async (srcB, srcK, dstB, dstK) => {
          copies.push({ srcB, srcK, dstB, dstK });
        },
      }),
    );

    const out = await runS3(
      {
        resource: "file",
        operation: "copy",
        sourcePath: "/src-bucket/a.txt",
        destinationPath: "/dst-bucket/b.txt",
      },
      [{}],
    );

    expect(out[0][0].json).toEqual({ success: true });
    expect(copies).toEqual([
      { srcB: "src-bucket", srcK: "a.txt", dstB: "dst-bucket", dstK: "b.txt" },
    ]);
  });

  it("bucket getAll respects limit", async () => {
    const buckets: S3BucketInfo[] = [
      { name: "a", creationDate: "2020-01-01" },
      { name: "b", creationDate: "2020-01-02" },
      { name: "c", creationDate: "2020-01-03" },
    ];
    setS3ClientFactory(async () => mockClient({ listBuckets: async () => buckets }));

    const out = await runS3(
      { resource: "bucket", operation: "getAll", returnAll: false, limit: 2 },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("a");
    expect(out[0][1].json.name).toBe("b");
  });

  it("folder getAll returns common-prefix folders", async () => {
    const folders: S3FolderInfo[] = [{ key: "alpha/" }, { key: "beta/" }];
    setS3ClientFactory(async () =>
      mockClient({
        listObjects: async () => ({ objects: [], folders }),
      }),
    );

    const out = await runS3(
      { resource: "folder", operation: "getAll", bucketName: "my-bucket", returnAll: true },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ key: "alpha/" });
    expect(out[0][1].json).toEqual({ key: "beta/" });
  });
});
