import {
  createCredential,
  deleteCredential,
  isServiceError,
  listCredentialsMeta,
  updateCredential,
  type CredentialMetaOut,
  type ServiceError,
} from "./credentials-admin";
import { resolveCredential } from "../credentials";
import {
  MCP_FLOW_API_CREDENTIAL,
  MCP_FLOW_CONNECTION_NAME,
  type McpFlowConnectionPublic,
} from "../../lib/nodes/mcp-flow/types";

export type McpFlowCredData = {
  url: string;
  apiKey: string;
};

export type LoadedMcpFlowCredential = {
  meta: CredentialMetaOut;
  data: McpFlowCredData;
};

function err(error: string, status: number): ServiceError {
  return { error, status };
}

function asData(raw: Record<string, unknown> | null): McpFlowCredData | null {
  if (!raw) return null;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : "";
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export function publicConnection(loaded: LoadedMcpFlowCredential): McpFlowConnectionPublic {
  return {
    id: loaded.meta.id,
    name: loaded.meta.name,
    url: loaded.data.url,
  };
}

export async function loadMcpFlowCredential(
  userId: string,
  opts?: { credentialId?: string | null; projectId?: string | null },
): Promise<LoadedMcpFlowCredential | ServiceError> {
  const rows = await listCredentialsMeta(userId, {
    projectId: opts?.projectId,
    type: MCP_FLOW_API_CREDENTIAL,
    includeUse: true,
  });
  const wanted = opts?.credentialId?.trim();
  const meta = wanted ? rows.find((r) => r.id === wanted) : rows[0];
  if (!meta) return err("mcp-flow not connected", 404);

  const data = asData(
    await resolveCredential(
      { id: meta.id, name: meta.name },
      { userId, projectId: meta.projectId },
    ),
  );
  if (!data) return err("mcp-flow credential is missing url or apiKey", 400);
  return { meta, data };
}

export async function saveMcpFlowConnection(
  userId: string,
  input: { url?: string; apiKey?: string; name?: string; projectId?: string | null },
): Promise<McpFlowConnectionPublic | ServiceError> {
  const url = input.url?.trim() ?? "";
  const apiKey = input.apiKey?.trim() ?? "";
  if (!url) return err("url is required", 400);
  if (!apiKey) return err("apiKey is required", 400);

  const existing = await loadMcpFlowCredential(userId, { projectId: input.projectId });
  const name = input.name?.trim() || MCP_FLOW_CONNECTION_NAME;

  if (!("error" in existing)) {
    const updated = await updateCredential(userId, existing.meta.id, {
      name,
      data: { url, apiKey },
    });
    if (isServiceError(updated)) return updated;
    return { id: updated.id, name: updated.name, url };
  }
  if (existing.status !== 404) return existing;

  const created = await createCredential(userId, {
    name,
    type: MCP_FLOW_API_CREDENTIAL,
    data: { url, apiKey },
    projectId: input.projectId,
  });
  if (isServiceError(created)) return created;
  return { id: created.id, name: created.name, url };
}

export async function deleteMcpFlowConnection(
  userId: string,
  opts?: { credentialId?: string | null; projectId?: string | null },
): Promise<{ ok: true } | ServiceError> {
  const loaded = await loadMcpFlowCredential(userId, opts);
  if ("error" in loaded) return loaded;
  const deleted = await deleteCredential(userId, loaded.meta.id);
  if (isServiceError(deleted)) return deleted;
  return { ok: true };
}
