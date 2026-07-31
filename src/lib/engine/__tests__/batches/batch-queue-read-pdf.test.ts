import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.readPDF";

const MINIMAL_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNjUgMDAwMDAgbiAKMDAwMDAwMDEyNCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjIxNgolJUVPRA==";

function binItem(
  data: string,
  mimeType = "application/pdf",
  json: Record<string, unknown> = {},
) {
  return {
    json,
    binary: {
      data: { data, mimeType },
    },
  };
}

describe("batch-queue read-pdf — n8n-nodes-base.readPDF", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Extract from PDF");
  });

  it("extracts text and metadata from a PDF", async () => {
    const out = await runNode(
      TYPE,
      { binaryPropertyName: "data" },
      [binItem(MINIMAL_PDF_B64)],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("text");
    expect(out[0][0].json).toHaveProperty("metadata");
    expect(out[0][0].json).toHaveProperty("numPages");
    expect(out[0][0].json).toHaveProperty("version");
    expect(out[0][0].json.numPages).toBeGreaterThanOrEqual(1);
    expect(typeof out[0][0].json.version).toBe("string");
  });

  it("uses custom binary property name", async () => {
    const item = {
      json: {},
      binary: {
        attachment: { data: MINIMAL_PDF_B64, mimeType: "application/pdf" },
      },
    };
    const out = await runNode(TYPE, { binaryPropertyName: "attachment" }, [item]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("text");
    expect(out[0][0].json.numPages).toBeGreaterThanOrEqual(1);
  });

  it("throws when binary property is missing", async () => {
    await expect(
      runNode(TYPE, { binaryPropertyName: "data" }, [{ json: {} }]),
    ).rejects.toThrow(/binary property "data" is missing/);
  });

  it("throws when binaryPropertyName is empty", async () => {
    await expect(
      runNode(TYPE, { binaryPropertyName: "" }, [binItem(MINIMAL_PDF_B64)]),
    ).rejects.toThrow(/binaryPropertyName is required/);
  });

  it("returns error item on continueOnFail for missing binary", async () => {
    const out = await runNode(
      TYPE,
      { binaryPropertyName: "data" },
      [{ json: {} }],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("missing");
  });

  it("returns error item on continueOnFail for invalid PDF", async () => {
    const invalidB64 = Buffer.from("not a valid pdf").toString("base64");
    const out = await runNode(
      TYPE,
      { binaryPropertyName: "data" },
      [binItem(invalidB64)],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("processes multiple items independently", async () => {
    const out = await runNode(
      TYPE,
      { binaryPropertyName: "data" },
      [binItem(MINIMAL_PDF_B64), binItem(MINIMAL_PDF_B64)],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("text");
    expect(out[0][1].json).toHaveProperty("text");
  });

  it("does not forward input json to output", async () => {
    const out = await runNode(
      TYPE,
      { binaryPropertyName: "data" },
      [binItem(MINIMAL_PDF_B64, "application/pdf", { originalKey: "shouldNotAppear" })],
    );

    expect(out[0][0].json).not.toHaveProperty("originalKey");
  });
});