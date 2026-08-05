import { describe, it, expect } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";
import { makeCtx, makeNode } from "../helpers";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.cheerio";

describe("batch-queue cheerio — n8n-nodes-base.cheerio", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HTML (Cheerio)");
  });

  // -------------------------------------------------------------------------
  // extractHtmlContent (from spec acceptance tests)
  // -------------------------------------------------------------------------

  it("extract text from HTML", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        jsonProperty: "data",
        extractionValues: {
          values: [
            { key: "paragraph", cssSelector: ".content p", returnValue: "text" },
          ],
        },
      },
      [{ data: '<div class="content"><p>Hello world</p></div>' }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: '<div class="content"><p>Hello world</p></div>',
      paragraph: "Hello world",
    });
  });

  it("extract attribute from HTML", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        jsonProperty: "html",
        extractionValues: {
          values: [
            { key: "href", cssSelector: "a", returnValue: "attribute", attributeName: "href" },
          ],
        },
      },
      [{ html: '<a href="/page" class="link">click</a>' }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      html: '<a href="/page" class="link">click</a>',
      href: "/page",
    });
  });

  it("extract with returnArray on multiple matches", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "extractHtmlContent",
        sourceData: "json",
        jsonProperty: "html",
        extractionValues: {
          values: [
            { key: "items", cssSelector: "li", returnValue: "text" },
          ],
        },
        returnArray: true,
      },
      [{ html: "<ul><li>A</li><li>B</li><li>C</li></ul>" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      html: "<ul><li>A</li><li>B</li><li>C</li></ul>",
      items: ["A", "B", "C"],
    });
  });

  // -------------------------------------------------------------------------
  // generateHtmlTemplate (from spec acceptance tests)
  // -------------------------------------------------------------------------

  it("generate HTML template", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "generateHtmlTemplate",
        template: "<h1>Hello {{ $json.name }}</h1>",
      },
      [{ name: "Alice" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      name: "Alice",
      data: "<h1>Hello Alice</h1>",
    });
  });

  // -------------------------------------------------------------------------
  // convertToHtmlTable (from spec acceptance tests)
  // -------------------------------------------------------------------------

  it("convert to HTML table with capitalize headers", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "convertToHtmlTable",
        capitalizeHeaders: true,
      },
      [
        { product: "Widget", price: 9.99 },
        { product: "Gadget", price: 24.99 },
      ],
    );
    expect(out[0]).toHaveLength(1);
    const table = out[0][0].json.data as string;
    expect(table).toContain("Product</th>");
    expect(table).toContain("Price</th>");
    expect(table).toContain("Widget");
    expect(table).toContain("Gadget");
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("throws on unknown operation", async () => {
    await expect(
      runNode(TYPE, { operation: "unknownOp" }, [{}]),
    ).rejects.toThrow(/unknown operation/);
  });

  it("extract throws on missing JSON property", async () => {
    await expect(
      runNode(
        TYPE,
        {
          operation: "extractHtmlContent",
          sourceData: "json",
          jsonProperty: "missing",
          extractionValues: { values: [] },
        },
        [{ other: "val" }],
      ),
    ).rejects.toThrow(/No property named/);
  });

  it("extract with continueOnFail emits error item", async () => {
    const { getExecutorMap } = await import("@/lib/engine/node-runtime");
    const map = getExecutorMap();
    const executor = map[TYPE];
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        operation: "extractHtmlContent",
        sourceData: "json",
        jsonProperty: "missing",
        extractionValues: { values: [] },
      },
    });
    const ctx = makeCtx([{ other: "val" }], node);
    const ctxWithFail = {
      ...ctx,
      continueOnFail: () => true,
    };
    const out = await executor!(ctxWithFail, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
