import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.outputParserItemList";

type ItemListParserHandle = {
  type: string;
  numberOfItems: number;
  separator: string;
  parse(text: string): string[];
};

function getHandle(out: Awaited<ReturnType<typeof runNode>>): ItemListParserHandle {
  return out[0][0].json as unknown as ItemListParserHandle;
}

describe("batch-queue outputParserItemList — @n8n/n8n-nodes-langchain.outputParserItemList", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Item List Output Parser");
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("wire shape — handle exposes parse function", async () => {
    const out = await runNode(TYPE, { numberOfItems: -1, separator: "\n" });
    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.numberOfItems).toBe(-1);
    expect(handle.separator).toBe("\n");
    expect(typeof handle.parse).toBe("function");
  });

  it("default newline split", async () => {
    const out = await runNode(TYPE, { numberOfItems: -1, separator: "\n" });
    const handle = getHandle(out);
    const result = handle.parse("one\ntwo\nthree");
    expect(result).toEqual(["one", "two", "three"]);
  });

  it("custom separator", async () => {
    const out = await runNode(TYPE, { numberOfItems: -1, separator: ", " });
    const handle = getHandle(out);
    const result = handle.parse("red, green, blue");
    expect(result).toEqual(["red", "green", "blue"]);
  });

  it("capped length", async () => {
    const out = await runNode(TYPE, { numberOfItems: 2, separator: "\n" });
    const handle = getHandle(out);
    const result = handle.parse("a\nb\nc\nd");
    expect(result).toEqual(["a", "b"]);
  });

  it("unlimited length (-1)", async () => {
    const out = await runNode(TYPE, { numberOfItems: -1, separator: "\n" });
    const handle = getHandle(out);
    const result = handle.parse("a\nb\nc");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("fewer items than cap returns all available", async () => {
    const out = await runNode(TYPE, { numberOfItems: 10, separator: "\n" });
    const handle = getHandle(out);
    const result = handle.parse("x\ny");
    expect(result).toEqual(["x", "y"]);
  });

  it("empty text returns array with one empty string", async () => {
    const out = await runNode(TYPE, { numberOfItems: -1, separator: "\n" });
    const handle = getHandle(out);
    const result = handle.parse("");
    expect(result).toEqual([""]);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
