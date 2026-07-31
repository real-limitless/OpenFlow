import { prisma } from "../db";
import { ensurePersonalProject } from "./projects";

/** Synthetic owner used when AUTH_DISABLED=true. */
export const LOCAL_USER_ID = "local";

/** Ensure a User row exists (FK for workflows/credentials under AUTH_DISABLED). */
export async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@local`,
      passwordHash: "",
      role: userId === LOCAL_USER_ID ? "owner" : "member",
    },
  });
  await ensurePersonalProject(userId);
}

/** User + default personal project id. */
export async function ensureUserWithProject(userId: string): Promise<{ userId: string; projectId: string }> {
  await ensureUser(userId);
  const projectId = await ensurePersonalProject(userId);
  return { userId, projectId };
}
