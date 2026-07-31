import { describe, it, expect } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { DataTableAccess } from "@/lib/data-tables/access";
import { dataTableExecutor } from "../../executors/data-table";
import { evaluationTriggerExecutor } from "../../executors/evaluation-trigger";
import { evaluationExecutor } from "../../executors/evaluation";
import type { INode, IWorkflow } from "@/lib/workflow/types";

function makeAccess(seed: Record<string, Record<string, unknown>[]> = {}): DataTableAccess & {
  store: Record<string, Record<string, unknown>[]>;
} {
  const store = { ...seed };
  for (const k of Object.keys(store)) {
    store[k] = store[k].map((r) => ({ ...r }));
  }
  return {
    store,
    async listTables() {
      return Object.keys(store).map((id) => ({ id, name: id }));
    },
    async resolveTable(ref) {
      if (!(ref in store)) return null;
      return { id: ref, name: ref, columns: [] };
    },
    async loadRows(ref) {
      return (store[ref] ?? []).map((r, i) => ({ ...r, _rowId: `r${i}` }));
    },
    async insertRows(ref, rows) {
      if (!store[ref]) store[ref] = [];
      store[ref].push(...rows);
      return rows.length;
    },
    async updateRows(ref, match, fields) {
      const rows = store[ref] ?? [];
      let n = 0;
      for (const row of rows) {
        if (String(row[match.column]) === String(match.value)) {
          Object.assign(row, fields);
          n++;
        }
      }
      return n;
    },
    async deleteRows(ref, match) {
      if (!match) {
        const n = store[ref]?.length ?? 0;
        store[ref] = [];
        return n;
      }
      const before = store[ref] ?? [];
      store[ref] = before.filter((r) => String(r[match.column]) !== String(match.value));
      return before.length - store[ref].length;
    },
    async clearRows(ref) {
      return this.deleteRows(ref);
    },
    async appendOutputRow(ref, fields) {
      if (!store[ref]) store[ref] = [];
      store[ref].push({ ...fields });
    },
  };
}

function ctx(
  type: string,
  params: Record<string, unknown>,
  opts: {
    items?: Array<Record<string, unknown>>;
    dataTables?: DataTableAccess;
    customData?: Record<string, string>;
  } = {},
) {
  const node: INode = {
    id: "n1",
    name: "N",
    type,
    typeVersion: 1,
    position: [0, 0],
    parameters: params,
  };
  const workflow = {
    id: "w1",
    name: "W",
    active: false,
    nodes: [node],
    connections: {},
    versionId: "v1",
    settings: {},
  } as IWorkflow;
  const items = (opts.items ?? [{}]).map((json) => ({ json }));
  return createExecutionContext({
    node,
    workflow,
    getNodeInputItems: () => items,
    continueOnFail: false,
    dataTables: opts.dataTables,
    customData: opts.customData,
  });
}

describe("DataTable store operations", () => {
  it("get reads rows from access", async () => {
    const access = makeAccess({ t1: [{ name: "A" }, { name: "B" }] });
    const out = await dataTableExecutor(
      ctx(
        "n8n-nodes-base.dataTable",
        { operation: "get", dataTableId: { mode: "list", value: "t1" } },
        { dataTables: access },
      ),
      {} as INode,
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("A");
  });

  it("insert writes rows", async () => {
    const access = makeAccess({ t1: [] });
    await dataTableExecutor(
      ctx(
        "n8n-nodes-base.dataTable",
        {
          operation: "insert",
          dataTableId: { mode: "id", value: "t1" },
          mapFromInput: true,
        },
        { items: [{ foo: 1 }], dataTables: access },
      ),
      {} as INode,
    );
    expect(access.store.t1).toEqual([{ foo: 1 }]);
  });

  it("manual still works without access", async () => {
    const out = await dataTableExecutor(
      ctx("n8n-nodes-base.dataTable", {
        operation: "manual",
        tableData: [{ x: 1 }],
      }),
      {} as INode,
    );
    expect(out[0][0].json).toEqual({ x: 1 });
  });
});

describe("Evaluation ↔ Data Tables", () => {
  it("trigger loads from dataTables access", async () => {
    const access = makeAccess({ dt: [{ score: 10 }, { score: 20 }] });
    const out = await evaluationTriggerExecutor(
      ctx(
        "n8n-nodes-base.evaluationTrigger",
        { source: "dataTable", dataTableId: { mode: "list", value: "dt" } },
        { dataTables: access },
      ),
      {} as INode,
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][1].json.score).toBe(20);
  });

  it("trigger falls back to customData", async () => {
    const out = await evaluationTriggerExecutor(
      ctx(
        "n8n-nodes-base.evaluationTrigger",
        { source: "dataTable", dataTableId: { mode: "id", value: "x" } },
        { customData: { __datatable__x: JSON.stringify([{ a: 1 }]) } },
      ),
      {} as INode,
    );
    expect(out[0][0].json).toEqual({ a: 1 });
  });

  it("setOutputs appends via access", async () => {
    const access = makeAccess({ evals: [] });
    await evaluationExecutor(
      ctx(
        "n8n-nodes-base.evaluation",
        {
          operation: "setOutputs",
          source: "dataTable",
          dataTableId: { mode: "list", value: "evals" },
          outputs: { values: [{ name: "score", value: "={{ 99 }}" }] },
        },
        { items: [{}], dataTables: access },
      ),
      {} as INode,
    );
    expect(access.store.evals[0].score).toBe(99);
  });
});
