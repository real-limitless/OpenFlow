import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  createFsBinaryStore,
  createS3BinaryStore,
  setBinaryStore,
  storeBinary,
  getBinary,
  getBinaryData,
  getBinaryRefAsync,
  deleteBinary,
  type BinaryStore,
  type BinaryRef,
} from "../binary";

describe("E6 BinaryStore", () => {
  let dir: string;
  let prev: BinaryStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "of-bin-"));
    prev = (await import("../binary")).getBinaryStore();
    setBinaryStore(createFsBinaryStore(dir));
  });

  afterEach(async () => {
    setBinaryStore(prev);
    await rm(dir, { recursive: true, force: true });
  });

  it("FS store round-trips data and metadata across store instances", async () => {
    const ref = await storeBinary(Buffer.from("hello-e6").toString("base64"), {
      mimeType: "text/plain",
      fileName: "hello.txt",
      fileExtension: "txt",
    });

    expect(ref.fileSize).toBe(8);

    // Simulate another worker: fresh FS store, no memory cache
    setBinaryStore(createFsBinaryStore(dir));
    const buf = await getBinary(ref.id);
    expect(buf?.toString("utf8")).toBe("hello-e6");

    const data = await getBinaryData(ref.id);
    expect(data?.mimeType).toBe("text/plain");
    expect(data?.fileName).toBe("hello.txt");
    expect(Buffer.from(data!.data, "base64").toString("utf8")).toBe("hello-e6");

    const meta = await getBinaryRefAsync(ref.id);
    expect(meta?.fileExtension).toBe("txt");

    await deleteBinary(ref.id);
    expect(await getBinary(ref.id)).toBeNull();
  });

  it("S3 store uses mock fetch for put/get/head/delete", async () => {
    const objects = new Map<string, { body: Buffer; headers: Record<string, string> }>();

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const key = url.split("/openflow/binary/")[1] ?? url.split("/").pop()!;

      if (method === "PUT") {
        const body = init?.body
          ? Buffer.from(init.body as ArrayBuffer | Uint8Array)
          : Buffer.alloc(0);
        const headers: Record<string, string> = {};
        const h = init?.headers as Record<string, string>;
        if (h) {
          for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = String(v);
        }
        objects.set(key, { body, headers });
        return new Response(null, { status: 200 });
      }
      if (method === "GET") {
        const obj = objects.get(key);
        if (!obj) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(obj.body), {
          status: 200,
          headers: obj.headers,
        });
      }
      if (method === "HEAD") {
        const obj = objects.get(key);
        if (!obj) return new Response(null, { status: 404 });
        return new Response(null, { status: 200, headers: obj.headers });
      }
      if (method === "DELETE") {
        objects.delete(key);
        return new Response(null, { status: 204 });
      }
      return new Response("no", { status: 400 });
    };

    const s3 = createS3BinaryStore({
      bucket: "openflow",
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true,
      fetchImpl,
    });

    const meta: BinaryRef = {
      id: "abc-123",
      mimeType: "application/pdf",
      fileName: "doc.pdf",
      fileExtension: "pdf",
      fileSize: 4,
    };
    await s3.put("abc-123", Buffer.from("%PDF"), meta);
    expect(objects.has("abc-123")).toBe(true);

    const got = await s3.get("abc-123");
    expect(got?.toString("utf8")).toBe("%PDF");

    const head = await s3.getMeta("abc-123");
    expect(head?.mimeType).toBe("application/pdf");
    expect(head?.fileName).toBe("doc.pdf");

    await s3.delete("abc-123");
    expect(await s3.get("abc-123")).toBeNull();
  });
});
