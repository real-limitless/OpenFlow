import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.webflowTrigger";

const FORM_SUBMISSION_PAYLOAD = {
  name: "Contact Form",
  data: { name: "Jane", email: "jane@example.com" },
  submittedAt: "2025-01-15T12:00:00Z",
  _id: "sub_abc123",
};

const SITE_PUBLISH_PAYLOAD = {
  site: "site_abc123",
  publishedUrl: "https://example.com",
  exportedAt: "2025-01-15T12:00:00Z",
};

describe("batch-queue webflowTrigger — n8n-nodes-base.webflowTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Webflow Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("form submission — wraps payload in _payload with timestamp and _webhook_id", async () => {
    const out = await runNode(
      TYPE,
      { site: "site_abc123", triggerEvents: ["form_submission"] },
      [FORM_SUBMISSION_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._payload).toEqual(FORM_SUBMISSION_PAYLOAD);
    expect(out[0][0].json._webhook_id).toBe("");
    expect(typeof out[0][0].json.timestamp).toBe("number");
  });

  it("site publish — wraps publish payload", async () => {
    const out = await runNode(
      TYPE,
      { site: "site_abc123", triggerEvents: ["site_publish"] },
      [SITE_PUBLISH_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json._payload).toEqual(SITE_PUBLISH_PAYLOAD);
    expect(out[0][0].json._payload.site).toBe("site_abc123");
  });

  it("multiple payloads — each produces one output item", async () => {
    const out = await runNode(
      TYPE,
      { site: "site_abc123", triggerEvents: ["form_submission", "site_publish"] },
      [FORM_SUBMISSION_PAYLOAD, SITE_PUBLISH_PAYLOAD],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json._payload._id).toBe("sub_abc123");
    expect(out[0][1].json._payload.site).toBe("site_abc123");
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { site: "site_abc123", triggerEvents: ["form_submission"] },
      [],
    );
    expect(out).toEqual([[]]);
  });
});