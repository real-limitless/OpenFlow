import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.monday.com/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asStr(raw: unknown, itemJson: Record<string, unknown> = {}, def = ""): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved === undefined || resolved === null) return def;
  if (typeof resolved === "string") return resolved;
  if (typeof resolved === "object" && "value" in (resolved as Record<string, unknown>)) {
    return String((resolved as Record<string, unknown>).value ?? def);
  }
  return String(resolved);
}

function toBool(raw: unknown, def = false): boolean {
  if (raw === undefined || raw === null) return def;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  return false;
}

function toNum(raw: unknown, def = 0): number {
  const n = Number(resolveValue(raw, {}));
  return isNaN(n) ? def : n;
}

/** Parse a JSON string or object into a plain value. Strings that are empty are returned as-is. */
function asJson(raw: unknown, itemJson: Record<string, unknown>, label: string): unknown {
  const resolved = resolveValue(raw, itemJson);
  if (resolved === undefined || resolved === null) return undefined;
  if (typeof resolved === "string") {
    const trimmed = resolved.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`monday.com: invalid JSON in ${label}`);
    }
  }
  return resolved;
}

interface GraphqlResult {
  data: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
}

async function graphql(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "API-Version": "2023-10",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: GraphqlResult | null = null;
    try {
      parsed = text ? (JSON.parse(text) as GraphqlResult) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const message = parsed?.errors?.[0]?.message;
      throw new Error(message || `monday.com API request failed with status code ${response.status}`);
    }
    if (parsed?.errors?.length) {
      const message = parsed.errors[0].message;
      throw new Error(message || "monday.com API request failed");
    }
    return (parsed?.data ?? {}) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("monday.com:") || err.message.includes("monday.com"))) {
      throw err;
    }
    throw new Error(`monday.com request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(node.parameters.authentication ?? "accessToken");
  const credName = authentication === "oAuth2" ? "mondayComOAuth2Api" : "mondayComApi";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String(cred.accessToken ?? cred.apiToken ?? "") : "";
  if (!accessToken) {
    const fallback = process.env.MONDAY_COM_API_KEY;
    if (fallback) return fallback;
    throw new Error(`monday.com: ${credName} credential is not configured`);
  }
  return accessToken;
}

interface HandlerParams {
  ctx: ExecutionContext;
  node: INode;
  token: string;
  itemJson: Record<string, unknown>;
}

type ResourceHandler = (
  params: HandlerParams,
) => Promise<Record<string, unknown> | Record<string, unknown>[]>;

function extractItems(result: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const list = result[key];
  if (Array.isArray(list)) return list as Record<string, unknown>[];
  return [];
}

const handlers: Record<string, Record<string, ResourceHandler>> = {
  board: {
    archive: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      const data = await graphql(
        token,
        `mutation archive_board($boardId: ID!) { archive_board(board_id: $boardId) { id } }`,
        { boardId },
      );
      const archived = (data.archive_board ?? {}) as Record<string, unknown>;
      return archived;
    },
    create: async ({ node, token, itemJson }) => {
      const name = asStr(node.parameters.name, itemJson);
      if (!name) throw new Error("monday.com: name is required");
      const kind = asStr(node.parameters.kind, itemJson, "public");
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const templateId = toNum(resolveValue(additionalFields.templateId, itemJson));
      const args = [`board_name: ${JSON.stringify(name)}`, `board_kind: ${kind}`];
      if (templateId) args.push(`template_id: ${templateId}`);
      const data = await graphql(
        token,
        `mutation create_board { create_board(${args.join(", ")}) { id name } }`,
      );
      return (data.create_board ?? {}) as Record<string, unknown>;
    },
    get: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      const data = await graphql(
        token,
        `query get_board { boards(ids: [${boardId}]) { id name board_kind } }`,
      );
      const boards = extractItems(data, "boards");
      return boards[0] ?? {};
    },
    getAll: async ({ node, token, itemJson }) => {
      const returnAll = toBool(node.parameters.returnAll);
      const limit = toNum(node.parameters.limit, 50);
      const data = await graphql(
        token,
        `query get_boards { boards() { id name board_kind } }`,
      );
      const boards = extractItems(data, "boards");
      return returnAll ? boards : boards.slice(0, limit);
    },
  },
  boardColumn: {
    create: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const title = asStr(node.parameters.title, itemJson);
      const columnType = asStr(node.parameters.columnType, itemJson, "text");
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!title) throw new Error("monday.com: title is required");
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const defaults = asJson(additionalFields.defaults, itemJson, "defaults");
      const args = [
        `board_id: ${boardId}`,
        `title: ${JSON.stringify(title)}`,
        `column_type: ${columnType}`,
      ];
      if (defaults !== undefined && defaults !== null) {
        args.push(`defaults: ${JSON.stringify(defaults)}`);
      }
      const data = await graphql(
        token,
        `mutation create_column { create_column(${args.join(", ")}) { id title type } }`,
      );
      return (data.create_column ?? {}) as Record<string, unknown>;
    },
    getAll: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      const data = await graphql(
        token,
        `query get_columns { boards(ids: [${boardId}]) { columns { id title type } } }`,
      );
      const boards = extractItems(data, "boards");
      return extractItems((boards[0] ?? {}) as Record<string, unknown>, "columns");
    },
  },
  boardGroup: {
    create: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const name = asStr(node.parameters.name, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!name) throw new Error("monday.com: name is required");
      const data = await graphql(
        token,
        `mutation create_group { create_group(board_id: ${boardId}, group_name: ${JSON.stringify(name)}) { id title } }`,
      );
      return (data.create_group ?? {}) as Record<string, unknown>;
    },
    delete: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const groupId = asStr(node.parameters.groupId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!groupId) throw new Error("monday.com: groupId is required");
      const data = await graphql(
        token,
        `mutation delete_group { delete_group(board_id: ${boardId}, group_id: ${JSON.stringify(groupId)}) { id } }`,
      );
      const deleted = (data.delete_group ?? {}) as Record<string, unknown>;
      return deleted;
    },
    getAll: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      const data = await graphql(
        token,
        `query get_groups { boards(ids: [${boardId}]) { groups { id title } } }`,
      );
      const boards = extractItems(data, "boards");
      return extractItems((boards[0] ?? {}) as Record<string, unknown>, "groups");
    },
  },
  boardItem: {
    addUpdate: async ({ node, token, itemJson }) => {
      const itemId = asStr(node.parameters.itemId, itemJson);
      const value = asStr(node.parameters.value, itemJson);
      if (!itemId) throw new Error("monday.com: itemId is required");
      if (!value) throw new Error("monday.com: value is required");
      const data = await graphql(
        token,
        `mutation create_update { create_update(item_id: ${itemId}, body: ${JSON.stringify(value)}) { id body } }`,
      );
      return (data.create_update ?? {}) as Record<string, unknown>;
    },
    changeColumnValue: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const itemId = asStr(node.parameters.itemId, itemJson);
      const columnId = asStr(node.parameters.columnId, itemJson);
      const value = asJson(node.parameters.value, itemJson, "value");
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!itemId) throw new Error("monday.com: itemId is required");
      if (!columnId) throw new Error("monday.com: columnId is required");
      if (value === undefined) throw new Error("monday.com: value is required");
      const data = await graphql(
        token,
        `mutation change_column_value($value: JSON!) { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: ${JSON.stringify(columnId)}, value: $value) { id name } }`,
        { value },
      );
      return (data.change_column_value ?? {}) as Record<string, unknown>;
    },
    changeMultipleColumnValues: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const itemId = asStr(node.parameters.itemId, itemJson);
      const columnValues = asJson(node.parameters.columnValues, itemJson, "columnValues");
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!itemId) throw new Error("monday.com: itemId is required");
      if (columnValues === undefined) throw new Error("monday.com: columnValues is required");
      const data = await graphql(
        token,
        `mutation change_multiple_column_values($columnValues: JSON!) { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: $columnValues) { id name } }`,
        { columnValues },
      );
      return (data.change_multiple_column_values ?? {}) as Record<string, unknown>;
    },
    create: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const name = asStr(node.parameters.name, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!name) throw new Error("monday.com: name is required");
      const groupId = asStr(node.parameters.groupId, itemJson);
      const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
      const columnValues =
        asJson(node.parameters.columnValues, itemJson, "columnValues") ??
        asJson(additionalFields.columnValues, itemJson, "columnValues");
      const args = [`board_id: ${boardId}`, `item_name: ${JSON.stringify(name)}`];
      if (groupId) args.push(`group_id: ${JSON.stringify(groupId)}`);
      const variables: Record<string, unknown> = {};
      if (columnValues !== undefined && columnValues !== null) {
        args.push("column_values: $columnValues");
        variables.columnValues = columnValues;
      }
      const data = await graphql(
        token,
        `mutation create_item($columnValues: JSON) { create_item(${args.join(", ")}) { id name } }`,
        variables,
      );
      return (data.create_item ?? {}) as Record<string, unknown>;
    },
    delete: async ({ node, token, itemJson }) => {
      const itemId = asStr(node.parameters.itemId, itemJson);
      if (!itemId) throw new Error("monday.com: itemId is required");
      const data = await graphql(
        token,
        `mutation delete_item { delete_item(item_id: ${itemId}) { id } }`,
      );
      const deleted = (data.delete_item ?? {}) as Record<string, unknown>;
      return deleted;
    },
    get: async ({ node, token, itemJson }) => {
      const itemId = asStr(node.parameters.itemId, itemJson);
      if (!itemId) throw new Error("monday.com: itemId is required");
      const data = await graphql(
        token,
        `query get_item { items(ids: [${itemId}]) { id name group { id } column_values { id title text } } }`,
      );
      const items = extractItems(data, "items");
      return items[0] ?? {};
    },
    getAll: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const returnAll = toBool(node.parameters.returnAll);
      const limit = toNum(node.parameters.limit, 50);
      const groupId = asStr(node.parameters.groupId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      const groupArg = groupId ? `groups: [${JSON.stringify(groupId)}]` : "";
      const data = await graphql(
        token,
        `query get_items { boards(ids: [${boardId}]) { items_page(${groupArg}) { items { id name } } } }`,
      );
      const boards = extractItems(data, "boards");
      const page = (boards[0]?.items_page ?? {}) as Record<string, unknown>;
      const items = extractItems(page, "items");
      return returnAll ? items : items.slice(0, limit);
    },
    getByColumnValue: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const columnId = asStr(node.parameters.columnId, itemJson);
      const columnValue = asStr(node.parameters.columnValue, itemJson);
      const returnAll = toBool(node.parameters.returnAll);
      const limit = toNum(node.parameters.limit, 50);
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!columnId) throw new Error("monday.com: columnId is required");
      if (!columnValue) throw new Error("monday.com: columnValue is required");
      const data = await graphql(
        token,
        `query get_items_by_column_value($columnValue: String!) { items_by_column_values(board_id: ${boardId}, column_id: ${JSON.stringify(columnId)}, column_value: $columnValue) { id name } }`,
        { columnValue },
      );
      const items = extractItems(data, "items_by_column_values");
      return returnAll ? items : items.slice(0, limit);
    },
    move: async ({ node, token, itemJson }) => {
      const boardId = asStr(node.parameters.boardId, itemJson);
      const itemId = asStr(node.parameters.itemId, itemJson);
      const groupId = asStr(node.parameters.groupId, itemJson);
      if (!boardId) throw new Error("monday.com: boardId is required");
      if (!itemId) throw new Error("monday.com: itemId is required");
      if (!groupId) throw new Error("monday.com: groupId is required");
      const data = await graphql(
        token,
        `mutation move_item_to_group { move_item_to_group(board_id: ${boardId}, item_id: ${itemId}, group_id: ${JSON.stringify(groupId)}) { id name } }`,
      );
      return (data.move_item_to_group ?? {}) as Record<string, unknown>;
    },
  },
};

export const mondayComExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "board");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const handler = handlers[resource]?.[operation];
  if (!handler) {
    throw new Error(`monday.com: unsupported resource/operation: ${resource}/${operation}`);
  }

  const token = await getToken(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await handler({ ctx, node, token, itemJson });
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (continueOnFail) {
        const message = err instanceof Error ? err.message : String(err);
        out.push({ json: { error: message }, pairedItem });
      } else {
        throw err;
      }
    }
  }

  return [out];
};
