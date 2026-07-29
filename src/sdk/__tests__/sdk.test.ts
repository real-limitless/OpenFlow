import { describe, it, expect } from "vitest";
import {
  createExecutionContext,
  defineNode,
  definitionToExecutor,
  createNodeRegistry,
  withAliases,
  getParam,
} from "@/sdk";
import type { INode } from "@/lib/workflow/types";

const baseNode: INode = {
  id: "1",
  name: "N",
  type: "test",
  typeVersion: 1,
  position: [0, 0],
  parameters: { url: "https://example.com", count: 3 },
};

function ctx(node: INode = baseNode) {
  return createExecutionContext({
    node,
    workflow: {
      id: "w",
      name: "t",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => [{ json: { ok: true } }],
    continueOnFail: false,
  });
}

describe("OpenFlow SDK", () => {
  it("createExecutionContext exposes native helpers", () => {
    const c = ctx();
    expect(c.getParam("url")).toBe("https://example.com");
    expect(c.getParam("missing", "x")).toBe("x");
    expect(c.getInputItems(0)[0].json.ok).toBe(true);
    expect(c.getNode().name).toBe("N");
  });

  it("defineNode + registry produce executors", async () => {
    const def = defineNode({
      type: "openflow.test.echo",
      async execute(c) {
        return [c.getInputItems(0)];
      },
    });
    const reg = createNodeRegistry([def]);
    const exec = reg.toExecutorMap()["openflow.test.echo"];
    const result = await exec(ctx(), baseNode);
    expect(result[0][0].json.ok).toBe(true);
  });

  it("definitionToExecutor wraps execute", async () => {
    const exec = definitionToExecutor(
      defineNode({
        type: "t",
        async execute() {
          return [[{ json: { n: 1 } }]];
        },
      }),
    );
    expect((await exec(ctx(), baseNode))[0][0].json.n).toBe(1);
  });

  it("withAliases maps familiar names", () => {
    const a = withAliases(ctx());
    expect(a.getNodeParameter("url")).toBe("https://example.com");
    expect(a.getInputData(0)[0].json.ok).toBe(true);
    expect(a.native.getParam("count")).toBe(3);
  });

  it("getParam helper works standalone", () => {
    expect(getParam(baseNode, "count")).toBe(3);
  });
});
