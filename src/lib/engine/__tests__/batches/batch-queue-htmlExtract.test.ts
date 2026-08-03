import { describe, it, expect } from "vitest";
import { runNode } from "../helpers";

describe("n8n-nodes-base.htmlExtract", () => {
  it("should extract text content from HTML elements", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.htmlExtract",
      {
        sourceData: "JSON",
        jsonProperty: "html",
        extractionValues: {
          values: [
            { key: "heading", cssSelector: "h1", returnValue: "Text" },
            { key: "description", cssSelector: "p.desc", returnValue: "Text" },
          ],
        },
      },
      [
        {
          html: '<html><body><h1>Hello World</h1><p class="desc">A description.</p></body></html>',
        },
      ],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json).toMatchObject({
      html: '<html><body><h1>Hello World</h1><p class="desc">A description.</p></body></html>',
      htmlExtract: {
        heading: "Hello World",
        description: "A description.",
      },
    });
  });

  it("should extract attribute values", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.htmlExtract",
      {
        sourceData: "JSON",
        jsonProperty: "page",
        extractionValues: {
          values: [
            { key: "linkHref", cssSelector: "a.nav", returnValue: "Attribute", attribute: "href" },
          ],
        },
      },
      [
        {
          page: '<a href="/home" class="nav">Home</a><a href="/about">About</a>',
        },
      ],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.htmlExtract).toEqual({
      linkHref: "/home",
    });
  });

  it("should return multiple matches as array when returnArray is true", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.htmlExtract",
      {
        sourceData: "JSON",
        jsonProperty: "list",
        extractionValues: {
          values: [
            { key: "items", cssSelector: "li", returnValue: "Text", returnArray: true },
          ],
        },
      },
      [
        {
          list: "<ul><li>A</li><li>B</li><li>C</li></ul>",
        },
      ],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.htmlExtract).toEqual({
      items: ["A", "B", "C"],
    });
  });

  it("should handle binary source data", async () => {
    const base64 = Buffer.from("<html><body><p>Hello</p></body></html>").toString("base64");
    const [output] = await runNode(
      "n8n-nodes-base.htmlExtract",
      {
        sourceData: "Binary",
        inputBinaryField: "myFile",
        extractionValues: {
          values: [
            { key: "par", cssSelector: "p", returnValue: "Text" },
          ],
        },
      },
      [
        {
          json: {},
          binary: {
            myFile: {
              data: base64,
              mimeType: "text/html",
              fileName: "page.html",
            },
          },
        },
      ],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.htmlExtract).toEqual({
      par: "Hello",
    });
  });

  it("should clean up text when option is enabled", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.htmlExtract",
      {
        sourceData: "JSON",
        jsonProperty: "html",
        extractionValues: {
          values: [
            { key: "cleaned", cssSelector: "div", returnValue: "Text" },
          ],
        },
        options: {
          cleanUpText: true,
        },
      },
      [
        {
          html: "<div>  Lots   of   spaces   and\nnewlines  </div>",
        },
      ],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.htmlExtract).toEqual({
      cleaned: "Lots of spaces and newlines",
    });
  });
});
