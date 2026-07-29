import type { CredentialData } from "@/lib/engine/credentials";
import type { ExecutionContext } from "../types";

export async function requireCredential(
  ctx: ExecutionContext,
  name: string,
): Promise<CredentialData> {
  const data = await ctx.getCredential(name);
  if (!data) {
    throw new Error(`Credential "${name}" is not configured on this node`);
  }
  return data;
}
