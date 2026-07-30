import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.html";

describe("batch-queue html — n8n-nodes-base.html", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HTML");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.html")).toBe(canonical);
  });

  // -------------------------------------------------------------------------
  // generateHtmlTemplate
  // -------------------------------------------------------------------------

  it("generate HTML template with expression", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "generateHtmlTemplate",
        html: "<p>Hello {{ $json.name }}!</p>",
      },
      [{ name: "Ada" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ html: "<p>Hello Ada!</p>" });
  });

  it("generate HTML template preserves <style> and <script> blocks verbatim", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "generateHtmlTemplate",
        html:
          "<style>.x { color: red; }</style><p>{{ $json.name }}</p><script>var x = 1;</script>",
      },
      [{ name: "Ada" }],
    );
    expect(out[0][0].json.html).toContain("<style>.x { color: red; }</style>");
    expect(out[0][0].json.html).toContain("<script>var x = 1;</script>");
    expect(out[0][0].json.html).toContain("<p>Ada</p>");
  });

  it("generate HTML template outputs one item per input item", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "generateHtmlTemplate",
        html: "<p>{{ $json.name }}</p>",
      },
      [{ name: "Ada" }, { name: "Grace" }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ html: "<p>Ada</p>" });
    expect(out[0][1].json).toEqual({ html: "<p>Grace</p>" });
  });

  // -------------------------------------------------------------------------
  // extractHtmlContent
  // -------------------------------------------------------------------------

  it("extract text content from JSON (v1.2, returnArray)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            { key: "price", cssSelector: "p", returnValue: "text", returnArray: true },
          ],
        },
        options: { trimValues: true, cleanUpText: true },
      },
      [{ data: "<div><p>Price: $10</p><p>Old: $20</p></div>" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ price: ["Price: $10", "Old: $20"] });
  });

  it("extract attribute (single value)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            {
              key: "url",
              cssSelector: "a",
              returnValue: "attribute",
              attribute: "href",
              returnArray: false,
            },
          ],
        },
        options: {},
      },
      [{ data: '<a href="https://example.com" class="link">link</a>' }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ url: "https://example.com" });
  });

  it("extract html (inner HTML)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            { key: "inner", cssSelector: "div", returnValue: "html", returnArray: false },
          ],
        },
        options: {},
      },
      [{ data: "<div><p>Hello</p></div>" }],
    );
    expect(out[0][0].json.inner).toBe("<p>Hello</p>");
  });

  it("extract value from <input>", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            { key: "val", cssSelector: "input", returnValue: "value", returnArray: false },
          ],
        },
        options: {},
      },
      [{ data: '<input type="text" value="test123">' }],
    );
    expect(out[0][0].json.val).toBe("test123");
  });

  it("extract from binary field (v1.2)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "binary",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            { key: "heading", cssSelector: "h1", returnValue: "text", returnArray: false },
          ],
        },
        options: {},
      },
      [
        {
          json: {},
          binary: {
            data: { data: "PGgxPlRpdGxlPC9oMT4=", mimeType: "text/html" },
          },
        },
      ],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ heading: "Title" });
  });

  it("extract with dot-notation dataPropertyName", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "nested.html",
        extractionValues: {
          values: [
            { key: "t", cssSelector: "p", returnValue: "text", returnArray: false },
          ],
        },
        options: {},
      },
      [{ nested: { html: "<p>deep</p>" } }],
    );
    expect(out[0][0].json).toEqual({ t: "deep" });
  });

  it("extract with array of HTML strings produces one output per string", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            { key: "t", cssSelector: "p", returnValue: "text", returnArray: false },
          ],
        },
        options: {},
      },
      [{ data: ["<p>first</p>", "<p>second</p>"] }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ t: "first" });
    expect(out[0][1].json).toEqual({ t: "second" });
  });

  it("extract with skipSelectors skips matching elements in text", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "data",
        extractionValues: {
          values: [
            {
              key: "t",
              cssSelector: "div",
              returnValue: "text",
              returnArray: false,
              skipSelectors: "span",
            },
          ],
        },
        options: {},
      },
      [{ data: "<div>keep<span>skip</span></div>" }],
    );
    expect(out[0][0].json.t).toBe("keep");
  });

  it("extract throws on missing JSON property", async () => {
    await expect(
      runNode(
        TYPE,
        {
          operation: "extractHtmlContent",
          sourceData: "json",
          dataPropertyName: "missing",
          extractionValues: { values: [] },
          options: {},
        },
        [{ other: "val" }],
      ),
    ).rejects.toThrow(/No property named/);
  });

  it("extract with continueOnFail emits error item", async () => {
    const { makeCtx, makeNode } = await import("../helpers");
    const { getExecutorMap } = await import("@/lib/engine/node-runtime");
    const map = getExecutorMap();
    const executor = map[TYPE];
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "extractHtmlContent",
        sourceData: "json",
        dataPropertyName: "missing",
        extractionValues: { values: [] },
        options: {},
      },
    });
    const ctx = makeCtx([{ other: "val" }], node);
    // Override continueOnFail to true
    const ctxWithFail = {
      ...ctx,
      continueOnFail: () => true,
    };
    const out = await executor(ctxWithFail, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  // -------------------------------------------------------------------------
  // convertToHtmlTable
  // -------------------------------------------------------------------------

  it("convert to HTML table (capitalize + boolean)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: { capitalize: true, customStyling: true },
      },
      [
        { first_name: "Ada", active: true },
        { first_name: "Grace", active: false },
      ],
    );
    expect(out[0]).toHaveLength(1);
    const table = out[0][0].json.table as string;
    expect(table).toContain("<th>First Name</th>");
    expect(table).toContain("<tr>");
    expect(table).toContain('<input type="checkbox" checked="checked"/>');
    expect(table).toContain('<input type="checkbox" />');
  });

  it("convert to HTML table applies default styling when customStyling is off", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: {},
      },
      [{ a: "1" }],
    );
    const table = out[0][0].json.table as string;
    expect(table).toContain('style="border-collapse: collapse;"');
    expect(table).toContain("border: 1px solid black;");
  });

  it("convert to HTML table with caption", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: { customStyling: true, caption: "My Caption" },
      },
      [{ a: "1" }],
    );
    const table = out[0][0].json.table as string;
    expect(table).toContain("<caption>My Caption</caption>");
  });

  it("convert to HTML table with table/header attributes", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: {
          customStyling: true,
          tableAttributes: 'id="t1"',
          headerAttributes: 'class="h"',
        },
      },
      [{ a: "1" }],
    );
    const table = out[0][0].json.table as string;
    expect(table).toContain('id="t1"');
    expect(table).toContain('class="h"');
  });

  it("convert to HTML table collects union of keys as headers", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: { customStyling: true },
      },
      [{ a: "1" }, { b: "2" }],
    );
    const table = out[0][0].json.table as string;
    expect(table).toContain("<th>a</th>");
    expect(table).toContain("<th>b</th>");
  });

  it("convert to HTML table on empty input produces no output", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: {},
      },
      [],
    );
    expect(out[0]).toEqual([]);
  });

  it("convert to HTML table escapes HTML in cell values", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        options: { customStyling: true },
      },
      [{ a: "<script>" }],
    );
    const table = out[0][0].json.table as string;
    expect(table).toContain("&lt;script&gt;");
    expect(table).not.toContain("<script>");
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("throws on unknown operation", async () => {
    await expect(
      runNode(
        TYPE,
        { operation: "unknownOp" },
        [{}],
      ),
    ).rejects.toThrow(/unknown operation/);
  });

  it("defaults to generateHtmlTemplate when operation is omitted", async () => {
    const out = await runNode(
      TYPE,
      { html: "<p>{{ $json.name }}</p>" },
      [{ name: "Ada" }],
    );
    expect(out[0][0].json).toEqual({ html: "<p>Ada</p>" });
  });
});