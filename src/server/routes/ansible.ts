import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import {
  ansibleCatalogStats,
  ansibleSchemaFileExistsFs,
  getAnsibleModuleSchemaFs,
  listAnsibleCollectionsFs,
  listAnsibleModulesByCollectionFs,
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

function enrichList(
  items: Array<{ fqcn: string; shortName: string; collection: string; description: string }>,
) {
  return items.map((item) => ({
    ...item,
    // Cheap: schema file on disk. Form fields confirmed only when schema is fetched.
    hasSchemaFile: ansibleSchemaFileExistsFs(item.fqcn),
  }));
}

export default function ansibleRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/ansible/stats", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const stats = ansibleCatalogStats();
    const collections = listAnsibleCollectionsFs();
    return c.json({
      ...stats,
      collectionCount: collections.length,
    });
  });

  /** Browse: all collections with counts (no module payload). */
  app.get("/api/v1/ansible/collections", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const collections = listAnsibleCollectionsFs();
    const stats = ansibleCatalogStats();
    return c.json({
      totalModules: stats.galleryCount,
      count: collections.length,
      collections,
      catalogRoot: stats.root,
    });
  });

  /**
   * Modules:
   *  - ?collection=ansible.builtin → all modules in that collection
   *  - ?q=yum → global search (default limit 200, max 500)
   *  - neither → empty items (use /collections to browse)
   */
  app.get("/api/v1/ansible/modules", async (c) => {
    if (!requireUserId(c)) return c.json({ error: "Unauthorized" }, 401);
    const q = String(c.req.query("q") ?? c.req.query("query") ?? "").trim();
    const collection = String(c.req.query("collection") ?? "").trim();
    const limitRaw = Number(c.req.query("limit") ?? (q ? 200 : 0));
    const offsetRaw = Number(c.req.query("offset") ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 0), 5000) : 200;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const stats = ansibleCatalogStats();

    if (collection) {
      const all = listAnsibleModulesByCollectionFs(collection);
      const slice = limit > 0 ? all.slice(offset, offset + limit) : all.slice(offset);
      return c.json({
        count: slice.length,
        total: all.length,
        collection,
        offset,
        items: enrichList(slice),
        catalogRoot: stats.root,
      });
    }

    if (q) {
      const searchLimit = limit > 0 ? limit : 200;
      const items = searchAnsibleGalleryFs(q, Math.min(searchLimit, 500));
      return c.json({
        count: items.length,
        total: stats.galleryCount,
        query: q,
        items: enrichList(items),
        catalogRoot: stats.root,
      });
    }

    // No collection / query: do not dump the catalog
    return c.json({
      count: 0,
      total: stats.galleryCount,
      items: [],
      message: "Pass collection=… to list a collection, or q=… to search.",
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
