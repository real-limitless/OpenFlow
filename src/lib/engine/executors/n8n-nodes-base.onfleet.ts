import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://onfleet.com/api/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", `return (${raw.replace(/^=/, "")})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const onfleetExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Task");
  const operation = String(node.parameters.operation ?? "GetAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext, node: INode): Promise<string> {
  const cred = await ctx.getCredential("onfleetApi");
  if (!cred) {
    throw new Error("Onfleet: onfleetApi credential is not configured");
  }
  return String(cred.apiKey ?? "");
}

async function onfleetRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
  const encoded = btoa(`${apiKey}:`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.message ?? `Request failed with status code ${response.status}`);
      throw new Error(`Onfleet: ${errMsg}`);
    }
    return asObj(parsed);
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("Onfleet:") || err.message.startsWith("Onfleet "))) {
      throw err;
    }
    throw new Error(`Onfleet request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const apiKey = await getApiKey(ctx, node);

  switch (resource) {
    case "Administrator": return runAdministrator(apiKey, node, operation, itemJson);
    case "Container": return runContainer(apiKey, node, operation, itemJson);
    case "Destination": return runDestination(apiKey, node, operation, itemJson);
    case "Hub": return runHub(apiKey, node, operation, itemJson);
    case "Organization": return runOrganization(apiKey, node, operation, itemJson);
    case "Recipient": return runRecipient(apiKey, node, operation, itemJson);
    case "Task": return runTask(apiKey, node, operation, itemJson);
    case "Team": return runTeam(apiKey, node, operation, itemJson);
    case "Worker": return runWorker(apiKey, node, operation, itemJson);
    case "Webhook": return runWebhook(apiKey, node, operation, itemJson);
    default: throw new Error(`Onfleet: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Administrator
// ---------------------------------------------------------------------------

async function runAdministrator(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const phone = String(resolveValue(node.parameters.phone, itemJson) ?? "");
    if (!name || !email || !phone) throw new Error("Onfleet: name, email, and phone are required");
    const body: Record<string, unknown> = { name, email, phone };
    const isReadOnly = resolveValue(node.parameters.isReadOnly, itemJson);
    if (isReadOnly !== undefined) body.isReadOnly = Boolean(isReadOnly);
    const res = await onfleetRequest(apiKey, "POST", "/admins", body);
    return { json: res };
  }
  if (operation === "Delete") {
    const adminId = String(resolveValue(node.parameters.adminId, itemJson) ?? "");
    if (!adminId) throw new Error("Onfleet: adminId is required");
    await onfleetRequest(apiKey, "DELETE", `/admins/${adminId}`);
    return { json: { success: true } };
  }
  if (operation === "GetAll") {
    const res = await onfleetRequest(apiKey, "GET", "/admins");
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((a) => ({ json: a }));
  }
  if (operation === "Update") {
    const adminId = String(resolveValue(node.parameters.adminId, itemJson) ?? "");
    if (!adminId) throw new Error("Onfleet: adminId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
    const phone = resolveValue(node.parameters.phone, itemJson);
    if (phone) body.phone = String(phone);
    const isReadOnly = resolveValue(node.parameters.isReadOnly, itemJson);
    if (isReadOnly !== undefined) body.isReadOnly = Boolean(isReadOnly);
    const res = await onfleetRequest(apiKey, "PUT", `/admins/${adminId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Administrator operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

async function runContainer(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const containerType = String(resolveValue(node.parameters.containerType, itemJson) ?? "");
  const containerId = String(resolveValue(node.parameters.containerId, itemJson) ?? "");
  if (!containerType || !containerId) throw new Error("Onfleet: containerType and containerId are required");

  if (operation === "Get") {
    const res = await onfleetRequest(apiKey, "GET", `/containers/${containerType}/${containerId}`);
    return { json: res };
  }
  if (operation === "Add Task") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Onfleet: taskId is required");
    const body: Record<string, unknown> = { taskId };
    const index = resolveValue(node.parameters.index, itemJson);
    if (index !== undefined) body.index = Number(index);
    const res = await onfleetRequest(apiKey, "POST", `/containers/${containerType}/${containerId}`, body);
    return { json: res };
  }
  if (operation === "Replace Tasks") {
    const taskIdsRaw = resolveValue(node.parameters.taskIds, itemJson);
    const taskIds = Array.isArray(taskIdsRaw) ? taskIdsRaw : [String(taskIdsRaw ?? "")];
    const body: Record<string, unknown> = { taskIds };
    const res = await onfleetRequest(apiKey, "PUT", `/containers/${containerType}/${containerId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Container operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Destination
// ---------------------------------------------------------------------------

async function runDestination(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const addressRaw = resolveValue(node.parameters.address, itemJson) ?? {};
    const address = asObj(addressRaw);
    const body: Record<string, unknown> = { address };
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const location = resolveValue(node.parameters.location, itemJson);
    if (location) body.location = location;
    const language = resolveValue(node.parameters.language, itemJson);
    if (language) body.language = String(language);
    const res = await onfleetRequest(apiKey, "POST", "/destinations", body);
    return { json: res };
  }
  if (operation === "Get") {
    const destinationId = String(resolveValue(node.parameters.destinationId, itemJson) ?? "");
    if (!destinationId) throw new Error("Onfleet: destinationId is required");
    const res = await onfleetRequest(apiKey, "GET", `/destinations/${destinationId}`);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Destination operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

async function runHub(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const addressRaw = resolveValue(node.parameters.address, itemJson) ?? {};
    if (!name) throw new Error("Onfleet: name is required");
    const body: Record<string, unknown> = { name, address: asObj(addressRaw) };
    const teams = resolveValue(node.parameters.teams, itemJson);
    if (Array.isArray(teams)) body.teams = teams;
    const res = await onfleetRequest(apiKey, "POST", "/hubs", body);
    return { json: res };
  }
  if (operation === "GetAll") {
    const res = await onfleetRequest(apiKey, "GET", "/hubs");
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((h) => ({ json: h }));
  }
  if (operation === "Update") {
    const hubId = String(resolveValue(node.parameters.hubId, itemJson) ?? "");
    if (!hubId) throw new Error("Onfleet: hubId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const addressRaw = resolveValue(node.parameters.address, itemJson);
    if (addressRaw) body.address = asObj(addressRaw);
    const teams = resolveValue(node.parameters.teams, itemJson);
    if (Array.isArray(teams)) body.teams = teams;
    const res = await onfleetRequest(apiKey, "PUT", `/hubs/${hubId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Hub operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

async function runOrganization(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Get") {
    const res = await onfleetRequest(apiKey, "GET", "/organization");
    return { json: res };
  }
  if (operation === "Get Connected Organization") {
    const organizationId = String(resolveValue(node.parameters.organizationId, itemJson) ?? "");
    if (!organizationId) throw new Error("Onfleet: organizationId is required");
    const res = await onfleetRequest(apiKey, "GET", `/organizations/${organizationId}`);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Organization operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Recipient
// ---------------------------------------------------------------------------

async function runRecipient(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const phone = String(resolveValue(node.parameters.phone, itemJson) ?? "");
    if (!name || !phone) throw new Error("Onfleet: name and phone are required");
    const body: Record<string, unknown> = { name, phone };
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const skipSMS = resolveValue(node.parameters.skipSMSNotifications, itemJson);
    if (skipSMS !== undefined) body.skipSMSNotifications = Boolean(skipSMS);
    const skipPhoneValidation = resolveValue(node.parameters.skipPhoneNumberValidation, itemJson);
    if (skipPhoneValidation !== undefined) body.skipPhoneNumberValidation = Boolean(skipPhoneValidation);
    const res = await onfleetRequest(apiKey, "POST", "/recipients", body);
    return { json: res };
  }
  if (operation === "Get") {
    const recipientId = String(resolveValue(node.parameters.recipientId, itemJson) ?? "");
    if (!recipientId) throw new Error("Onfleet: recipientId is required");
    const res = await onfleetRequest(apiKey, "GET", `/recipients/${recipientId}`);
    return { json: res };
  }
  if (operation === "Update") {
    const recipientId = String(resolveValue(node.parameters.recipientId, itemJson) ?? "");
    if (!recipientId) throw new Error("Onfleet: recipientId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const phone = resolveValue(node.parameters.phone, itemJson);
    if (phone) body.phone = String(phone);
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const skipSMS = resolveValue(node.parameters.skipSMSNotifications, itemJson);
    if (skipSMS !== undefined) body.skipSMSNotifications = Boolean(skipSMS);
    const res = await onfleetRequest(apiKey, "PUT", `/recipients/${recipientId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Recipient operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

async function runTask(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const body: Record<string, unknown> = {};
    const destination = resolveValue(node.parameters.destination, itemJson);
    if (destination) body.destination = destination;
    const recipients = resolveValue(node.parameters.recipients, itemJson);
    if (Array.isArray(recipients)) body.recipients = recipients;
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const completeAfter = resolveValue(node.parameters.completeAfter, itemJson);
    if (completeAfter !== undefined) body.completeAfter = Number(completeAfter);
    const completeBefore = resolveValue(node.parameters.completeBefore, itemJson);
    if (completeBefore !== undefined) body.completeBefore = Number(completeBefore);
    const pickupTask = resolveValue(node.parameters.pickupTask, itemJson);
    if (pickupTask !== undefined) body.pickupTask = pickupTask;
    const quantity = resolveValue(node.parameters.quantity, itemJson);
    if (quantity !== undefined) body.quantity = Number(quantity);
    const serviceTime = resolveValue(node.parameters.serviceTime, itemJson);
    if (serviceTime !== undefined) body.serviceTime = Number(serviceTime);
    // TODO: merchant, executor, recipientName, recipientNotes, recipientSkipSMSNotifications, useMerchantForProxy
    // TODO: autoAssign, container, dependencies, requirements, barcodes, appearance (triangleColor), customFields
    const res = await onfleetRequest(apiKey, "POST", "/tasks", body);
    return { json: res };
  }
  if (operation === "Clone") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Onfleet: taskId is required");
    const body: Record<string, unknown> = {};
    const destination = resolveValue(node.parameters.destination, itemJson);
    if (destination) body.destination = destination;
    const recipients = resolveValue(node.parameters.recipients, itemJson);
    if (recipients) body.recipients = recipients;
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const completeAfter = resolveValue(node.parameters.completeAfter, itemJson);
    if (completeAfter !== undefined) body.completeAfter = Number(completeAfter);
    const completeBefore = resolveValue(node.parameters.completeBefore, itemJson);
    if (completeBefore !== undefined) body.completeBefore = Number(completeBefore);
    const pickupTask = resolveValue(node.parameters.pickupTask, itemJson);
    if (pickupTask !== undefined) body.pickupTask = pickupTask;
    const serviceTime = resolveValue(node.parameters.serviceTime, itemJson);
    if (serviceTime !== undefined) body.serviceTime = Number(serviceTime);
    const includeMetadata = resolveValue(node.parameters.includeMetadata, itemJson);
    if (includeMetadata !== undefined) body.includeMetadata = Boolean(includeMetadata);
    const includeBarcodes = resolveValue(node.parameters.includeBarcodes, itemJson);
    if (includeBarcodes !== undefined) body.includeBarcodes = Boolean(includeBarcodes);
    const includeDependencies = resolveValue(node.parameters.includeDependencies, itemJson);
    if (includeDependencies !== undefined) body.includeDependencies = Boolean(includeDependencies);
    const res = await onfleetRequest(apiKey, "POST", `/tasks/${taskId}/clone`, body);
    return { json: res };
  }
  if (operation === "Complete") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    const completionDetailsRaw = resolveValue(node.parameters.completionDetails, itemJson) ?? {};
    const completionDetails = asObj(completionDetailsRaw);
    if (!taskId) throw new Error("Onfleet: taskId is required");
    if (completionDetails.success === undefined) throw new Error("Onfleet: completionDetails.success is required");
    const res = await onfleetRequest(apiKey, "POST", `/tasks/${taskId}/complete`, { completionDetails });
    return { json: res };
  }
  if (operation === "Delete") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Onfleet: taskId is required");
    await onfleetRequest(apiKey, "DELETE", `/tasks/${taskId}`);
    return { json: { success: true } };
  }
  if (operation === "GetAll") {
    const params: Record<string, string> = {};
    const from = resolveValue(node.parameters.from, itemJson);
    if (from !== undefined) params.from = String(from);
    const to = resolveValue(node.parameters.to, itemJson);
    if (to !== undefined) params.to = String(to);
    const lastId = resolveValue(node.parameters.lastId, itemJson);
    if (lastId) params.lastId = String(lastId);
    const state = resolveValue(node.parameters.state, itemJson);
    if (state !== undefined) params.state = String(state);
    const worker = resolveValue(node.parameters.worker, itemJson);
    if (worker) params.worker = String(worker);
    const completeBefore = resolveValue(node.parameters.completeBefore, itemJson);
    if (completeBefore !== undefined) params.completeBefore = String(completeBefore);
    const completeAfter = resolveValue(node.parameters.completeAfter, itemJson);
    if (completeAfter !== undefined) params.completeAfter = String(completeAfter);
    const dependencies = resolveValue(node.parameters.dependencies, itemJson);
    if (dependencies !== undefined) params.dependencies = String(dependencies);
    const res = await onfleetRequest(apiKey, "GET", "/tasks/all", undefined, params);
    const list = (res.tasks ?? res.rows ?? []) as Record<string, unknown>[];
    return list.map((t) => ({ json: t }));
  }
  if (operation === "Get") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Onfleet: taskId is required");
    const res = await onfleetRequest(apiKey, "GET", `/tasks/${taskId}`);
    return { json: res };
  }
  if (operation === "Update") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Onfleet: taskId is required");
    const body: Record<string, unknown> = {};
    const notes = resolveValue(node.parameters.notes, itemJson);
    if (notes) body.notes = String(notes);
    const completeAfter = resolveValue(node.parameters.completeAfter, itemJson);
    if (completeAfter !== undefined) body.completeAfter = Number(completeAfter);
    const completeBefore = resolveValue(node.parameters.completeBefore, itemJson);
    if (completeBefore !== undefined) body.completeBefore = Number(completeBefore);
    const pickupTask = resolveValue(node.parameters.pickupTask, itemJson);
    if (pickupTask !== undefined) body.pickupTask = pickupTask;
    const quantity = resolveValue(node.parameters.quantity, itemJson);
    if (quantity !== undefined) body.quantity = Number(quantity);
    const serviceTime = resolveValue(node.parameters.serviceTime, itemJson);
    if (serviceTime !== undefined) body.serviceTime = Number(serviceTime);
    const res = await onfleetRequest(apiKey, "PUT", `/tasks/${taskId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Task operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

async function runTeam(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Auto Dispatch") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    if (!teamId) throw new Error("Onfleet: teamId is required");
    const body: Record<string, unknown> = {};
    const maxTasksPerRoute = resolveValue(node.parameters.maxTasksPerRoute, itemJson);
    if (maxTasksPerRoute !== undefined) body.maxTasksPerRoute = Number(maxTasksPerRoute);
    const taskTimeWindow = resolveValue(node.parameters.taskTimeWindow, itemJson);
    if (taskTimeWindow !== undefined) body.taskTimeWindow = taskTimeWindow;
    const scheduleTimeWindow = resolveValue(node.parameters.scheduleTimeWindow, itemJson);
    if (scheduleTimeWindow !== undefined) body.scheduleTimeWindow = scheduleTimeWindow;
    const serviceTime = resolveValue(node.parameters.serviceTime, itemJson);
    if (serviceTime !== undefined) body.serviceTime = Number(serviceTime);
    const routeEnd = resolveValue(node.parameters.routeEnd, itemJson);
    if (routeEnd) body.routeEnd = String(routeEnd);
    const maxAllowedDelay = resolveValue(node.parameters.maxAllowedDelay, itemJson);
    if (maxAllowedDelay !== undefined) body.maxAllowedDelay = Number(maxAllowedDelay);
    const res = await onfleetRequest(apiKey, "POST", `/teams/${teamId}/autoDispatch`, body);
    return { json: res };
  }
  if (operation === "Create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Onfleet: name is required");
    const body: Record<string, unknown> = { name };
    const workers = resolveValue(node.parameters.workers, itemJson);
    if (Array.isArray(workers)) body.workers = workers;
    const managers = resolveValue(node.parameters.managers, itemJson);
    if (Array.isArray(managers)) body.managers = managers;
    const hub = resolveValue(node.parameters.hub, itemJson);
    if (hub) body.hub = hub;
    const enableSelfAssignment = resolveValue(node.parameters.enableSelfAssignment, itemJson);
    if (enableSelfAssignment !== undefined) body.enableSelfAssignment = Boolean(enableSelfAssignment);
    const res = await onfleetRequest(apiKey, "POST", "/teams", body);
    return { json: res };
  }
  if (operation === "Delete") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    if (!teamId) throw new Error("Onfleet: teamId is required");
    await onfleetRequest(apiKey, "DELETE", `/teams/${teamId}`);
    return { json: { success: true } };
  }
  if (operation === "Get") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    if (!teamId) throw new Error("Onfleet: teamId is required");
    const res = await onfleetRequest(apiKey, "GET", `/teams/${teamId}`);
    return { json: res };
  }
  if (operation === "GetAll") {
    const res = await onfleetRequest(apiKey, "GET", "/teams");
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((t) => ({ json: t }));
  }
  if (operation === "Get Estimated Time") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    const dropoffLocation = resolveValue(node.parameters.dropoffLocation, itemJson);
    const pickupLocation = resolveValue(node.parameters.pickupLocation, itemJson);
    if (!teamId) throw new Error("Onfleet: teamId is required");
    if (!dropoffLocation) throw new Error("Onfleet: dropoffLocation is required");
    if (!pickupLocation) throw new Error("Onfleet: pickupLocation is required");
    const body: Record<string, unknown> = { dropoffLocation, pickupLocation };
    const pickupTime = resolveValue(node.parameters.pickupTime, itemJson);
    if (pickupTime !== undefined) body.pickupTime = Number(pickupTime);
    const restrictedVehicleTypes = resolveValue(node.parameters.restrictedVehicleTypes, itemJson);
    if (restrictedVehicleTypes) body.restrictedVehicleTypes = restrictedVehicleTypes;
    const serviceTime = resolveValue(node.parameters.serviceTime, itemJson);
    if (serviceTime !== undefined) body.serviceTime = Number(serviceTime);
    const res = await onfleetRequest(apiKey, "POST", `/teams/${teamId}/estimate`, body);
    return { json: res };
  }
  if (operation === "Update") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    if (!teamId) throw new Error("Onfleet: teamId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const workers = resolveValue(node.parameters.workers, itemJson);
    if (Array.isArray(workers)) body.workers = workers;
    const managers = resolveValue(node.parameters.managers, itemJson);
    if (Array.isArray(managers)) body.managers = managers;
    const hub = resolveValue(node.parameters.hub, itemJson);
    if (hub) body.hub = hub;
    const enableSelfAssignment = resolveValue(node.parameters.enableSelfAssignment, itemJson);
    if (enableSelfAssignment !== undefined) body.enableSelfAssignment = Boolean(enableSelfAssignment);
    const res = await onfleetRequest(apiKey, "PUT", `/teams/${teamId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Team operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function runWorker(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const phone = String(resolveValue(node.parameters.phone, itemJson) ?? "");
    if (!name || !phone) throw new Error("Onfleet: name and phone are required");
    const body: Record<string, unknown> = { name, phone };
    const vehicle = resolveValue(node.parameters.vehicle, itemJson);
    if (vehicle) body.vehicle = vehicle;
    const teams = resolveValue(node.parameters.teams, itemJson);
    if (Array.isArray(teams)) body.teams = teams;
    const capacity = resolveValue(node.parameters.capacity, itemJson);
    if (capacity !== undefined) body.capacity = Number(capacity);
    const displayName = resolveValue(node.parameters.displayName, itemJson);
    if (displayName) body.displayName = String(displayName);
    const res = await onfleetRequest(apiKey, "POST", "/workers", body);
    return { json: res };
  }
  if (operation === "Delete") {
    const workerId = String(resolveValue(node.parameters.workerId, itemJson) ?? "");
    if (!workerId) throw new Error("Onfleet: workerId is required");
    await onfleetRequest(apiKey, "DELETE", `/workers/${workerId}`);
    return { json: { success: true } };
  }
  if (operation === "Get") {
    const workerId = String(resolveValue(node.parameters.workerId, itemJson) ?? "");
    if (!workerId) throw new Error("Onfleet: workerId is required");
    const res = await onfleetRequest(apiKey, "GET", `/workers/${workerId}`);
    return { json: res };
  }
  if (operation === "GetAll") {
    const params: Record<string, string> = {};
    const filter = resolveValue(node.parameters.filter, itemJson);
    if (filter) params.filter = String(filter);
    const teams = resolveValue(node.parameters.teams, itemJson);
    if (teams !== undefined) params.teams = String(teams);
    const states = resolveValue(node.parameters.states, itemJson);
    if (states !== undefined) params.states = String(states);
    const phones = resolveValue(node.parameters.phones, itemJson);
    if (phones) params.phones = String(phones);
    const analytics = resolveValue(node.parameters.analytics, itemJson);
    if (analytics) params.analytics = String(analytics);
    const res = await onfleetRequest(apiKey, "GET", "/workers", undefined, params);
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((w) => ({ json: w }));
  }
  if (operation === "Get Schedule") {
    const workerId = String(resolveValue(node.parameters.workerId, itemJson) ?? "");
    if (!workerId) throw new Error("Onfleet: workerId is required");
    const res = await onfleetRequest(apiKey, "GET", `/workers/${workerId}/schedule`);
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((s) => ({ json: s }));
  }
  if (operation === "Update") {
    const workerId = String(resolveValue(node.parameters.workerId, itemJson) ?? "");
    if (!workerId) throw new Error("Onfleet: workerId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const phone = resolveValue(node.parameters.phone, itemJson);
    if (phone) body.phone = String(phone);
    const vehicle = resolveValue(node.parameters.vehicle, itemJson);
    if (vehicle) body.vehicle = vehicle;
    const teams = resolveValue(node.parameters.teams, itemJson);
    if (Array.isArray(teams)) body.teams = teams;
    const capacity = resolveValue(node.parameters.capacity, itemJson);
    if (capacity !== undefined) body.capacity = Number(capacity);
    const displayName = resolveValue(node.parameters.displayName, itemJson);
    if (displayName) body.displayName = String(displayName);
    const res = await onfleetRequest(apiKey, "PUT", `/workers/${workerId}`, body);
    return { json: res };
  }
  throw new Error(`Onfleet: unsupported Worker operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

async function runWebhook(
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const url = String(resolveValue(node.parameters.url, itemJson) ?? "");
    const trigger = resolveValue(node.parameters.trigger, itemJson);
    if (!url || trigger === undefined) throw new Error("Onfleet: url and trigger are required");
    const body: Record<string, unknown> = { url, trigger: Number(trigger) };
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const threshold = resolveValue(node.parameters.threshold, itemJson);
    if (threshold !== undefined) body.threshold = Number(threshold);
    const res = await onfleetRequest(apiKey, "POST", "/webhooks", body);
    return { json: res };
  }
  if (operation === "Delete") {
    const webhookId = String(resolveValue(node.parameters.webhookId, itemJson) ?? "");
    if (!webhookId) throw new Error("Onfleet: webhookId is required");
    await onfleetRequest(apiKey, "DELETE", `/webhooks/${webhookId}`);
    return { json: { success: true } };
  }
  if (operation === "GetAll") {
    const res = await onfleetRequest(apiKey, "GET", "/webhooks");
    const list = (res.rows ?? res.data ?? []) as Record<string, unknown>[];
    return list.map((w) => ({ json: w }));
  }
  throw new Error(`Onfleet: unsupported Webhook operation "${operation}"`);
}
