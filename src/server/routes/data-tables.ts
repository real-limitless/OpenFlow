import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { ensureUser, ensureUserWithProject } from "../services/users";
import {
  listAccessibleProjectIds,
  projectIdFromRequest,
  requireProjectPermission,
} from "../services/projects";
import {
  defaultColumns,
  normalizeColumns,
  parseColumns,
  parseRowData,
  projectRowData,
  type DataTableColumn,
  type DataTableMeta,
  type DataTableRowDto,
} from "@/lib/data-tables/types";

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}

function toMeta(
  row: {
    id: string;
    name: string;
    columns: string;
    createdAt: Date;
    updatedAt: Date;
    _count?: { rows: number };
  },
  rowCount?: number,
): DataTableMeta {
  return {
    id: row.id,
    name: row.name,
    columns: parseColumns(row.columns),
    rowCount: rowCount ?? row._count?.rows ?? 0,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toRowDto(row: {
  id: string;
  data: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): DataTableRowDto {
  return {
    id: row.id,
    data: parseRowData(row.data),
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function findAccessibleTable(id: string, userId: string, minRole: "viewer" | "editor" = "viewer") {
  const table = await prisma.dataTable.findUnique({ where: { id } });
  if (!table) return null;
  const access = await requireProjectPermission(table.projectId, userId, minRole);
  if (!access.ok) return null;
  return table;
}

export default function dataTablesRoute(app: Hono<AppEnv>) {
  // GET /api/v1/data-tables?q=
  app.get("/api/v1/data-tables", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const filterProjectId = projectIdFromRequest(c);
    let projectIds: string[];
    if (filterProjectId) {
      const access = await requireProjectPermission(filterProjectId, userId, "viewer");
      if (!access.ok) return c.json({ error: access.error }, access.status);
      projectIds = [filterProjectId];
    } else {
      projectIds = await listAccessibleProjectIds(userId, "viewer");
    }
    const tables = await prisma.dataTable.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { rows: true } } },
    });
    const mapped = tables.map((t) => toMeta(t));
    if (!q) return c.json(mapped);
    return c.json(
      mapped.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.columns.some((col) => col.name.toLowerCase().includes(q)),
      ),
    );
  });

  // POST /api/v1/data-tables
  app.post("/api/v1/data-tables", async (c) => {
    const userId = c.get("userId");
    const { projectId: personalId } = await ensureUserWithProject(userId);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      columns?: unknown;
      projectId?: string;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name required" }, 400);

    let columns: DataTableColumn[];
    if (body.columns === undefined) {
      columns = defaultColumns();
    } else {
      const normalized = normalizeColumns(body.columns);
      if (!normalized) return c.json({ error: "columns must be an array" }, 400);
      columns = normalized.length > 0 ? normalized : defaultColumns();
    }

    const projectId = body.projectId || projectIdFromRequest(c) || personalId;
    const access = await requireProjectPermission(projectId, userId, "editor");
    if (!access.ok) return c.json({ error: access.error }, access.status);

    try {
      const table = await prisma.dataTable.create({
        data: {
          userId,
          projectId,
          name,
          columns: JSON.stringify(columns),
        },
      });
      return c.json(toMeta(table, 0), 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") || msg.includes("unique")) {
        return c.json({ error: "A table with that name already exists" }, 409);
      }
      throw err;
    }
  });

  // GET /api/v1/data-tables/:id?q=&limit=&offset=
  app.get("/api/v1/data-tables/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const limitRaw = c.req.query("limit");
    const offsetRaw = c.req.query("offset");
    const limit = limitRaw != null && limitRaw !== "" ? Math.max(0, Number(limitRaw)) : undefined;
    const offset = offsetRaw != null && offsetRaw !== "" ? Math.max(0, Number(offsetRaw)) : 0;

    const owned = await findAccessibleTable(id, userId, "viewer");
    if (!owned) return c.json({ error: "Not found" }, 404);

    const table = await prisma.dataTable.findUnique({
      where: { id },
      include: {
        rows: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        _count: { select: { rows: true } },
      },
    });
    if (!table) return c.json({ error: "Not found" }, 404);

    let rows = table.rows.map(toRowDto);
    if (q) {
      rows = rows.filter((r) =>
        Object.values(r.data).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    const totalRows = rows.length;
    if (offset > 0) rows = rows.slice(offset);
    if (limit != null && Number.isFinite(limit)) rows = rows.slice(0, limit);

    return c.json({
      ...toMeta(table, table._count.rows),
      rows,
      totalRows,
      offset,
      limit: limit ?? null,
    });
  });

  // PATCH /api/v1/data-tables/:id
  app.patch("/api/v1/data-tables/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "editor");
    if (!existing) return c.json({ error: "Not found" }, 404);

    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      columns?: unknown;
    };
    const update: { name?: string; columns?: string } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return c.json({ error: "name required" }, 400);
      update.name = name;
    }

    let nextColumns: DataTableColumn[] | null = null;
    if (body.columns !== undefined) {
      const normalized = normalizeColumns(body.columns);
      if (!normalized) return c.json({ error: "columns must be an array" }, 400);
      if (normalized.length === 0) return c.json({ error: "at least one column required" }, 400);
      nextColumns = normalized;
      update.columns = JSON.stringify(normalized);
    }

    try {
      if (nextColumns) {
        const rows = await prisma.dataTableRow.findMany({ where: { tableId: id } });
        for (const row of rows) {
          const cleaned = projectRowData(parseRowData(row.data), nextColumns);
          await prisma.dataTableRow.update({
            where: { id: row.id },
            data: { data: JSON.stringify(cleaned) },
          });
        }
      }

      const table = await prisma.dataTable.update({
        where: { id },
        data: update,
        include: { _count: { select: { rows: true } } },
      });
      return c.json(toMeta(table));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Unique constraint") || msg.includes("unique")) {
        return c.json({ error: "A table with that name already exists" }, 409);
      }
      throw err;
    }
  });

  // DELETE /api/v1/data-tables/:id
  app.delete("/api/v1/data-tables/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "editor");
    if (!existing) return c.json({ error: "Not found" }, 404);
    await prisma.dataTable.delete({ where: { id } });
    return c.json({ success: true });
  });

  // GET /api/v1/data-tables/:id/rows?q=&limit=&offset=
  app.get("/api/v1/data-tables/:id/rows", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "viewer");
    if (!existing) return c.json({ error: "Not found" }, 404);

    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const limitRaw = c.req.query("limit");
    const offsetRaw = c.req.query("offset");
    const limit = limitRaw != null && limitRaw !== "" ? Math.max(0, Number(limitRaw)) : undefined;
    const offset = offsetRaw != null && offsetRaw !== "" ? Math.max(0, Number(offsetRaw)) : 0;

    let rows = (
      await prisma.dataTableRow.findMany({
        where: { tableId: id },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      })
    ).map(toRowDto);

    if (q) {
      rows = rows.filter((r) =>
        Object.values(r.data).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    const total = rows.length;
    if (offset > 0) rows = rows.slice(offset);
    if (limit != null && Number.isFinite(limit)) rows = rows.slice(0, limit);

    return c.json({ rows, total, offset, limit: limit ?? null });
  });

  // POST /api/v1/data-tables/:id/rows
  app.post("/api/v1/data-tables/:id/rows", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "editor");
    if (!existing) return c.json({ error: "Not found" }, 404);

    const columns = parseColumns(existing.columns);
    const body = (await c.req.json().catch(() => ({}))) as {
      data?: unknown;
      rows?: unknown;
    };

    const payloads: Record<string, unknown>[] = [];
    if (Array.isArray(body.rows)) {
      for (const item of body.rows) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return c.json({ error: "each row must be an object" }, 400);
        }
        payloads.push(item as Record<string, unknown>);
      }
    } else if (body.data !== undefined) {
      if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
        return c.json({ error: "data must be an object" }, 400);
      }
      payloads.push(body.data as Record<string, unknown>);
    } else {
      payloads.push({});
    }

    const max = await prisma.dataTableRow.aggregate({
      where: { tableId: id },
      _max: { position: true },
    });
    let pos = (max._max.position ?? -1) + 1;

    const byName = new Map(columns.map((c) => [c.name, c.id]));
    const created = [];
    for (const data of payloads) {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (columns.some((c) => c.id === key)) {
          normalized[key] = value;
        } else if (byName.has(key)) {
          normalized[byName.get(key)!] = value;
        }
      }
      const projected = projectRowData(normalized, columns);
      for (const col of columns) {
        if (!(col.id in projected)) projected[col.id] = null;
      }
      const row = await prisma.dataTableRow.create({
        data: {
          tableId: id,
          data: JSON.stringify(projected),
          position: pos++,
        },
      });
      created.push(toRowDto(row));
    }

    await prisma.dataTable.update({ where: { id }, data: { updatedAt: new Date() } });

    return c.json(created.length === 1 ? created[0] : created, 201);
  });

  // PATCH /api/v1/data-tables/:id/rows/:rowId
  app.patch("/api/v1/data-tables/:id/rows/:rowId", async (c) => {
    const userId = c.get("userId");
    const { id, rowId } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "editor");
    if (!existing) return c.json({ error: "Not found" }, 404);

    const row = await prisma.dataTableRow.findFirst({ where: { id: rowId, tableId: id } });
    if (!row) return c.json({ error: "Not found" }, 404);

    const body = (await c.req.json().catch(() => ({}))) as {
      data?: unknown;
      position?: number;
    };
    const update: { data?: string; position?: number } = {};

    if (body.data !== undefined) {
      if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
        return c.json({ error: "data must be an object" }, 400);
      }
      const columns = parseColumns(existing.columns);
      const merged = {
        ...parseRowData(row.data),
        ...(body.data as Record<string, unknown>),
      };
      const projected = projectRowData(merged, columns);
      for (const col of columns) {
        if (!(col.id in projected)) projected[col.id] = null;
      }
      update.data = JSON.stringify(projected);
    }

    if (typeof body.position === "number" && Number.isFinite(body.position)) {
      update.position = Math.trunc(body.position);
    }

    const updated = await prisma.dataTableRow.update({
      where: { id: rowId },
      data: update,
    });
    await prisma.dataTable.update({ where: { id }, data: { updatedAt: new Date() } });
    return c.json(toRowDto(updated));
  });

  // DELETE /api/v1/data-tables/:id/rows/:rowId
  app.delete("/api/v1/data-tables/:id/rows/:rowId", async (c) => {
    const userId = c.get("userId");
    const { id, rowId } = c.req.param();
    const existing = await findAccessibleTable(id, userId, "editor");
    if (!existing) return c.json({ error: "Not found" }, 404);

    const row = await prisma.dataTableRow.findFirst({ where: { id: rowId, tableId: id } });
    if (!row) return c.json({ error: "Not found" }, 404);

    await prisma.dataTableRow.delete({ where: { id: rowId } });
    await prisma.dataTable.update({ where: { id }, data: { updatedAt: new Date() } });
    return c.json({ success: true });
  });
}
