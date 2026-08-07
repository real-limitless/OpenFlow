import type { NodeExecutor, INodeExecutionData } from "@/sdk";
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

interface MandrillCredential {
  apiKey?: string;
}

const MANDRILL_API_BASE = "https://mandrillapp.com/api/1.0";

interface MandrillMessage {
  html?: string;
  text?: string;
  subject?: string;
  from_email: string;
  from_name?: string;
  to: Array<{ email: string; name?: string; type?: string }>;
  headers?: Record<string, string>;
  important?: boolean;
  track_opens?: boolean;
  track_clicks?: boolean;
  auto_text?: boolean;
  auto_html?: boolean;
  inline_css?: boolean;
  url_strip_qs?: boolean;
  preserve_recipients?: boolean;
  view_content_link?: boolean;
  bcc_address?: string;
  tracking_domain?: string;
  signing_domain?: string;
  return_path_domain?: string;
  subaccount?: string;
  google_analytics_campaign?: string;
  google_analytics_domains?: string[];
  metadata?: Record<string, string>;
  tags?: string[];
  attachments?: Array<{ type: string; name: string; content: string }>;
  images?: Array<{ type: string; name: string; content: string }>;
}

function sanitizeOptionName(name: string): string {
  const map: Record<string, string> = {
    bccAddress: "bcc_address",
    fromName: "from_name",
    googleAnalyticsCampaign: "google_analytics_campaign",
    googleAnalyticsDomains: "google_analytics_domains",
    inlineCss: "inline_css",
    ipPool: "ip_pool",
    preserveRecipients: "preserve_recipients",
    returnPathDomain: "return_path_domain",
    sendAt: "send_at",
    signingDomain: "signing_domain",
    subAccount: "subaccount",
    trackClicks: "track_clicks",
    trackOpens: "track_opens",
    trackingDomain: "tracking_domain",
    urlStripQs: "url_strip_qs",
    viewContentLink: "view_content_link",
  };
  return map[name] ?? name;
}

const BOOLEAN_OPTIONS = new Set([
  "async", "autoText", "autoHtml", "important", "inlineCss",
  "preserveRecipients", "trackClicks", "trackOpens", "urlStripQs", "viewContentLink",
]);

function buildMessage(
  options: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  fromEmail: string,
  toEmail: string,
): MandrillMessage {
  const to: Array<{ email: string }> = String(resolveValue(toEmail, itemJson))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  const message: MandrillMessage = {
    from_email: String(resolveValue(fromEmail, itemJson)),
    to,
  };

  for (const [key, raw] of Object.entries(options)) {
    if (key === "html" || key === "text" || key === "subject") {
      const val = resolveValue(raw, itemJson);
      if (val) message[key] = String(val);
      continue;
    }
    if (key === "sendAt") {
    }
    const sanitized = sanitizeOptionName(key);
    if (sanitized.startsWith("googleAnalytics")) continue;
    if (key === "tags") {
      const rawTags = String(resolveValue(raw, itemJson) ?? "");
      if (rawTags) message.tags = rawTags.split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (BOOLEAN_OPTIONS.has(key)) {
      const val = resolveValue(raw, itemJson);
      if (val === true || val === "true") (message as Record<string, unknown>)[sanitized] = true;
      continue;
    }
    const val = resolveValue(raw, itemJson);
    if (val) (message as Record<string, unknown>)[sanitized] = val;
  }

  return message;
}

export const mandrillExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("mandrillApi");
  const apiKey = cred ? String((cred as MandrillCredential).apiKey ?? "") : "";

  if (!apiKey) {
    throw new Error("Mandrill: mandrillApi credential is not configured");
  }

  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "sendHtml");
  const templateName = node.parameters.template ?? "";
  const jsonParameters = node.parameters.jsonParameters === true || node.parameters.jsonParameters === "true";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};

  const endpoint = operation === "sendTemplate" ? "/messages/send-template" : "/messages/send";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    let attempted = false;
    try {
      const fromEmail = String(resolveValue(node.parameters.fromEmail, itemJson) ?? "");
      const toEmail = String(resolveValue(node.parameters.toEmail, itemJson) ?? "");
      const templateVal = String(resolveValue(templateName, itemJson) ?? "");

      if (!fromEmail) throw new Error("Mandrill: fromEmail is required");
      if (!toEmail) throw new Error("Mandrill: toEmail is required");
      if (operation === "sendTemplate" && !templateVal) {
        throw new Error("Mandrill: template is required for sendTemplate operation");
      }

      const message = buildMessage(options, itemJson, fromEmail, toEmail);

      const body: Record<string, unknown> = {
        key: apiKey,
        message,
      };

      if (operation === "sendTemplate") {
        body.template_name = templateVal;
        body.template_content = [{}];
      }

      if (options.sendAt) {
        const sendAt = String(resolveValue(options.sendAt, itemJson) ?? "");
        if (sendAt) body.send_at = sendAt;
      }

      if (options.async === true || options.async === "true") {
        body.async = true;
      }

      if (jsonParameters) {
        const attachJsonRaw = node.parameters.attachmentsJson;
        if (attachJsonRaw) {
          let parsed: Array<Record<string, unknown>> = [];
          try {
            parsed = JSON.parse(
              typeof attachJsonRaw === "string" ? attachJsonRaw : JSON.stringify(attachJsonRaw),
            );
          } catch { /* ignore parse errors */ }
          if (Array.isArray(parsed) && parsed.length > 0) {
            message.attachments = parsed.map((a) => ({
              type: String(a.type ?? "application/octet-stream"),
              name: String(a.name ?? "attachment"),
              content: String(a.content ?? ""),
            }));
          }
        }
      } else {
        const attachValues = node.parameters.attachmentsValues as
          | { values?: Array<Record<string, unknown>> }
          | undefined;
        if (attachValues?.values) {
          message.attachments = [];
          for (const a of attachValues.values) {
            message.attachments.push({
              type: String(a.type ?? "application/octet-stream"),
              name: String(a.name ?? "attachment"),
              content: String(a.content ?? ""),
            });
          }
        }

        const attachBinary = node.parameters.attachmentsBinary as
          | { values?: Array<Record<string, unknown>> }
          | undefined;
        if (attachBinary?.values && item.binary) {
          if (!message.attachments) message.attachments = [];
          for (const entry of attachBinary.values) {
            const prop = String(entry.property ?? "");
            const bin = item.binary[prop];
            if (bin) {
              message.attachments.push({
                type: bin.mimeType ?? "application/octet-stream",
                name: bin.fileName ?? prop,
                content: bin.data,
              });
            }
          }
        }
      }

      {
        const mergeVarsUi = node.parameters.mergeVarsUi as
          | { values?: Array<Record<string, unknown>> }
          | undefined;
        if (mergeVarsUi?.values) {
          const vars: Record<string, string> = {};
          for (const v of mergeVarsUi.values) {
            const name = String(v.name ?? "");
            const content = String(v.content ?? "");
            if (name) vars[name] = content;
          }
          if (Object.keys(vars).length > 0) {
            body.global_merge_vars = Object.entries(vars).map(([n, c]) => ({ name: n, content: c }));
          }
        } else if (jsonParameters && node.parameters.mergeVarsJson) {
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(
              typeof node.parameters.mergeVarsJson === "string"
                ? node.parameters.mergeVarsJson
                : JSON.stringify(node.parameters.mergeVarsJson),
            );
          } catch { /* */ }
          const entries = Object.entries(parsed);
          if (entries.length > 0) {
            body.global_merge_vars = entries.map(([n, c]) => ({ name: n, content: String(c) }));
          }
        }
      }

      {
        const metadataUi = node.parameters.metadataUi as
          | { values?: Array<Record<string, unknown>> }
          | undefined;
        if (metadataUi?.values) {
          const md: Record<string, string> = {};
          for (const m of metadataUi.values) {
            const name = String(m.name ?? "");
            const value = String(m.value ?? "");
            if (name) md[name] = value;
          }
          if (Object.keys(md).length > 0) message.metadata = md;
        } else if (jsonParameters && node.parameters.metadataJson) {
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(
              typeof node.parameters.metadataJson === "string"
                ? node.parameters.metadataJson
                : JSON.stringify(node.parameters.metadataJson),
            );
          } catch { /* */ }
          if (Object.keys(parsed).length > 0) {
            message.metadata = parsed;
          }
        }
      }

      {
        const headersUi = node.parameters.headersUi as
          | { values?: Array<Record<string, unknown>> }
          | undefined;
        if (headersUi?.values) {
          const hdrs: Record<string, string> = {};
          for (const h of headersUi.values) {
            const name = String(h.name ?? "");
            const value = String(h.value ?? "");
            if (name) hdrs[name] = value;
          }
          if (Object.keys(hdrs).length > 0) message.headers = hdrs;
        } else if (jsonParameters && node.parameters.headersJson) {
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(
              typeof node.parameters.headersJson === "string"
                ? node.parameters.headersJson
                : JSON.stringify(node.parameters.headersJson),
            );
          } catch { /* */ }
          if (Object.keys(parsed).length > 0) message.headers = parsed;
        }
      }

      attempted = true;
      const url = `${MANDRILL_API_BASE}${endpoint}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const textBody = await response.text();
        let parsed: unknown = textBody;
        try {
          parsed = textBody ? JSON.parse(textBody) : null;
        } catch { /* keep text */ }
        if (response.status < 200 || response.status >= 300) {
          let errMsg = `HTTP ${response.status}`;
          if (parsed && typeof parsed === "object") {
            const obj = parsed as Record<string, unknown>;
            if (obj.message) errMsg = String(obj.message);
            else if (obj.status && obj.status !== "error") errMsg = String(obj.status);
            else if (Array.isArray(obj)) errMsg = String((obj as Array<unknown>)[0] ?? errMsg);
          }
          throw new Error(errMsg);
        }
        const results = Array.isArray(parsed) ? parsed : [parsed];
        for (const result of results as Array<Record<string, unknown>>) {
          out.push({
            json: {
              _id: String(result._id ?? result.id ?? ""),
              email: String(result.email ?? ""),
              status: String(result.status ?? "sent"),
            },
            pairedItem,
          });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!continueOnFail) throw err;
      if (attempted) {
        const errData = message;
        out.push({ json: { error: { message: errData, description: "" } }, pairedItem });
      } else {
        out.push({ json: { error: { message, description: "" } }, pairedItem });
      }
    }
  }

  return [out];
};
