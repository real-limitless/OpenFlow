import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";

export default function healthRoute(app: Hono<AppEnv>) {
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });
}
