import { describe, it, expect } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.facebookLeadAdsTrigger";

describe("batch-queue facebookLeadAdsTrigger — n8n-nodes-base.facebookLeadAdsTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Facebook Lead Ads Trigger");
  });

  it("emits a single item from a basic lead event", async () => {
    const payload = {
      entry: [{
        changes: [{
          field: "leadgen",
          value: {
            leadgen_id: "123456789012345",
            created_time: 1700000000,
            page_id: "987654321098765",
            form_id: "111111111111111",
            ad_id: "222222222222222",
            adgroup_id: "333333333333333",
            field_data: [
              { name: "full_name", values: ["Jane Doe"] },
              { name: "email", values: ["jane@example.com"] },
              { name: "phone", values: ["+12223334444"] },
            ],
          },
        }],
      }],
    };

    const out = await runNode(TYPE, {}, [{ json: payload }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      leadgen_id: "123456789012345",
      created_time: 1700000000,
      page_id: "987654321098765",
      form_id: "111111111111111",
      ad_id: "222222222222222",
      adgroup_id: "333333333333333",
      field_data: [
        { name: "full_name", values: ["Jane Doe"] },
        { name: "email", values: ["jane@example.com"] },
        { name: "phone", values: ["+12223334444"] },
      ],
    });
  });

  it("emits multiple items from multiple changes in one entry", async () => {
    const payload = {
      entry: [{
        changes: [
          { field: "leadgen", value: { leadgen_id: "1", field_data: [] } },
          { field: "leadgen", value: { leadgen_id: "2", field_data: [] } },
        ],
      }],
    };

    const out = await runNode(TYPE, {}, [{ json: payload }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ leadgen_id: "1", field_data: [] });
    expect(out[0][1].json).toEqual({ leadgen_id: "2", field_data: [] });
  });

  it("drops non-leadgen changes", async () => {
    const payload = {
      entry: [{
        changes: [
          { field: "some_other_event", value: {} },
        ],
      }],
    };

    const out = await runNode(TYPE, {}, [{ json: payload }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("handles empty entry array gracefully", async () => {
    const out = await runNode(TYPE, {}, [{ json: { entry: [] } }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("handles missing entry field gracefully", async () => {
    const out = await runNode(TYPE, {}, [{ json: {} }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });
});
