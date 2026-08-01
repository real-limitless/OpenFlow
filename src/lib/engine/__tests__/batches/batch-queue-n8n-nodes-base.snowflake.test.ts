import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.snowflake";

describe("batch-queue n8n-nodes-base.snowflake — Snowflake", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("executeQuery (basic)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "executeQuery",
        query: "SELECT 1 as test_value"
      },
      [{ json: {} }]
    );
    expect(out[0][0].json).toEqual({ test_value: 1 });
  });

  it("insert (basic)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "insert",
        table: "users",
        columns: "name,age"
      },
      [{ json: { name: "Alice", age: 30 } }]
    );
    expect(out[0][0].json).toHaveProperty("inserted");
  });

  it("update (basic)", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "update",
        table: "users",
        updateKey: "id",
        columns: "name,age",
        documentId: { mode: "id", value: "row-1" }
      },
      [{ json: { id: "row-1", name: "Alice Updated", age: 31 } }]
    );
    expect(out[0][0].json).toHaveProperty("updated");
  });

  it("executeQuery with multiple rows", async () => {
    const out = await runNode(
      TYPE,
      {
        operation: "executeQuery",
        query: "SELECT count as count"
      },
      [{ json: {} }, { json: {} }]
    );
    expect(out[0].length).toBe(2);
  });
});