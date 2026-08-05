import type { Hono } from "hono";
import { config } from "../../config";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import { LOCAL_USER_ID } from "../services/users";

/** Count real accounts (exclude AUTH_DISABLED synthetic local user). */
export async function countRealUsers(): Promise<number> {
  return prisma.user.count({
    where: {
      AND: [{ id: { not: LOCAL_USER_ID } }, { passwordHash: { not: "" } }],
    },
  });
}

export default function setupRoute(app: Hono<AppEnv>) {
  /**
   * Public product-readiness probe for first-run UI.
   * Infra readiness remains GET /health/ready.
   */
  app.get("/api/v1/setup/status", async (c) => {
    const authDisabled = config.auth.disabled;
    const realUsers = await countRealUsers();
    const hasUsers = realUsers > 0;
    return c.json({
      authDisabled,
      hasUsers,
      needsOwner: !authDisabled && !hasUsers,
    });
  });
}
