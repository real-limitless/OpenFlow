import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

/** Alternate type ids repaired from factory partial jobs — must resolve executors. */
const LEGACY: Array<{ type: string; canonical?: string }> = [
  { type: "n8n-nodes-base.sendEmail", canonical: "n8n-nodes-base.emailSend" },
  { type: "n8n-nodes-base.wordPress", canonical: "n8n-nodes-base.wordpress" },
  { type: "n8n-nodes-base.twistTool", canonical: "n8n-nodes-base.twist" },
  { type: "n8n-nodes-base.microsoftGraphSecurityTool", canonical: "n8n-nodes-base.microsoftGraphSecurity" },
  { type: "n8n-nodes-base.schedule", canonical: "n8n-nodes-base.scheduleTrigger" },
  { type: "n8n-nodes-base.postHog", canonical: "n8n-nodes-base.postHogTool" },
  { type: "n8n-nodes-base.venafiTlsProtectCloud", canonical: "n8n-nodes-base.venafiTlsProtectCloudTool" },
];

describe("batch-queue legacy-type-ids", () => {
  for (const { type, canonical } of LEGACY) {
    it(`${type} is registered as executor + non-placeholder description`, () => {
      expect(hasExecutor(type)).toBe(true);
      const desc = getNodeType(type);
      expect(desc.placeholder).not.toBe(true);
      expect(typeof getExecutor(type)).toBe("function");
      if (canonical) {
        expect(hasExecutor(canonical)).toBe(true);
        expect(getExecutor(type)).toBe(getExecutor(canonical));
      }
    });
  }
});
