import type { NodeExecutor } from "@/sdk";

interface AirtopApiResponse {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function getParam(node: { parameters: Record<string, unknown> }, name: string, fallback?: unknown): unknown {
  const v = node.parameters[name];
  return v !== undefined && v !== null ? v : fallback;
}

function getAdditionalField(node: { parameters: Record<string, unknown> }, name: string): unknown {
  const af = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (!af) return undefined;
  return af[name];
}

async function sessionCreate(ctx: any, node: any): Promise<AirtopApiResponse> {
  const url = "https://api.airtop.ai/v1/sessions";
  const body: Record<string, unknown> = {};
  const profileName = getParam(node, "profileName");
  if (profileName) body.profileName = profileName;
  const saveProfile = getParam(node, "saveProfileOnTermination");
  if (saveProfile) body.saveProfileOnTermination = saveProfile;
  body.record = getParam(node, "record") ?? false;
  body.timeoutMinutes = getParam(node, "timeoutMinutes") ?? 10;
  const proxy = getParam(node, "proxy");
  if (proxy && proxy !== "none") {
    if (proxy === "integrated") {
      const pc = getParam(node, "proxyConfig") as Record<string, unknown> | undefined;
      body.proxy = { type: "integrated", country: pc?.country ?? "US", sticky: pc?.sticky ?? true };
    } else if (proxy === "proxyUrl") {
      body.proxy = { type: "custom", url: getParam(node, "proxyUrl") };
    }
  }
  const solveCaptcha = getAdditionalField(node, "solveCaptcha");
  if (solveCaptcha) body.solveCaptcha = solveCaptcha;
  const extensionIds = getAdditionalField(node, "extensionIds");
  if (extensionIds) body.extensionIds = extensionIds;
  return apiRequest(ctx, "POST", url, body);
}

async function sessionSave(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/save-profile`;
  return apiRequest(ctx, "POST", url, { profileName: getParam(node, "profileName") });
}

async function sessionTerminate(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/terminate`;
  return apiRequest(ctx, "DELETE", url);
}

async function sessionWaitForDownload(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/wait-for-download`;
  const body: Record<string, unknown> = {};
  const timeout = getParam(node, "timeout") ?? 30;
  body.timeout = timeout;
  return apiRequest(ctx, "POST", url, body);
}

async function windowCreate(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows`;
  const body: Record<string, unknown> = {};
  const urlParam = getParam(node, "url");
  if (urlParam) body.url = urlParam;
  const getLiveView = getParam(node, "getLiveView");
  if (getLiveView) body.getLiveView = getLiveView;
  const includeNavigationBar = getParam(node, "includeNavigationBar");
  if (includeNavigationBar) body.includeNavigationBar = includeNavigationBar;
  const screenResolution = getParam(node, "screenResolution");
  if (screenResolution) body.screenResolution = screenResolution;
  const disableResize = getParam(node, "disableResize");
  if (disableResize) body.disableResize = disableResize;
  const waitUntil = getAdditionalField(node, "waitUntil");
  if (waitUntil) body.waitUntil = waitUntil;
  return apiRequest(ctx, "POST", url, body);
}

async function windowLoad(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const windowId = getParam(node, "windowId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/load`;
  const body: Record<string, unknown> = { url: getParam(node, "url") };
  const waitUntil = getAdditionalField(node, "waitUntil");
  if (waitUntil) body.waitUntil = waitUntil;
  return apiRequest(ctx, "POST", url, body);
}

async function windowClose(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const windowId = getParam(node, "windowId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/close`;
  return apiRequest(ctx, "DELETE", url);
}

async function windowList(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows`;
  return apiRequest(ctx, "GET", url);
}

async function windowGetLiveView(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const windowId = getParam(node, "windowId");
  let url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/live-view`;
  const params: Record<string, string> = {};
  const includeNav = getAdditionalField(node, "includeNavigationBar") ?? getParam(node, "includeNavigationBar");
  if (includeNav) params.includeNavigationBar = String(includeNav);
  const screenRes = getAdditionalField(node, "screenResolution") ?? getParam(node, "screenResolution");
  if (screenRes) params.screenResolution = String(screenRes);
  const disableResize = getAdditionalField(node, "disableResize") ?? getParam(node, "disableResize");
  if (disableResize) params.disableResize = String(disableResize);
  const qs = new URLSearchParams(params).toString();
  if (qs) url += `?${qs}`;
  return apiRequest(ctx, "GET", url);
}

async function windowTakeScreenshot(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId");
  const windowId = getParam(node, "windowId");
  const url = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/screenshot`;
  return apiRequest(ctx, "POST", url);
}

async function extractionQuery(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runExtraction(ctx, node, "query");
}

async function extractionGetPaginated(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runExtraction(ctx, node, "getPaginated");
}

async function extractionScrape(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runExtraction(ctx, node, "scrape");
}

async function runExtraction(ctx: any, node: any, mode: string): Promise<AirtopApiResponse> {
  const sessionMode = getParam(node, "sessionMode") as string | undefined;
  let sessionId = getParam(node, "sessionId") as string | undefined;
  let windowId = getParam(node, "windowId") as string | undefined;
  const urlInput = getParam(node, "url") as string | undefined;
  const profileName = getParam(node, "profileName") as string | undefined;

  if (sessionMode === "new") {
    const autoTerminate = getParam(node, "autoTerminateSession");
    const createBody: Record<string, unknown> = {
      autoTerminate: autoTerminate !== false,
    };
    if (profileName) createBody.profileName = profileName;
    const createResp = await apiRequest(ctx, "POST", "https://api.airtop.ai/v1/sessions", createBody);
    const sessionData = createResp.data as Record<string, unknown> | undefined;
    sessionId = (sessionData?.sessionId ?? createResp.sessionId) as string;
    const winResp = await apiRequest(ctx, "POST", `https://api.airtop.ai/v1/sessions/${sessionId}/windows`, {
      url: urlInput ?? "https://www.google.com",
    });
    const winData = winResp.data as Record<string, unknown> | undefined;
    windowId = (winData?.windowId ?? winResp.windowId) as string;
  }

  if (!sessionId) throw new Error("sessionId is required");
  if (!windowId) throw new Error("windowId is required");

  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/extraction/${mode}`;
  const body: Record<string, unknown> = {};
  const prompt = getParam(node, "prompt");
  if (prompt) body.prompt = prompt;
  const outputSchema = getAdditionalField(node, "outputSchema");
  if (outputSchema) body.outputSchema = outputSchema;
  const parseJson = getAdditionalField(node, "parseJsonOutput");
  if (parseJson !== undefined) body.parseJsonOutput = parseJson;

  if (mode === "getPaginated") {
    const interactionMode = getAdditionalField(node, "interactionMode");
    if (interactionMode) body.interactionMode = interactionMode;
    const paginationMode = getAdditionalField(node, "paginationMode");
    if (paginationMode) body.paginationMode = paginationMode;
  }

  const includeVisual = getAdditionalField(node, "includeVisualAnalysis");
  if (includeVisual) body.includeVisualAnalysis = includeVisual;

  return apiRequest(ctx, "POST", endpoint, body);
}

async function interactionClick(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runInteraction(ctx, node, "click", { clickType: getParam(node, "clickType") ?? "click" });
}

async function interactionFill(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runInteraction(ctx, node, "fill", { formData: getParam(node, "formData") });
}

async function interactionHover(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runInteraction(ctx, node, "hover");
}

async function interactionScroll(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runInteraction(ctx, node, "scroll", { scrollingMode: getParam(node, "scrollingMode") ?? "automatic" });
}

async function interactionType(ctx: any, node: any): Promise<AirtopApiResponse> {
  return runInteraction(ctx, node, "type", { text: getParam(node, "text"), pressEnterKey: getParam(node, "pressEnterKey") ?? false });
}

async function runInteraction(ctx: any, node: any, action: string, extra?: Record<string, unknown>): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId") as string;
  const windowId = getParam(node, "windowId") as string;
  if (!sessionId) throw new Error("sessionId is required");
  if (!windowId) throw new Error("windowId is required");
  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/windows/${windowId}/interaction/${action}`;
  const body: Record<string, unknown> = {};
  const elementDescription = getParam(node, "elementDescription");
  if (elementDescription) body.elementDescription = elementDescription;
  const visualScope = getAdditionalField(node, "visualScope");
  if (visualScope) body.visualScope = visualScope;
  const waitForNavigation = getAdditionalField(node, "waitForNavigation");
  if (waitForNavigation) body.waitForNavigation = waitForNavigation;

  if (action === "scroll") {
    const scrollToElement = getParam(node, "scrollToElement");
    if (scrollToElement) body.scrollToElement = scrollToElement;
    const scrollToEdge = getParam(node, "scrollToEdge");
    if (scrollToEdge) body.scrollToEdge = scrollToEdge;
    const scrollBy = getParam(node, "scrollBy");
    if (scrollBy) body.scrollBy = scrollBy;
    const scrollWithin = getParam(node, "scrollWithin");
    if (scrollWithin) body.scrollWithin = scrollWithin;
  }

  if (extra) Object.assign(body, extra);
  return apiRequest(ctx, "POST", endpoint, body);
}

async function fileUpload(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId") as string;
  if (!sessionId) throw new Error("sessionId is required");
  const source = getParam(node, "source") as string | undefined;
  const body: Record<string, unknown> = {
    fileName: getParam(node, "fileName"),
    fileType: getParam(node, "fileType") ?? "customer_upload",
  };
  const triggerFileInput = getParam(node, "triggerFileInputParameter");
  if (triggerFileInput !== undefined) body.triggerFileInputParameter = triggerFileInput;
  const elementDescription = getParam(node, "elementDescription");
  if (elementDescription) body.elementDescription = elementDescription;
  const includeHidden = getParam(node, "includeHiddenElements");
  if (includeHidden !== undefined) body.includeHiddenElements = includeHidden;

  if (source === "binary") {
    body.source = "binary";
    const binProp = getParam(node, "binaryPropertyName") as string ?? "data";
    body.binaryPropertyName = binProp;
    const item0 = ctx.getInputItems(0)?.[0];
    if (item0?.binary?.[binProp]) {
      body.data = item0.binary[binProp];
    }
  } else {
    body.source = "url";
    body.url = getParam(node, "url");
  }
  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/files`;
  return apiRequest(ctx, "POST", endpoint, body);
}

async function fileLoad(ctx: any, node: any): Promise<AirtopApiResponse> {
  const sessionId = getParam(node, "sessionId") as string;
  const fileId = getParam(node, "fileId") as string;
  if (!sessionId) throw new Error("sessionId is required");
  const endpoint = `https://api.airtop.ai/v1/sessions/${sessionId}/files/${fileId}/load`;
  const body: Record<string, unknown> = {};
  const elementDescription = getParam(node, "elementDescription");
  if (elementDescription) body.elementDescription = elementDescription;
  const includeHidden = getParam(node, "includeHiddenElements");
  if (includeHidden !== undefined) body.includeHiddenElements = includeHidden;
  return apiRequest(ctx, "POST", endpoint, body);
}

async function fileGet(ctx: any, node: any): Promise<AirtopApiResponse> {
  const fileId = getParam(node, "fileId") as string;
  const endpoint = `https://api.airtop.ai/v1/files/${fileId}`;
  const outputBinary = getParam(node, "outputBinaryFile");
  if (outputBinary) {
    return apiRequest(ctx, "GET", `${endpoint}?outputBinaryFile=true`);
  }
  return apiRequest(ctx, "GET", endpoint);
}

async function fileGetMany(ctx: any, node: any): Promise<AirtopApiResponse> {
  const endpoint = "https://api.airtop.ai/v1/files";
  const params: Record<string, string> = {};
  const sessionIds = getParam(node, "sessionIds") as string | undefined;
  if (sessionIds) params.sessionIds = sessionIds;
  const returnAll = getParam(node, "returnAll");
  if (!returnAll) {
    const limit = getParam(node, "limit");
    if (limit) params.limit = String(limit);
  }
  const qs = new URLSearchParams(params).toString();
  return apiRequest(ctx, "GET", qs ? `${endpoint}?${qs}` : endpoint);
}

async function fileDelete(ctx: any, node: any): Promise<AirtopApiResponse> {
  const fileId = getParam(node, "fileId") as string;
  const endpoint = `https://api.airtop.ai/v1/files/${fileId}`;
  return apiRequest(ctx, "DELETE", endpoint);
}

async function agentRun(ctx: any, node: any): Promise<AirtopApiResponse> {
  const agentId = getParam(node, "agentId") as { mode?: string; value?: string } | string | undefined;
  let id: string;
  if (typeof agentId === "object" && agentId !== null) {
    id = (agentId as { mode?: string; value?: string }).value ?? String(agentId);
  } else {
    id = String(agentId ?? "");
  }
  if (!id) throw new Error("agentId is required");
  const endpoint = `https://api.airtop.ai/v1/agents/${id}/invoke`;
  const body: Record<string, unknown> = {};
  const awaitExec = getParam(node, "awaitExecution");
  if (awaitExec !== undefined) body.awaitExecution = awaitExec;
  const timeout = getParam(node, "timeout");
  if (timeout) body.timeout = timeout;
  const agentParams = getParam(node, "agentParameters");
  if (agentParams) body.agentParameters = agentParams;
  const sessionId = getParam(node, "sessionId");
  if (sessionId) body.sessionId = sessionId;
  const windowId = getParam(node, "windowId");
  if (windowId) body.windowId = windowId;
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

const resourceHandlers: Record<string, Record<string, (ctx: any, node: any) => Promise<AirtopApiResponse>>> = {
  session: {
    create: sessionCreate,
    save: sessionSave,
    terminate: sessionTerminate,
    waitForDownload: sessionWaitForDownload,
  },
  window: {
    create: windowCreate,
    load: windowLoad,
    close: windowClose,
    list: windowList,
    getLiveView: windowGetLiveView,
    takeScreenshot: windowTakeScreenshot,
  },
  extraction: {
    query: extractionQuery,
    getPaginated: extractionGetPaginated,
    scrape: extractionScrape,
  },
  interaction: {
    click: interactionClick,
    fill: interactionFill,
    hover: interactionHover,
    scroll: interactionScroll,
    type: interactionType,
  },
  file: {
    upload: fileUpload,
    load: fileLoad,
    get: fileGet,
    getMany: fileGetMany,
    delete: fileDelete,
  },
  agent: {
    run: agentRun,
  },
};

export const airtopExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  if (!inputItems || inputItems.length === 0) {
    return [[{ json: {} }]];
  }
  const resource = getParam(node, "resource") as string;
  const operation = getParam(node, "operation") as string;
  const handler = resourceHandlers[resource]?.[operation];
  if (!handler) {
    throw new Error(`Unknown resource/operation: ${resource}/${operation}`);
  }
  const results: Array<{ json: Record<string, unknown> }> = [];
  const continueOnFail = ctx.continueOnFail?.();
  for (const item of inputItems) {
    try {
      const result = await handler(ctx, node);
      const itemJson = (item as { json?: Record<string, unknown> })?.json ?? {};
      const output: Record<string, unknown> = {
        ...itemJson,
        ...(result.data ?? result),
      };
      results.push({ json: output });
    } catch (err) {
      if (continueOnFail) {
        results.push({ json: { error: (err as Error).message } });
      } else {
        throw err;
      }
    }
  }
  return [results];
};
