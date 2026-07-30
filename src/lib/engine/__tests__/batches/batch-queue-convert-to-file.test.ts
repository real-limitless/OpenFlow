import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.convertToFile";

function decode(bin: { data: string }): string {
  return Buffer.from(bin.data, "base64").toString("utf8");
}

describe("batch-queue convert-to-file — n8n-nodes-base.convertToFile", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Convert to File");
  });

  it("converts items to CSV", async () => {
    const out = await runNode(TYPE, { operation: "csv", binaryPropertyName: "data" }, [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]);

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    const text = decode(bin!);
    expect(text).toContain("name,age");
    expect(text).toContain("Alice,30");
    expect(text).toContain("Bob,25");
    expect(bin!.mimeType).toBe("text/csv");
    expect(bin!.fileExtension).toBe("csv");
  });

  it("quotes CSV values containing commas", async () => {
    const out = await runNode(TYPE, { operation: "csv" }, [
      { text: "hello, world" },
    ]);

    const text = decode(out[0][0].binary!.data);
    expect(text).toContain('"hello, world"');
  });

  it("converts items to a single JSON file", async () => {
    const out = await runNode(TYPE, { operation: "toJson" }, [
      { id: 1 },
      { id: 2 },
    ]);

    expect(out[0]).toHaveLength(1);
    const text = decode(out[0][0].binary!.data);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual([{ id: 1 }, { id: 2 }]);
    expect(out[0][0].binary!.data.mimeType).toBe("application/json");
  });

  it("converts items to multiple JSON files when multipleFiles is true", async () => {
    const out = await runNode(TYPE, {
      operation: "toJson",
      options: { multipleFiles: true },
    }, [
      { id: 1 },
      { id: 2 },
    ]);

    expect(out[0]).toHaveLength(2);
    expect(JSON.parse(decode(out[0][0].binary!.data))).toEqual({ id: 1 });
    expect(JSON.parse(decode(out[0][1].binary!.data))).toEqual({ id: 2 });
  });

  it("converts a field to a text file per item", async () => {
    const out = await runNode(TYPE, {
      operation: "toText",
      options: { fieldName: "message" },
    }, [
      { message: "hello" },
      { message: "world" },
    ]);

    expect(out[0]).toHaveLength(2);
    expect(decode(out[0][0].binary!.data)).toBe("hello");
    expect(decode(out[0][1].binary!.data)).toBe("world");
  });

  it("throws when toText field is missing", async () => {
    await expect(
      runNode(TYPE, { operation: "toText", options: { fieldName: "missing" } }, [
        { other: "x" },
      ]),
    ).rejects.toThrow(/field "missing"/);
  });

  it("decodes base64 string to binary (toBinary)", async () => {
    const out = await runNode(TYPE, {
      operation: "toBinary",
      options: { fieldName: "raw", fileExtension: "txt", mimeType: "text/plain" },
    }, [
      { raw: "aGVsbG8=" },
    ]);

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary!.data;
    expect(decode(bin)).toBe("hello");
    expect(bin.mimeType).toBe("text/plain");
    expect(bin.fileExtension).toBe("txt");
  });

  it("converts items to an HTML table", async () => {
    const out = await runNode(TYPE, { operation: "html" }, [
      { a: 1, b: 2 },
    ]);

    const text = decode(out[0][0].binary!.data);
    expect(text).toContain("<table>");
    expect(text).toContain("<th>a</th>");
    expect(text).toContain("<th>b</th>");
    expect(text).toContain("<td>1</td>");
    expect(text).toContain("<td>2</td>");
    expect(out[0][0].binary!.data.mimeType).toBe("text/html");
  });

  it("converts items to RTF", async () => {
    const out = await runNode(TYPE, { operation: "rtf" }, [
      { name: "Alice" },
    ]);

    const text = decode(out[0][0].binary!.data);
    expect(text).toContain("{\\rtf1");
    expect(text).toContain("Alice");
  });

  it("converts items to ICS events", async () => {
    const out = await runNode(TYPE, {
      operation: "iCal",
      options: {
        eventTitle: "Meeting",
        eventStart: "2026-01-15T10:00:00Z",
        eventEnd: "2026-01-15T11:00:00Z",
      },
    }, [
      { title: "Meeting" },
    ]);

    expect(out[0]).toHaveLength(1);
    const text = decode(out[0][0].binary!.data);
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain("SUMMARY:Meeting");
    expect(text).toContain("DTSTART:20260115T100000Z");
    expect(out[0][0].binary!.data.fileExtension).toBe("ics");
  });

  it("throws on unsupported spreadsheet operations", async () => {
    await expect(
      runNode(TYPE, { operation: "xlsx" }, [{ a: 1 }]),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("throws on unknown operation", async () => {
    await expect(
      runNode(TYPE, { operation: "unknown" }, [{}]),
    ).rejects.toThrow(/unknown operation/);
  });

  it("preserves input json on output items", async () => {
    const out = await runNode(TYPE, { operation: "csv" }, [
      { name: "Alice", age: 30 },
    ]);

    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
  });

  it("handles empty input items", async () => {
    const out = await runNode(TYPE, { operation: "csv" }, []);

    expect(out[0]).toHaveLength(1);
    const text = decode(out[0][0].binary!.data);
    expect(text).toBe("\n");
  });
});