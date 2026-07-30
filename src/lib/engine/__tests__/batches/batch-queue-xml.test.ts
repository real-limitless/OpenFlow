import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.xml";

describe("batch-queue xml — n8n-nodes-base.xml", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("XML");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.xml")).toBe(canonical);
  });

  it("resolves the Parse alias", () => {
    expect(getExecutor("Parse")).toBeDefined();
  });

  it("XML to JSON (basic, default options)", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a>1</a></root>" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ data: { root: { a: { _: "1" } } } });
  });

  it("JSON to XML (basic, default options, headless)", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToxml", dataPropertyName: "data", options: { headless: true } },
      [{ data: { a: "1" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ data: "<root><a>1</a></root>" });
  });

  it("XML to JSON — attributes merged (mergeAttrs default true)", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: '<root id="x"><a>1</a></root>' }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { id: "x", a: { _: "1" } } },
    });
  });

  it("XML to JSON — attributes nested (mergeAttrs false)", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { mergeAttrs: false },
      },
      [{ data: '<root id="x"><a>1</a></root>' }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { $: { id: "x" }, a: { _: "1" } } },
    });
  });

  it("JSON to XML — attributes via attrkey, text via charkey", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToxml", dataPropertyName: "data", options: { headless: true } },
      [{ data: { a: { $: { id: "x" }, _: "1" } } }],
    );
    expect(out[0][0].json).toEqual({ data: '<root><a id="x">1</a></root>' });
  });

  it("preserves other JSON fields on the item", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a>1</a></root>", other: "keep" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: { _: "1" } } },
      other: "keep",
    });
  });

  it("XML to JSON — explicitArray makes children arrays", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { explicitArray: true },
      },
      [{ data: "<root><a>1</a></root>" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: [{ _: "1" }] } },
    });
  });

  it("XML to JSON — repeated children become array without explicitArray", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a>1</a><a>2</a></root>" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: [{ _: "1" }, { _: "2" }] } },
    });
  });

  it("XML to JSON — ignoreAttrs drops attributes", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { ignoreAttrs: true },
      },
      [{ data: '<root id="x"><a>1</a></root>' }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: { _: "1" } } },
    });
  });

  it("XML to JSON — explicitRoot false unwraps root", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { explicitRoot: false },
      },
      [{ data: "<root><a>1</a></root>" }],
    );
    expect(out[0][0].json).toEqual({ data: { a: { _: "1" } } });
  });

  it("XML to JSON — normalizeTags lowercases tag names", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { normalizeTags: true },
      },
      [{ data: "<Root><A>1</A></Root>" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: { _: "1" } } },
    });
  });

  it("JSON to XML — includes XML declaration when not headless", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToxml", dataPropertyName: "data" },
      [{ data: { a: "1" } }],
    );
    expect(out[0][0].json.data).toContain("<?xml");
    expect(out[0][0].json.data).toContain("<root><a>1</a></root>");
  });

  it("JSON to XML — custom rootName", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "jsonToxml",
        dataPropertyName: "data",
        options: { headless: true, rootName: "custom" },
      },
      [{ data: { a: "1" } }],
    );
    expect(out[0][0].json).toEqual({ data: "<custom><a>1</a></custom>" });
  });

  it("JSON to XML — array values produce repeated elements", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToxml", dataPropertyName: "data", options: { headless: true } },
      [{ data: { a: ["1", "2"] } }],
    );
    expect(out[0][0].json).toEqual({ data: "<root><a>1</a><a>2</a></root>" });
  });

  it("JSON to XML — escapes special XML characters", async () => {
    const out = await runNode(
      TYPE,
      { mode: "jsonToxml", dataPropertyName: "data", options: { headless: true } },
      [{ data: { a: "<x>&\"y\"" } }],
    );
    expect(out[0][0].json).toEqual({
      data: "<root><a>&lt;x&gt;&amp;\"y\"</a></root>",
    });
  });

  it("JSON to XML — cdata wraps text needing escaping", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "jsonToxml",
        dataPropertyName: "data",
        options: { headless: true, cdata: true },
      },
      [{ data: { a: "<x>" } }],
    );
    expect(out[0][0].json).toEqual({
      data: "<root><a><![CDATA[<x>]]></a></root>",
    });
  });

  it("XML to JSON — handles self-closing elements", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a/></root>" }],
    );
    expect(out[0][0].json).toEqual({ data: { root: { a: {} } } });
  });

  it("XML to JSON — handles CDATA sections", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a><![CDATA[<b>]]></a></root>" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: { _: "<b>" } } },
    });
  });

  it("XML to JSON — decodes XML entities", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [{ data: "<root><a>1 &amp; 2</a></root>" }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { a: { _: "1 & 2" } } },
    });
  });

  it("XML to JSON — custom attrkey and charkey", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "xmlToJson",
        dataPropertyName: "data",
        options: { attrkey: "@", charkey: "#", mergeAttrs: false },
      },
      [{ data: '<root id="x"><a>1</a></root>' }],
    );
    expect(out[0][0].json).toEqual({
      data: { root: { "@": { id: "x" }, a: { "#": "1" } } },
    });
  });

  it("throws on missing dataPropertyName value", async () => {
    await expect(
      runNode(TYPE, { mode: "xmlToJson", dataPropertyName: "data" }, [{}]),
    ).rejects.toThrow(/missing or undefined/);
  });

  it("throws on non-string for xmlToJson", async () => {
    await expect(
      runNode(
        TYPE,
        { mode: "xmlToJson", dataPropertyName: "data" },
        [{ data: 123 }],
      ),
    ).rejects.toThrow(/must be a string/);
  });

  it("empty input produces empty output", async () => {
    const out = await runNode(
      TYPE,
      { mode: "xmlToJson", dataPropertyName: "data" },
      [],
    );
    expect(out[0]).toEqual([]);
  });
});