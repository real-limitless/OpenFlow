import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";
import * as fs from "node:fs";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.writeBinaryFile";
const TEST_FILE = "/tmp/openflow-test-write-binary.png";
const TEST_FILE_TXT = "/tmp/openflow-test-hello.txt";
const TEST_FILE_APPEND = "/tmp/openflow-test-append.txt";

function binaryItem(base64: string, mimeType = "application/json", fileName?: string): INodeExecutionData {
  const b: INodeExecutionData["binary"] = {
    data: { data: base64, mimeType },
  };
  if (fileName) b!.data.fileName = fileName;
  return { json: {}, binary: b };
}

describe("batch-queue writeBinaryFile — n8n-nodes-base.writeBinaryFile", () => {
  beforeEach(() => {
    for (const f of [TEST_FILE, TEST_FILE_TXT, TEST_FILE_APPEND]) {
      try { fs.unlinkSync(f); } catch { /* ok */ }
    }
  });

  afterEach(() => {
    for (const f of [TEST_FILE, TEST_FILE_TXT, TEST_FILE_APPEND]) {
      try { fs.unlinkSync(f); } catch { /* ok */ }
    }
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Write Binary File");
  });

  it("write binary file to disk (acceptance: write binary file)", async () => {
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const out = await runNode(
      TYPE,
      { fileName: TEST_FILE, dataPropertyName: "myFile" },
      [{
        json: { id: 1 },
        binary: {
          myFile: { data: pngBase64, mimeType: "image/png", fileName: "input.png" },
        },
      }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1 });
    expect(out[0][0].binary?.myFile).toBeDefined();
    expect(fs.existsSync(TEST_FILE)).toBe(true);
    const written = fs.readFileSync(TEST_FILE);
    expect(written.toString("base64")).toBe(pngBase64);
  });

  it("write with default property name (acceptance: default property name)", async () => {
    const out = await runNode(
      TYPE,
      { fileName: TEST_FILE_TXT, dataPropertyName: "data" },
      [{
        json: {},
        binary: {
          data: { data: "SGVsbG8gV29ybGQ=", mimeType: "text/plain" },
        },
      }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(fs.existsSync(TEST_FILE_TXT)).toBe(true);
    const text = fs.readFileSync(TEST_FILE_TXT, "utf-8");
    expect(text).toBe("Hello World");
  });

  it("append to existing file (acceptance: append)", async () => {
    fs.writeFileSync(TEST_FILE_APPEND, "AAA");
    const out = await runNode(
      TYPE,
      { fileName: TEST_FILE_APPEND, dataPropertyName: "data", options: { append: true } },
      [{
        json: {},
        binary: {
          data: { data: "QkJCIFN0cmluZw==", mimeType: "text/plain" },
        },
      }],
    );
    expect(out[0]).toHaveLength(1);
    const content = fs.readFileSync(TEST_FILE_APPEND, "utf-8");
    expect(content).toBe("AAABBB String");
  });

  it("append creates file if missing", async () => {
    const out = await runNode(
      TYPE,
      { fileName: TEST_FILE_APPEND, dataPropertyName: "data", options: { append: true } },
      [{
        json: {},
        binary: {
          data: { data: "SGVsbG8=", mimeType: "text/plain" },
        },
      }],
    );
    expect(out[0]).toHaveLength(1);
    expect(fs.existsSync(TEST_FILE_APPEND)).toBe(true);
    const content = fs.readFileSync(TEST_FILE_APPEND, "utf-8");
    expect(content).toBe("Hello");
  });

  it("missing binary property raises error", async () => {
    await expect(
      runNode(TYPE, { fileName: "/tmp/out.txt", dataPropertyName: "data" }, [{ json: { text: "hello" } }]),
    ).rejects.toThrow("No binary property found");
  });

  it("continueOnFail: passes through item with error field for missing binary", async () => {
    const out = await runNode(
      TYPE,
      { fileName: "/tmp/out.txt", dataPropertyName: "data" },
      [{ json: { text: "hello" } }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("No binary property found");
    expect(out[0][0].json.text).toBe("hello");
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "WriteFile",
          type: TYPE,
          parameters: {
            fileName: TEST_FILE,
            dataPropertyName: "data",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "WriteFile", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {
      pinData: {
        Start: [{ json: {}, binary: { data: { data: "SGVsbG8=", mimeType: "text/plain" } } }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.runData.WriteFile?.status).toBe("success");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.writeBinaryFile")).toBe(canonical);
  });
});