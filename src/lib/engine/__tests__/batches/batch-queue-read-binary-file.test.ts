import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runNode, assertExecutorRegistered } from "../helpers";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.readBinaryFile";

let tmpDir: string;

function setupTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rbf-test-"));
}

function cleanupDir(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function decode(bin: { data: string }): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

describe("batch-queue read-binary-file — n8n-nodes-base.readBinaryFile", () => {
  beforeEach(() => { tmpDir = setupTmpDir(); });
  afterEach(() => { cleanupDir(tmpDir); });

  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Read Binary File");
  });

  it("reads a single file", async () => {
    const filePath = path.join(tmpDir, "example.txt");
    fs.writeFileSync(filePath, "hello world");

    const out = await runNode(TYPE, {
      filePath,
      dataPropertyName: "data",
    });

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(decode(bin)).toBe("hello world");
    expect(bin.mimeType).toBe("text/plain");
    expect(bin.fileName).toBe("example.txt");
    expect(bin.fileExtension).toBe("txt");
    expect(bin.fileSize).toBe(11);
  });

  it("uses custom binary property name", async () => {
    const filePath = path.join(tmpDir, "report.pdf");
    fs.writeFileSync(filePath, "pdf-content");

    const out = await runNode(TYPE, {
      filePath,
      dataPropertyName: "attachment",
    });

    expect(out[0]).toHaveLength(1);
    const item = out[0][0];
    expect(item.binary!.attachment).toBeDefined();
    expect(item.binary!.data).toBeUndefined();
    expect(decode(item.binary!.attachment)).toBe("pdf-content");
  });

  it("passes through input json per item", async () => {
    const filePath = path.join(tmpDir, "input.csv");
    fs.writeFileSync(filePath, "a,b,c\n1,2,3");

    const out = await runNode(
      TYPE,
      { filePath, dataPropertyName: "data" },
      [{ json: { index: 1 } }, { json: { index: 2 } }],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ index: 1 });
    expect(out[0][1].json).toEqual({ index: 2 });
    expect(decode(out[0][0].binary!.data)).toBe("a,b,c\n1,2,3");
    expect(decode(out[0][1].binary!.data)).toBe("a,b,c\n1,2,3");
  });

  it("surfaces error as item with continueOnFail", async () => {
    const filePath = path.join(tmpDir, "nonexistent.txt");

    const out = await runNode(
      TYPE,
      { filePath, dataPropertyName: "data" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/ENOENT|no such file|nonexistent/);
  });

  it("throws when file not found and continueOnFail is false", async () => {
    await expect(
      runNode(TYPE, {
        filePath: "/nonexistent-file-12345.txt",
        dataPropertyName: "data",
      }),
    ).rejects.toThrow();
  });

  it("throws when filePath parameter is empty", async () => {
    await expect(
      runNode(TYPE, { filePath: "", dataPropertyName: "data" }),
    ).rejects.toThrow(/filePath.*required/);
  });

  it("continueOnFail — mixed success and failure across items", async () => {
    const existingPath = path.join(tmpDir, "exists.txt");
    fs.writeFileSync(existingPath, "data from existing file");

    // filePath is an expression evaluated per item
    const out = await runNode(
      TYPE,
      { filePath: "{{ $json.path }}", dataPropertyName: "data" },
      [{ json: { path: existingPath } }, { json: { path: "/nonexistent-path-xyz.txt" } }],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.path).toBe(existingPath);
    expect(out[0][0].binary!.data).toBeDefined();
    expect(decode(out[0][0].binary!.data)).toBe("data from existing file");
    expect(out[0][1].json.error).toBeDefined();
    expect(out[0][1].json.path).toBe("/nonexistent-path-xyz.txt");
    expect(out[0][1].binary).toBeUndefined();
  });

  it("rejects path outside allowed directories when N8N_RESTRICT_FILE_ACCESS_TO is set", async () => {
    const origEnv = process.env.N8N_RESTRICT_FILE_ACCESS_TO;
    process.env.N8N_RESTRICT_FILE_ACCESS_TO = tmpDir;
    try {
      const outsidePath = "/etc/passwd";
      const out = await runNode(
        TYPE,
        { filePath: outsidePath, dataPropertyName: "data" },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toMatch(/Access denied|outside the allowed directories/);
    } finally {
      if (origEnv === undefined) {
        delete process.env.N8N_RESTRICT_FILE_ACCESS_TO;
      } else {
        process.env.N8N_RESTRICT_FILE_ACCESS_TO = origEnv;
      }
    }
  });

  it("accepts path inside allowed directories", async () => {
    const origEnv = process.env.N8N_RESTRICT_FILE_ACCESS_TO;
    process.env.N8N_RESTRICT_FILE_ACCESS_TO = tmpDir;
    try {
      const filePath = path.join(tmpDir, "allowed.txt");
      fs.writeFileSync(filePath, "allowed content");
      const out = await runNode(
        TYPE,
        { filePath, dataPropertyName: "data" },
        [{}],
      );
      expect(out[0]).toHaveLength(1);
      expect(decode(out[0][0].binary!.data)).toBe("allowed content");
    } finally {
      if (origEnv === undefined) {
        delete process.env.N8N_RESTRICT_FILE_ACCESS_TO;
      } else {
        process.env.N8N_RESTRICT_FILE_ACCESS_TO = origEnv;
      }
    }
  });
});