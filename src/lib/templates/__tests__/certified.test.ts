import { describe, expect, it } from "vitest";
import { isCertifiedTemplate } from "../certified";
import { scoreTemplateCompatibility } from "@/server/services/template-compat";

describe("certified templates", () => {
  it("requires the certified source, readyToDemo, and ready executors", () => {
    expect(
      isCertifiedTemplate({
        sourceId: "openflow-certified",
        readyToDemo: true,
        compatibilityLevel: "ready",
      }),
    ).toBe(true);
    expect(
      isCertifiedTemplate({
        sourceId: "openflow-certified",
        readyToDemo: true,
        compatibilityLevel: "partial",
      }),
    ).toBe(false);
    expect(
      isCertifiedTemplate({
        sourceId: "n8n-community",
        readyToDemo: true,
        compatibilityLevel: "ready",
      }),
    ).toBe(false);
  });

  it("HTTP + manual trigger pack is ready (honest badge)", () => {
    const types = ["n8n-nodes-base.manualTrigger", "n8n-nodes-base.httpRequest"];
    expect(scoreTemplateCompatibility(types).level).toBe("ready");
  });
});
