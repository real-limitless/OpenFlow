import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wufooTrigger";

describe("batch-queue wufooTrigger — n8n-nodes-base.wufooTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Wufoo Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(getExecutor("nodes-base.wufooTrigger")).toBe(canonical);
  });

  it("emits one item per incoming webhook payload", async () => {
    const out = await runNode(
      TYPE,
      { form: "abc123" },
      [
        {
          EntryId: "12345",
          FormId: "abc123",
          DateCreated: "2025-01-15 10:30:00",
          Field1: "John Doe",
          Field2: "john@example.com",
          Field3: "Product feedback",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      EntryId: "12345",
      FormId: "abc123",
      DateCreated: "2025-01-15 10:30:00",
      Field1: "John Doe",
      Field2: "john@example.com",
      Field3: "Product feedback",
    });
  });

  it("outputs empty item when no input is provided", async () => {
    const out = await runNode(TYPE, { form: "abc123" }, []);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("preserves binary data on the output item", async () => {
    const { runNodeWithCtx } = await import("../helpers");
    const { out } = await runNodeWithCtx(
      TYPE,
      { form: "abc123" },
      [
        {
          json: {
            EntryId: "12345",
            FormId: "abc123",
            DateCreated: "2025-01-15 10:30:00",
            Field1: "John Doe",
          },
          binary: {
            attachment: { data: "dGVzdA==", mimeType: "text/plain", fileName: "test.txt" },
          },
        },
      ],
    );

    expect(out[0][0].binary).toEqual({
      attachment: { data: "dGVzdA==", mimeType: "text/plain", fileName: "test.txt" },
    });
  });
});
