import { prisma } from "../db";
import {
  newColumnId,
  parseColumns,
  parseRowData,
  projectRowData,
  type DataTableColumn,
} from "@/lib/data-tables/types";
import type {
  DataTableAccess,
  DataTableRef,
  LoadRowsOptions,
} from "@/lib/data-tables/access";

function cellEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  return String(a) === String(b);
}

function rowToNamed(
  data: Record<string, unknown>,
  columns: DataTableColumn[],
  rowId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { _rowId: rowId };
  for (const col of columns) {
    out[col.name] = data[col.id] ?? null;
  }
  return out;
}

function namedToIds(
  fields: Record<string, unknown>,
  columns: DataTableColumn[],
): Record<string, unknown> {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "_rowId") continue;
    const col = byName.get(key) ?? byId.get(key);
    if (col) out[col.id] = value;
  }
  return out;
}

function findColumn(columns: DataTableColumn[], nameOrId: string): DataTableColumn | undefined {
  return columns.find((c) => c.name === nameOrId || c.id === nameOrId);
}

async function resolveOwned(userId: string, ref: string): Promise<DataTableRef | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const row =
    (await prisma.dataTable.findFirst({ where: { userId, id: trimmed } })) ??
    (await prisma.dataTable.findFirst({ where: { userId, name: trimmed } }));
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    columns: parseColumns(row.columns),
  };
}

export function dataTableAccessForUser(userId: string): DataTableAccess {
  return {
    async listTables() {
      const tables = await prisma.dataTable.findMany({
        where: { userId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return tables;
    },

    async resolveTable(ref) {
      return resolveOwned(userId, ref);
    },

    async loadRows(ref, opts: LoadRowsOptions = {}) {
      const table = await resolveOwned(userId, ref);
      if (!table) return [];

      const rows = await prisma.dataTableRow.findMany({
        where: { tableId: table.id },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });

      let named = rows.map((r) => rowToNamed(parseRowData(r.data), table.columns, r.id));

      const search = opts.search?.trim().toLowerCase();
      if (search) {
        named = named.filter((row) =>
          Object.entries(row).some(([k, v]) => {
            if (k === "_rowId") return false;
            return String(v ?? "")
              .toLowerCase()
              .includes(search);
          }),
        );
      }

      const offset = Math.max(0, opts.offset ?? 0);
      const limit = opts.limit != null ? Math.max(0, opts.limit) : undefined;
      if (limit != null) return named.slice(offset, offset + limit);
      if (offset > 0) return named.slice(offset);
      return named;
    },

    async insertRows(ref, rows) {
      const table = await resolveOwned(userId, ref);
      if (!table) throw new Error(`Data table not found: ${ref}`);
      if (rows.length === 0) return 0;

      const max = await prisma.dataTableRow.aggregate({
        where: { tableId: table.id },
        _max: { position: true },
      });
      let pos = (max._max.position ?? -1) + 1;

      for (const fields of rows) {
        const projected = projectRowData(namedToIds(fields, table.columns), table.columns);
        for (const col of table.columns) {
          if (!(col.id in projected)) projected[col.id] = null;
        }
        await prisma.dataTableRow.create({
          data: {
            tableId: table.id,
            data: JSON.stringify(projected),
            position: pos++,
          },
        });
      }
      await prisma.dataTable.update({
        where: { id: table.id },
        data: { updatedAt: new Date() },
      });
      return rows.length;
    },

    async updateRows(ref, match, fields) {
      const table = await resolveOwned(userId, ref);
      if (!table) throw new Error(`Data table not found: ${ref}`);
      const col = findColumn(table.columns, match.column);
      if (!col) throw new Error(`Column not found: ${match.column}`);

      const rows = await prisma.dataTableRow.findMany({ where: { tableId: table.id } });
      let count = 0;
      for (const row of rows) {
        const data = parseRowData(row.data);
        if (!cellEquals(data[col.id], match.value)) continue;
        const merged = {
          ...data,
          ...namedToIds(fields, table.columns),
        };
        const projected = projectRowData(merged, table.columns);
        await prisma.dataTableRow.update({
          where: { id: row.id },
          data: { data: JSON.stringify(projected) },
        });
        count++;
      }
      if (count > 0) {
        await prisma.dataTable.update({
          where: { id: table.id },
          data: { updatedAt: new Date() },
        });
      }
      return count;
    },

    async deleteRows(ref, match) {
      const table = await resolveOwned(userId, ref);
      if (!table) throw new Error(`Data table not found: ${ref}`);

      if (!match) {
        const res = await prisma.dataTableRow.deleteMany({ where: { tableId: table.id } });
        await prisma.dataTable.update({
          where: { id: table.id },
          data: { updatedAt: new Date() },
        });
        return res.count;
      }

      const col = findColumn(table.columns, match.column);
      if (!col) throw new Error(`Column not found: ${match.column}`);

      const rows = await prisma.dataTableRow.findMany({ where: { tableId: table.id } });
      let count = 0;
      for (const row of rows) {
        const data = parseRowData(row.data);
        if (!cellEquals(data[col.id], match.value)) continue;
        await prisma.dataTableRow.delete({ where: { id: row.id } });
        count++;
      }
      if (count > 0) {
        await prisma.dataTable.update({
          where: { id: table.id },
          data: { updatedAt: new Date() },
        });
      }
      return count;
    },

    async clearRows(ref) {
      return this.deleteRows(ref);
    },

    async appendOutputRow(ref, fields) {
      const table = await resolveOwned(userId, ref);
      if (!table) throw new Error(`Data table not found: ${ref}`);

      let columns = [...table.columns];
      let changed = false;
      for (const key of Object.keys(fields)) {
        if (key === "_rowId") continue;
        if (!columns.some((c) => c.name === key || c.id === key)) {
          columns.push({ id: newColumnId(), name: key, type: "string" });
          changed = true;
        }
      }
      if (changed) {
        await prisma.dataTable.update({
          where: { id: table.id },
          data: { columns: JSON.stringify(columns), updatedAt: new Date() },
        });
      }

      const max = await prisma.dataTableRow.aggregate({
        where: { tableId: table.id },
        _max: { position: true },
      });
      const projected = projectRowData(namedToIds(fields, columns), columns);
      for (const col of columns) {
        if (!(col.id in projected)) projected[col.id] = null;
      }
      await prisma.dataTableRow.create({
        data: {
          tableId: table.id,
          data: JSON.stringify(projected),
          position: (max._max.position ?? -1) + 1,
        },
      });
      await prisma.dataTable.update({
        where: { id: table.id },
        data: { updatedAt: new Date() },
      });
    },
  };
}
