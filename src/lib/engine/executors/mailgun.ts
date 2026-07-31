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

interface MailgunCredential {
  apiDomain?: string;
  emailDomain?: string;
  apiKey?: string;
}

export const mailgunExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("mailgunApi");
  const apiDomain = cred ? String((cred as MailgunCredential).apiDomain ?? "api.mailgun.net") : "api.mailgun.net";
  const emailDomain = cred ? String((cred as MailgunCredential).emailDomain ?? "") : "";
  const apiKey = cred ? String((cred as MailgunCredential).apiKey ?? "") : "";

  if (!apiKey) {
    throw new Error("Mailgun: mailgunApi credential is not configured");
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const fromEmail = String(resolveValue(node.parameters.fromEmail, itemJson) ?? "");
      const toEmail = String(resolveValue(node.parameters.toEmail, itemJson) ?? "");
      const ccEmail = String(resolveValue(node.parameters.ccEmail, itemJson) ?? "");
      const bccEmail = String(resolveValue(node.parameters.bccEmail, itemJson) ?? "");
      const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
      const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
      const html = String(resolveValue(node.parameters.html, itemJson) ?? "");
      const attachmentsRaw = String(resolveValue(node.parameters.attachments, itemJson) ?? "");

      if (!fromEmail || !toEmail) {
        throw new Error("Mailgun: fromEmail and toEmail are required");
      }

      if (!text && !html) {
        throw new Error("Mailgun: at least one of text or html must be provided");
      }

      const formData = new FormData();
      formData.append("from", fromEmail);
      formData.append("to", toEmail);
      if (ccEmail) formData.append("cc", ccEmail);
      if (bccEmail) formData.append("bcc", bccEmail);
      if (subject) formData.append("subject", subject);
      if (text) formData.append("text", text);
      if (html) formData.append("html", html);

      if (attachmentsRaw) {
        const names = attachmentsRaw.split(",").map((s) => s.trim()).filter(Boolean);
        for (const name of names) {
          const bin = item.binary?.[name];
          if (bin) {
            const blob = new Blob(
              [Buffer.from(bin.data, "base64")],
              { type: bin.mimeType ?? "application/octet-stream" },
            );
            formData.append("attachment", blob, bin.fileName ?? name);
          }
        }
      }

      const url = `https://${apiDomain}/v3/${emailDomain}/messages`;
      const auth = btoa(`api:${apiKey}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
          },
          body: formData,
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
          const obj = parsed as Record<string, unknown> | null;
          const errMsg = (obj?.message as string) ?? (obj?.error as string) ?? `HTTP ${response.status}`;
          throw new Error(errMsg);
        }
        out.push({
          json: (parsed as Record<string, unknown>) ?? { id: "", message: "Queued. Thank you." },
          pairedItem,
        });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Mailgun")) throw err;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message, description: "" } }, pairedItem });
    }
  }

  return [out];
};