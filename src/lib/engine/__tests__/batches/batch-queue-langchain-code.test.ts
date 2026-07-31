import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.code";

describe("batch-queue langchain-code — @n8n/n8n-nodes-langchain.code", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("LangChain Code");
  });

  it("execute-mode-transform — transforms items via $input.all()", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "execute",
        jsCode: "return $input.all().map(i => ({ json: { greeting: `Hello ${i.json.name}` } }));",
        inputs: ["main"],
        outputs: ["main"],
      },
      [{ json: { name: "Ada" } }, { json: { name: "Grace" } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ greeting: "Hello Ada" });
    expect(out[0][1].json).toEqual({ greeting: "Hello Grace" });
  });

  it("execute-mode-requires-main-output — throws without main output", async () => {
    await expect(
      runNode(
        TYPE,
        {
          mode: "execute",
          jsCode: "return $input.all();",
          inputs: ["main"],
          outputs: ["ai_languageModel"],
        },
        [{ json: { a: 1 } }],
      ),
    ).rejects.toThrow(/main.*output/);
  });

  it("supply-data-mode — uses this.addOutputData()", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "supplyData",
        jsCode:
          "this.addOutputData('ai_document', { document: [{ pageContent: 'hello world', metadata: { source: 'test' } }] }); return [];",
        inputs: [],
        outputs: ["ai_document"],
      },
      [],
    );
    expect(out[0]).toBeDefined();
  });

  it("getInputConnectionData throws documented TODO error", async () => {
    await expect(
      runNode(
        TYPE,
        {
          mode: "supplyData",
          jsCode:
            "const model = this.getInputConnectionData('ai_languageModel', 0); return [];",
          inputs: ["ai_languageModel"],
          outputs: ["ai_chain"],
        },
        [],
      ),
    ).rejects.toThrow(/not implemented/);
  });

  it("supports Promise return type", async () => {
    const out = await runNode(
      TYPE,
      {
        mode: "execute",
        jsCode: "return Promise.resolve($input.all().map(i => ({ json: { n: i.json.x } })));",
        inputs: ["main"],
        outputs: ["main"],
      },
      [{ json: { x: 1 } }, { json: { x: 2 } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.n).toBe(1);
    expect(out[0][1].json.n).toBe(2);
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});