import type { Hono } from "hono";
import { config } from "../../config";
import {
  listExecutorTypes,
  reloadBuiltinExecutors,
  seedBuiltinExecutors,
} from "../../lib/engine";
import { seedBuiltinDescriptions, allNodeTypes } from "../../lib/nodes/registry";
import type { AppEnv } from "../middleware/auth";

export default function devRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/dev/nodes", (c) => {
    if (!config.hotNodes.enabled) {
      return c.json({ error: "Hot nodes disabled. Set OPENFLOW_HOT_NODES=1" }, 403);
    }
    return c.json({
      executors: listExecutorTypes(),
      descriptions: allNodeTypes().map((d) => d.name),
      count: listExecutorTypes().length,
    });
  });

  app.post("/api/v1/dev/reload-nodes", async (c) => {
    if (!config.hotNodes.enabled) {
      return c.json({ error: "Hot nodes disabled. Set OPENFLOW_HOT_NODES=1" }, 403);
    }

    seedBuiltinExecutors();
    seedBuiltinDescriptions();
    const result = await reloadBuiltinExecutors();

    return c.json({
      ok: result.errors.length === 0,
      reloaded: result.reloaded,
      errors: result.errors,
      executorCount: listExecutorTypes().length,
      descriptionCount: allNodeTypes().length,
    });
  });
}
