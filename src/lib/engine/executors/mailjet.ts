import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function splitEmails(value: string): Array<{ Email: string }> {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ Email: email }));
}

interface MailjetEmailCredential {
  apiKey?: string;
  secretKey?: string;
  sandboxMode?: boolean;
}

interface MailjetSmsCredential {
  token?: string;
}

export const mailjetExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "email");
  const operation = String(node.parameters.operation ?? "send");
  const continueOnFail = ctx.continueOnFail();

  const emailCred = await ctx.getCredential("mailjetEmailApi") as MailjetEmailCredential | null;
  const smsCred = await ctx.getCredential("mailjetSmsApi") as MailjetSmsCredential | null;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      if (resource === "email") {
        const result = await sendEmail(
          node, itemJson, operation, emailCred,
        );
        out.push({ json: result, pairedItem });
      } else if (resource === "sms") {
        const result = await sendSms(
          node, itemJson, smsCred,
        );
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message, description: "" } }, pairedItem });
    }
  }

  return [out];
};

async function sendEmail(
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  operation: string,
  cred: MailjetEmailCredential | null,
): Promise<Record<string, unknown>> {
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const secretKey = cred ? String(cred.secretKey ?? "") : "";
  const sandboxMode = cred ? Boolean(cred.sandboxMode) : false;

  if (!apiKey || !secretKey) {
    throw new Error("Mailjet: mailjetEmailApi credential is not configured");
  }

  const fromEmail = String(resolveValue(node.parameters.fromEmail, itemJson) ?? "");
  const toEmail = String(resolveValue(node.parameters.toEmail, itemJson) ?? "");
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  if (!fromEmail || !toEmail) {
    throw new Error("Mailjet: fromEmail and toEmail are required");
  }

  const body: Record<string, unknown> = {
    From: { Email: fromEmail },
    To: splitEmails(toEmail),
  };

  if (operation === "send") {
    const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const html = String(resolveValue(node.parameters.html, itemJson) ?? "");

    if (subject) body.Subject = subject;
    if (text) body.TextPart = text;
    if (html) body.HTMLPart = html;
  } else if (operation === "sendTemplate") {
    const templateId = String(resolveValue(node.parameters.templateId, itemJson) ?? "");
    if (!templateId) {
      throw new Error("Mailjet: templateId is required for sendTemplate operation");
    }
    body.TemplateID = Number(templateId);
    const templateLanguage = Boolean(resolveValue(additionalFields.templateLanguage, itemJson));
    if (templateLanguage) body.TemplateLanguage = true;
  }

  const ccAddresses = String(resolveValue(additionalFields.ccAddresses, itemJson) ?? "");
  if (ccAddresses) body.Cc = splitEmails(ccAddresses);

  const bccEmail = String(resolveValue(additionalFields.bccEmail, itemJson) ?? "");
  if (bccEmail) body.Bcc = splitEmails(bccEmail);

  const fromName = String(resolveValue(additionalFields.fromName, itemJson) ?? "");
  if (fromName) body.From.Name = fromName;

  const replyTo = String(resolveValue(additionalFields.replyTo, itemJson) ?? "");
  if (replyTo) body.ReplyTo = splitEmails(replyTo);

  const priority = resolveValue(additionalFields.priority, itemJson);
  if (priority !== undefined && priority !== null && priority !== "") {
    body.Priority = Number(priority);
  }

  const trackClicks = String(resolveValue(additionalFields.trackClicks, itemJson) ?? "");
  if (trackClicks && trackClicks !== "account_default") {
    body.TrackClicks = trackClicks;
  }

  const trackOpens = String(resolveValue(additionalFields.trackOpens, itemJson) ?? "");
  if (trackOpens && trackOpens !== "account_default") {
    body.TrackOpens = trackOpens;
  }

  const customCampaign = String(resolveValue(additionalFields.customCampaign, itemJson) ?? "");
  if (customCampaign) body.CustomCampaign = customCampaign;

  const deduplicateCampaign = Boolean(resolveValue(additionalFields.deduplicateCampaign, itemJson));
  if (deduplicateCampaign) body.DeduplicateCampaign = true;

  if (sandboxMode) body.SandboxMode = true;

  const jsonParameters = Boolean(node.parameters.jsonParameters);
  const variables: Record<string, string> = {};
  if (jsonParameters) {
    const variablesJson = String(resolveValue(node.parameters.variablesJson, itemJson) ?? "");
    if (variablesJson) {
      try {
        const parsed = JSON.parse(variablesJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.assign(variables, parsed);
        }
      } catch {
        throw new Error("Mailjet: variablesJson contains invalid JSON");
      }
    }
  } else {
    const variablesUi = node.parameters.variablesUi as Record<string, unknown> | undefined;
    const values = variablesUi?.variablesValues as Array<Record<string, string>> | undefined;
    if (values && Array.isArray(values)) {
      for (const entry of values) {
        const name = String(resolveValue(entry.name, itemJson) ?? "");
        const value = String(resolveValue(entry.value, itemJson) ?? "");
        if (name) variables[name] = value;
      }
    }
  }
  if (Object.keys(variables).length > 0) {
    body.Variables = variables;
  }

  const payload = { Messages: [body] };
  const auth = btoa(`${apiKey}:${secretKey}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.mailjet.com/v3/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const textBody = await response.text();
    let parsed: unknown = textBody;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed as Record<string, unknown>) ?? {};
      const errMsg = (obj.errorMessage as string) ?? (obj.error as string) ?? `HTTP ${response.status}`;
      throw new Error(errMsg);
    }
    return (parsed as Record<string, unknown>) ?? {};
  } finally {
    clearTimeout(timer);
  }
}

async function sendSms(
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  cred: MailjetSmsCredential | null,
): Promise<Record<string, unknown>> {
  const token = cred ? String(cred.token ?? "") : "";

  if (!token) {
    throw new Error("Mailjet: mailjetSmsApi credential is not configured");
  }

  const from = String(resolveValue(node.parameters.from, itemJson) ?? "");
  const to = String(resolveValue(node.parameters.to, itemJson) ?? "");
  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");

  if (!from || !to || !text) {
    throw new Error("Mailjet: from, to, and text are required for SMS send");
  }

  const body = { From: from, To: to, Text: text };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.mailjet.com/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const textBody = await response.text();
    let parsed: unknown = textBody;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed as Record<string, unknown>) ?? {};
      const errMsg = (obj.errorMessage as string) ?? (obj.error as string) ?? `HTTP ${response.status}`;
      throw new Error(errMsg);
    }
    return (parsed as Record<string, unknown>) ?? {};
  } finally {
    clearTimeout(timer);
  }
}