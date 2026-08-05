import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const EVENT_TO_OBJECT: Record<string, string> = {
  accountCreated: "Account",
  accountUpdated: "Account",
  attachmentCreated: "Attachment",
  attachmentUpdated: "Attachment",
  caseCreated: "Case",
  caseUpdated: "Case",
  contactCreated: "Contact",
  contactUpdated: "Contact",
  customObjectCreated: "",
  customObjectUpdated: "",
  leadCreated: "Lead",
  leadUpdated: "Lead",
  opportunityCreated: "Opportunity",
  opportunityUpdated: "Opportunity",
  taskCreated: "Task",
  taskUpdated: "Task",
  userCreated: "User",
  userUpdated: "User",
};

function isCreateEvent(triggerOn: string): boolean {
  return triggerOn.endsWith("Created");
}

function objectApiName(triggerOn: string, customObject: string): string {
  if (triggerOn === "customObjectCreated" || triggerOn === "customObjectUpdated") {
    if (!customObject) {
      throw new Error("Salesforce Trigger: customObject is required for customObjectCreated and customObjectUpdated events");
    }
    return customObject;
  }
  return EVENT_TO_OBJECT[triggerOn] ?? "";
}

function cursorField(triggerOn: string): string {
  return isCreateEvent(triggerOn) ? "CreatedDate" : "SystemModstamp";
}

function salesforceApiUrl(instanceUrl: string): string {
  const base = instanceUrl.replace(/\/+$/, "");
  return `${base}/services/data/v58.0`;
}

async function salesforceRequest(
  url: string,
  accessToken: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(
      `Salesforce request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function processSalesforceError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const errs = Array.isArray(obj) ? (obj as Record<string, unknown>[]) : [obj];
  const first = errs[0] ?? {};
  const errorCode = String(first.errorCode ?? "");
  const message = String(first.message ?? "");
  const detail = errorCode && message ? `${errorCode} — ${message}` : message || errorCode || String(status);
  return new Error(`Salesforce: ${detail}`);
}

export const salesforceTriggerExecutor: NodeExecutor = async (ctx, node) => {
  const params = node.parameters;
  const triggerOn = String(params.triggerOn ?? "contactCreated");
  const customObject = String(params.customObject ?? "");

  const objName = objectApiName(triggerOn, customObject);

  const cred = await ctx.getCredential("salesforceOAuth2Api");
  if (!cred) {
    throw new Error("Salesforce: salesforceOAuth2Api credential is not configured");
  }

  const accessToken = String(cred.accessToken ?? cred.token ?? "");
  const instanceUrl = String(cred.instanceUrl ?? "");
  if (!accessToken || !instanceUrl) {
    throw new Error("Salesforce: salesforceOAuth2Api credential is not configured");
  }

  const apiBase = salesforceApiUrl(instanceUrl);
  const cField = cursorField(triggerOn);

  const lastPoll = ctx.getCustomData("_lastPollTimestamp");
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  let soql: string;
  if (lastPoll) {
    soql = `SELECT FIELDS(ALL) FROM ${objName} WHERE ${cField} > ${lastPoll} ORDER BY ${cField} ASC`;
  } else {
    soql = `SELECT FIELDS(ALL) FROM ${objName} ORDER BY ${cField} ASC`;
  }

  const queryUrl = `${apiBase}/query/?q=${encodeURIComponent(soql)}`;

  const allRecords: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = queryUrl;

  for (;;) {
    const res = await salesforceRequest(nextUrl, accessToken);
    if (res.status < 200 || res.status >= 300) {
      if (res.status === 401) {
        throw new Error("Salesforce: Invalid or expired credentials");
      }
      throw processSalesforceError(res.body, res.status);
    }
    const obj = asObj(res.body);
    const records = Array.isArray(obj.records)
      ? (obj.records as Record<string, unknown>[])
      : [];
    for (const rec of records) {
      allRecords.push(rec);
    }
    nextUrl = typeof obj.nextRecordsUrl === "string" ? `${apiBase}${obj.nextRecordsUrl}` : undefined;
    if (!nextUrl) break;
  }

  const out: INodeExecutionData[] = allRecords.map((rec) => ({ json: rec }));

  ctx.setCustomData("_lastPollTimestamp", now);

  return [out];
};
