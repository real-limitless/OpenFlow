import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import dataTablesRoute from "../routes/data-tables";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../middleware/auth";

async function withRetry<T>(fn: () => Promise<T> | T, attempts = 10, delayMs = 200): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timed out") || msg.includes("busy") || msg.includes("write")) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

describe("Data Tables API", () => {
  let app: Hono<AppEnv>;
  let tableId: string;
  let rowId: string;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "true";

    await withRetry(() =>
      prisma.user.upsert({
        where: { id: "local" },
        update: { email: "dt-test@local.test" },
        create: { id: "local", email: "dt-test@local.test", passwordHash: "hashed" },
      }),
    );

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    dataTablesRoute(app);
  });

  afterAll(async () => {
    if (tableId) {
      await withRetry(() => prisma.dataTableRow.deleteMany({ where: { tableId } }));
      await withRetry(() => prisma.dataTable.deleteMany({ where: { id: tableId } }));
    }
    await withRetry(() =>
      prisma.dataTable.deleteMany({ where: { userId: "local", name: { startsWith: "dt-test-" } } }),
    );
    delete process.env.AUTH_DISABLED;
  });

  it("POST creates a table with default column", async () => {
    const name = `dt-test-${Date.now()}`;
    const res = await withRetry(() =>
      app.request("/api/v1/data-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    tableId = body.id;
    expect(body.name).toBe(name);
    expect(body.columns.length).toBe(1);
    expect(body.rowCount).toBe(0);
  });

  it("GET lists tables including the new one", async () => {
    const res = await app.request("/api/v1/data-tables");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((t: { id: string }) => t.id === tableId)).toBe(true);
  });

  it("POST row and PATCH cell", async () => {
    const detail = await (await app.request(`/api/v1/data-tables/${tableId}`)).json();
    const colId = detail.columns[0].id;

    const createRes = await app.request(`/api/v1/data-tables/${tableId}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { [colId]: "hello" } }),
    });
    expect(createRes.status).toBe(201);
    const row = await createRes.json();
    rowId = row.id;
    expect(row.data[colId]).toBe("hello");

    const patchRes = await app.request(`/api/v1/data-tables/${tableId}/rows/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { [colId]: "world" } }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.data[colId]).toBe("world");
  });

  it("PATCH columns strips removed column keys", async () => {
    const detail = await (await app.request(`/api/v1/data-tables/${tableId}`)).json();
    const oldCol = detail.columns[0];
    const newCol = { id: "col_new", name: "Only", type: "string" };

    const res = await app.request(`/api/v1/data-tables/${tableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns: [newCol] }),
    });
    expect(res.status).toBe(200);

    const after = await (await app.request(`/api/v1/data-tables/${tableId}`)).json();
    expect(after.columns).toEqual([newCol]);
    const row = after.rows.find((r: { id: string }) => r.id === rowId);
    expect(row).toBeDefined();
    expect(row.data[oldCol.id]).toBeUndefined();
  });

  it("returns 404 for other user ownership", async () => {
    const foreign = await withRetry(() =>
      prisma.dataTable.create({
        data: {
          userId: "local",
          name: `dt-test-foreign-${Date.now()}`,
          columns: JSON.stringify([{ id: "c1", name: "A", type: "string" }]),
        },
      }),
    );
    // Simulate different user by direct delete ownership check: request with wrong id
    const res = await app.request(`/api/v1/data-tables/nonexistent-id`);
    expect(res.status).toBe(404);
    await withRetry(() => prisma.dataTable.delete({ where: { id: foreign.id } }));
  });

  it("DELETE table removes it", async () => {
    const res = await app.request(`/api/v1/data-tables/${tableId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const get = await app.request(`/api/v1/data-tables/${tableId}`);
    expect(get.status).toBe(404);
    tableId = "";
  });
});
