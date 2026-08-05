import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import type { SmtpTransport, SmtpTransportFactory, EmailMessage, EmailSendResult, EmailAttachment } from "./email-send";

const DEFAULT_FACTORY: SmtpTransportFactory = async (credentials, options) => {
  const { defaultSmtpTransportFactory } = await import("./email-send-transport");
  return defaultSmtpTransportFactory(credentials, options);
};

let transportFactory: SmtpTransportFactory | null = null;

export function setHitlSmtpTransportFactory(factory: SmtpTransportFactory | null): void {
  transportFactory = factory;
}

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

function resolveToolExpression(
  text: string,
  toolName: string,
  toolParameters: Record<string, unknown>,
): string {
  return text
    .replace(/\{\{\s*\$tool\.name\s*\}\}/g, toolName)
    .replace(/\{\{\s*JSON\.stringify\(\$tool\.parameters.*?\)\s*\}\}/g, JSON.stringify(toolParameters));
}

function buildEmailBody(
  text: string | undefined,
  html: string | undefined,
  emailFormat: string,
  message: string,
  toolName: string,
  toolParameters: Record<string, unknown>,
  appendAttribution: boolean,
): { text?: string; html?: string } {
  const attribution = appendAttribution
    ? "\n\n---\nThis email was sent automatically with n8n"
    : "";

  const resolvedMessage = resolveToolExpression(message, toolName, toolParameters);

  if (emailFormat === "html") {
    const htmlBody = html
      ? resolveToolExpression(html, toolName, toolParameters)
      : resolvedMessage.replace(/\n/g, "<br>");
    return {
      html: htmlBody + (appendAttribution ? attribution.replace(/\n/g, "<br>") : ""),
    };
  }

  if (emailFormat === "both") {
    const textBody = text
      ? resolveToolExpression(text, toolName, toolParameters)
      : resolvedMessage;
    const htmlBody = html
      ? resolveToolExpression(html, toolName, toolParameters)
      : resolvedMessage.replace(/\n/g, "<br>");
    return {
      text: textBody + attribution,
      html: htmlBody + (appendAttribution ? attribution.replace(/\n/g, "<br>") : ""),
    };
  }

  const textBody = text
    ? resolveToolExpression(text, toolName, toolParameters)
    : resolvedMessage;
  return { text: textBody + attribution };
}

export const emailSendHitlToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const params = node.parameters ?? {};
  const options = (params.options ?? {}) as Record<string, unknown>;

  const credentials = await ctx.getCredential("smtp");
  if (!credentials) {
    throw new Error('EmailSendHITL: credential "smtp" is not configured on this node');
  }

  const factory = transportFactory ?? DEFAULT_FACTORY;
  const transport = await factory(credentials, options);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json ?? {};

    const fromEmail = String(resolveValue(params.fromEmail ?? "", json));
    if (!fromEmail) throw new Error("EmailSendHITL: fromEmail is required");
    const toEmailRaw = String(resolveValue(params.toEmail ?? "", json));
    if (!toEmailRaw) throw new Error("EmailSendHITL: toEmail is required");

    const subject = String(resolveValue(params.subject ?? "", json));
    const emailFormat = String(params.emailFormat ?? "text");
    const text = params.text as string | undefined;
    const html = params.html as string | undefined;
    const message = String(params.message ?? "The AI wants to use {{ $tool.name }} with params: {{ JSON.stringify($tool.parameters, null, 2) }}");

    const toolName = String(options.toolName ?? "AI Tool");
    const toolParameters = (options.toolParameters ?? {}) as Record<string, unknown>;
    const appendAttribution = options.appendAttribution !== false;
    const ccRaw = options.ccEmail as string | undefined;
    const bccRaw = options.bccEmail as string | undefined;
    const replyToRaw = options.replyTo as string | undefined;

    const responseType = String(params.responseType ?? "approval");
    const approvalType = String(options.approvalType ?? "approve");

    const body = buildEmailBody(text, html, emailFormat, message, toolName, toolParameters, appendAttribution);

    const msg: EmailMessage = {
      from: fromEmail,
      to: splitAddresses(toEmailRaw),
      subject: subject || `Approval Needed: ${toolName}`,
      ...(ccRaw ? { cc: splitAddresses(ccRaw) } : {}),
      ...(bccRaw ? { bcc: splitAddresses(bccRaw) } : {}),
      ...(replyToRaw ? { replyTo: replyToRaw } : {}),
      attachments: [],
      ...body,
    };

    const result = await transport(msg);

    out.push({
      json: {
        success: result.success,
        messageId: result.messageId,
        to: msg.to,
        subject: msg.subject,
        responseType,
        approvalType,
        toolName,
        toolParameters,
      },
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    });
  }

  return [out];
};
