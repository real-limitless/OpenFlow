import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runNode, assertExecutorRegistered } from "../helpers";
import { createExecutionContext } from "@/sdk";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.readWriteFile";

let tmpDir: string;

function setupTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rwf-test-"));
  return dir;
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function decode(bin: { data: string }): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

describe("batch-queue read-write-file — n8n-nodes-base.readWriteFile", () => {
  beforeEach(() => {
    tmpDir = setupTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Read/Write Files from Disk");
  });

  it("reads a single file", async () => {
    const filePath = path.join(tmpDir, "example.txt");
    fs.writeFileSync(filePath, "hello world");

    const out = await runNode(TYPE, {
      operation: "read",
      fileSelector: filePath,
      options: {},
    });

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(decode(bin)).toBe("hello world");
    expect(bin.mimeType).toBe("text/plain");
    expect(bin.fileName).toBe("example.txt");
    expect(bin.fileExtension).toBe("txt");
    expect(bin.fileSize).toBe(11);
  });

  it("reads multiple files via glob", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "aaa");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "bbb");
    fs.writeFileSync(path.join(tmpDir, "c.log"), "ccc");

    const pattern = path.join(tmpDir, "*.txt").replace(/\\/g, "/");
    const out = await runNode(TYPE, {
      operation: "read",
      fileSelector: pattern,
      options: {},
    });

    expect(out[0]).toHaveLength(2);
    const names = out[0].map((item) => item.binary!.data.fileName).sort();
    expect(names).toEqual(["a.txt", "b.txt"]);
    expect(decode(out[0][0].binary!.data)).toBe("aaa");
  });

  it("reads with custom output field and metadata overrides", async () => {
    const filePath = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(filePath, "pdf-content");

    const out = await runNode(TYPE, {
      operation: "read",
      fileSelector: filePath,
      options: {
        dataPropertyName: "attachment",
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(out[0]).toHaveLength(1);
    const item = out[0][0];
    expect(item.binary!.attachment).toBeDefined();
    expect(item.binary!.data).toBeUndefined();
    expect(item.binary!.attachment.fileName).toBe("invoice.pdf");
    expect(item.binary!.attachment.mimeType).toBe("application/pdf");
  });

  it("writes a file from input binary", async () => {
    const dest = path.join(tmpDir, "out.txt");
    const out = await runNode(
      TYPE,
      {
        operation: "write",
        fileName: dest,
        dataPropertyName: "data",
        options: {},
      },
      [
        {
          json: {},
          binary: {
            data: {
              data: Buffer.from("hello world").toString("base64"),
              mimeType: "text/plain",
              fileName: "example.txt",
            },
          },
        },
      ],
    );

    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello world");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("appends to an existing file when append option is true", async () => {
    const dest = path.join(tmpDir, "log.txt");
    fs.writeFileSync(dest, "line1\n");

    await runNode(
      TYPE,
      {
        operation: "write",
        fileName: dest,
        dataPropertyName: "data",
        options: { append: true },
      },
      [
        {
          json: {},
          binary: {
            data: {
              data: Buffer.from("line2").toString("base64"),
              mimeType: "text/plain",
            },
          },
        },
      ],
    );

    expect(fs.readFileSync(dest, "utf8")).toBe("line1\nline2");
  });

  it("throws when no files match the selector", async () => {
    const pattern = path.join(tmpDir, "nonexistent.*").replace(/\\/g, "/");
    await expect(
      runNode(TYPE, {
        operation: "read",
        fileSelector: pattern,
        options: {},
      }),
    ).rejects.toThrow(/no files matched/);
  });

  it("surfaces error as item with continueOnFail", async () => {
    const pattern = path.join(tmpDir, "nonexistent.*").replace(/\\/g, "/");
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "read",
        fileSelector: pattern,
        options: {},
      },
    });

    const ctx = createExecutionContext({
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
      continueOnFail: true,
    });

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/no files matched/);
  });

  it("throws when write input item is missing the binary field", async () => {
    const dest = path.join(tmpDir, "missing.txt");
    await expect(
      runNode(
        TYPE,
        {
          operation: "write",
          fileName: dest,
          dataPropertyName: "data",
          options: {},
        },
        [{ json: {} }],
      ),
    ).rejects.toThrow(/missing binary field/);
  });

  it("passes through input json on read output", async () => {
    const filePath = path.join(tmpDir, "example.txt");
    fs.writeFileSync(filePath, "hello");

    const out = await runNode(
      TYPE,
      {
        operation: "read",
        fileSelector: filePath,
        options: {},
      },
      [{ source: "test" }],
    );

    expect(out[0][0].json).toEqual({ source: "test" });
  });

  it("throws on unknown operation", async () => {
    await expect(
      runNode(TYPE, { operation: "unknown" }, [{}]),
    ).rejects.toThrow(/unknown operation/);
  });
});