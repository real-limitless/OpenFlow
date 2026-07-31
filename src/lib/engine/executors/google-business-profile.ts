import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://mybusiness.googleapis.com/v4";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function resolveLocatorMode(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "mode" in resolved) {
    return String((resolved as Record<string, unknown>).mode ?? "name");
  }
  return "name";
}

function resolveLocatorValue(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getAccessToken(ctx: ExecutionContext, _node: INode): Promise<string> {
  const cred = await ctx.getCredential("googleBusinessProfileOAuth2Api");
  if (!cred) {
    throw new Error("GoogleBusinessProfile: googleBusinessProfileOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GoogleBusinessProfile: credential has no accessToken");
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
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, body: parsed };
}

function buildError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const apiErr = obj.error as Record<string, unknown> | undefined;
  const message = apiErr?.message ?? obj.message ?? JSON.stringify(body);
  return new Error(`GoogleBusinessProfile API error (${status}): ${message}`);
}

function buildBasePath(accountLoc: unknown, locationLoc: unknown, itemJson: Record<string, unknown>): string {
  let account = resolveLocatorValue(accountLoc, itemJson);
  let location = resolveLocatorValue(locationLoc, itemJson);
  if (!account) throw new Error("GoogleBusinessProfile: account is required");
  if (!location) throw new Error("GoogleBusinessProfile: location is required");
  if (location.startsWith("accounts/") && location.includes("/locations/")) {
    return location;
  }
  return `${account}/locations/${location}`;
}

function resolveReviewName(basePath: string, reviewLoc: unknown, itemJson: Record<string, unknown>): string {
  const mode = resolveLocatorMode(reviewLoc, itemJson);
  const value = resolveLocatorValue(reviewLoc, itemJson);
  if (!value) throw new Error("GoogleBusinessProfile: review is required");
  if (mode === "name") return value;
  return `${basePath}/reviews/${value}`;
}

function buildPostBody(operation: string, node: INode, itemJson: Record<string, unknown>): Record<string, unknown> | undefined {
  if (operation === "create") {
    const postType = String(resolveValue(node.parameters.postType, itemJson) ?? "STANDARD");
    const body: Record<string, unknown> = {
      topicType: postType,
      summary: String(resolveValue(node.parameters.summary, itemJson) ?? ""),
    };
    const options = resolveValue(node.parameters.options, itemJson) as Record<string, unknown> | undefined;
    if (options) {
      if (options.languageCode) body.languageCode = options.languageCode;
      if (options.callToActionType) {
        body.callToAction = {
          actionType: options.callToActionType,
          url: options.url ?? "",
        };
      }
      if (options.couponCode) {
        body.offer = {
          couponCode: options.couponCode,
          redeemOnlineUrl: options.redeemOnlineUrl ?? "",
          termsConditions: options.termsConditions ?? "",
        };
      }
    }
    if (postType === "EVENT") {
      const event: Record<string, unknown> = {
        title: String(resolveValue(node.parameters.title, itemJson) ?? ""),
        schedule: {
          startDate: { year: 2026, month: 1, day: 1 },
          startTime: { hours: 0, minutes: 0 },
        },
      };
      const startDt = String(resolveValue(node.parameters.startDateTime, itemJson) ?? "");
      const endDt = String(resolveValue(node.parameters.endDateTime, itemJson) ?? "");
      if (startDt) {
        const d = new Date(startDt);
        event.schedule = {
          startDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
          startTime: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() },
        };
      }
      if (endDt) {
        const d = new Date(endDt);
        const schedule = event.schedule as Record<string, unknown>;
        schedule.endDate = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        schedule.endTime = { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
      }
      body.event = event;
    }
    if (postType === "OFFER") {
      body.offer = body.offer ?? {};
      Object.assign(body.offer as Record<string, unknown>, {
        couponCode: options?.couponCode ?? "",
        redeemOnlineUrl: options?.redeemOnlineUrl ?? "",
        termsConditions: options?.termsConditions ?? "",
      });
      const offerTitle = String(resolveValue(node.parameters.title, itemJson) ?? "");
      const startDate = String(resolveValue(node.parameters.startDate, itemJson) ?? "");
      const endDate = String(resolveValue(node.parameters.endDate, itemJson) ?? "");
      body.event = { title: offerTitle };
      if (startDate) {
        const parts = startDate.split("-");
        (body.event as Record<string, unknown>).schedule = {
          startDate: { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) },
        };
      }
      if (endDate) {
        const schedule = (body.event as Record<string, unknown>).schedule as Record<string, unknown> || {};
        const parts = endDate.split("-");
        schedule.endDate = { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
        (body.event as Record<string, unknown>).schedule = schedule;
      }
    }
    if (postType === "ALERT") {
      body.alertType = String(resolveValue(node.parameters.alertType, itemJson) ?? "COVID_19");
    }
    return body;
  }
  return undefined;
}

function buildUpdateBody(node: INode, itemJson: Record<string, unknown>): { body: Record<string, unknown>; updateMask: string } {
  const options = resolveValue(node.parameters.options, itemJson) as Record<string, unknown> | undefined;
  const body: Record<string, unknown> = {};
  const maskFields: string[] = [];
  if (!options) return { body, updateMask: "" };
  if (options.summary) { body.summary = options.summary; maskFields.push("summary"); }
  if (options.languageCode) { body.languageCode = options.languageCode; maskFields.push("languageCode"); }
  if (options.callToActionType) {
    body.callToAction = { actionType: options.callToActionType, url: options.url ?? "" };
    maskFields.push("callToAction.actionType", "callToAction.url");
  }
  if (options.title) { body.event = { title: options.title }; maskFields.push("event.title"); }
  if (options.startDateTime || options.endDateTime) {
    const event = (body.event as Record<string, unknown>) ?? {};
    const schedule: Record<string, unknown> = {};
    if (options.startDateTime) {
      const d = new Date(String(options.startDateTime));
      schedule.startDate = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      schedule.startTime = { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
      maskFields.push("event.schedule.startDate", "event.schedule.startTime");
    }
    if (options.endDateTime) {
      const d = new Date(String(options.endDateTime));
      schedule.endDate = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      schedule.endTime = { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
      maskFields.push("event.schedule.endDate", "event.schedule.endTime");
    }
    event.schedule = schedule;
    body.event = event;
  }
  if (options.startDate || options.endDate) {
    const event = (body.event as Record<string, unknown>) ?? {};
    const schedule = ((event.schedule ?? {}) as Record<string, unknown>);
    if (options.startDate) {
      const parts = String(options.startDate).split("-");
      schedule.startDate = { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
      maskFields.push("event.schedule.startDate");
    }
    if (options.endDate) {
      const parts = String(options.endDate).split("-");
      schedule.endDate = { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
      maskFields.push("event.schedule.endDate");
    }
    event.schedule = schedule;
    body.event = event;
  }
  if (options.couponCode) { body.offer = { ...(body.offer as Record<string, unknown> ?? {}), couponCode: options.couponCode }; maskFields.push("offer.couponCode"); }
  if (options.redeemOnlineUrl) { body.offer = { ...(body.offer as Record<string, unknown> ?? {}), redeemOnlineUrl: options.redeemOnlineUrl }; maskFields.push("offer.redeemOnlineUrl"); }
  if (options.termsConditions) { body.offer = { ...(body.offer as Record<string, unknown> ?? {}), termsConditions: options.termsConditions }; maskFields.push("offer.termsConditions"); }
  return { body, updateMask: maskFields.join(",") };
}

export const googleBusinessProfileExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "post") ?? "post");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const token = await getAccessToken(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const basePath = buildBasePath(node.parameters.account, node.parameters.location, itemJson);

      if (resource === "post") {
        if (operation === "create") {
          const body = buildPostBody(operation, node, itemJson);
          const url = `${API_BASE}/${basePath}/localPosts`;
          const { status, body: resBody } = await apiRequest("POST", url, token, body);
          if (status >= 400) throw buildError(resBody, status);
          out.push({ json: asObj(resBody), pairedItem });
        } else if (operation === "get") {
          const postName = resolveLocatorValue(node.parameters.post, itemJson);
          const url = `${API_BASE}/${postName}`;
          const { status, body: resBody } = await apiRequest("GET", url, token);
          if (status >= 400) throw buildError(resBody, status);
          out.push({ json: asObj(resBody), pairedItem });
        } else if (operation === "getAll") {
          const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
          const limit = Number(node.parameters.limit ?? 20);
          const pageSize = 100;
          const dataKey = "localPosts";
          let allItems: Record<string, unknown>[] = [];
          let pageToken: string | undefined;
          for (let page = 0; page < 100; page++) {
            let url = `${API_BASE}/${basePath}/${dataKey}?pageSize=${returnAll ? pageSize : Math.min(pageSize, limit)}`;
            if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
            const { status, body: resBody } = await apiRequest("GET", url, token);
            if (status >= 400) throw buildError(resBody, status);
            const obj = asObj(resBody);
            const items = (obj[dataKey] as Array<Record<string, unknown>>) ?? [];
            allItems.push(...items);
            if (!returnAll && allItems.length >= limit) {
              allItems = allItems.slice(0, limit);
              break;
            }
            pageToken = obj.nextPageToken as string | undefined;
            if (!pageToken) break;
          }
          for (const p of (returnAll ? allItems : allItems.slice(0, limit))) {
            out.push({ json: p, pairedItem });
          }
        } else if (operation === "update") {
          const postName = resolveLocatorValue(node.parameters.post, itemJson);
          const { body: updateBody, updateMask } = buildUpdateBody(node, itemJson);
          let url = `${API_BASE}/${postName}`;
          if (updateMask) url += `?updateMask=${encodeURIComponent(updateMask)}`;
          const { status, body: resBody } = await apiRequest("PATCH", url, token, updateBody);
          if (status >= 400) throw buildError(resBody, status);
out.push({ json: asObj(resBody), pairedItem });
          } else if (operation === "delete") {
            const postName = resolveLocatorValue(node.parameters.post, itemJson);
            const url = `${API_BASE}/${postName}`;
            const { status, body: resBody } = await apiRequest("DELETE", url, token);
            if (status >= 400) throw buildError(resBody, status);
            out.push({ json: { success: true, name: postName }, pairedItem });
          }
        } else if (resource === "review") {
        if (operation === "get") {
          const reviewName = resolveReviewName(basePath, node.parameters.review, itemJson);
          const url = `${API_BASE}/${reviewName}`;
          const { status, body: resBody } = await apiRequest("GET", url, token);
          if (status >= 400) throw buildError(resBody, status);
          out.push({ json: asObj(resBody), pairedItem });
        } else if (operation === "getAll") {
          const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
          const limit = Number(node.parameters.limit ?? 20);
          const pageSize = 50;
          const dataKey = "reviews";
          let allItems: Record<string, unknown>[] = [];
          let pageToken: string | undefined;
          const maxPages = 100;
          for (let page = 0; page < maxPages; page++) {
            let url = `${API_BASE}/${basePath}/${dataKey}?pageSize=${returnAll ? pageSize : Math.min(pageSize, limit)}`;
            if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
            const { status, body: resBody } = await apiRequest("GET", url, token);
            if (status >= 400) throw buildError(resBody, status);
            const obj = asObj(resBody);
            const items = (obj[dataKey] as Array<Record<string, unknown>>) ?? [];
            allItems.push(...items);
            if (!returnAll && allItems.length >= limit) {
              allItems = allItems.slice(0, limit);
              break;
            }
            pageToken = obj.nextPageToken as string | undefined;
            if (!pageToken) break;
          }
          const results = returnAll ? allItems : allItems.slice(0, limit);
          for (const p of results) {
            out.push({ json: p, pairedItem });
          }
        } else if (operation === "reply") {
          const reviewName = resolveReviewName(basePath, node.parameters.review, itemJson);
          const replyText = String(resolveValue(node.parameters.reply, itemJson) ?? "");
          const url = `${API_BASE}/${reviewName}/reply`;
          const { status, body: resBody } = await apiRequest("PUT", url, token, { comment: replyText });
          if (status >= 400) throw buildError(resBody, status);
          out.push({ json: asObj(resBody), pairedItem });
        } else if (operation === "delete") {
          const reviewName = resolveReviewName(basePath, node.parameters.review, itemJson);
          const url = `${API_BASE}/${reviewName}/reply`;
          const { status, body: resBody } = await apiRequest("DELETE", url, token);
          if (status >= 400) throw buildError(resBody, status);
          out.push({ json: { success: true, name: reviewName }, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};