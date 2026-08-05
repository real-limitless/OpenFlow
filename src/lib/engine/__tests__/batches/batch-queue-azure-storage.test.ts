import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { hmacSha256 } from "../../executors/azureStorage";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.azureStorage";

const SHARED_KEY_CRED = {
  azureStorageSharedKeyApi: {
    account: "testaccount",
    key: "dGVzdEtleQ==",
  },
};

const OAUTH2_CRED = {
  azureStorageOAuth2Api: {
    account: "testaccount",
    accessToken: "test-oauth-token",
  },
};

function fakeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { ...headers },
  });
}

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

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runAzureStorage(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = SHARED_KEY_CRED,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue azureStorage — n8n-nodes-base.azureStorage", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Azure Storage");
  });

  it("hmacSha256 produces a real signature (not placeholder)", () => {
    const sig = hmacSha256("dGVzdEtleQ==", "stringToSign");
    expect(sig).not.toBe("PLACEHOLDER_SHARED_KEY_SIGNATURE");
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
  });

  it("blob create with binary data — returns success metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(201, "", {
          etag: '"0x8D7F123456789AB"',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-request-id": "abc-123",
        }),
      ),
    );

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "create",
        container: { mode: "id", value: "test-container" },
        blobCreate: "test.txt",
        from: "binary",
        binaryPropertyName: "data",
        options: { accessTier: "Hot", blobType: "BlockBlob" },
      },
      [
        {
          json: { fileName: "test.txt" },
          binary: {
            data: {
              data: "SGVsbG8gV29ybGQ=",
              mimeType: "text/plain",
            },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      container: "test-container",
      blobName: "test.txt",
      etag: '"0x8D7F123456789AB"',
      lastModified: "2025-01-01T00:00:00.000Z",
      xMsRequestId: "abc-123",
    });
  });

  it("blob create with sharedKey — Authorization header is SharedKey", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit | undefined) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return fakeResponse(201, "", {
          etag: '"etag"',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-request-id": "req-1",
        });
      }),
    );

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "create",
        container: { mode: "id", value: "test-container" },
        blobCreate: "test.txt",
        from: "binary",
        binaryPropertyName: "data",
        options: { accessTier: "Hot", blobType: "BlockBlob" },
      },
      [
        {
          json: {},
          binary: {
            data: { data: "SGVsbG8gV29ybGQ=", mimeType: "text/plain" },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(capturedHeaders!["Authorization"]).toMatch(/^SharedKey testaccount:/);
    expect(capturedHeaders!["x-ms-blob-type"]).toBe("BlockBlob");
    expect(capturedHeaders!["x-ms-access-tier"]).toBe("Hot");
    expect(capturedHeaders!["Content-Type"]).toBe("text/plain");
  });

  it("blob create with OAuth2 — sends Bearer token", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit | undefined) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return fakeResponse(201, "", {
          etag: '"etag"',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-request-id": "req-1",
        });
      }),
    );

    const out = await runAzureStorage(
      {
        authentication: "oAuth2",
        resource: "blob",
        operation: "create",
        container: { mode: "id", value: "test-container" },
        blobCreate: "test.txt",
        from: "binary",
        binaryPropertyName: "data",
        options: { blobType: "BlockBlob" },
      },
      [
        {
          json: {},
          binary: {
            data: { data: "SGVsbG8gV29ybGQ=", mimeType: "text/plain" },
          },
        },
      ],
      OAUTH2_CRED,
    );

    expect(out[0]).toHaveLength(1);
    expect(capturedHeaders!["Authorization"]).toBe("Bearer test-oauth-token");
  });

  it("blob create with tags and metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(201, "", {
          etag: '"etag"',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-request-id": "req-1",
        }),
      ),
    );

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "create",
        container: { mode: "id", value: "test-container" },
        blobCreate: "test.txt",
        from: "binary",
        binaryPropertyName: "data",
        options: {
          tags: {
            values: [
              { name: "env", value: "test" },
              { name: "owner", value: "dev" },
            ],
          },
          metadata: {
            values: [{ name: "project", value: "openflow" }],
          },
        },
      },
      [
        {
          json: {},
          binary: {
            data: { data: "SGVsbG8gV29ybGQ=", mimeType: "text/plain" },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      container: "test-container",
      blobName: "test.txt",
    });
  });

  it("blob get returns binary data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(200, "fake-image-bytes", {
          "content-type": "image/jpeg",
          "content-length": "12345",
          etag: '"0x8D7FABCDE"',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-request-id": "req-456",
        }),
      ),
    );

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "get",
        container: { mode: "id", value: "my-container" },
        blob: "photo.jpg",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      contentType: "image/jpeg",
      contentLength: "12345",
      etag: '"0x8D7FABCDE"',
      lastModified: "2025-01-01T00:00:00.000Z",
      xMsRequestId: "req-456",
    });
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.data.mimeType).toBe("image/jpeg");
    expect(out[0][0].binary!.data.fileName).toBe("photo.jpg");
    expect(out[0][0].binary!.data.data).toBe("ZmFrZS1pbWFnZS1ieXRlcw==");
  });

  it("blob getAll — parses XML list", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://testaccount.blob.core.windows.net/" ContainerName="logs">
  <Blobs>
    <Blob>
      <Name>2025/01/app.log</Name>
      <Properties>
        <Content-Length>4567</Content-Length>
        <Content-Type>text/plain</Content-Type>
        <Last-Modified>2025-01-01T00:00:00.000Z</Last-Modified>
        <Etag>"0x8D7F..."</Etag>
        <BlobType>BlockBlob</BlobType>
        <AccessTier>Hot</AccessTier>
      </Properties>
    </Blob>
  </Blobs>
</EnumerationResults>`;

    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, xml)));

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "getAll",
        container: { mode: "id", value: "logs" },
        returnAll: true,
        options: { filter: "2025/01/", simplify: true },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const items = out[0][0].json as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "2025/01/app.log",
      contentLength: "4567",
      contentType: "text/plain",
      lastModified: "2025-01-01T00:00:00.000Z",
      blobType: "BlockBlob",
      accessTier: "Hot",
    });
  });

  it("blob delete — returns confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(202, "")));

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "delete",
        container: { mode: "id", value: "test-container" },
        blob: "old-file.txt",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      container: "test-container",
      blobName: "old-file.txt",
      deleted: true,
    });
  });

  it("container create with OAuth2 — returns confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(201, "", {
          etag: '"0x8D7F..."',
          "last-modified": "2025-01-01T00:00:00.000Z",
        }),
      ),
    );

    const out = await runAzureStorage(
      {
        authentication: "oAuth2",
        resource: "container",
        operation: "create",
        containerName: "public-assets",
        options: { accessLevel: "blob" },
      },
      [{}],
      OAUTH2_CRED,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      container: "public-assets",
      created: true,
      etag: '"0x8D7F..."',
      lastModified: "2025-01-01T00:00:00.000Z",
    });
  });

  it("container getAll — parses XML container list", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ServiceEndpoint="https://testaccount.blob.core.windows.net/">
  <Containers>
    <Container>
      <Name>test-container</Name>
      <Properties>
        <Last-Modified>2025-01-01T00:00:00.000Z</Last-Modified>
        <Etag>"0x8D7F..."</Etag>
        <LeaseStatus>unlocked</LeaseStatus>
        <LeaseState>available</LeaseState>
        <PublicAccess>container</PublicAccess>
      </Properties>
    </Container>
  </Containers>
</EnumerationResults>`;

    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, xml)));

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "container",
        operation: "getAll",
        returnAll: false,
        limit: 10,
        options: { filter: "test" },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const items = out[0][0].json as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "test-container",
      lastModified: "2025-01-01T00:00:00.000Z",
      leaseStatus: "unlocked",
      leaseState: "available",
      publicAccess: "container",
    });
  });

  it("container delete — returns confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(202, "")));

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "container",
        operation: "delete",
        container: { mode: "id", value: "old-container" },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      container: "old-container",
      deleted: true,
    });
  });

  it("container get — returns properties", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(200, "", {
          etag: '"0x8D7F..."',
          "last-modified": "2025-01-01T00:00:00.000Z",
          "x-ms-lease-status": "unlocked",
          "x-ms-lease-state": "available",
          "x-ms-blob-public-access": "container",
        }),
      ),
    );

    const out = await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "container",
        operation: "get",
        container: { mode: "id", value: "my-container" },
        options: { simplify: true },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      name: "my-container",
      etag: '"0x8D7F..."',
      lastModified: "2025-01-01T00:00:00.000Z",
      leaseStatus: "unlocked",
      leaseState: "available",
      publicAccess: "container",
      hasImmutabilityPolicy: null,
      hasLegalHold: null,
    });
  });

  it("throws when shared key credential is missing", async () => {
    await expect(
      runAzureStorage(
        {
          authentication: "sharedKey",
          resource: "blob",
          operation: "get",
          container: { mode: "id", value: "c" },
          blob: "f",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/Shared Key/);
  });

  it("throws when OAuth2 credential is missing", async () => {
    await expect(
      runAzureStorage(
        {
          authentication: "oAuth2",
          resource: "blob",
          operation: "get",
          container: { mode: "id", value: "c" },
          blob: "f",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/OAuth2/);
  });

  it("blob getAll with limit sends maxresults query param", async () => {
    let capturedUrl: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return fakeResponse(200, `<?xml version="1.0"?><EnumerationResults><Blobs></Blobs></EnumerationResults>`);
      }),
    );

    await runAzureStorage(
      {
        authentication: "sharedKey",
        resource: "blob",
        operation: "getAll",
        container: { mode: "id", value: "logs" },
        returnAll: false,
        limit: 25,
      },
      [{}],
    );

    expect(capturedUrl).toContain("maxresults=25");
  });
});
