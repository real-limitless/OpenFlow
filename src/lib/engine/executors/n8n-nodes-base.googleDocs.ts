import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DOCS_API = "https://docs.googleapis.com/v1/documents";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function extractDocumentId(value: string): string {
  if (!value) return "";
  const urlMatch = value.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  return value.trim();
}

function resolveDocumentId(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return extractDocumentId(String((resolved as Record<string, unknown>).value ?? ""));
  }
  return extractDocumentId(String(resolved ?? ""));
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function extractPlainText(doc: Record<string, unknown>): string {
  const body = asObj(doc.body);
  const content = (body.content as Array<Record<string, unknown>>) ?? [];
  let text = "";
  for (const el of content) {
    const paragraph = asObj(el.paragraph);
    const elements = (paragraph.elements as Array<Record<string, unknown>>) ?? [];
    for (const pe of elements) {
      const textRun = asObj(pe.textRun);
      if (typeof textRun.content === "string") text += textRun.content;
    }
    const table = asObj(el.table);
    const rows = (table.tableRows as Array<Record<string, unknown>>) ?? [];
    for (const row of rows) {
      const cells = (row.tableCells as Array<Record<string, unknown>>) ?? [];
      for (const cell of cells) {
        const cellContent = (cell.content as Array<Record<string, unknown>>) ?? [];
        for (const cel of cellContent) {
          const p = asObj(cel.paragraph);
          const els = (p.elements as Array<Record<string, unknown>>) ?? [];
          for (const pe of els) {
            const textRun = asObj(pe.textRun);
            if (typeof textRun.content === "string") text += textRun.content;
          }
        }
      }
    }
  }
  return text;
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleDocsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleDocs: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleDocs: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleDocs: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function locationOrEnd(
  field: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const locationChoice = String(
    resolveValue(field.locationChoice, itemJson) ?? "endOfSegmentLocation",
  );
  const insertSegment = String(resolveValue(field.insertSegment, itemJson) ?? "body");
  const segmentId =
    insertSegment === "body"
      ? ""
      : String(resolveValue(field.segmentId, itemJson) ?? "");

  if (locationChoice === "location") {
    const index = Number(resolveValue(field.index, itemJson) ?? 1);
    return {
      location: {
        index,
        ...(segmentId ? { segmentId } : {}),
      },
    };
  }
  return {
    endOfSegmentLocation: {
      ...(segmentId ? { segmentId } : {}),
    },
  };
}

function buildActionRequest(
  field: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> | null {
  const object = String(resolveValue(field.object, itemJson) ?? "text");
  const action = String(resolveValue(field.action, itemJson) ?? "");

  if (object === "text" && action === "insert") {
    const text = String(resolveValue(field.text, itemJson) ?? "");
    return { insertText: { text, ...locationOrEnd(field, itemJson) } };
  }

  if (object === "text" && action === "replaceAll") {
    const text = String(resolveValue(field.text, itemJson) ?? "");
    const replaceText = String(resolveValue(field.replaceText, itemJson) ?? "");
    const matchCase = resolveValue(field.matchCase, itemJson) === true;
    return {
      replaceAllText: {
        containsText: { text, matchCase },
        replaceText,
      },
    };
  }

  if (object === "footer" && action === "create") {
    return { createFooter: { type: "DEFAULT" } };
  }
  if (object === "footer" && action === "delete") {
    const footerId = String(resolveValue(field.footerId, itemJson) ?? "");
    return { deleteFooter: { footerId } };
  }

  if (object === "header" && action === "create") {
    return { createHeader: { type: "DEFAULT" } };
  }
  if (object === "header" && action === "delete") {
    const headerId = String(resolveValue(field.headerId, itemJson) ?? "");
    return { deleteHeader: { headerId } };
  }

  if (object === "namedRange" && action === "create") {
    const name = String(resolveValue(field.name, itemJson) ?? "");
    const startIndex = Number(resolveValue(field.startIndex, itemJson) ?? 0);
    const endIndex = Number(resolveValue(field.endIndex, itemJson) ?? 0);
    return {
      createNamedRange: {
        name,
        range: { startIndex, endIndex },
      },
    };
  }
  if (object === "namedRange" && action === "delete") {
    const ref = String(resolveValue(field.namedRangeReference, itemJson) ?? "namedRangeId");
    const value = String(resolveValue(field.value, itemJson) ?? "");
    if (ref === "name") return { deleteNamedRange: { name: value } };
    return { deleteNamedRange: { namedRangeId: value } };
  }

  if (object === "paragraphBullets" && action === "create") {
    const startIndex = Number(resolveValue(field.startIndex, itemJson) ?? 0);
    const endIndex = Number(resolveValue(field.endIndex, itemJson) ?? 0);
    const bulletPreset = String(
      resolveValue(field.bulletPreset, itemJson) ?? "BULLET_DISC_CIRCLE_SQUARE",
    );
    return {
      createParagraphBullets: {
        range: { startIndex, endIndex },
        bulletPreset,
      },
    };
  }
  if (object === "paragraphBullets" && action === "delete") {
    const startIndex = Number(resolveValue(field.startIndex, itemJson) ?? 0);
    const endIndex = Number(resolveValue(field.endIndex, itemJson) ?? 0);
    return {
      deleteParagraphBullets: {
        range: { startIndex, endIndex },
      },
    };
  }

  if (object === "pageBreak" && action === "insert") {
    return { insertPageBreak: { ...locationOrEnd(field, itemJson) } };
  }

  if (object === "table" && action === "insert") {
    const rows = Number(resolveValue(field.rows, itemJson) ?? 0);
    const columns = Number(resolveValue(field.columns, itemJson) ?? 0);
    return {
      insertTable: {
        rows,
        columns,
        ...locationOrEnd(field, itemJson),
      },
    };
  }

  if (object === "tableColumn" || object === "tableRow") {
    const rowIndex = Number(resolveValue(field.rowIndex, itemJson) ?? 0);
    const columnIndex = Number(resolveValue(field.columnIndex, itemJson) ?? 0);
    const index = Number(resolveValue(field.index, itemJson) ?? 1);
    const insertPosition = resolveValue(field.insertPosition, itemJson);
    const insertAfter = insertPosition === true || insertPosition === "true";
    const tableCellLocation = {
      tableStartLocation: { index },
      rowIndex,
      columnIndex,
    };
    if (object === "tableColumn" && action === "insert") {
      return {
        insertTableColumn: {
          tableCellLocation,
          insertRight: insertAfter,
        },
      };
    }
    if (object === "tableColumn" && action === "delete") {
      return { deleteTableColumn: { tableCellLocation } };
    }
    if (object === "tableRow" && action === "insert") {
      return {
        insertTableRow: {
          tableCellLocation,
          insertBelow: insertAfter,
        },
      };
    }
    if (object === "tableRow" && action === "delete") {
      return { deleteTableRow: { tableCellLocation } };
    }
  }

  if (object === "positionedObject" && action === "delete") {
    const objectId = String(resolveValue(field.objectId, itemJson) ?? "");
    return { deletePositionedObject: { objectId } };
  }

  return null;
}

async function createDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
  const driveId = String(resolveValue(node.parameters.driveId, itemJson) ?? "myDrive");
  const folderId = String(resolveValue(node.parameters.folderId, itemJson) ?? "");

  const body: Record<string, unknown> = {
    name: title || "Untitled",
    mimeType: "application/vnd.google-apps.document",
  };
  if (folderId) {
    body.parents = [folderId];
  }

  const qs = new URLSearchParams({ supportsAllDrives: "true" });
  if (driveId && driveId !== "myDrive") {
    // Shared drive create — parent may be the drive root
    if (!folderId) body.parents = [driveId];
  }

  const res = await apiRequest("POST", `${DRIVE_API}?${qs}`, token, body);
  const data = asObj(res.body);
  return {
    id: String(data.id ?? ""),
    kind: "docs#document",
    mimeType: String(data.mimeType ?? "application/vnd.google-apps.document"),
    name: String(data.name ?? title),
  };
}

async function getDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = resolveDocumentId(node.parameters.documentURL, itemJson);
  if (!documentId) throw new Error("GoogleDocs: documentURL is required");
  const simple = node.parameters.simple !== false;

  const res = await apiRequest("GET", `${DOCS_API}/${encodeURIComponent(documentId)}`, token);
  const data = asObj(res.body);

  if (simple) {
    return {
      documentId: String(data.documentId ?? documentId),
      content: extractPlainText(data),
    };
  }
  return data;
}

async function updateDocument(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const documentId = resolveDocumentId(node.parameters.documentURL, itemJson);
  if (!documentId) throw new Error("GoogleDocs: documentURL is required");

  const actionsUi = (node.parameters.actionsUi ?? {}) as {
    actionFields?: Array<Record<string, unknown>>;
  };
  const fields = actionsUi.actionFields ?? [];
  const requests: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    const req = buildActionRequest(field ?? {}, itemJson);
    if (req) requests.push(req);
  }

  const body: Record<string, unknown> = { requests };

  const updateFields = (node.parameters.updateFields ?? {}) as {
    writeControlObject?: { control?: string; value?: unknown };
  };
  const wco = updateFields.writeControlObject;
  if (wco && wco.value !== undefined && wco.value !== "") {
    const control = String(wco.control ?? "requiredRevisionId");
    const value = String(resolveValue(wco.value, itemJson) ?? "");
    body.writeControl = { [control]: value };
  }

  await apiRequest(
    "POST",
    `${DOCS_API}/${encodeURIComponent(documentId)}:batchUpdate`,
    token,
    body,
  );

  return { documentId };
}

export const googleDocsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "document") ?? "document");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();

  // create/get: once per node execution; update: per input item
  const runOnce = operation === "create" || operation === "get";
  const loopItems = runOnce ? items.slice(0, 1) : items;
  const effective = loopItems.length > 0 ? loopItems : [{ json: {} }];

  for (let idx = 0; idx < effective.length; idx++) {
    const item = effective[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource !== "document") {
        throw new Error(`GoogleDocs: unsupported resource "${resource}"`);
      }
      const token = await getAccessToken(ctx, node);
      let json: Record<string, unknown>;
      if (operation === "create") {
        json = await createDocument(node, itemJson, token);
      } else if (operation === "get") {
        json = await getDocument(node, itemJson, token);
      } else if (operation === "update") {
        json = await updateDocument(node, itemJson, token);
      } else {
        throw new Error(`GoogleDocs: unsupported operation "${operation}"`);
      }
      out.push({ json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
