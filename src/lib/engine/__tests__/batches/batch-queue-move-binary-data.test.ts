import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.moveBinaryData";

function binaryItem(base64: string, mimeType = "application/json", fileName?: string): INodeExecutionData {
  const b: INodeExecutionData["binary"] = {
    data: { data: base64, mimeType },
  };
  if (fileName) b!.data.fileName = fileName;
  return { json: {}, binary: b };
}

describe("batch-queue moveBinaryData — n8n-nodes-base.moveBinaryData", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Move Binary Data");
  });

  it("binaryToJson: setAllData replaces entire json (acceptance: setAllData)", async () => {
    const out = await runNode(
      TYPE,
      { mode: "binaryToJson", sourceKey: "data", setAllData: true },
      [binaryItem("eyJrZXkiOiAidmFsdWUifQ==")],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ key: "value" });
    expect(out[0][0].binary).toBeUndefined();
  });

  it("binaryToJson: single key with keepSource preserves source binary (acceptance: single key)", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "binaryToJson",
        sourceKey: "data",
        setAllData: false,
        destinationKey: "message",
        options: { keepSource: true },
      },
      [{ json: { existing: true }, binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.existing).toBe(true);
    expect(out[0][0].json.message).toBe("hello");
    expect(out[0][0].binary?.data).toBeDefined();
  });

  it("jsonToBinary: convertAllData with fileName (acceptance: convertAllData)", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "jsonToBinary",
        destinationKey: "data",
        convertAllData: true,
        options: { fileName: "alice.json", mimeType: "application/json" },
      },
      [{ json: { name: "Alice", age: 30 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary!.data.fileName).toBe("alice.json");
    expect(out[0][0].binary!.data.mimeType).toBe("application/json");
    const decoded = Buffer.from(out[0][0].binary!.data.data, "base64").toString("utf8");
    expect(JSON.parse(decoded)).toEqual({ name: "Alice", age: 30 });
  });

  it("jsonToBinary: single key with dataIsBase64 (acceptance: single key keepSource)", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "jsonToBinary",
        sourceKey: "payload",
        destinationKey: "file",
        convertAllData: false,
        options: { keepSource: true, dataIsBase64: true },
      },
      [{ json: { name: "Alice", payload: "SGVsbG8=" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Alice");
    expect(out[0][0].json.payload).toBe("SGVsbG8=");
    expect(out[0][0].binary?.file).toBeDefined();
    const decoded = Buffer.from(out[0][0].binary!.file.data, "base64").toString("utf8");
    expect(decoded).toBe("Hello");
  });

  it("binaryToJson: keepAsBase64 preserves base64 string", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "binaryToJson",
        sourceKey: "data",
        setAllData: false,
        destinationKey: "out",
        options: { keepAsBase64: true },
      },
      [binaryItem("aGVsbG8=", "text/plain")],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.out).toBe("aGVsbG8=");
  });

  it("skips items without required source binary key", async () => {
    const out = await runNode(
      TYPE,
      { mode: "binaryToJson", sourceKey: "missing", setAllData: false, destinationKey: "out" },
      [{ json: {}, binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } } }],
    );
    expect(out[0]).toHaveLength(0);
  });

  it("skips items without required source JSON key", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToBinary", sourceKey: "missing", destinationKey: "data", convertAllData: false },
      [{ json: { name: "Alice" } }],
    );
    expect(out[0]).toHaveLength(0);
  });

  it("throws on unrecognized mode", async () => {
    await expect(
      runNode(TYPE, { mode: "invalidMode" }, [{ json: {} }]),
    ).rejects.toThrow("Unrecognized mode");
  });

  it("continueOnFail: passes through item with error field", async () => {
    const out = await runNode(
      TYPE,
      { mode: "invalidMode" },
      [{ json: { x: 1 } }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Unrecognized mode");
    expect(out[0][0].json.x).toBe(1);
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "MoveBinary",
          type: TYPE,
          parameters: {
            mode: "binaryToJson",
            sourceKey: "data",
            setAllData: true,
          },
        }),
      ],
      {
        Start: { main: [[{ node: "MoveBinary", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.MoveBinary?.status).toBe("success");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.moveBinaryData")).toBe(canonical);
  });
});