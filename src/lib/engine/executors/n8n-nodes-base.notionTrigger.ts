import type { INodeExecutionData, NodeExecutor } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

const API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-02-22";

const pollCursors = new Map<string, string>();

export function _clearPollStateForTest(): void {
  pollCursors.clear();
}

interface NotionCred {
  accessToken?: string;
  apiKey?: string;
}

function resolveString(raw: unknown): string {
  if (typeof raw !== "string") return String(raw ?? "");
  if (raw.startsWith("{{") || raw.startsWith("=")) {
    const result = evaluateExpression(raw, { json: {}, itemIndex: 0 });
    return result.ok ? String(result.value ?? "") : raw;
  }
  return raw;
}

function locatorValue(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    return String((raw as Record<string, unknown>).value ?? "");
  }
  return String(raw);
}

async function notionRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  notionVersion = DEFAULT_NOTION_VERSION,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": notionVersion,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, init);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const msg =
      ((errObj as { message?: string }).message) ??
      ((errObj as { code?: string }).code) ??
      `HTTP ${res.status}`;
    throw new Error(`NotionTrigger: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function simplifyPage(page: Record<string, unknown>): Record<string, unknown> {
  const props = (page.properties as Record<string, unknown>) ?? {};
  const simplified: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val && typeof val === "object") {
      const v = val as Record<string, unknown>;
      const type = v.type as string | undefined;
      if (type === "title") {
        const titleArr = v.title as Array<Record<string, unknown>> | undefined;
        simplified[key] = titleArr?.map((t) => t.plain_text ?? "").join("") ?? "";
      } else if (type === "rich_text") {
        const textArr = v.rich_text as Array<Record<string, unknown>> | undefined;
        simplified[key] = textArr?.map((t) => t.plain_text ?? "").join("") ?? "";
      } else if (type === "select" && v.select) {
        simplified[key] = (v.select as Record<string, unknown>).name ?? null;
      } else if (type === "multi_select" && v.multi_select) {
        simplified[key] = (v.multi_select as Array<Record<string, unknown>>).map(
          (o) => o.name,
        );
      } else if (type === "number") {
        simplified[key] = v.number ?? null;
      } else if (type === "checkbox") {
        simplified[key] = v.checkbox ?? false;
      } else if (type === "date" && v.date) {
        simplified[key] = (v.date as Record<string, unknown>).start ?? null;
      } else if (type === "email") {
        simplified[key] = v.email ?? null;
      } else if (type === "phone_number") {
        simplified[key] = v.phone_number ?? null;
      } else if (type === "url") {
        simplified[key] = v.url ?? null;
      } else if (type === "status" && v.status) {
        simplified[key] = (v.status as Record<string, unknown>).name ?? null;
      } else if (type === "people") {
        const people = v.people as Array<Record<string, unknown>> | undefined;
        simplified[key] = people?.map((p) => ({ id: p.id, name: p.name })) ?? [];
      } else if (type === "files") {
        const files = v.files as Array<Record<string, unknown>> | undefined;
        simplified[key] = files?.map((f) => ({ name: f.name, url: f.file?.url ?? f.external?.url })) ?? [];
      } else if (type === "relation") {
        const rel = v.relation as Array<Record<string, unknown>> | undefined;
        simplified[key] = rel?.map((r) => r.id) ?? [];
      } else if (type === "rollup" && v.rollup) {
        simplified[key] = (v.rollup as Record<string, unknown>).number ?? null;
      } else if (type === "formula" && v.formula) {
        simplified[key] = Object.values(v.formula as Record<string, unknown>)[0] ?? null;
      } else {
        simplified[key] = null;
      }
    } else {
      simplified[key] = val;
    }
  }
  return simplified;
}

async function downloadAttachments(
  token: string,
  page: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const props = (page.properties as Record<string, unknown>) ?? {};
  const binaries: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val && typeof val === "object") {
      const v = val as Record<string, unknown>;
      if (v.type === "files") {
        const files = v.files as Array<Record<string, unknown>> | undefined;
        if (!files) continue;
        const fileData: Array<Record<string, unknown>> = [];
        for (const file of files) {
          const url = (file.file as Record<string, unknown> | undefined)?.url ??
            (file.external as Record<string, unknown> | undefined)?.url;
          if (url) {
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const buffer = await res.arrayBuffer();
            fileData.push({
              fileName: file.name,
              data: Buffer.from(buffer).toString("base64"),
              mimeType: res.headers.get("content-type") ?? "application/octet-stream",
            });
          }
        }
        if (fileData.length > 0) binaries[key] = fileData;
      }
    }
  }
  return binaries;
}

export const notionTriggerExecutor: NodeExecutor = async (ctx) => {
  const credential = await ctx.getCredential("notionApi") ?? await ctx.getCredential("notionOAuth2Api");
  const cred = credential as NotionCred | null;
  const token = cred?.accessToken ?? cred?.apiKey ?? "";
  if (!token) {
    throw new Error("NotionTrigger: notionApi or notionOAuth2Api credential is required");
  }

  const notionVersion = DEFAULT_NOTION_VERSION;

  const events = ctx.getParam<string[]>("events", ["pageAddedToDatabase"]);
  const databaseIdRaw = ctx.getParam("databaseId", "");
  const databaseId = locatorValue(databaseIdRaw);
  if (!databaseId) {
    throw new Error("NotionTrigger: databaseId is required");
  }

  const options = (ctx.getParam("options", {}) as Record<string, unknown>);
  const simplifyOutput = Boolean(options.simplifyOutput);
  const downloadAttach = Boolean(options.downloadAttachments);
  const filterJsonRaw = String(options.filterJson ?? "");
  const sortJsonRaw = String(options.sortJson ?? "");

  const nodeId = ctx.node.id ?? "default";
  const cursor = pollCursors.get(nodeId);
  const now = new Date().toISOString();

  const isManual = !cursor;

  if (isManual) {
    pollCursors.set(nodeId, now);
  }

  const queryBody: Record<string, unknown> = {};

  if (filterJsonRaw) {
    let filterObj: unknown;
    try {
      filterObj = JSON.parse(filterJsonRaw);
    } catch {
      throw new Error("NotionTrigger: options.filterJson is not valid JSON");
    }
    queryBody.filter = filterObj;
  } else {
    const hasAdded = events.includes("pageAddedToDatabase");
    const hasUpdated = events.includes("pageUpdatedInDatabase");

    if (hasAdded && !hasUpdated) {
      queryBody.filter = {
        timestamp: "created_time",
        property: "created_time",
        created_time: { after: cursor ?? new Date(Date.now() - 86400000).toISOString() },
      };
    } else {
      const timeCursor = cursor ?? new Date(Date.now() - 86400000).toISOString();
      if (hasAdded && hasUpdated) {
        queryBody.filter = {
          or: [
            { timestamp: "created_time", property: "created_time", created_time: { after: timeCursor } },
            { timestamp: "last_edited_time", property: "last_edited_time", last_edited_time: { after: timeCursor } },
          ],
        };
      } else if (hasUpdated) {
        queryBody.filter = {
          timestamp: "last_edited_time",
          property: "last_edited_time",
          last_edited_time: { after: timeCursor },
        };
      }
    }
  }

  if (sortJsonRaw) {
    let sortsObj: unknown;
    try {
      sortsObj = JSON.parse(sortJsonRaw);
    } catch {
      throw new Error("NotionTrigger: options.sortJson is not valid JSON");
    }
    queryBody.sorts = sortsObj;
  } else {
    queryBody.sorts = [{ timestamp: "last_edited_time", direction: "descending" }];
  }

  const res = await notionRequest(
    token,
    "POST",
    `/databases/${encodeURIComponent(databaseId)}/query`,
    queryBody,
    notionVersion,
  );
  const body = res.body as Record<string, unknown> ?? {};
  const results = (body.results as Array<Record<string, unknown>>) ?? [];

  if (results.length === 0) {
    pollCursors.set(nodeId, now);
    return [[]];
  }

  const out: INodeExecutionData[] = [];
  for (const page of results) {
    const createdTime = String(page.created_time ?? "");

    const hasSelectedAdded = events.includes("pageAddedToDatabase");
    const hasSelectedUpdated = events.includes("pageUpdatedInDatabase");

    let event: string;
    if (cursor) {
      const isNew = createdTime >= cursor;
      if (isNew && hasSelectedAdded) {
        event = "pageAddedToDatabase";
      } else {
        event = "pageUpdatedInDatabase";
      }
    } else {
      event = hasSelectedUpdated && !hasSelectedAdded
        ? "pageUpdatedInDatabase"
        : "pageAddedToDatabase";
    }

    let outputJson: Record<string, unknown>;
    if (simplifyOutput) {
      outputJson = simplifyPage(page);
      outputJson._event = event;
    } else {
      outputJson = { ...page } as Record<string, unknown>;
      outputJson._event = event;
    }

    const item: INodeExecutionData = { json: outputJson };

    if (downloadAttach) {
      const binaries = await downloadAttachments(token, page);
      if (Object.keys(binaries).length > 0) {
        item.binary = binaries as INodeExecutionData["binary"];
      }
    }

    out.push(item);
  }

  pollCursors.set(nodeId, now);
  return [out];
};
