import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

const CHANNEL_PARTS_ALL =
  "brandingSettings,contentDetails,contentOwnerDetails,id,localizations,snippet,statistics,status,topicDetails";
const PLAYLIST_PARTS_ALL = "contentDetails,id,localizations,player,snippet,status";
const PLAYLIST_ITEM_PARTS_ALL = "contentDetails,id,snippet,status";
const VIDEO_PARTS_ALL =
  "contentDetails,id,liveStreamingDetails,localizations,player,recordingDetails,snippet,statistics,status,topicDetails";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function encodePath(segment: string): string {
  return encodeURIComponent(segment);
}

function buildQuery(params: Record<string, string | undefined | null | boolean | number>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function str(raw: unknown, itemJson: Record<string, unknown>, fallback = ""): string {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function bool(raw: unknown, itemJson: Record<string, unknown>): boolean | undefined {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null || v === "") return undefined;
  return v === true || v === "true";
}

function num(raw: unknown, itemJson: Record<string, unknown>): number | undefined {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function resolvePart(raw: unknown, allParts: string, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  let parts: string[] = [];
  if (Array.isArray(resolved)) {
    parts = resolved.map((p) => String(p));
  } else if (typeof resolved === "string" && resolved) {
    parts = resolved.split(",").map((p) => p.trim()).filter(Boolean);
  } else {
    parts = ["*"];
  }
  if (parts.includes("*") || parts.length === 0) return allParts;
  return parts.join(",");
}

function tagsFrom(raw: unknown, itemJson: Record<string, unknown>): string[] | undefined {
  const v = resolveValue(raw, itemJson);
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return String(v)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
  return Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("youTubeOAuth2Api");
  if (!cred) {
    throw new Error("YouTube: youTubeOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("YouTube: youTubeOAuth2Api has no accessToken");
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...extraHeaders,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      init.body = body;
    } else if (typeof body === "string") {
      init.body = body;
    } else {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      init.body = JSON.stringify(body);
    }
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
    const errNested = asRecord(errObj.error);
    const msg =
      String(errNested.message ?? "") ||
      String(errObj.message ?? "") ||
      `HTTP ${res.status}`;
    throw new Error(`YouTube: ${msg}`);
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

async function paginate(
  token: string,
  baseUrl: string,
  baseQs: Record<string, string | undefined | null | boolean | number>,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = returnAll ? 50 : Math.min(Math.max(limit, 1), 50);

  do {
    const qs = {
      ...baseQs,
      maxResults: returnAll ? pageSize : Math.min(limit - results.length, pageSize),
      pageToken,
    };
    const res = await apiRequest("GET", `${baseUrl}${buildQuery(qs)}`, token);
    const body = asObj(res.body);
    const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
    for (const item of items) {
      results.push(item);
      if (!returnAll && results.length >= limit) break;
    }
    pageToken = returnAll ? String(body.nextPageToken ?? "") || undefined : undefined;
    if (!returnAll && results.length >= limit) break;
  } while (pageToken);

  return results;
}

// ── Channel ──────────────────────────────────────────────────────────

async function channelGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const channelId = str(node.parameters.channelId, itemJson);
  if (!channelId) throw new Error("YouTube: channelId is required for channel get");
  const part = resolvePart(node.parameters.part, CHANNEL_PARTS_ALL, itemJson);
  const url = `${YT_API}/channels${buildQuery({ part, id: channelId })}`;
  const res = await apiRequest("GET", url, token);
  const body = asObj(res.body);
  const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
  return items[0] ?? body;
}

async function channelGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const part = resolvePart(node.parameters.part, CHANNEL_PARTS_ALL, itemJson);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 25);
  const filters = asRecord(node.parameters.filters);
  const options = asRecord(node.parameters.options);

  const qs: Record<string, string | undefined | null | boolean | number> = { part };

  const categoryId = str(filters.categoryId, itemJson);
  const forUsername = str(filters.forUsername, itemJson);
  const id = str(filters.id, itemJson);
  const managedByMe = bool(filters.managedByMe, itemJson);

  if (categoryId) qs.categoryId = categoryId;
  else if (forUsername) qs.forUsername = forUsername;
  else if (id) qs.id = id;
  else if (managedByMe === true) qs.managedByMe = "true";
  else qs.mine = "true";

  const hl = str(options.h1 ?? options.hl, itemJson);
  if (hl) qs.hl = hl;
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;

  return paginate(token, `${YT_API}/channels`, qs, returnAll, limit);
}

async function channelUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const channelId = str(node.parameters.channelId, itemJson);
  if (!channelId) throw new Error("YouTube: channelId is required for channel update");
  const updateFields = asRecord(node.parameters.updateFields);
  const brandingUi = asRecord(updateFields.brandingSettingsUi);

  const brandingSettings: Record<string, unknown> = {};
  const channelSettings = asRecord(
    asRecord(brandingUi.channelSettingsValues).channel ?? brandingUi.channel,
  );
  if (Object.keys(channelSettings).length) {
    const ch: Record<string, unknown> = {};
    for (const key of [
      "country",
      "description",
      "defaultLanguage",
      "defaultTab",
      "featuredChannelsTitle",
      "keywords",
      "profileColor",
      "trackingAnalyticsAccountId",
      "unsubscribedTrailer",
    ]) {
      if (channelSettings[key] !== undefined && channelSettings[key] !== "") {
        ch[key] = resolveValue(channelSettings[key], itemJson);
      }
    }
    if (channelSettings.featuredChannelsUrls !== undefined) {
      const urls = resolveValue(channelSettings.featuredChannelsUrls, itemJson);
      ch.featuredChannelsUrls = Array.isArray(urls)
        ? urls
        : String(urls ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    for (const bKey of ["moderateComments", "showRelatedChannels", "showBrowseView"]) {
      if (channelSettings[bKey] !== undefined) {
        ch[bKey] = bool(channelSettings[bKey], itemJson);
      }
    }
    if (Object.keys(ch).length) brandingSettings.channel = ch;
  }

  const imageSettings = asRecord(
    asRecord(brandingUi.imageSettingsValues).image ?? brandingUi.image,
  );
  if (Object.keys(imageSettings).length) {
    const img: Record<string, unknown> = {};
    for (const key of ["bannerExternalUrl", "trackingImageUrl", "watchIconImageUrl"]) {
      if (imageSettings[key] !== undefined && imageSettings[key] !== "") {
        img[key] = str(imageSettings[key], itemJson);
      }
    }
    if (Object.keys(img).length) brandingSettings.image = img;
  }

  const statusValue = asRecord(asRecord(brandingUi.statusValue).status ?? brandingUi.status);
  const status: Record<string, unknown> = {};
  if (statusValue.selfDeclaredMadeForKids !== undefined) {
    status.selfDeclaredMadeForKids = bool(statusValue.selfDeclaredMadeForKids, itemJson);
  }

  const body: Record<string, unknown> = { id: channelId };
  const parts: string[] = ["id"];
  if (Object.keys(brandingSettings).length) {
    body.brandingSettings = brandingSettings;
    parts.push("brandingSettings");
  }
  if (Object.keys(status).length) {
    body.status = status;
    parts.push("status");
  }

  const qs: Record<string, string | undefined> = { part: parts.join(",") };
  const onBehalf = str(updateFields.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;

  const res = await apiRequest("PUT", `${YT_API}/channels${buildQuery(qs)}`, token, body);
  return asObj(res.body);
}

async function channelUploadBanner(
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  token: string,
): Promise<Record<string, unknown>> {
  const channelId = str(node.parameters.channelId, itemJson);
  if (!channelId) throw new Error("YouTube: channelId is required for uploadBanner");
  const binaryProperty = str(node.parameters.binaryProperty, itemJson, "data") || "data";
  const binary = item.binary?.[binaryProperty];
  if (!binary?.data) {
    throw new Error(`YouTube: binary property "${binaryProperty}" is missing`);
  }
  const bytes = base64ToBytes(String(binary.data));
  const mimeType = String(binary.mimeType ?? "image/jpeg");

  const uploadRes = await apiRequest(
    "POST",
    `${YT_UPLOAD}/channelBanners/insert`,
    token,
    bytes,
    { "Content-Type": mimeType },
  );
  const uploadBody = asObj(uploadRes.body);
  const bannerUrl = String(uploadBody.url ?? "");

  const body = {
    id: channelId,
    brandingSettings: {
      image: { bannerExternalUrl: bannerUrl },
    },
  };
  const res = await apiRequest(
    "PUT",
    `${YT_API}/channels${buildQuery({ part: "brandingSettings" })}`,
    token,
    body,
  );
  return asObj(res.body);
}

// ── Playlist ─────────────────────────────────────────────────────────

async function playlistCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const title = str(node.parameters.title, itemJson);
  if (!title) throw new Error("YouTube: title is required for playlist create");
  const options = asRecord(node.parameters.options);

  const snippet: Record<string, unknown> = { title };
  const description = str(options.description, itemJson);
  if (description) snippet.description = description;
  const defaultLanguage = str(options.defaultLanguage, itemJson);
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;
  const tags = tagsFrom(options.tags, itemJson);
  if (tags) snippet.tags = tags;

  const status: Record<string, unknown> = {};
  const privacyStatus = str(options.privacyStatus, itemJson);
  if (privacyStatus) status.privacyStatus = privacyStatus;

  const body: Record<string, unknown> = { snippet };
  const parts = ["snippet"];
  if (Object.keys(status).length) {
    body.status = status;
    parts.push("status");
  }

  const qs: Record<string, string | undefined> = { part: parts.join(",") };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  const onBehalfChannel = str(options.onBehalfOfContentOwnerChannel, itemJson);
  if (onBehalfChannel) qs.onBehalfOfContentOwnerChannel = onBehalfChannel;

  const res = await apiRequest("POST", `${YT_API}/playlists${buildQuery(qs)}`, token, body);
  return asObj(res.body);
}

async function playlistDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistId = str(node.parameters.playlistId, itemJson);
  if (!playlistId) throw new Error("YouTube: playlistId is required for playlist delete");
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { id: playlistId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  await apiRequest("DELETE", `${YT_API}/playlists${buildQuery(qs)}`, token);
  return { success: true };
}

async function playlistGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistId = str(node.parameters.playlistId, itemJson);
  if (!playlistId) throw new Error("YouTube: playlistId is required for playlist get");
  const part = resolvePart(node.parameters.part, PLAYLIST_PARTS_ALL, itemJson);
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { part, id: playlistId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  const onBehalfChannel = str(options.onBehalfOfContentOwnerChannel, itemJson);
  if (onBehalfChannel) qs.onBehalfOfContentOwnerChannel = onBehalfChannel;
  const res = await apiRequest("GET", `${YT_API}/playlists${buildQuery(qs)}`, token);
  const body = asObj(res.body);
  const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
  return items[0] ?? body;
}

async function playlistGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const part = resolvePart(node.parameters.part, PLAYLIST_PARTS_ALL, itemJson);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 25);
  const filters = asRecord(node.parameters.filters);
  const options = asRecord(node.parameters.options);

  const qs: Record<string, string | undefined | null | boolean | number> = { part };
  const channelId = str(filters.channelId, itemJson);
  const id = str(filters.id, itemJson);
  if (id) qs.id = id;
  else if (channelId) qs.channelId = channelId;
  else qs.mine = "true";

  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  const onBehalfChannel = str(options.onBehalfOfContentOwnerChannel, itemJson);
  if (onBehalfChannel) qs.onBehalfOfContentOwnerChannel = onBehalfChannel;

  return paginate(token, `${YT_API}/playlists`, qs, returnAll, limit);
}

async function playlistUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistId = str(node.parameters.playlistId, itemJson);
  if (!playlistId) throw new Error("YouTube: playlistId is required for playlist update");
  const title = str(node.parameters.title, itemJson);
  if (!title) throw new Error("YouTube: title is required for playlist update");
  const updateFields = asRecord(node.parameters.updateFields);

  const snippet: Record<string, unknown> = { title };
  const description = str(updateFields.description, itemJson);
  if (description || updateFields.description !== undefined) {
    snippet.description = description;
  }
  const defaultLanguage = str(updateFields.defaultLanguage, itemJson);
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;
  const tags = tagsFrom(updateFields.tags, itemJson);
  if (tags) snippet.tags = tags;

  const status: Record<string, unknown> = {};
  const privacyStatus = str(updateFields.privacyStatus, itemJson);
  if (privacyStatus) status.privacyStatus = privacyStatus;

  const body: Record<string, unknown> = { id: playlistId, snippet };
  const parts = ["snippet"];
  if (Object.keys(status).length) {
    body.status = status;
    parts.push("status");
  }

  const qs: Record<string, string | undefined> = { part: parts.join(",") };
  const onBehalf = str(updateFields.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;

  const res = await apiRequest("PUT", `${YT_API}/playlists${buildQuery(qs)}`, token, body);
  return asObj(res.body);
}

// ── Playlist Item ────────────────────────────────────────────────────

async function playlistItemAdd(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistId = str(node.parameters.playlistId, itemJson);
  const videoId = str(node.parameters.videoId, itemJson);
  if (!playlistId) throw new Error("YouTube: playlistId is required for playlistItem add");
  if (!videoId) throw new Error("YouTube: videoId is required for playlistItem add");
  const options = asRecord(node.parameters.options);

  const snippet: Record<string, unknown> = {
    playlistId,
    resourceId: { kind: "youtube#video", videoId },
  };
  const position = num(options.position, itemJson);
  if (position !== undefined) snippet.position = position;

  const contentDetails: Record<string, unknown> = {};
  const note = str(options.note, itemJson);
  if (note) contentDetails.note = note;
  const startAt = str(options.startAt, itemJson);
  if (startAt) contentDetails.startAt = startAt;
  const endAt = str(options.endAt, itemJson);
  if (endAt) contentDetails.endAt = endAt;

  const body: Record<string, unknown> = { snippet };
  const parts = ["snippet"];
  if (Object.keys(contentDetails).length) {
    body.contentDetails = contentDetails;
    parts.push("contentDetails");
  }

  const qs: Record<string, string | undefined> = { part: parts.join(",") };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;

  const res = await apiRequest("POST", `${YT_API}/playlistItems${buildQuery(qs)}`, token, body);
  return asObj(res.body);
}

async function playlistItemDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistItemId = str(node.parameters.playlistItemId, itemJson);
  if (!playlistItemId) {
    throw new Error("YouTube: playlistItemId is required for playlistItem delete");
  }
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { id: playlistItemId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  await apiRequest("DELETE", `${YT_API}/playlistItems${buildQuery(qs)}`, token);
  return { success: true };
}

async function playlistItemGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const playlistItemId = str(node.parameters.playlistItemId, itemJson);
  if (!playlistItemId) {
    throw new Error("YouTube: playlistItemId is required for playlistItem get");
  }
  const part = resolvePart(node.parameters.part, PLAYLIST_ITEM_PARTS_ALL, itemJson);
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { part, id: playlistItemId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  const res = await apiRequest("GET", `${YT_API}/playlistItems${buildQuery(qs)}`, token);
  const body = asObj(res.body);
  const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
  return items[0] ?? body;
}

async function playlistItemGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const playlistId = str(node.parameters.playlistId, itemJson);
  if (!playlistId) throw new Error("YouTube: playlistId is required for playlistItem getAll");
  const part = resolvePart(node.parameters.part, PLAYLIST_ITEM_PARTS_ALL, itemJson);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 25);
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined | null | boolean | number> = {
    part,
    playlistId,
  };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  return paginate(token, `${YT_API}/playlistItems`, qs, returnAll, limit);
}

// ── Video ────────────────────────────────────────────────────────────

async function videoDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const videoId = str(node.parameters.videoId, itemJson);
  if (!videoId) throw new Error("YouTube: videoId is required for video delete");
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { id: videoId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  await apiRequest("DELETE", `${YT_API}/videos${buildQuery(qs)}`, token);
  return { success: true };
}

async function videoGet(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const videoId = str(node.parameters.videoId, itemJson);
  if (!videoId) throw new Error("YouTube: videoId is required for video get");
  const part = resolvePart(node.parameters.part, VIDEO_PARTS_ALL, itemJson);
  const options = asRecord(node.parameters.options);
  const qs: Record<string, string | undefined> = { part, id: videoId };
  const onBehalf = str(options.onBehalfOfContentOwner, itemJson);
  if (onBehalf) qs.onBehalfOfContentOwner = onBehalf;
  const res = await apiRequest("GET", `${YT_API}/videos${buildQuery(qs)}`, token);
  const body = asObj(res.body);
  const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[];
  return items[0] ?? body;
}

async function videoGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 25);
  const filters = asRecord(node.parameters.filters);
  const options = asRecord(node.parameters.options);

  const relatedToVideoId = str(filters.relatedToVideoId, itemJson);
  const forDeveloper = bool(filters.forDeveloper, itemJson);
  if (relatedToVideoId && forDeveloper === true) {
    throw new Error(
      "YouTube: relatedToVideoId and forDeveloper cannot both be set",
    );
  }

  const qs: Record<string, string | undefined | null | boolean | number> = {
    part: "snippet",
    type: "video",
  };

  const channelId = str(filters.channelId, itemJson);
  if (channelId) qs.channelId = channelId;
  if (forDeveloper === true) qs.forDeveloper = "true";
  const publishedAfter = str(filters.publishedAfter, itemJson);
  if (publishedAfter) qs.publishedAfter = publishedAfter;
  const publishedBefore = str(filters.publishedBefore, itemJson);
  if (publishedBefore) qs.publishedBefore = publishedBefore;
  const q = str(filters.q, itemJson);
  if (q) qs.q = q;
  const regionCode = str(filters.regionCode, itemJson);
  if (regionCode) qs.regionCode = regionCode;
  if (relatedToVideoId) qs.relatedToVideoId = relatedToVideoId;
  const videoCategoryId = str(filters.videoCategoryId, itemJson);
  if (videoCategoryId) qs.videoCategoryId = videoCategoryId;
  if (filters.videoSyndicated !== undefined) {
    const vs = bool(filters.videoSyndicated, itemJson);
    if (vs !== undefined) qs.videoSyndicated = vs ? "true" : "false";
  }
  const videoType = str(filters.videoType, itemJson);
  if (videoType && videoType !== "any") qs.videoType = videoType;

  const order = str(options.order, itemJson, "relevance") || "relevance";
  if (order) qs.order = order;
  const safeSearch = str(options.safeSearch, itemJson);
  if (safeSearch) qs.safeSearch = safeSearch;

  return paginate(token, `${YT_API}/search`, qs, returnAll, limit);
}

async function videoRate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const videoId = str(node.parameters.videoId, itemJson);
  const rating = str(node.parameters.rating, itemJson);
  if (!videoId) throw new Error("YouTube: videoId is required for video rate");
  if (!rating) throw new Error("YouTube: rating is required for video rate");
  await apiRequest(
    "POST",
    `${YT_API}/videos/rate${buildQuery({ id: videoId, rating })}`,
    token,
  );
  return { success: true };
}

async function videoUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const videoId = str(node.parameters.videoId, itemJson);
  if (!videoId) throw new Error("YouTube: videoId is required for video update");
  const title = str(node.parameters.title, itemJson);
  if (!title) throw new Error("YouTube: title is required for video update");
  const updateFields = asRecord(node.parameters.updateFields);

  const snippet: Record<string, unknown> = { title };
  const categoryId = str(node.parameters.categoryId, itemJson);
  if (categoryId) snippet.categoryId = categoryId;
  const description = str(updateFields.description, itemJson);
  if (updateFields.description !== undefined) snippet.description = description;
  const defaultLanguage = str(updateFields.defaultLanguage, itemJson);
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;
  const tags = tagsFrom(updateFields.tags, itemJson);
  if (tags) snippet.tags = tags;

  const status: Record<string, unknown> = {};
  for (const key of [
    "embeddable",
    "license",
    "privacyStatus",
    "publicStatsViewable",
    "publishAt",
    "selfDeclaredMadeForKids",
  ] as const) {
    if (updateFields[key] !== undefined && updateFields[key] !== "") {
      const v = resolveValue(updateFields[key], itemJson);
      status[key] = v;
    }
  }

  const recordingDetails: Record<string, unknown> = {};
  const recordingDate = str(updateFields.recordingDate, itemJson);
  if (recordingDate) recordingDetails.recordingDate = recordingDate;

  const body: Record<string, unknown> = { id: videoId, snippet };
  const parts = ["snippet"];
  if (Object.keys(status).length) {
    body.status = status;
    parts.push("status");
  }
  if (Object.keys(recordingDetails).length) {
    body.recordingDetails = recordingDetails;
    parts.push("recordingDetails");
  }

  const qs: Record<string, string | undefined> = { part: parts.join(",") };
  if (updateFields.notifySubscribers !== undefined) {
    qs.notifySubscribers = String(bool(updateFields.notifySubscribers, itemJson) !== false);
  }

  const res = await apiRequest("PUT", `${YT_API}/videos${buildQuery(qs)}`, token, body);
  return asObj(res.body);
}

async function videoUpload(
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  token: string,
): Promise<Record<string, unknown>> {
  const title = str(node.parameters.title, itemJson);
  if (!title) throw new Error("YouTube: title is required for video upload");
  const binaryProperty = str(node.parameters.binaryProperty, itemJson, "data") || "data";
  const binary = item.binary?.[binaryProperty];
  if (!binary?.data) {
    throw new Error(`YouTube: binary property "${binaryProperty}" is missing`);
  }
  const options = asRecord(node.parameters.options);
  const bytes = base64ToBytes(String(binary.data));
  const mimeType = String(binary.mimeType ?? "video/mp4");

  const snippet: Record<string, unknown> = { title };
  const categoryId = str(node.parameters.categoryId, itemJson);
  if (categoryId) snippet.categoryId = categoryId;
  const description = str(options.description, itemJson);
  if (description) snippet.description = description;
  const defaultLanguage = str(options.defaultLanguage, itemJson);
  if (defaultLanguage) snippet.defaultLanguage = defaultLanguage;
  const tags = tagsFrom(options.tags, itemJson);
  if (tags) snippet.tags = tags;

  const status: Record<string, unknown> = {};
  const privacyStatus = str(options.privacyStatus, itemJson, "private") || "private";
  status.privacyStatus = privacyStatus;
  if (options.embeddable !== undefined) status.embeddable = bool(options.embeddable, itemJson);
  if (options.license !== undefined && options.license !== "") {
    status.license = str(options.license, itemJson);
  }
  if (options.publicStatsViewable !== undefined) {
    status.publicStatsViewable = bool(options.publicStatsViewable, itemJson) !== false;
  } else {
    status.publicStatsViewable = true;
  }
  if (options.publishAt !== undefined && options.publishAt !== "") {
    status.publishAt = str(options.publishAt, itemJson);
  }
  if (options.selfDeclaredMadeForKids !== undefined) {
    status.selfDeclaredMadeForKids = bool(options.selfDeclaredMadeForKids, itemJson);
  }

  const recordingDetails: Record<string, unknown> = {};
  const recordingDate = str(options.recordingDate, itemJson);
  if (recordingDate) recordingDetails.recordingDate = recordingDate;

  const metadata: Record<string, unknown> = { snippet, status };
  if (Object.keys(recordingDetails).length) metadata.recordingDetails = recordingDetails;

  const parts = ["snippet", "status"];
  if (Object.keys(recordingDetails).length) parts.push("recordingDetails");

  const qs: Record<string, string | undefined> = {
    part: parts.join(","),
    uploadType: "resumable",
  };
  if (options.notifySubscribers !== undefined) {
    qs.notifySubscribers = String(bool(options.notifySubscribers, itemJson) !== false);
  }

  const initRes = await apiRequest(
    "POST",
    `${YT_UPLOAD}/videos${buildQuery(qs)}`,
    token,
    metadata,
    {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(bytes.length),
      "X-Upload-Content-Type": mimeType,
    },
  );

  const uploadUrl =
    initRes.headers.get("location") ||
    initRes.headers.get("Location") ||
    String(asObj(initRes.body).uploadUrl ?? "");

  if (!uploadUrl) {
    // Some mocks return the final video in the init response
    const body = asObj(initRes.body);
    if (body.id || body.snippet) return body;
    throw new Error("YouTube: resumable upload missing Location header");
  }

  const putRes = await apiRequest("PUT", uploadUrl, token, bytes, {
    "Content-Type": mimeType,
    "Content-Length": String(bytes.length),
  });
  const result = asObj(putRes.body);
  if (!result.uploadId && initRes.body) {
    const initBody = asObj(initRes.body);
    if (initBody.uploadId) result.uploadId = initBody.uploadId;
  }
  return result;
}

// ── Video Category ───────────────────────────────────────────────────

async function videoCategoryGetAll(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const regionCode = str(node.parameters.regionCode, itemJson);
  if (!regionCode) throw new Error("YouTube: regionCode is required for videoCategory getAll");
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 25);
  const qs: Record<string, string | undefined | null | boolean | number> = {
    part: "snippet",
    regionCode,
  };
  return paginate(token, `${YT_API}/videoCategories`, qs, returnAll, limit);
}

// ── Dispatch ─────────────────────────────────────────────────────────

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getAccessToken(ctx);

  if (resource === "channel") {
    if (operation === "get") return channelGet(node, itemJson, token);
    if (operation === "getAll") return channelGetAll(node, itemJson, token);
    if (operation === "update") return channelUpdate(node, itemJson, token);
    if (operation === "uploadBanner") return channelUploadBanner(node, itemJson, item, token);
    throw new Error(`YouTube: unsupported channel operation "${operation}"`);
  }
  if (resource === "playlist") {
    if (operation === "create") return playlistCreate(node, itemJson, token);
    if (operation === "delete") return playlistDelete(node, itemJson, token);
    if (operation === "get") return playlistGet(node, itemJson, token);
    if (operation === "getAll") return playlistGetAll(node, itemJson, token);
    if (operation === "update") return playlistUpdate(node, itemJson, token);
    throw new Error(`YouTube: unsupported playlist operation "${operation}"`);
  }
  if (resource === "playlistItem") {
    if (operation === "add") return playlistItemAdd(node, itemJson, token);
    if (operation === "delete") return playlistItemDelete(node, itemJson, token);
    if (operation === "get") return playlistItemGet(node, itemJson, token);
    if (operation === "getAll") return playlistItemGetAll(node, itemJson, token);
    throw new Error(`YouTube: unsupported playlistItem operation "${operation}"`);
  }
  if (resource === "video") {
    if (operation === "delete") return videoDelete(node, itemJson, token);
    if (operation === "get") return videoGet(node, itemJson, token);
    if (operation === "getAll") return videoGetAll(node, itemJson, token);
    if (operation === "rate") return videoRate(node, itemJson, token);
    if (operation === "update") return videoUpdate(node, itemJson, token);
    if (operation === "upload") return videoUpload(node, itemJson, item, token);
    throw new Error(`YouTube: unsupported video operation "${operation}"`);
  }
  if (resource === "videoCategory") {
    if (operation === "getAll") return videoCategoryGetAll(node, itemJson, token);
    throw new Error(`YouTube: unsupported videoCategory operation "${operation}"`);
  }
  throw new Error(`YouTube: unsupported resource "${resource}"`);
}

export const youTubeExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(
    node.parameters.resource ?? ctx.getParam("resource", "channel") ?? "channel",
  );
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", "getAll") ?? "getAll",
  );
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      if (Array.isArray(result)) {
        for (const json of result) {
          out.push({ json, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
