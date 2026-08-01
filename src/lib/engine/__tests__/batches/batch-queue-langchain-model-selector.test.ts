import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.modelSelector";

describe("batch-queue langchain modelSelector", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Model Selector");
  });

  it("first-match-wins routing", async () => {
    const out = await runNode(
      TYPE,
      {
        numberInputs: 3,
        rules: {
          rule: [
            {
              conditions: {
                combinator: "and",
                conditions: [
                  {
                    leftValue: "={{ $json.request_type }}",
                    rightValue: "coding",
                    operator: { type: "string", operation: "equals" },
                  },
                ],
              },
            },
            {
              conditions: {
                combinator: "and",
                conditions: [
                  {
                    leftValue: "={{ $json.request_type }}",
                    rightValue: "coding",
                    operator: { type: "string", operation: "equals" },
                  },
                ],
              },
              modelIndex: 2,
            },
          ],
        },
      },
      [{ request_type: "coding" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.selectedModelIndex).toBe(0);
    expect(out[0][0].json.request_type).toBe("coding");
  });

  it("modelIndex omitted defaults to 0", async () => {
    const out = await runNode(
      TYPE,
      {
        numberInputs: 4,
        rules: {
          rule: [
            {
              conditions: {
                combinator: "and",
                conditions: [
                  {
                    leftValue: "={{ $json.request_type }}",
                    rightValue: "general",
                    operator: { type: "string", operation: "equals" },
                  },
                ],
              },
            },
          ],
        },
      },
      [{ request_type: "general" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.selectedModelIndex).toBe(0);
  });

  it("routes to explicit modelIndex 2", async () => {
    const out = await runNode(
      TYPE,
      {
        numberInputs: 4,
        rules: {
          rule: [
            {
              conditions: {
                combinator: "and",
                conditions: [
                  {
                    leftValue: "={{ $json.request_type }}",
                    rightValue: "reasoning",
                    operator: { type: "string", operation: "equals" },
                  },
                ],
              },
              modelIndex: 2,
            },
          ],
        },
      },
      [{ request_type: "reasoning" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.selectedModelIndex).toBe(2);
  });

  it("no matching rule throws error", async () => {
    await expect(
      runNode(
        TYPE,
        {
          numberInputs: 2,
          rules: {
            rule: [
              {
                conditions: {
                  combinator: "and",
                  conditions: [
                    {
                      leftValue: "={{ $json.request_type }}",
                      rightValue: "coding",
                      operator: { type: "string", operation: "equals" },
                    },
                  ],
                },
              },
            ],
          },
        },
        [{ request_type: "greeting" }],
      ),
    ).rejects.toThrow("No matching rule");
  });

  it("modelIndex out of range throws configuration error", async () => {
    await expect(
      runNode(
        TYPE,
        {
          numberInputs: 2,
          rules: {
            rule: [
              {
                conditions: {
                  combinator: "and",
                  conditions: [
                    {
                      leftValue: "={{ $json.request_type }}",
                      rightValue: "coding",
                      operator: { type: "string", operation: "equals" },
                    },
                  ],
                },
                modelIndex: 5,
              },
            ],
          },
        },
        [{ request_type: "coding" }],
      ),
    ).rejects.toThrow("Configuration error: modelIndex 5 is out of range");
  });

  it("evaluates only the first item (sub-node rule)", async () => {
    const inputItems = [
      { request_type: "special" },
      { request_type: "x" },
    ];
    const out = await runNode(
      TYPE,
      {
        numberInputs: 2,
        rules: {
          rule: [
            {
              conditions: {
                combinator: "and",
                conditions: [
                  {
                    leftValue: "={{ $json.request_type }}",
                    rightValue: "special",
                    operator: { type: "string", operation: "equals" },
                  },
                ],
              },
            },
          ],
        },
      },
      inputItems,
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.selectedModelIndex).toBe(0);
    expect(out[0][1].json.selectedModelIndex).toBe(0);
    expect(out[0][0].json.request_type).toBe("special");
    expect(out[0][1].json.request_type).toBe("x");
  });
});
