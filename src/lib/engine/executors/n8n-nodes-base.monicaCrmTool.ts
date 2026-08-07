import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const DEFAULT_API = "https://app.monicahq.com/api";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function monicaRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  baseUrl: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Monica CRM request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processMonicaError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.error?.message === "string"
    ? `${obj.error.message} (code: ${obj.error_code ?? "?"})`
    : `Monica CRM: HTTP ${status}`;
  return new Error(message);
}

async function requestOk(
  method: string,
  path: string,
  headers: Record<string, string>,
  baseUrl: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await monicaRequest(method, path, headers, baseUrl, body);
  if (res.status < 200 || res.status >= 300) throw processMonicaError(res.body, res.status);
  return asObj(res.body);
}

async function authHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; baseUrl: string }> {
  const cred = await ctx.getCredential("monicaCrmApi");
  const token = cred ? String(cred.apiToken ?? cred.accessToken ?? cred.token ?? "") : "";
  if (!token) throw new Error("Monica CRM: monicaCrmApi credential is not configured");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const baseUrl = cred?.environment === "selfHosted" && cred?.domain
    ? String(cred.domain).replace(/\/$/, "") + "/api"
    : DEFAULT_API;
  return { headers, baseUrl };
}

function getParam(node: INode, name: string): unknown {
  return node.parameters[name];
}

function getEntityId(node: INode, itemJson: Record<string, unknown>): string {
  const fromId = resolveValue(getParam(node, "id"), itemJson);
  if (fromId !== undefined && fromId !== "" && fromId !== null) return String(fromId);
  const fromContact = resolveValue(getParam(node, "contactId"), itemJson);
  if (fromContact !== undefined && fromContact !== "" && fromContact !== null) return String(fromContact);
  const fromConversation = resolveValue(getParam(node, "conversationId"), itemJson);
  if (fromConversation !== undefined && fromConversation !== "" && fromConversation !== null) return String(fromConversation);
  return "";
}

export const monicaCrmToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const rawResource = String(getParam(node, "resource") ?? "activity");
  const rawOperation = String(getParam(node, "operation") ?? "create");
  const resource = normalizeResource(rawResource);
  const operation = normalizeOperation(rawOperation);
  const continueOnFail = ctx.continueOnFail();
  const { headers, baseUrl } = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, resource, operation, itemJson, headers, baseUrl);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

function normalizeResource(raw: string): string {
  const map: Record<string, string> = {
    activity: "activity", Activity: "activity",
    call: "call", Call: "call",
    contact: "contact", Contact: "contact",
    "contact field": "contactField", "Contact Field": "contactField", contactField: "contactField",
    "contact tag": "contactTag", "Contact Tag": "contactTag", contactTag: "contactTag",
    conversation: "conversation", Conversation: "conversation",
    "conversation message": "conversationMessage", "Conversation Message": "conversationMessage", conversationMessage: "conversationMessage",
    "journal entry": "journalEntry", "Journal Entry": "journalEntry", journalEntry: "journalEntry",
    note: "note", Note: "note",
    reminder: "reminder", Reminder: "reminder",
    tag: "tag", Tag: "tag",
    task: "task", Task: "task",
  };
  return map[raw] ?? raw;
}

function normalizeOperation(raw: string): string {
  const map: Record<string, string> = {
    create: "create", Create: "create",
    get: "get", Get: "get", Retrieve: "get", retrieve: "get",
    getAll: "getAll", "get all": "getAll", "Get All": "getAll", "Retrieve all": "getAll", "retrieve all": "getAll",
    update: "update", Update: "update",
    delete: "delete", Delete: "delete",
    add: "add", Add: "add",
    remove: "remove", Remove: "remove",
    createMessage: "createMessage", "create message": "createMessage", "Create Message": "createMessage",
    updateMessage: "updateMessage", "update message": "updateMessage", "Update Message": "updateMessage",
  };
  return map[raw] ?? raw;
}

function apiPath(resource: string): string {
  const ops: Record<string, string> = {
    activity: "/activities",
    call: "/calls",
    contact: "/contacts",
    contactField: "/contactfields",
    contactTag: "/contacttags",
    conversation: "/conversations",
    conversationMessage: "/conversations",
    journalEntry: "/journalentries",
    note: "/notes",
    reminder: "/reminders",
    tag: "/tags",
    task: "/tasks",
  };
  return ops[resource] ?? "/contacts";
}

async function runOperation(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  baseUrl: string,
): Promise<Record<string, unknown>[]> {

  if (operation === "getAll") {
    return handleGetAll(node, resource, itemJson, headers, baseUrl);
  }

  if (operation === "get") {
    const id = getEntityId(node, itemJson);
    if (!id) throw new Error(`Monica CRM: id is required for get on ${resource}`);
    const path = `${apiPath(resource)}/${id}`;
    const obj = await requestOk("GET", path, headers, baseUrl);
    const data = obj.data as Record<string, unknown> | undefined;
    return [data ?? obj];
  }

  if (operation === "delete") {
    const id = getEntityId(node, itemJson);
    if (!id) throw new Error(`Monica CRM: id is required for delete on ${resource}`);
    const path = `${apiPath(resource)}/${id}`;
    const obj = await requestOk("DELETE", path, headers, baseUrl);
    return [obj];
  }

  if (operation === "create" || operation === "update") {
    const body = buildCreateBody(resource, operation, node, itemJson);
    if (operation === "update") {
      const id = getEntityId(node, itemJson);
      if (!id) throw new Error(`Monica CRM: id is required for update on ${resource}`);
      const obj = await requestOk("PUT", `${apiPath(resource)}/${id}`, headers, baseUrl, body);
      const data = obj.data as Record<string, unknown> | undefined;
      return [data ?? obj];
    }
    const obj = await requestOk("POST", apiPath(resource), headers, baseUrl, body);
    const data = obj.data as Record<string, unknown> | undefined;
    return [data ?? obj];
  }

  function parseTagIds(raw: unknown): number[] {
    if (Array.isArray(raw)) return raw.map(Number).filter((n) => !isNaN(n) && n > 0);
    if (typeof raw === "string" && raw.trim()) return raw.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
    return [];
  }

  if (resource === "contactTag" && operation === "add") {
    const contactId = String(resolveValue(getParam(node, "contactId"), itemJson) ?? "");
    if (!contactId) throw new Error("Monica CRM: contactId is required for contact tag add");
    const tagsToAdd = resolveValue(getParam(node, "tagsToAdd") ?? getParam(node, "tagsToAdd"), itemJson);
    const tagIds = parseTagIds(tagsToAdd);
    if (tagIds.length === 0) throw new Error("Monica CRM: tagsToAdd must contain at least one tag ID");
    const obj = await requestOk("POST", `/contacts/${contactId}/tags`, headers, baseUrl, { tags: tagIds });
    return [obj];
  }

  if (resource === "contactTag" && operation === "remove") {
    const contactId = String(resolveValue(getParam(node, "contactId"), itemJson) ?? "");
    if (!contactId) throw new Error("Monica CRM: contactId is required for contact tag remove");
    const tagsToRemove = resolveValue(getParam(node, "tagsToRemove") ?? getParam(node, "tagsToRemove"), itemJson);
    const tagIds = parseTagIds(tagsToRemove);
    if (tagIds.length === 0) throw new Error("Monica CRM: tagsToRemove must contain at least one tag ID");
    const results: Record<string, unknown>[] = [];
    for (const tagId of tagIds) {
      const obj = await requestOk("DELETE", `/contacts/${contactId}/tags/${tagId}`, headers, baseUrl);
      results.push(obj);
    }
    return results;
  }

  if (resource === "conversationMessage") {
    const conversationId = String(resolveValue(getParam(node, "conversationId"), itemJson) ?? "");
    if (!conversationId) throw new Error("Monica CRM: conversationId is required for conversation message");
    const message = String(resolveValue(getParam(node, "message") ?? getParam(node, "conversationMessage"), itemJson) ?? "");
    if (operation === "createMessage") {
      const obj = await requestOk("POST", `/conversations/${conversationId}/messages`, headers, baseUrl, { content: message });
      const data = obj.data as Record<string, unknown> | undefined;
      return [data ?? obj];
    }
    if (operation === "updateMessage") {
      const messageId = getEntityId(node, itemJson);
      if (!messageId) throw new Error("Monica CRM: messageId is required for updateMessage");
      const obj = await requestOk("PUT", `/conversations/${conversationId}/messages/${messageId}`, headers, baseUrl, { content: message });
      const data = obj.data as Record<string, unknown> | undefined;
      return [data ?? obj];
    }
  }

  const msg = `Monica CRM: unsupported resource/operation: ${resource}/${operation}`;
  throw new Error(msg);
}

async function handleGetAll(
  node: INode,
  resource: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  baseUrl: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = getParam(node, "returnAll") === true;
  const options = (getParam(node, "options") as Record<string, unknown> | undefined) ?? {};
  const limit = Number(getParam(node, "limit") ?? options.limit ?? 10);
  const resolveData = getParam(node, "resolveData") === true;
  const page = Number(getParam(node, "page") ?? options.page ?? 1);
  const perPage = Math.min(Math.max(limit, 1), 100);
  const path = apiPath(resource);
  const params = `?page=${page}&limit=${perPage}${resolveData ? "&with=" : ""}`;
  const obj = await requestOk("GET", `${path}${params}`, headers, baseUrl);

  if (!returnAll) {
    // Return full Monica envelope per spec (data, links, meta)
    return [obj];
  }

  // Collect all pages
  const allData: Record<string, unknown>[] = [];
  const data = Array.isArray(obj.data) ? obj.data as Record<string, unknown>[] : [];
  allData.push(...data);
  const totalPages = Number((obj.meta as Record<string, unknown> | undefined)?.last_page ?? 1);
  let currentPage = page;
  while (currentPage < totalPages) {
    currentPage++;
    const nextObj = await requestOk("GET", `${path}?page=${currentPage}&limit=${perPage}${resolveData ? "&with=" : ""}`, headers, baseUrl);
    const nextData = Array.isArray(nextObj.data) ? nextObj.data as Record<string, unknown>[] : [];
    allData.push(...nextData);
  }

  return allData;
}

function buildCreateBody(
  resource: string,
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const contactId = resolveValue(getParam(node, "contactId"), itemJson);
  if (contactId !== undefined && contactId !== "" && resource !== "contact") {
    body.contact_id = Number(contactId);
  }

  const genderId = resolveValue(getParam(node, "genderId"), itemJson);
  const additionalFields = getParam(node, "additionalFields") as Record<string, unknown> | undefined;

  switch (resource) {
    case "activity": {
      body.summary = resolveValue(getParam(node, "summary"), itemJson) ?? "";
      const happenedAt = resolveValue(getParam(node, "happenedAt") ?? getParam(node, "date"), itemJson);
      body.happened_at = happenedAt ?? "";
      const typeId = resolveValue(getParam(node, "activityTypeId"), itemJson);
      if (typeId !== undefined && typeId !== "") body.activity_type_id = Number(typeId);
      break;
    }
    case "call": {
      const calledAt = resolveValue(getParam(node, "initialCallDate") ?? getParam(node, "calledAt") ?? getParam(node, "date"), itemJson);
      body.called_at = calledAt ?? "";
      body.content = resolveValue(getParam(node, "content"), itemJson) ?? "";
      break;
    }
    case "contact": {
      body.first_name = resolveValue(getParam(node, "firstName"), itemJson) ?? "";
      body.last_name = resolveValue(getParam(node, "lastName"), itemJson) ?? "";
      if (genderId !== undefined && genderId !== "") {
        body.gender_id = Number(genderId);
      } else if (additionalFields?.genderId !== undefined && additionalFields.genderId !== "") {
        body.gender_id = Number(additionalFields.genderId);
      }
      const birthdate = resolveValue(additionalFields?.birthdate, itemJson);
      if (birthdate !== undefined && birthdate !== "") body.birthdate = String(birthdate);
      const email = resolveValue(additionalFields?.email ?? getParam(node, "email"), itemJson);
      if (email !== undefined && email !== "") body.email = String(email);
      const phone = resolveValue(additionalFields?.phone ?? getParam(node, "phone"), itemJson);
      if (phone !== undefined && phone !== "") body.phone = String(phone);
      break;
    }
    case "contactField": {
      body.contact_field_type_id = Number(resolveValue(getParam(node, "contactFieldTypeId"), itemJson) ?? 0);
      body.value = String(resolveValue(getParam(node, "contactFieldData") ?? getParam(node, "value"), itemJson) ?? "");
      break;
    }
    case "conversation": {
      body.subject = resolveValue(getParam(node, "subject") ?? getParam(node, "conversationMessage"), itemJson) ?? "";
      break;
    }
    case "journalEntry": {
      body.entry = resolveValue(getParam(node, "journalEntry") ?? getParam(node, "content"), itemJson) ?? "";
      body.title = resolveValue(getParam(node, "title"), itemJson) ?? "";
      const journalDate = resolveValue(getParam(node, "journalDate") ?? getParam(node, "date"), itemJson);
      if (journalDate !== undefined && journalDate !== "") body.date = String(journalDate);
      break;
    }
    case "note": {
      body.body = resolveValue(getParam(node, "body") ?? getParam(node, "simpleBody"), itemJson) ?? "";
      const noteTitle = resolveValue(getParam(node, "title") ?? getParam(node, "subject"), itemJson);
      if (noteTitle !== undefined && noteTitle !== "") body.title = String(noteTitle);
      break;
    }
    case "reminder": {
      body.title = resolveValue(getParam(node, "reminderTitle") ?? getParam(node, "summary"), itemJson) ?? "";
      body.next_expected_date = String(resolveValue(getParam(node, "reminderDate") ?? getParam(node, "date"), itemJson) ?? "");
      body.frequency_type = String(resolveValue(getParam(node, "reminderFrequencyType"), itemJson) ?? "once");
      break;
    }
    case "tag": {
      body.name = resolveValue(getParam(node, "name"), itemJson) ?? "";
      break;
    }
    case "task": {
      body.title = resolveValue(getParam(node, "title") ?? getParam(node, "subject"), itemJson) ?? "";
      const desc = resolveValue(getParam(node, "description"), itemJson);
      if (desc !== undefined && desc !== "") body.description = String(desc);
      const completed = resolveValue(getParam(node, "completed"), itemJson);
      if (completed !== undefined && completed !== false && completed !== "false") {
        body.completed = true;
      }
      break;
    }
  }

  return body;
}
