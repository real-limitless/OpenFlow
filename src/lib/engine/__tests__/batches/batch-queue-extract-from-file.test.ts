import { describe, it, expect } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.extractFromFile";

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function binItem(data: string, mimeType = "text/plain", json: Record<string, unknown> = {}) {
  return {
    json,
    binary: {
      data: { data: b64(data), mimeType },
    },
  };
}

describe("batch-queue extract-from-file — n8n-nodes-base.extractFromFile", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Extract from File");
  });

  it("extracts CSV with header row", async () => {
    const out = await runNode(TYPE, { operation: "csv", binaryPropertyName: "data" }, [
      binItem("name,age\nAlice,30\nBob,25\n", "text/csv"),
    ]);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ name: "Alice", age: "30" });
    expect(out[0][1].json).toEqual({ name: "Bob", age: "25" });
  });

  it("extracts CSV without header row", async () => {
    const out = await runNode(TYPE, {
      operation: "csv",
      options: { headerRow: false },
    }, [
      binItem("Alice,30\nBob,25\n", "text/csv"),
    ]);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ column_0: "Alice", column_1: "30" });
  });

  it("handles CSV values with commas in quotes", async () => {
    const out = await runNode(TYPE, { operation: "csv" }, [
      binItem('name,note\nAlice,"hello, world"\n', "text/csv"),
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ name: "Alice", note: "hello, world" });
  });

  it("extracts JSON array", async () => {
    const out = await runNode(TYPE, { operation: "toJson" }, [
      binItem('[{"id":1},{"id":2}]', "application/json"),
    ]);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: 1 });
    expect(out[0][1].json).toEqual({ id: 2 });
  });

  it("extracts JSON single object", async () => {
    const out = await runNode(TYPE, { operation: "toJson" }, [
      binItem('{"id":42}', "application/json"),
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 42 });
  });

  it("extracts text to a field per item", async () => {
    const out = await runNode(TYPE, {
      operation: "toText",
      options: { fieldName: "content" },
    }, [
      binItem("hello", "text/plain", { id: 1 }),
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, content: "hello" });
  });

  it("extracts ICS events", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:1@example",
      "SUMMARY:Test Event",
      "DTSTART:20260101T090000Z",
      "DTEND:20260101T100000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const out = await runNode(TYPE, { operation: "iCal" }, [
      binItem(ics, "text/calendar"),
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Test Event");
    expect(out[0][0].json.start).toBe("20260101T090000Z");
    expect(out[0][0].json.end).toBe("20260101T100000Z");
  });

  it("extracts HTML table", async () => {
    const html = "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>";
    const out = await runNode(TYPE, { operation: "html" }, [
      binItem(html, "text/html"),
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ a: "1", b: "2" });
  });

  it("throws when binary property is missing", async () => {
    await expect(
      runNode(TYPE, { operation: "csv" }, [{ json: {} }]),
    ).rejects.toThrow(/binary property "data" is missing/);
  });

  it("throws on unsupported spreadsheet operations", async () => {
    await expect(
      runNode(TYPE, { operation: "xlsx" }, [binItem("x", "application/octet-stream")]),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("throws on unknown operation", async () => {
    await expect(
      runNode(TYPE, { operation: "unknown" }, [binItem("x")]),
    ).rejects.toThrow(/unknown operation/);
  });

  it("throws on invalid JSON for toJson", async () => {
    await expect(
      runNode(TYPE, { operation: "toJson" }, [binItem("not json{", "application/json")]),
    ).rejects.toThrow();
  });

  it("handles custom binary property name", async () => {
    const item = {
      json: {},
      binary: {
        myFile: { data: b64("a,b\n1,2\n"), mimeType: "text/csv" },
      },
    };
    const out = await runNode(TYPE, { operation: "csv", binaryPropertyName: "myFile" }, [item]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ a: "1", b: "2" });
  });
});