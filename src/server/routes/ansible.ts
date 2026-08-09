import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import {
  ansibleCatalogStats,
  getAnsibleModuleSchemaFs,
  listAnsibleGalleryFs,
  searchAnsibleGalleryFs,
} from "../../lib/nodes/ansible/catalog-fs";
import { schemaHasFormFields } from "../../lib/nodes/ansible/catalog-core";

function requireUserId(c: { get: (k: "userId") => string | undefined }): string | null {
  try {
    const id = c.get("userId");
    return id && String(id).length > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

export default function ansibleRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/ansible/stats", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    return c.json(ansibleCatalogStats());
  });

  app.get("/api/v1/ansible/modules", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const q = String(c.req.query("q") ?? c.req.query("query") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? 80);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 80;
    const collection = String(c.req.query("collection") ?? "").trim();

    let items = q ? searchAnsibleGalleryFs(q, limit * 3) : listAnsibleGalleryFs();
    if (collection) {
      items = items.filter((i) => i.collection === collection);
    }
    if (!q) {
      items = items.slice(0, limit);
    } else {
      items = items.slice(0, limit);
    }

    // Annotate form-ready without loading every schema: check file existence lightly via get
    // (cached). Only for returned page.
    const enriched = items.map((item) => {
      const schema = getAnsibleModuleSchemaFs(item.fqcn);
      return {
        ...item,
        hasFormSchema: schemaHasFormFields(schema),
      };
    });

    const stats = ansibleCatalogStats();
    return c.json({
      count: enriched.length,
      total: stats.galleryCount,
      items: enriched,
      catalogRoot: stats.root,
    });
  });

  app.get("/api/v1/ansible/modules/:fqcn/schema", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const fqcn = decodeURIComponent(c.req.param("fqcn") ?? "").trim();
    if (!fqcn) return c.json({ error: "fqcn required" }, 400);
    const schema = getAnsibleModuleSchemaFs(fqcn);
    if (!schema) {
      return c.json(
        {
          fqcn,
          schema: null,
          message: "No schema on disk; use JSON args on the Ansible node.",
        },
        404,
      );
    }
    return c.json({
      ...schema,
      hasFormSchema: schemaHasFormFields(schema),
    });
  });
}
