import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dataTableTool";

describe("batch-queue dataTableTool — n8n-nodes-base.dataTableTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Data Table Tool");
  });

  // --- Table lifecycle ---

  it("creates a table with columns", async () => {
    const out = await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "test_table",
      columns: {
        columnValues: [
          { name: "id", type: "Number" },
          { name: "name", type: "String" },
          { name: "active", type: "Boolean" },
          { name: "createdAt", type: "Date" },
        ],
      },
    });
    expect(out[0]).toHaveLength(1);
    const table = out[0][0].json;
    expect(table.name).toBe("test_table");
    expect(table.columns).toHaveLength(4);
    expect(table.id).toBeTruthy();
  });

  it("lists tables after creation", async () => {
    await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "list_test",
      columns: { columnValues: [{ name: "x", type: "String" }] },
    });
    const out = await runNode(TYPE, {
      resource: "table",
      operation: "getMany",
      options: { returnAll: true },
    });
    const tables = out[0];
    const found = tables.some((t) => t.json.name === "list_test");
    expect(found).toBe(true);
  });

  it("updates a table name", async () => {
    const createOut = await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "old_name",
      columns: { columnValues: [{ name: "x", type: "String" }] },
    });
    const tableId = createOut[0][0].json.id;

    const updateOut = await runNode(TYPE, {
      resource: "table",
      operation: "update",
      dataTableId: { mode: "id", value: tableId },
      newName: "new_name",
    });
    expect(updateOut[0][0].json.name).toBe("new_name");
  });

  it("deletes a table", async () => {
    const createOut = await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "delete_me",
      columns: { columnValues: [{ name: "x", type: "String" }] },
    });
    const tableId = createOut[0][0].json.id;

    const deleteOut = await runNode(TYPE, {
      resource: "table",
      operation: "delete",
      dataTableId: { mode: "id", value: tableId },
    });
    expect(deleteOut[0][0].json.name).toBe("delete_me");

    const listOut = await runNode(TYPE, {
      resource: "table",
      operation: "getMany",
      options: { returnAll: true },
    });
    const found = listOut[0].some((t) => t.json.name === "delete_me");
    expect(found).toBe(false);
  });

  // --- Row insert & get ---

  it("inserts rows and retrieves them", async () => {
    const table = (await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "row_test",
      columns: { columnValues: [{ name: "val", type: "Number" }] },
    }))[0][0].json;
    const tableId = table.id;

    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: tableId },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ val: 10 }),
    });
    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: tableId },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ val: 20 }),
    });

    const getOut = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: tableId },
      options: { returnAll: true },
    });
    expect(getOut[0]).toHaveLength(2);
  });

  it("filters rows by condition", async () => {
    const table = (await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "filter_test",
      columns: { columnValues: [{ name: "active", type: "Boolean" }] },
    }))[0][0].json;

    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ active: true }),
    });
    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ active: false }),
    });

    const filtered = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: table.id },
      matchType: "allConditions",
      conditions: {
        conditionValues: [{ keyName: "active", condition: "eq", keyValue: "true" }],
      },
      options: { returnAll: true },
    });
    expect(filtered[0].length).toBeGreaterThanOrEqual(1);
  });

  // --- Row update with conditions ---

  it("updates rows matching condition", async () => {
    const table = (await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "update_cond",
      columns: { columnValues: [{ name: "name", type: "String" }, { name: "active", type: "Boolean" }] },
    }))[0][0].json;

    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ name: "test", active: true }),
    });
    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ name: "other", active: true }),
    });

    await runNode(TYPE, {
      resource: "row",
      operation: "update",
      dataTableId: { mode: "id", value: table.id },
      matchType: "allConditions",
      conditions: {
        conditionValues: [{ keyName: "name", condition: "eq", keyValue: "test" }],
      },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ active: false }),
    });

    const updated = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: table.id },
      matchType: "allConditions",
      conditions: {
        conditionValues: [{ keyName: "active", condition: "eq", keyValue: "false" }],
      },
      options: { returnAll: true },
    });
    expect(updated[0].length).toBeGreaterThanOrEqual(1);
  });

  // --- Upsert ---

  it("upsert creates new row when none matches, updates when exists", async () => {
    const table = (await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "upsert_test",
      columns: { columnValues: [{ name: "id", type: "Number" }, { name: "val", type: "String" }] },
    }))[0][0].json;

    const first = await runNode(TYPE, {
      resource: "row",
      operation: "upsert",
      dataTableId: { mode: "id", value: table.id },
      matchType: "allConditions",
      conditions: {
        conditionValues: [{ keyName: "id", condition: "eq", keyValue: "1" }],
      },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ id: 1, val: "first" }),
    });
    expect(first[0][0].json.val).toBe("first");

    const second = await runNode(TYPE, {
      resource: "row",
      operation: "upsert",
      dataTableId: { mode: "id", value: table.id },
      matchType: "allConditions",
      conditions: {
        conditionValues: [{ keyName: "id", condition: "eq", keyValue: "1" }],
      },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ id: 1, val: "updated" }),
    });
    expect(second[0][0].json.val).toBe("updated");

    const all = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: table.id },
      options: { returnAll: true },
    });
    expect(all[0]).toHaveLength(1);
  });

  // --- Dry run ---

  it("dry-run simulates delete without removing rows", async () => {
    const table = (await runNode(TYPE, {
      resource: "table",
      operation: "create",
      name: "dryrun_test",
      columns: { columnValues: [{ name: "mark", type: "String" }] },
    }))[0][0].json;

    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ mark: "keep" }),
    });
    await runNode(TYPE, {
      resource: "row",
      operation: "insert",
      dataTableId: { mode: "id", value: table.id },
      mappingMode: "defineBelow",
      columns: JSON.stringify({ mark: "remove" }),
    });

    const dryOut = await runNode(TYPE, {
      resource: "row",
      operation: "delete",
      dataTableId: { mode: "id", value: table.id },
      conditions: {
        conditionValues: [{ keyName: "mark", condition: "eq", keyValue: "remove" }],
      },
      options: { dryRun: true },
    });
    expect(dryOut[0].length).toBeGreaterThanOrEqual(1);

    const afterDry = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: table.id },
      options: { returnAll: true },
    });
    expect(afterDry[0]).toHaveLength(2);

    await runNode(TYPE, {
      resource: "row",
      operation: "delete",
      dataTableId: { mode: "id", value: table.id },
      conditions: {
        conditionValues: [{ keyName: "mark", condition: "eq", keyValue: "remove" }],
      },
    });

    const afterReal = await runNode(TYPE, {
      resource: "row",
      operation: "get",
      dataTableId: { mode: "id", value: table.id },
      options: { returnAll: true },
    });
    expect(afterReal[0]).toHaveLength(1);
  });
});
