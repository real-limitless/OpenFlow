import { describe, it, expect, beforeAll } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

beforeAll(() => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();
});

const TYPE = "n8n-nodes-base.mistralAi";

describe("batch-queue mistralAi — n8n-nodes-base.mistralAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Mistral AI");
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "url",
          url: "https://example.com/doc.pdf",
        },
        [{}],
      ),
    ).rejects.toThrow(/mistralCloudApi credential is not configured/);
  });

  it("throws when inputType is binary and no binary property matches", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "binary",
          binaryProperty: "data",
        },
        [{}],
      ),
    ).rejects.toThrow(/No binary data found in property 'data'/);
  });

  it("throws when inputType is binary with wrong property name", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "binary",
          binaryProperty: "nonexistent",
        },
        [{ json: {}, binary: { doc: { mimeType: "application/pdf", data: "pdfdata" } } }],
      ),
    ).rejects.toThrow(/No binary data found in property 'nonexistent'/);
  });

  it("throws when inputType is url and no url param is given", async () => {
    await expect(
      runNode(
        TYPE,
        {
          resource: "document",
          operation: "extractText",
          inputType: "url",
        },
        [{}],
      ),
    ).rejects.toThrow(/Mistral AI: URL is required when inputType is 'url'/);
  });

  it("resolves the executor under the canonical type string", async () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(hasExecutor("nodes-base.mistralAi")).toBe(true);
  });

  it("preserves original json properties in output on error with continueOnFail", async () => {
    const out = await runNode(
      TYPE,
      {
        resource: "document",
        operation: "extractText",
        inputType: "binary",
        binaryProperty: "data",
      },
      [{ json: { fileRef: "invoice" }, binary: {} }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.fileRef).toBe("invoice");
    expect(out[0][0].json.error).toBeDefined();
    expect(out[0][0].json.error).toContain("No binary data found in property 'data'");
  });
});
