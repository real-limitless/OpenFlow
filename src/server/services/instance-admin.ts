import { prisma } from "../db";
import { config } from "../../config";

export async function requireInstanceAdmin(
  userId: string,
): Promise<true | { error: string; status: 403 }> {
  if (userId === "local" || config.auth.disabled) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "owner" || user?.role === "admin") return true;
  return { error: "Only instance admins can change this setting", status: 403 };
}

export async function actorRole(userId: string): Promise<string> {
  if (userId === "local" || config.auth.disabled) return "owner";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? "member";
}
