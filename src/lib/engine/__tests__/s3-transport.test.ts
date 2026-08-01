import { describe, it, expect, afterEach, vi } from "vitest";
import { defaultS3ClientFactory } from "../executors/s3-transport";

/**
 * Covers the S3 REST/XML layer that the live MinIO runs exercise, without
 * needing a server: request shaping (query params, headers, copy source) and
 * response parsing (ListObjectsV2, ListBuckets, error bodies).
 */

const CRED = {
  endpoint: "http://s3.test",
  region: "us-east-1",
  accessKeyId: "AK",
  secretAccessKey: "SK",
  forcePathStyle: true,
};

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function stubFetch(responder: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init: unknown) => {
    const i = init as { method: string; headers: Record<string, string>; body?: unknown };
    const call = { url: String(url), method: i.method, headers: i.headers, body: i.body };
    calls.push(call);
    return responder(call);
  });
  return calls;
}

const xml = (body: string) => new Response(body, { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("s3-transport request shaping", () => {
  it("sends ListObjectsV2 params as sorted, encoded query", async () => {
    const calls = stubFetch(() => xml("<ListBucketResult></ListBucketResult>"));
    const c = await defaultS3ClientFactory(CRED as never);
    await c.listObjects("bkt", {
      prefix: "a b/",
      delimiter: "/",
      maxKeys: 10,
      startAfter: "x",
      continuationToken: "tok=n",
      fetchOwner: true,
      requesterPays: true,
    });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/bkt/");
    expect(url.searchParams.get("list-type")).toBe("2");
    expect(url.searchParams.get("prefix")).toBe("a b/");
    expect(url.searchParams.get("max-keys")).toBe("10");
    expect(url.searchParams.get("continuation-token")).toBe("tok=n");
    expect(url.searchParams.get("fetch-owner")).toBe("true");
    expect(calls[0].headers["x-amz-request-payer"]).toBe("requester");
    // Signed with the query included.
    expect(calls[0].headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it("omits a location constraint for us-east-1 but sends one elsewhere", async () => {
    const calls = stubFetch(() => xml(""));
    const c = await defaultS3ClientFactory(CRED as never);

    await c.createBucket("b1", { region: "us-east-1" });
    expect(calls[0].body).toBeUndefined();

    await c.createBucket("b2", { region: "eu-west-2" });
    expect(Buffer.from(calls[1].body as Uint8Array).toString()).toContain(
      "<LocationConstraint>eu-west-2</LocationConstraint>",
    );
  });

  it("converts canned ACL names to their S3 kebab form", async () => {
    const calls = stubFetch(() => xml(""));
    const c = await defaultS3ClientFactory(CRED as never);
    await c.createBucket("b", { acl: "publicReadWrite" });
    expect(calls[0].headers["x-amz-acl"]).toBe("public-read-write");

    await c.putObject("b", "k", Buffer.from("x"), { acl: "authenticatedRead" });
    expect(calls[1].headers["x-amz-acl"]).toBe("authenticated-read");
  });

  it("url-encodes the copy source while keeping slashes", async () => {
    const calls = stubFetch(() => xml(""));
    const c = await defaultS3ClientFactory(CRED as never);
    await c.copyObject("src", "dir/a b&c.txt", "dst", "out.txt");
    expect(calls[0].headers["x-amz-copy-source"]).toBe("/src/dir/a%20b%26c.txt");
  });

  it("maps upload options onto x-amz headers", async () => {
    const calls = stubFetch(() => xml(""));
    const c = await defaultS3ClientFactory(CRED as never);
    await c.putObject("b", "k", Buffer.from("x"), {
      contentType: "text/csv",
      storageClass: "glacier",
      tags: { env: "prod", team: "data" },
      metadata: { Origin: "openflow" },
      requesterPays: true,
    });
    const h = calls[0].headers;
    expect(h["content-type"]).toBe("text/csv");
    expect(h["x-amz-storage-class"]).toBe("GLACIER");
    expect(h["x-amz-tagging"]).toBe("env=prod&team=data");
    expect(h["x-amz-meta-origin"]).toBe("openflow");
    expect(h["x-amz-request-payer"]).toBe("requester");
  });
});

describe("s3-transport response parsing", () => {
  it("parses ListObjectsV2 including owner, prefixes and paging", async () => {
    stubFetch(() =>
      xml(`<?xml version="1.0"?>
<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>tok123</NextContinuationToken>
  <Contents>
    <Key>dir/a &amp; b.txt</Key>
    <LastModified>2024-01-02T03:04:05.000Z</LastModified>
    <ETag>&quot;abc123&quot;</ETag>
    <Size>42</Size>
    <StorageClass>STANDARD</StorageClass>
    <Owner><ID>oid</ID><DisplayName>owner</DisplayName></Owner>
  </Contents>
  <CommonPrefixes><Prefix>dir/</Prefix></CommonPrefixes>
  <CommonPrefixes><Prefix>other/</Prefix></CommonPrefixes>
</ListBucketResult>`),
    );
    const c = await defaultS3ClientFactory(CRED as never);
    const res = await c.listObjects("b", {});

    expect(res.isTruncated).toBe(true);
    expect(res.nextContinuationToken).toBe("tok123");
    expect(res.objects).toHaveLength(1);
    expect(res.objects[0]).toEqual({
      key: "dir/a & b.txt",
      lastModified: "2024-01-02T03:04:05.000Z",
      size: 42,
      eTag: "abc123",
      storageClass: "STANDARD",
      owner: { id: "oid", displayName: "owner" },
    });
    expect(res.folders).toEqual([{ key: "dir/" }, { key: "other/" }]);
  });

  it("reports IsTruncated false and no token on a final page", async () => {
    stubFetch(() => xml("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>"));
    const c = await defaultS3ClientFactory(CRED as never);
    const res = await c.listObjects("b", {});
    expect(res.isTruncated).toBe(false);
    expect(res.nextContinuationToken).toBeUndefined();
    expect(res.objects).toEqual([]);
  });

  it("parses ListBuckets", async () => {
    stubFetch(() =>
      xml(`<ListAllMyBucketsResult><Buckets>
        <Bucket><Name>one</Name><CreationDate>2024-01-01T00:00:00.000Z</CreationDate></Bucket>
        <Bucket><Name>two</Name></Bucket>
      </Buckets></ListAllMyBucketsResult>`),
    );
    const c = await defaultS3ClientFactory(CRED as never);
    expect(await c.listBuckets()).toEqual([
      { name: "one", creationDate: "2024-01-01T00:00:00.000Z" },
      { name: "two" },
    ]);
  });

  it("surfaces the S3 error code and message on failure", async () => {
    stubFetch(
      () =>
        new Response(
          "<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>",
          { status: 404 },
        ),
    );
    const c = await defaultS3ClientFactory(CRED as never);
    await expect(c.getObject("nope", "k")).rejects.toThrow(
      /HTTP 404.*NoSuchBucket: The specified bucket does not exist/s,
    );
  });

  it("extracts binary body and user metadata on download", async () => {
    stubFetch(
      () =>
        new Response(Buffer.from([1, 2, 3, 250]), {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": "4",
            etag: '"deadbeef"',
            "x-amz-meta-origin": "openflow",
          },
        }),
    );
    const c = await defaultS3ClientFactory(CRED as never);
    const res = await c.getObject("b", "k");
    expect([...res.body]).toEqual([1, 2, 3, 250]);
    expect(res.contentLength).toBe(4);
    expect(res.eTag).toBe("deadbeef");
    expect(res.metadata).toEqual({ origin: "openflow" });
  });
});
