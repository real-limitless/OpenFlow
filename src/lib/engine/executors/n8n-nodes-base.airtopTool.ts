import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

interface AirtopApiResponse {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function getParam(params: Record<string, unknown>, name: string, fallback?: unknown): unknown {
  const v = params[name];
  return v !== undefined && v !== null ? v : fallback;
}

async function toolSessionCreate(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const url = "https://api.airtop.ai/v1/sessions";
  const body: Record<string, unknown> = {};
  const profileName = bodyParams.profileName;
  if (profileName) body.profileName = profileName;
  body.timeoutMinutes = bodyParams.timeoutMinutes ?? 10;
  body.record = bodyParams.record ?? false;
  const proxy = bodyParams.proxy;
  if (proxy && proxy !== "none") {
    if (proxy === "integrated") {
      body.proxy = { type: "integrated", country: "US", sticky: true };
    } else if (proxy === "proxyUrl" && bodyParams.proxyUrl) {
      body.proxy = { type: "custom", url: bodyParams.proxyUrl };
    }
  }
  return apiRequest(ctx, "POST", url, body);
}

async function toolSessionSave(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/save-profile`, { profileName: bodyParams.profileName });
}

async function toolSessionTerminate(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  return apiRequest(ctx, "DELETE", `https://api.airtop.ai/v1/sessions/${sessionId}/terminate`);
}

async function toolSessionWaitForDownload(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/wait-for-download`, { timeout: bodyParams.timeout ?? 30 });
}

async function toolWindowCreate(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  const body: Record<string, unknown> = {};
  if (bodyParams.url) body.url = bodyParams.url;
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/windows`, body);
}

async function toolWindowLoad(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const windowId = bodyParams.windowId as string;
  if (!sessionId || !windowId) throw new Error("sessionId and windowId are required");
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/load`, { url: bodyParams.url });
}

async function toolWindowClose(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const windowId = bodyParams.windowId as string;
  if (!sessionId || !windowId) throw new Error("sessionId and windowId are required");
  return apiRequest(ctx, "DELETE", `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/close`);
}

async function toolWindowList(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  return apiRequest(ctx, "GET", `https://api.airtop.ai/v1/sessions/${sessionId}/windows`);
}

async function toolWindowGetLiveView(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const windowId = bodyParams.windowId as string;
  if (!sessionId || !windowId) throw new Error("sessionId and windowId are required");
  return apiRequest(ctx, "GET", `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/live-view`);
}

async function toolWindowTakeScreenshot(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const windowId = bodyParams.windowId as string;
  if (!sessionId || !windowId) throw new Error("sessionId and windowId are required");
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/screenshot`);
}

async function toolExtractionQuery(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunExtraction(bodyParams, ctx, "query");
}

async function toolExtractionGetPaginated(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunExtraction(bodyParams, ctx, "getPaginated");
}

async function toolExtractionScrape(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunExtraction(bodyParams, ctx, "scrape");
}

async function toolRunExtraction(bodyParams: Record<string, unknown>, ctx: any, mode: string): Promise<AirtopApiResponse> {
  const sessionMode = bodyParams.sessionMode as string | undefined;
  let sessionId = bodyParams.sessionId as string | undefined;
  let windowId = bodyParams.windowId as string | undefined;

  if (sessionMode === "new") {
    const createResp = await apiRequest(ctx, "POST", "https://api.airtop.ai/v1/sessions", {});
    const sessionData = createResp.data as Record<string, unknown> | undefined;
    sessionId = (sessionData?.sessionId ?? createResp.sessionId) as string;
    const winResp = await apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/windows`, {});
    const winData = winResp.data as Record<string, unknown> | undefined;
    windowId = (winData?.windowId ?? winResp.windowId) as string;
  }

  if (!sessionId) throw new Error("sessionId is required");
  if (!windowId) throw new Error("windowId is required");

  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/extraction/${mode}`;
  const body: Record<string, unknown> = {};
  if (bodyParams.prompt) body.prompt = bodyParams.prompt;
  return apiRequest(ctx, "POST", endpoint, body);
}

async function toolInteractionClick(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunInteraction(bodyParams, ctx, "click", { clickType: bodyParams.clickType ?? "click" });
}

async function toolInteractionFill(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunInteraction(bodyParams, ctx, "fill", { formData: bodyParams.formData });
}

async function toolInteractionHover(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunInteraction(bodyParams, ctx, "hover");
}

async function toolInteractionScroll(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunInteraction(bodyParams, ctx, "scroll", { scrollingMode: bodyParams.scrollingMode ?? "automatic" });
}

async function toolInteractionType(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return toolRunInteraction(bodyParams, ctx, "type", { text: bodyParams.text, pressEnterKey: bodyParams.pressEnterKey ?? false });
}

async function toolRunInteraction(bodyParams: Record<string, unknown>, ctx: any, action: string, extra?: Record<string, unknown>): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const windowId = bodyParams.windowId as string;
  if (!sessionId) throw new Error("sessionId is required");
  if (!windowId) throw new Error("windowId is required");
  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/interaction/${action}`;
  const body: Record<string, unknown> = {};
  if (bodyParams.elementDescription) body.elementDescription = bodyParams.elementDescription;
  if (extra) Object.assign(body, extra);
  return apiRequest(ctx, "POST", endpoint, body);
}

async function toolFileUpload(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  if (!sessionId) throw new Error("sessionId is required");
  const body: Record<string, unknown> = {
    fileName: bodyParams.fileName,
    fileType: bodyParams.fileType ?? "customer_upload",
  };
  const source = bodyParams.source as string | undefined;
  if (source === "binary") {
    body.source = "binary";
    body.binaryPropertyName = bodyParams.binaryPropertyName ?? "data";
  } else {
    body.source = "url";
    body.url = bodyParams.url;
  }
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/files`, body);
}

async function toolFileLoad(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const sessionId = bodyParams.sessionId as string;
  const fileId = bodyParams.fileId as string;
  if (!sessionId) throw new Error("sessionId is required");
  return apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/files/${fileId}/load`);
}

async function toolFileGet(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const fileId = bodyParams.fileId as string;
  return apiRequest(ctx, "GET", `https://api.airtop.ai/v1/files/${fileId}`);
}

async function toolFileGetMany(_bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  return apiRequest(ctx, "GET", "https://api.airtop.ai/v1/files");
}

async function toolFileDelete(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const fileId = bodyParams.fileId as string;
  return apiRequest(ctx, "DELETE", `https://api.airtop.ai/v1/files/${fileId}`);
}

async function toolAgentRun(bodyParams: Record<string, unknown>, ctx: any): Promise<AirtopApiResponse> {
  const agentId = bodyParams.agentId as string;
  if (!agentId) throw new Error("agentId is required");
  const endpoint = `https://api.airtop.ai/v1/agents/${agentId}/invoke`;
  const body: Record<string, unknown> = {};
  if (bodyParams.awaitExecution !== undefined) body.awaitExecution = bodyParams.awaitExecution;
  if (bodyParams.sessionId) body.sessionId = bodyParams.sessionId;
  if (bodyParams.windowId) body.windowId = bodyParams.windowId;
  return apiRequest(ctx, "POST", endpoint, body);
}

async function apiRequest(ctx: any, method: string, url: string, body?: Record<string, unknown>): Promise<AirtopApiResponse> {
  const cred = await ctx.getCredential?.("airtopApi");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cred) {
    const apiKey = (cred as Record<string, unknown>).apiKey as string;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["api-key"] = apiKey;
    }
  }
  const opts: RequestInit = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };
  const response = await fetch(url, opts);
  const data = await response.json() as AirtopApiResponse;
  if (!response.ok) {
    throw new Error((data as Record<string, unknown>)?.message as string ?? `Airtop API error: ${response.statusText}`);
  }
  return data;
}

const resourceHandlers: Record<string, Record<string, (p: Record<string, unknown>, ctx: any) => Promise<AirtopApiResponse>>> = {
  session: {
    create: toolSessionCreate,
    save: toolSessionSave,
    terminate: toolSessionTerminate,
    waitForDownload: toolSessionWaitForDownload,
  },
  window: {
    create: toolWindowCreate,
    load: toolWindowLoad,
    close: toolWindowClose,
    list: toolWindowList,
    getLiveView: toolWindowGetLiveView,
    takeScreenshot: toolWindowTakeScreenshot,
  },
  extraction: {
    query: toolExtractionQuery,
    getPaginated: toolExtractionGetPaginated,
    scrape: toolExtractionScrape,
  },
  interaction: {
    click: toolInteractionClick,
    fill: toolInteractionFill,
    hover: toolInteractionHover,
    scroll: toolInteractionScroll,
    type: toolInteractionType,
  },
  file: {
    upload: toolFileUpload,
    load: toolFileLoad,
    get: toolFileGet,
    getMany: toolFileGetMany,
    delete: toolFileDelete,
  },
  agent: {
    run: toolAgentRun,
  },
};

export const airtopToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ensureItems(ctx.getInputItems(0));
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    const resource = String(itemJson.resource ?? ctx.getParam("resource") ?? "extraction");
    const operation = String(itemJson.operation ?? ctx.getParam("operation") ?? "query");

    const handler = resourceHandlers[resource]?.[operation];
    if (!handler) {
      if (continueOnFail) {
        out.push({ json: { error: `Unknown resource/operation: ${resource}/${operation}` }, pairedItem });
        continue;
      }
      throw new Error(`Unknown resource/operation: ${resource}/${operation}`);
    }

    try {
      const result = await handler(itemJson, ctx);
      out.push({ json: { ...itemJson, ...result.data ?? result }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
