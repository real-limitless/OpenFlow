import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { gunzipSync, inflateRawSync } from "node:zlib";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.compression";

const HELLO_B64 = "aGVsbG8=";
const WORLD_B64 = "d29ybGQ=";
const HELLO_GZIP_B64 = "H4sIAAAAAAAC/8tIzcnJBwCGphA2BQAAAA==";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
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
  });
}

async function runCompression(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  typeVersion: number = 1.1,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function decodeB64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

function readZipEntries(buf: Buffer): { name: string; data: Buffer }[] {
  const entries: { name: string; data: Buffer }[] = [];
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  expect(eocdOffset).not.toBe(-1);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  let pos = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    let data: Buffer;
    if (method === 0) {
      data = buf.subarray(dataStart, dataStart + uncompressedSize);
    } else if (method === 8) {
      data = inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
    } else {
      throw new Error(`unsupported method ${method}`);
    }
    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("batch-queue compression — n8n-nodes-base.compression", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Compression");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.compression")).toBe(canonical);
  });

  it("compresses to gzip (v1.1)", async () => {
    const out = await runCompression(
      {
        operation: "compress",
        binaryPropertyName: "data",
        outputFormat: "gzip",
        fileName: "data.txt",
        binaryPropertyOutput: "data",
      },
      [
        {
          json: {},
          binary: {
            data: { fileName: "data.txt", data: HELLO_B64, mimeType: "text/plain" },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(bin.fileName).toBe("data.txt");
    expect(bin.mimeType).toBe("application/gzip");
    expect(gunzipSync(decodeB64(bin.data)).toString("utf8")).toBe("hello");
  });

  it("compresses to zip (v1.1)", async () => {
    const out = await runCompression(
      {
        operation: "compress",
        binaryPropertyName: "data",
        outputFormat: "zip",
        fileName: "data.zip",
        binaryPropertyOutput: "data",
      },
      [
        {
          json: {},
          binary: {
            data: {
              fileName: "data",
              data: HELLO_B64,
              mimeType: "application/octet-stream",
            },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(bin.fileName).toBe("data.zip");
    expect(bin.mimeType).toBe("application/zip");
    const entries = readZipEntries(decodeB64(bin.data));
    expect(entries).toHaveLength(1);
    expect(entries[0].data.toString("utf8")).toBe("hello");
  });

  it("compresses multiple fields to zip (multi-field binaryPropertyName)", async () => {
    const out = await runCompression(
      {
        operation: "compress",
        binaryPropertyName: "data,data2",
        outputFormat: "zip",
        fileName: "bundle.zip",
        binaryPropertyOutput: "data",
      },
      [
        {
          json: {},
          binary: {
            data: { fileName: "a.txt", data: HELLO_B64, mimeType: "text/plain" },
            data2: { fileName: "b.txt", data: WORLD_B64, mimeType: "text/plain" },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(bin.fileName).toBe("bundle.zip");
    expect(bin.mimeType).toBe("application/zip");
    const entries = readZipEntries(decodeB64(bin.data));
    expect(entries).toHaveLength(2);
    const contents = entries.map((e) => e.data.toString("utf8")).sort();
    expect(contents).toEqual(["hello", "world"]);
  });

  it("decompresses a gzip archive", async () => {
    const out = await runCompression(
      {
        operation: "decompress",
        binaryPropertyName: "data",
        outputPrefix: "file_",
      },
      [
        {
          json: {},
          binary: {
            data: {
              fileName: "data.gz",
              data: HELLO_GZIP_B64,
              mimeType: "application/gzip",
            },
          },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.file_0;
    expect(bin).toBeDefined();
    expect(decodeB64(bin.data).toString("utf8")).toBe("hello");
  });

  it("throws on unsupported extension when decompressing", async () => {
    await expect(
      runCompression(
        {
          operation: "decompress",
          binaryPropertyName: "data",
          outputPrefix: "file_",
        },
        [
          {
            json: {},
            binary: {
              data: {
                fileName: "data.rar",
                data: "AAAA",
                mimeType: "application/x-rar",
              },
            },
          },
        ],
      ),
    ).rejects.toThrow(/unsupported file extension/i);
  });

  it("empty input produces empty output", async () => {
    const out = await runCompression(
      {
        operation: "compress",
        binaryPropertyName: "data",
        outputFormat: "zip",
        fileName: "data.zip",
        binaryPropertyOutput: "data",
      },
      [],
    );

    expect(out[0]).toEqual([]);
  });

  it("preserves item.json and unrelated binary fields on compress", async () => {
    const out = await runCompression(
      {
        operation: "compress",
        binaryPropertyName: "data",
        outputFormat: "gzip",
        fileName: "data.txt",
        binaryPropertyOutput: "out",
      },
      [
        {
          json: { keepMe: true },
          binary: {
            data: { fileName: "data.txt", data: HELLO_B64, mimeType: "text/plain" },
            other: { fileName: "other.bin", data: WORLD_B64, mimeType: "application/octet-stream" },
          },
        },
      ],
    );

    expect(out[0][0].json).toEqual({ keepMe: true });
    expect(out[0][0].binary!.other).toBeDefined();
    expect(out[0][0].binary!.out).toBeDefined();
    expect(out[0][0].binary!.data).toBeUndefined();
  });

  it("continueOnFail yields error on unsupported extension", async () => {
    const out = await runCompression(
      {
        operation: "decompress",
        binaryPropertyName: "data",
        outputPrefix: "file_",
      },
      [
        {
          json: {},
          binary: {
            data: {
              fileName: "data.rar",
              data: "AAAA",
              mimeType: "application/x-rar",
            },
          },
        },
      ],
      1.1,
      true,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
    expect(String(out[0][0].json.error)).toMatch(/unsupported file extension/i);
  });
});
