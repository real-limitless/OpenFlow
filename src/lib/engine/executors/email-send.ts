import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments: EmailAttachment[];
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
}

export type SmtpTransport = (message: EmailMessage) => Promise<EmailSendResult>;

export type SmtpTransportFactory = (
  credentials: CredentialData,
  options: Record<string, unknown>,
) => Promise<SmtpTransport>;

let transportFactory: SmtpTransportFactory | null = null;

export function setSmtpTransportFactory(factory: SmtpTransportFactory | null): void {
  transportFactory = factory;
}

const DEFAULT_FACTORY: SmtpTransportFactory = async (credentials, options) => {
  const { defaultSmtpTransportFactory } = await import("./email-send-transport");
  return defaultSmtpTransportFactory(credentials, options);
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function splitAddresses(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function collectAttachments(item: INodeExecutionData, attachmentsUi: unknown): EmailAttachment[] {
  const out: EmailAttachment[] = [];
  if (!attachmentsUi || typeof attachmentsUi !== "object") return out;

  const container = attachmentsUi as { attachments?: Array<{ binaryPropertyName?: string }> };
  const entries = container.attachments ?? [];
  for (const entry of entries) {
    const propName = entry.binaryPropertyName ?? "data";
    const bin = item.binary?.[propName];
    if (!bin) continue;
    out.push({
      filename: bin.fileName ?? propName,
      content: Buffer.from(bin.data, "base64"),
      contentType: bin.mimeType,
    });
  }
  return out;
}

export const emailSendExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};

  const credentials = await ctx.getCredential("smtp");
  if (!credentials) {
    throw new Error('EmailSend: credential "smtp" is not configured on this node');
  }

  const factory = transportFactory ?? DEFAULT_FACTORY;
  const transport = await factory(credentials, options);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json;

    const fromEmail = String(resolveValue(ctx.getParam("fromEmail", ""), json));
    if (!fromEmail) {
      throw new Error("EmailSend: fromEmail is required");
    }
    const toEmailRaw = String(resolveValue(ctx.getParam("toEmail", ""), json));
    if (!toEmailRaw) {
      throw new Error("EmailSend: toEmail is required");
    }

    const fromName = ctx.getParam("fromName", "");
    const fromNameStr = fromName ? String(resolveValue(fromName, json)) : undefined;

    const ccRaw = ctx.getParam("ccEmail", "");
    const bccRaw = ctx.getParam("bccEmail", "");
    const replyToRaw = ctx.getParam("replyTo", "");
    const subject = String(resolveValue(ctx.getParam("subject", ""), json));

    const emailFormat = ctx.getParam<string>("emailFormat", "text");
    const message = ctx.getParam("message", "");
    const htmlMessage = ctx.getParam("htmlMessage", "");

    const attachmentsUi = ctx.getParam("attachmentsUi", {});

    const msg: EmailMessage = {
      from: fromEmail,
      ...(fromNameStr ? { fromName: fromNameStr } : {}),
      to: splitAddresses(toEmailRaw),
      ...(ccRaw ? { cc: splitAddresses(String(resolveValue(ccRaw, json))) } : {}),
      ...(bccRaw ? { bcc: splitAddresses(String(resolveValue(bccRaw, json))) } : {}),
      ...(replyToRaw ? { replyTo: String(resolveValue(replyToRaw, json)) } : {}),
      subject,
      attachments: collectAttachments(item, attachmentsUi),
    };

    if (emailFormat === "html") {
      msg.html = String(resolveValue(htmlMessage, json));
    } else {
      msg.text = String(resolveValue(message, json));
    }

    const result = await transport(msg);

    out.push({
      json: {
        success: result.success,
        ...(result.messageId ? { messageId: result.messageId } : {}),
        to: msg.to,
        subject: msg.subject,
      },
      binary: item.binary,
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    });
  }

  return [out];
};
