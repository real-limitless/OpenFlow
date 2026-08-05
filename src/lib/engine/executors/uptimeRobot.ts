import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.uptimerobot.com/v2";

interface UptimeRobotResponse {
  stat: "ok" | "fail";
  pagination?: {
    offset: number;
    limit: number;
    total: number;
  };
  monitors?: Record<string, unknown>[];
  alert_contacts?: Record<string, unknown>[];
  alertcontact?: Record<string, unknown>;
  mwindows?: Record<string, unknown>[];
  psps?: Record<string, unknown>[];
  psp?: Record<string, unknown>;
  account?: Record<string, unknown>;
  monitor?: Record<string, unknown>;
  id?: number;
  [key: string]: unknown;
}

function getMethod(resource: string, operation: string): string {
  if (operation === "Get All") {
    if (resource === "Monitor") return "getMonitors";
    if (resource === "Alert Contact") return "getAlertContacts";
    if (resource === "Maintenance Window") return "getMWindows";
    if (resource === "Public Status Page") return "getPSPs";
  }
  if (operation === "Get") {
    if (resource === "Account") return "getAccountDetails";
    if (resource === "Monitor") return "getMonitors";
    if (resource === "Alert Contact") return "getAlertContacts";
    if (resource === "Maintenance Window") return "getMWindows";
    if (resource === "Public Status Page") return "getPSPs";
  }
  if (operation === "Create") {
    if (resource === "Monitor") return "newMonitor";
    if (resource === "Alert Contact") return "newAlertContact";
    if (resource === "Maintenance Window") return "newMWindow";
    if (resource === "Public Status Page") return "newPSP";
  }
  if (operation === "Update") {
    if (resource === "Monitor") return "editMonitor";
    if (resource === "Alert Contact") return "editAlertContact";
    if (resource === "Maintenance Window") return "editMWindow";
  }
  if (operation === "Delete") {
    if (resource === "Monitor") return "deleteMonitor";
    if (resource === "Alert Contact") return "deleteAlertContact";
    if (resource === "Maintenance Window") return "deleteMWindow";
    if (resource === "Public Status Page") return "deletePSP";
  }
  if (operation === "Reset") return "resetMonitor";
  return "";
}

function buildGetAllParams(ctx: Parameters<NodeExecutor>[0]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const resource = ctx.getParam<string>("resource");
  if (resource === "Monitor") {
    const monitorIds = ctx.getParam<string>("monitorIds");
    if (monitorIds) params.monitors = monitorIds;
    const types = ctx.getParam<string>("types");
    if (types) params.types = types;
    const statuses = ctx.getParam<string>("statuses");
    if (statuses) params.statuses = statuses;
    const customUptimeRatios = ctx.getParam<string>("customUptimeRatios");
    if (customUptimeRatios) params.custom_uptime_ratios = customUptimeRatios;
    const offset = ctx.getParam<number>("offset", 0);
    params.offset = offset;
    const limit = ctx.getParam<number>("limit", 50);
    params.limit = limit;
    const search = ctx.getParam<string>("search");
    if (search) params.search = search;
    const logs = ctx.getParam<boolean>("includeLogs", false);
    if (logs) params.logs = 1;
    const responseTimes = ctx.getParam<boolean>("includeResponseTimes", false);
    if (responseTimes) params.response_times = 1;
    const alertContacts = ctx.getParam<boolean>("includeAlertContacts", false);
    if (alertContacts) params.alert_contacts = 1;
    const mw = ctx.getParam<boolean>("includeMaintenanceWindows", false);
    if (mw) params.mwindows = 1;
    const ssl = ctx.getParam<boolean>("includeSslInfo", false);
    if (ssl) params.ssl = 1;
  }
  const status = ctx.getParam<number>("status");
  if (status !== undefined) params.status = status;
  return params;
}

function buildCreateBody(ctx: Parameters<NodeExecutor>[0]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const resource = ctx.getParam<string>("resource");

  if (resource === "Monitor") {
    body.friendly_name = ctx.getParam<string>("friendlyName", "");
    body.url = ctx.getParam<string>("url", "");
    body.type = ctx.getParam<number>("monitorType", 1);
    const subType = ctx.getParam<number>("subType");
    if (subType !== undefined) body.sub_type = subType;
    const port = ctx.getParam<number>("port");
    if (port !== undefined) body.port = port;
    const keywordType = ctx.getParam<number>("keywordType");
    if (keywordType !== undefined) body.keyword_type = keywordType;
    const keywordCaseType = ctx.getParam<number>("keywordCaseType");
    if (keywordCaseType !== undefined) body.keyword_case_type = keywordCaseType;
    const keywordValue = ctx.getParam<string>("keywordValue");
    if (keywordValue) body.keyword_value = keywordValue;
    const interval = ctx.getParam<number>("interval", 300);
    body.interval = interval;
    const httpMethod = ctx.getParam<number>("httpMethod");
    if (httpMethod !== undefined) body.http_method = httpMethod;
    const httpAuthType = ctx.getParam<string>("httpAuthType");
    if (httpAuthType) body.http_auth_type = httpAuthType;
    const httpUsername = ctx.getParam<string>("httpUsername");
    if (httpUsername) body.http_username = httpUsername;
    const httpPassword = ctx.getParam<string>("httpPassword");
    if (httpPassword) body.http_password = httpPassword;
    const customHttpStatuses = ctx.getParam<string>("customHttpStatuses");
    if (customHttpStatuses) body.custom_http_statuses = customHttpStatuses;
    const alertContactGuids = ctx.getParam<string>("alertContactGuids");
    if (alertContactGuids) body.alert_contact_guids = alertContactGuids;
  }

  if (resource === "Alert Contact") {
    body.alert_contact_type = ctx.getParam<number>("alertContactType", 2);
    body.alert_contact_value = ctx.getParam<string>("alertContactValue", "");
  }

  if (resource === "Maintenance Window") {
    body.mwindow_type = ctx.getParam<number>("type", 1);
    body.mwindow_start_time = ctx.getParam<string>("startTime", "");
    body.mwindow_duration = ctx.getParam<number>("duration", 60);
    const value = ctx.getParam<string>("value");
    if (value) body.mwindow_value = value;
  }

  if (resource === "Public Status Page") {
    body.friendly_name = ctx.getParam<string>("friendlyName", "");
    body.status_page_url = ctx.getParam<string>("statusPageUrl", "");
    const monitorIds = ctx.getParam<string>("monitorIds");
    if (monitorIds) body.monitor_ids = monitorIds;
    const password = ctx.getParam<string>("password");
    if (password) body.password = password;
    const sort = ctx.getParam<string>("sort");
    if (sort) body.sort = sort;
    const customCss = ctx.getParam<string>("customCss");
    if (customCss) body.custom_css = customCss;
  }

  return body;
}

function buildUpdateBody(ctx: Parameters<NodeExecutor>[0]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const resource = ctx.getParam<string>("resource");

  if (resource === "Monitor") {
    body.id = ctx.getParam<string>("id", "");
    const friendlyName = ctx.getParam<string>("friendlyName");
    if (friendlyName) body.friendly_name = friendlyName;
    const url = ctx.getParam<string>("url");
    if (url) body.url = url;
    const status = ctx.getParam<number>("status");
    if (status !== undefined) body.status = status;
  }

  if (resource === "Alert Contact") {
    body.id = ctx.getParam<string>("id", "");
    const status = ctx.getParam<number>("status");
    if (status !== undefined) body.status = status;
  }

  if (resource === "Maintenance Window") {
    body.id = ctx.getParam<string>("id", "");
    const status = ctx.getParam<number>("status");
    if (status !== undefined) body.status = status;
  }

  return body;
}

function buildDeleteBody(ctx: Parameters<NodeExecutor>[0]): Record<string, unknown> {
  return { id: ctx.getParam<string>("id", "") };
}

function extractEntities(
  data: UptimeRobotResponse,
  resource: string,
): Record<string, unknown>[] {
  if (data.monitors) return data.monitors;
  if (data.alert_contacts) return data.alert_contacts;
  if (data.mwindows) return data.mwindows;
  if (data.psps) return data.psps;
  if (data.account) return [data.account];
  if (data.monitor) return [data.monitor];
  if (data.alertcontact) return [data.alertcontact];
  if (data.mwindow) return [data.mwindow];
  if (data.psp) return [data.psp];
  if (data.id !== undefined) return [{ id: data.id }];
  return [];
}

function evaluateParam(
  ctx: Parameters<NodeExecutor>[0],
  value: unknown,
  itemJson: Record<string, unknown>,
): unknown {
  if (typeof value === "string" && value.startsWith("={{ ")) {
    return ctx.evaluate(value, itemJson);
  }
  return value;
}

export const uptimeRobotExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const outputs: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const resource = ctx.getParam<string>("resource", "Monitor");
  const operation = ctx.getParam<string>("operation", "Get All");

  for (let idx = 0; idx < items.length; idx++) {
    try {
      const itemJson = items[idx].json;
      const credential = await ctx.getCredential("uptimeRobotApi");
      const apiKey =
        credential && typeof credential === "object" && "apiKey" in credential
          ? (credential as { apiKey: string }).apiKey
          : "";

      const method = getMethod(resource, operation);
      let url = `${API_BASE}/${method}`;
      let body: Record<string, unknown> = { api_key: apiKey, format: "json" };

      if (operation === "Get All" || operation === "Get") {
        const getParams = buildGetAllParams(ctx);
        if (operation === "Get") {
          const id = evaluateParam(ctx, ctx.getParam<string>("id", ""), itemJson);
          if (resource === "Monitor") {
            getParams.monitors = String(id);
          } else if (resource === "Alert Contact") {
            getParams.alert_contacts = String(id);
          } else if (resource === "Maintenance Window") {
            getParams.mwindows = String(id);
          } else if (resource === "Public Status Page") {
            getParams.psps = String(id);
          }
        }
        Object.assign(body, getParams);
      } else if (operation === "Create") {
        const createBody = buildCreateBody(ctx);
        for (const key of Object.keys(createBody)) {
          body[key] = evaluateParam(ctx, createBody[key], itemJson);
        }
      } else if (operation === "Update") {
        const updateBody = buildUpdateBody(ctx);
        for (const key of Object.keys(updateBody)) {
          body[key] = evaluateParam(ctx, updateBody[key], itemJson);
        }
      } else if (operation === "Delete") {
        const deleteBody = buildDeleteBody(ctx);
        for (const key of Object.keys(deleteBody)) {
          body[key] = evaluateParam(ctx, deleteBody[key], itemJson);
        }
      } else if (operation === "Reset") {
        const id = evaluateParam(ctx, ctx.getParam<string>("id", ""), itemJson);
        body.id = String(id);
      }

      const formBody = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        formBody.append(k, String(v));
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });

      const data: UptimeRobotResponse = await response.json();

      if (data.stat === "fail") {
        throw new Error(
          `UptimeRobot API error: ${JSON.stringify(data)}`,
        );
      }

      if (operation === "Get All") {
        const entities = extractEntities(data, resource);
        for (const entity of entities) {
          outputs.push({ json: entity, pairedItem: { item: idx, input: 0 } });
        }
      } else {
        const entities = extractEntities(data, resource);
        const entity = entities.length > 0 ? entities[0] : {};
        outputs.push({ json: entity, pairedItem: { item: idx, input: 0 } });
      }
    } catch (err) {
      if (continueOnFail) {
        outputs.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: idx, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [outputs];
};
