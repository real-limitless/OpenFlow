import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { initXlsx } from "@/lib/engine/executors/spreadsheet-file";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.spreadsheetFile";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function binItem(
  data: string,
  overrides: { mimeType?: string; fileName?: string } = {},
  json: Record<string, unknown> = {},
) {
  return {
    json,
    binary: {
      data: {
        data: b64(data),
        mimeType: overrides.mimeType ?? "text/plain",
        fileName: overrides.fileName ?? "file.csv",
      },
    },
  };
}

function binItemBase64(
  base64: string,
  overrides: { mimeType?: string; fileName?: string } = {},
  json: Record<string, unknown> = {},
) {
  return {
    json,
    binary: {
      data: {
        data: base64,
        mimeType: overrides.mimeType ?? "application/octet-stream",
        fileName: overrides.fileName ?? "data.xlsx",
      },
    },
  };
}

function decode(bin: { data: string }): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

describe("batch-queue spreadsheet-file — n8n-nodes-base.spreadsheetFile", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Spreadsheet File");
  });

  describe("fromFile (read)", () => {
    it("reads CSV with header row", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { headerRow: true },
        },
        [binItem("name,age\nAlice,30\nBob,25\n")],
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ name: "Alice", age: "30" });
      expect(out[0][1].json).toEqual({ name: "Bob", age: "25" });
    });

    it("reads CSV without header row using numeric keys", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { headerRow: false },
        },
        [binItem("Alice,30\nBob,25\n")],
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ "0": "Alice", "1": "30" });
      expect(out[0][1].json).toEqual({ "0": "Bob", "1": "25" });
    });

    it("skips records with CSV errors when skipRecordsWithErrors is enabled", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: {
            skipRecordsWithErrors: { value: { enabled: true, maxSkippedRecords: 10 } },
          },
        },
        [binItem("a,b\n1,2\n3,broken,extra\n4,5\n")],
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ a: "1", b: "2" });
      expect(out[0][1].json).toEqual({ a: "4", b: "5" });
    });

    it("auto-detects format from file name extension", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "autodetect",
          binaryPropertyName: "data",
          options: { headerRow: true },
        },
        [binItem("x,y\n1,2\n", { fileName: "data.csv" })],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ x: "1", y: "2" });
    });

    it("throws on missing binary property", async () => {
      await expect(
        runNode(TYPE, { operation: "fromFile", binaryPropertyName: "data" }, [{ json: {} }]),
      ).rejects.toThrow("binary property \"data\" is missing");
    });

    it("returns error item on missing binary property with continueOnFail", async () => {
      const out = await runNode(
        TYPE,
        { operation: "fromFile", binaryPropertyName: "data" },
        [{ json: {} }],
        { continueOnFail: true },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.error).toContain("binary property");
    });

    it("reads XLSX with sheet name", async () => {
      await initXlsx();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([
        { col: "val1" },
        { col: "val2" },
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      const xlsxBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "xlsx",
          binaryPropertyName: "data",
          options: { sheetName: "Data", headerRow: true },
        },
        [binItemBase64(xlsxBase64, { fileName: "data.xlsx" })],
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ col: "val1" });
      expect(out[0][1].json).toEqual({ col: "val2" });
    });

    it("throws on unsupported binary formats", async () => {
      await expect(
        runNode(
          TYPE,
          { operation: "fromFile", fileFormat: "pdf", binaryPropertyName: "data" },
          [binItem("fake-content", { fileName: "data.pdf" })],
        ),
      ).rejects.toThrow("unsupported file format");
    });

    it("supports rawData mode", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { rawData: true },
        },
        [binItem("a,b\n1,2\n")],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.format).toBe("csv");
      expect(typeof out[0][0].json.data).toBe("string");
    });

    it("returns empty output on empty CSV", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "fromFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
        },
        [binItem("")],
      );

      expect(out[0]).toHaveLength(0);
    });
  });

  describe("toFile (write)", () => {
    it("writes JSON to CSV", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "toFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { headerRow: true },
        },
        [
          { json: { name: "Alice", age: 30 } },
          { json: { name: "Bob", age: 25 } },
        ],
      );

      expect(out[0]).toHaveLength(2);
      const bin = out[0][0].binary?.data;
      expect(bin).toBeDefined();
      const text = decode(bin!);
      expect(text).toContain("name,age");
      expect(text).toContain("Alice,30");
      expect(text).toContain("Bob,25");
      expect(bin!.mimeType).toBe("text/csv");
      expect(bin!.fileName).toBe("spreadsheet.csv");
    });

    it("writes with custom file name", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "toFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { fileName: "my-data", headerRow: false },
        },
        [{ json: { x: 1 } }],
      );

      const bin = out[0][0].binary?.data;
      expect(bin!.fileName).toBe("my-data.csv");
    });

    it("writes HTML format", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "toFile",
          fileFormat: "html",
          binaryPropertyName: "data",
          options: { headerRow: true },
        },
        [{ json: { a: 1, b: 2 } }],
      );

      const text = decode(out[0][0].binary!.data);
      expect(text).toContain("<table>");
      expect(text).toContain("<th>a</th>");
      expect(text).toContain("<td>1</td>");
    });

    it("writes JSON to XLSX", async () => {
      await initXlsx();
      const out = await runNode(
        TYPE,
        {
          operation: "toFile",
          fileFormat: "xlsx",
          binaryPropertyName: "data",
          options: { headerRow: true, sheetName: "Data" },
        },
        [
          { json: { name: "Alice", age: 30 } },
          { json: { name: "Bob", age: 25 } },
        ],
      );

      expect(out[0]).toHaveLength(2);
      const bin = out[0][0].binary?.data;
      expect(bin).toBeDefined();
      expect(bin!.fileName).toBe("spreadsheet.xlsx");
      expect(bin!.mimeType).toContain("spreadsheetml");
      expect(bin!.fileSize).toBeGreaterThan(0);
    });

    it("writes with custom file name preserving extension", async () => {
      const out = await runNode(
        TYPE,
        {
          operation: "toFile",
          fileFormat: "csv",
          binaryPropertyName: "data",
          options: { fileName: "my-data.csv", headerRow: false },
        },
        [{ json: { x: 1 } }],
      );

      const bin = out[0][0].binary?.data;
      expect(bin!.fileName).toBe("my-data.csv");
    });
  });
});