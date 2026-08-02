import type { NodeExecutor } from "@/sdk";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

interface OAuth2Cred {
  accessToken: string;
}

async function getToken(ctx: { getCredential(name: string): Promise<unknown> }, authentication: string): Promise<string> {
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleSheetsTriggerOAuth2Api";
  const cred = await ctx.getCredential(credName) as OAuth2Cred | null;
  if (!cred?.accessToken) {
    throw new Error(`GoogleSheetsTrigger: ${credName} credential is not configured`);
  }
  return cred.accessToken;
}

async function sheetsRequest(
  token: string,
  method: string,
  url: string,
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
    const errObj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const msg =
      ((errObj.error as { message?: string } | undefined)?.message) ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleSheetsTrigger: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function resolveLocator(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return extractId(raw);
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    return extractId(String((raw as Record<string, unknown>).value ?? ""));
  }
  return extractId(String(raw));
}

function extractId(value: string): string {
  if (!value) return "";
  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  return value;
}

function sheetTitle(name: string): string {
  if (!name) return "Sheet1";
  if (/^[A-Za-z_]/.test(name) && !name.includes("!") && !name.includes("'")) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

async function fetchSheetValues(
  token: string,
  documentId: string,
  range: string,
  valueRender: string,
  dateTimeRender: string,
): Promise<unknown[][]> {
  const renderMap: Record<string, string> = {
    unformatted: "UNFORMATTED_VALUE",
    formatted: "FORMATTED_VALUE",
    formulas: "FORMULA",
  };
  const dateMap: Record<string, string> = {
    serialNumber: "SERIAL_NUMBER",
    formattedString: "FORMATTED_STRING",
  };
  const qs = new URLSearchParams({
    valueRenderOption: renderMap[valueRender] ?? "UNFORMATTED_VALUE",
    dateTimeRenderOption: dateMap[dateTimeRender] ?? "FORMATTED_STRING",
  });
  const url = `${SHEETS_API}/${encodeURIComponent(documentId)}/values/${encodeURIComponent(range)}?${qs}`;
  const res = await sheetsRequest(token, "GET", url);
  const data = (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
  return (data.values as unknown[][]) ?? [];
}

interface PollState {
  rowCount: number;
  seenHashes: Set<string>;
}

const pollStates = new Map<string, PollState>();

export function _clearPollStatesForTest(): void {
  pollStates.clear();
}

function getPollState(ctx: { node: { id?: string } }): PollState {
  const id = ctx.node.id ?? "default";
  let state = pollStates.get(id);
  if (!state) {
    state = { rowCount: 0, seenHashes: new Set() };
    pollStates.set(id, state);
  }
  return state;
}

function hashRow(row: unknown[]): string {
  return row.map((v) => String(v ?? "")).join("|");
}

export const googleSheetsTriggerExecutor: NodeExecutor = async (ctx) => {
  const authentication = String(ctx.getParam("authentication", "triggerOAuth2"));
  const documentId = resolveLocator(ctx.getParam("documentId"));
  const sheetName = resolveLocator(ctx.getParam("sheetName"));
  const event = String(ctx.getParam("event", "rowAdded"));
  const options = (ctx.getParam("options", {}) as Record<string, unknown>);
  const pollTimes = ctx.getParam("pollTimes", {}) as Record<string, unknown>;

  if (!documentId) throw new Error("GoogleSheetsTrigger: documentId is required");
  if (!sheetName) throw new Error("GoogleSheetsTrigger: sheetName is required");

  const token = await getToken(ctx, authentication);

  // Detect manual execution via pollTimes absence
  const isManual = !pollTimes || !(pollTimes as Record<string, unknown>).item;

  const valueRender = String(options.valueRender ?? "unformatted");
  const dateTimeRender = String(options.dateTimeRender ?? "formattedString");
  const dataLoc = (options.dataLocationOnSheet ?? {}) as Record<string, unknown>;
  const headerRowNum = Number(dataLoc.headerRow ?? 1);
  const firstDataRowNum = Number(dataLoc.firstDataRow ?? headerRowNum + 1);

  const range = `${sheetTitle(sheetName)}`;
  const allValues = await fetchSheetValues(token, documentId, range, valueRender, dateTimeRender);

  if (allValues.length < headerRowNum) {
    return [[]];
  }

  const headers = (allValues[headerRowNum - 1] ?? []).map((h, i) => String(h ?? `col_${i}`));
  const dataRows = allValues.slice(firstDataRowNum - 1);

  if (isManual) {
    const items = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = row[c] ?? "";
      }
      return { json: obj };
    });
    return [items];
  }

  if (dataRows.length === 0) {
    return [[]];
  }

  const state = getPollState(ctx);

  if (state.rowCount === 0) {
    state.rowCount = dataRows.length;
    for (const row of dataRows) {
      state.seenHashes.add(hashRow(row));
    }
    return [[]];
  }

  const prevCount = state.rowCount;
  state.rowCount = dataRows.length;

  const changedRows: Array<{ rowIndex: number; row: unknown[] }> = [];

  if (event === "rowAdded" || event === "anyUpdate") {
    for (let i = prevCount; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row) continue;
      const h = hashRow(row);
      if (!state.seenHashes.has(h)) {
        state.seenHashes.add(h);
        changedRows.push({ rowIndex: firstDataRowNum + i, row });
      }
    }
  }

  if (event === "rowUpdate" || event === "anyUpdate") {
    for (let i = 0; i < Math.min(prevCount, dataRows.length); i++) {
      const row = dataRows[i];
      if (!row) continue;
      const h = hashRow(row);
      if (!state.seenHashes.has(h)) {
        state.seenHashes.add(h);
        changedRows.push({ rowIndex: firstDataRowNum + i, row });
      }
    }
  }

  if (changedRows.length === 0) {
    return [[]];
  }

  const items = changedRows.map(({ rowIndex, row }) => {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] ?? "";
    }
    obj._rowNumber = rowIndex;
    obj._changeType = event;
    return { json: obj };
  });

  return [items];
};
