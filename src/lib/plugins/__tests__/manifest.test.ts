import { describe, expect, it } from "vitest";
import {
  BUILTIN_PLUGINS,
  assertSafeNodeType,
  helloPlugin,
  validatePluginManifest,
} from "../manifest";
import { defineNode } from "@/sdk";

describe("plugin allowlist", () => {
  it("rejects n8n-nodes-* types", () => {
    expect(() => assertSafeNodeType("n8n-nodes-base.httpRequest")).toThrow(/n8n-nodes/);
    expect(() => assertSafeNodeType("n8n-nodes-langchain.agent")).toThrow(/n8n-nodes/);
  });

  it("accepts the builtin hello plugin on the openflow publisher", () => {
    const p = validatePluginManifest(helloPlugin(), ["openflow"]);
    expect(p.id).toBe("openflow.hello");
    expect(p.nodes[0]?.type).toBe("openflow-plugin.hello");
    expect(BUILTIN_PLUGINS).toHaveLength(1);
  });

  it("rejects an unknown publisher", () => {
    const p = helloPlugin();
    p.publisher = "untrusted";
    expect(() => validatePluginManifest(p, ["openflow"])).toThrow(/allowlist/);
  });

  it("rejects a defineNode that uses a forbidden type", () => {
    const bad = defineNode({
      type: "n8n-nodes-base.fake",
      async execute(ctx) {
        return [ctx.getInputItems(0)];
      },
    });
    expect(() =>
      validatePluginManifest(
        {
          id: "evil",
          publisher: "openflow",
          version: "1",
          displayName: "evil",
          nodes: [bad],
        },
        ["openflow"],
      ),
    ).toThrow(/n8n-nodes/);
  });
});
