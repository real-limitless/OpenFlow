import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const API_BASE = "https://api.monday.com/v2";

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("mondayComApi");
  const token = cred ? String(cred.accessToken ?? cred.apiToken ?? "") : "";
  if (token) return token;
  const fallback = process.env.MONDAY_COM_API_KEY;
  if (fallback) return fallback;
  throw new Error("monday.com Tool: mondayComApi credential is not configured");
}

async function graphql(token: string, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    let parsed: { data?: Record<string, unknown>; errors?: Array<{ message?: string }> } | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(parsed?.errors?.[0]?.message ?? `monday.com API request failed with status code ${response.status}`);
    }
    if (parsed?.errors?.length) {
      throw new Error(parsed.errors[0].message ?? "monday.com API request failed");
    }
    return (parsed?.data ?? {}) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function extractItems(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const list = data[key];
  return Array.isArray(list) ? list : [];
}

export const mondayComToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] = inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "Board");
  const operation = ctx.getParam<string>("operation", "");
  const continueOnFail = ctx.continueOnFail();
  const token = await getToken(ctx);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "Board" && operation === "Get all boards") {
        const options = ctx.getParam<Record<string, unknown>>("options", {});
        const limit = (options?.limit as number) ?? 50;
        const state = options?.state as string | undefined;
        const filter = state ? `(state: ${state})` : "()";
        const data = await graphql(token, `query { boards${filter} { id name state board_kind } }`);
        const boards = extractItems(data, "boards");
        result = { data: { boards: limit ? boards.slice(0, limit) : boards } };

      } else if (resource === "Board" && operation === "Get a board") {
        const boardId = ctx.getParam<string>("boardId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        const data = await graphql(token, `query { boards(ids: [${boardId}]) { id name board_kind state } }`);
        const boards = extractItems(data, "boards");
        result = { data: { boards } };

      } else if (resource === "Board" && operation === "Create a new board") {
        const boardName = ctx.getParam<string>("boardName", "");
        const boardKind = ctx.getParam<string>("boardKind", "public");
        if (!boardName) throw new Error("monday.com Tool: boardName is required");
        const data = await graphql(token, `mutation { create_board(board_name: ${JSON.stringify(boardName)}, board_kind: ${boardKind}) { id name board_kind } }`);
        result = { data: { create_board: data.create_board } };

      } else if (resource === "Board" && operation === "Archive a board") {
        const boardId = ctx.getParam<string>("boardId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        const data = await graphql(token, `mutation { archive_board(board_id: ${boardId}) { id } }`);
        result = { data: { archive_board: data.archive_board } };

      } else if (resource === "Board Column" && operation === "Get all columns") {
        const boardId = ctx.getParam<string>("boardId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        const data = await graphql(token, `query { boards(ids: [${boardId}]) { columns { id title type } } }`);
        const boards = extractItems(data, "boards");
        const columns = extractItems((boards[0] ?? {}) as Record<string, unknown>, "columns");
        result = { data: { boards: [{ columns }] } };

      } else if (resource === "Board Column" && operation === "Create a new column") {
        const boardId = ctx.getParam<string>("boardId", "");
        const columnTitle = ctx.getParam<string>("columnTitle", "");
        const columnType = ctx.getParam<string>("columnType", "text");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!columnTitle) throw new Error("monday.com Tool: columnTitle is required");
        const data = await graphql(token, `mutation { create_column(board_id: ${boardId}, title: ${JSON.stringify(columnTitle)}, column_type: ${columnType}) { id title type } }`);
        result = { data: { create_column: data.create_column } };

      } else if (resource === "Board Group" && operation === "Get list of groups in a board") {
        const boardId = ctx.getParam<string>("boardId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        const data = await graphql(token, `query { boards(ids: [${boardId}]) { groups { id title } } }`);
        const boards = extractItems(data, "boards");
        const groups = extractItems((boards[0] ?? {}) as Record<string, unknown>, "groups");
        result = { data: { boards: [{ groups }] } };

      } else if (resource === "Board Group" && operation === "Create a group in a board") {
        const boardId = ctx.getParam<string>("boardId", "");
        const groupName = ctx.getParam<string>("groupName", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!groupName) throw new Error("monday.com Tool: groupName is required");
        const data = await graphql(token, `mutation { create_group(board_id: ${boardId}, group_name: ${JSON.stringify(groupName)}) { id title } }`);
        result = { data: { create_group: data.create_group } };

      } else if (resource === "Board Group" && operation === "Delete a group in a board") {
        const boardId = ctx.getParam<string>("boardId", "");
        const groupId = ctx.getParam<string>("groupId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!groupId) throw new Error("monday.com Tool: groupId is required");
        const data = await graphql(token, `mutation { delete_group(board_id: ${boardId}, group_id: ${JSON.stringify(groupId)}) { id } }`);
        result = { data: { delete_group: data.delete_group } };

      } else if (resource === "Board Item" && operation === "Get all items") {
        const boardId = ctx.getParam<string>("boardId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        const groupId = ctx.getParam<string>("groupId", "");
        const groupArg = groupId ? `groups: [${JSON.stringify(groupId)}]` : "";
        const data = await graphql(token, `query { boards(ids: [${boardId}]) { items_page(${groupArg}) { items { id name } } } }`);
        const boards = extractItems(data, "boards");
        const page = (boards[0]?.items_page ?? {}) as Record<string, unknown>;
        const itemsList = extractItems(page, "items");
        result = { data: { boards: [{ items_page: { items: itemsList } }] } };

      } else if (resource === "Board Item" && operation === "Get an item") {
        const itemId = ctx.getParam<string>("itemId", "");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        const data = await graphql(token, `query { items(ids: [${itemId}]) { id name group { id } column_values { id title text } } }`);
        const itemsList = extractItems(data, "items");
        result = { data: { items: itemsList } };

      } else if (resource === "Board Item" && operation === "Create an item in a board's group") {
        const boardId = ctx.getParam<string>("boardId", "");
        const itemName = ctx.getParam<string>("itemName", "");
        const groupId = ctx.getParam<string>("groupId", "");
        const columnValuesRaw = ctx.getParam<string>("columnValues", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!itemName) throw new Error("monday.com Tool: itemName is required");
        const args = [`board_id: ${boardId}`, `item_name: ${JSON.stringify(itemName)}`];
        const variables: Record<string, unknown> = {};
        if (groupId) args.push(`group_id: ${JSON.stringify(groupId)}`);
        if (columnValuesRaw) {
          try { variables.columnValues = JSON.parse(columnValuesRaw); } catch { variables.columnValues = columnValuesRaw; }
          args.push("column_values: $columnValues");
        }
        const data = await graphql(token, `mutation create_item($columnValues: JSON) { create_item(${args.join(", ")}) { id name } }`, variables);
        result = { data: { create_item: data.create_item } };

      } else if (resource === "Board Item" && operation === "Change a column value for a board item") {
        const boardId = ctx.getParam<string>("boardId", "");
        const itemId = ctx.getParam<string>("itemId", "");
        const columnId = ctx.getParam<string>("columnId", "");
        const columnValueRaw = ctx.getParam<string>("columnValue", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        if (!columnId) throw new Error("monday.com Tool: columnId is required");
        let value: unknown;
        try { value = JSON.parse(columnValueRaw); } catch { value = columnValueRaw; }
        const data = await graphql(token, `mutation change_column_value($value: JSON!) { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: ${JSON.stringify(columnId)}, value: $value) { id name } }`, { value });
        result = { data: { change_column_value: data.change_column_value } };

      } else if (resource === "Board Item" && operation === "Change multiple column values for a board item") {
        const boardId = ctx.getParam<string>("boardId", "");
        const itemId = ctx.getParam<string>("itemId", "");
        const columnValuesRaw = ctx.getParam<string>("columnValues", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        if (!columnValuesRaw) throw new Error("monday.com Tool: columnValues is required");
        let columnValues: unknown;
        try { columnValues = JSON.parse(columnValuesRaw); } catch { columnValues = columnValuesRaw; }
        const data = await graphql(token, `mutation change_multiple_column_values($columnValues: JSON!) { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: $columnValues) { id name } }`, { columnValues });
        result = { data: { change_multiple_column_values: data.change_multiple_column_values } };

      } else if (resource === "Board Item" && operation === "Delete an item") {
        const itemId = ctx.getParam<string>("itemId", "");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        const data = await graphql(token, `mutation { delete_item(item_id: ${itemId}) { id } }`);
        result = { data: { delete_item: data.delete_item } };

      } else if (resource === "Board Item" && operation === "Add an update to an item") {
        const itemId = ctx.getParam<string>("itemId", "");
        const updateBody = ctx.getParam<string>("updateBody", "");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        if (!updateBody) throw new Error("monday.com Tool: updateBody is required");
        const data = await graphql(token, `mutation { create_update(item_id: ${itemId}, body: ${JSON.stringify(updateBody)}) { id body } }`);
        result = { data: { create_update: data.create_update } };

      } else if (resource === "Board Item" && operation === "Move item to group") {
        const boardId = ctx.getParam<string>("boardId", "");
        const itemId = ctx.getParam<string>("itemId", "");
        const groupId = ctx.getParam<string>("groupId", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!itemId) throw new Error("monday.com Tool: itemId is required");
        if (!groupId) throw new Error("monday.com Tool: groupId is required");
        const data = await graphql(token, `mutation { move_item_to_group(board_id: ${boardId}, item_id: ${itemId}, group_id: ${JSON.stringify(groupId)}) { id name } }`);
        result = { data: { move_item_to_group: data.move_item_to_group } };

      } else if (resource === "Board Item" && operation === "Get items by column value") {
        const boardId = ctx.getParam<string>("boardId", "");
        const columnId = ctx.getParam<string>("columnId", "");
        const columnValueSearch = ctx.getParam<string>("columnValueSearch", "");
        if (!boardId) throw new Error("monday.com Tool: boardId is required");
        if (!columnId) throw new Error("monday.com Tool: columnId is required");
        if (!columnValueSearch) throw new Error("monday.com Tool: columnValueSearch is required");
        const data = await graphql(token, `query get_items_by_column_value($columnValue: String!) { items_by_column_values(board_id: ${boardId}, column_id: ${JSON.stringify(columnId)}, column_value: $columnValue) { id name } }`, { columnValue: columnValueSearch });
        result = { data: { items_by_column_values: data.items_by_column_values } };

      } else {
        throw new Error(`monday.com Tool: unsupported resource/operation: ${resource}/${operation}`);
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
