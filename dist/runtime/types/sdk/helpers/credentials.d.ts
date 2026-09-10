import type { CredentialData } from "@/lib/engine/credentials";
import type { ExecutionContext } from "../types";
export declare function requireCredential(ctx: ExecutionContext, name: string): Promise<CredentialData>;
