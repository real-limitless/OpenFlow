import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import {
  getAnsibleModuleSchema,
  listAnsibleGallery,
  listAnsibleSchemaFqcns,
  searchAnsibleGallery,
} from "../../lib/nodes/ansible/catalog";

function requireUserId(c: { get: (k: "userId") => string | undefined }): string | null {
  try {
    const id = c.get("userId");
    return id && String(id).length > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

export default function ansibleRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/ansible/modules", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const q = String(c.req.query("q") ?? c.req.query("query") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? 40);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 40;
    const items = q ? searchAnsibleGallery(q, limit) : listAnsibleGallery().slice(0, limit);
    return c.json({ count: items.length, items, schemaFqcns: listAnsibleSchemaFqcns() });
  });

  app.get("/api/v1/ansible/modules/:fqcn/schema", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const fqcn = decodeURIComponent(c.req.param("fqcn") ?? "").trim();
    if (!fqcn) return c.json({ error: "fqcn required" }, 400);
    const schema = getAnsibleModuleSchema(fqcn);
    if (!schema) {
      return c.json(
        {
          fqcn,
          schema: null,
          message: "No committed schema; use JSON args on the Ansible node.",
        },
        404,
      );
    }
    return c.json(schema);
  });
}
