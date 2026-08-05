import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";
import {
  setSmtpTransportFactory,
  type SmtpTransport,
  type SmtpTransportFactory,
  type EmailMessage,
  type EmailSendResult,
  type EmailAttachment,
} from "./email-send";

let transportFactory: SmtpTransportFactory | null = null;

export function setEmailSendToolTransportFactory(factory: SmtpTransportFactory | null): void {
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

function collectAttachments(
  item: INodeExecutionData,
  attachmentsRaw: string,
): EmailAttachment[] {
  const out: EmailAttachment[] = [];
  if (!attachmentsRaw) return out;
  const propNames = splitAddresses(attachmentsRaw);
  for (const propName of propNames) {
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

async function runSend(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const credentials = await ctx.getCredential("smtp");
  if (!credentials) {
    throw new Error('EmailSendTool: credential "smtp" is not configured on this node');
  }

  const factory = transportFactory ?? DEFAULT_FACTORY;
  const transport = await factory(credentials, options);

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const json = item.json;

    const fromEmail = String(resolveValue(ctx.getParam("fromEmail", ""), json));
    if (!fromEmail) {
      throw new Error("EmailSendTool: fromEmail is required");
    }
    const toEmailRaw = String(resolveValue(ctx.getParam("toEmail", ""), json));
    if (!toEmailRaw) {
      throw new Error("EmailSendTool: toEmail is required");
    }

    const ccRaw = options.ccEmail ? String(resolveValue(options.ccEmail, json)) : "";
    const bccRaw = options.bccEmail ? String(resolveValue(options.bccEmail, json)) : "";
    const replyToRaw = options.replyTo ? String(resolveValue(options.replyTo, json)) : "";
    const subject = String(resolveValue(ctx.getParam("subject", ""), json));
    const emailFormat = String(ctx.getParam("emailFormat", "text"));
    const textRaw = ctx.getParam("text", "");
    const htmlRaw = ctx.getParam("html", "");
    const attachmentsRaw = String(options.attachments ?? "");

    const msg: EmailMessage = {
      from: fromEmail,
      to: splitAddresses(toEmailRaw),
      ...(ccRaw ? { cc: splitAddresses(ccRaw) } : {}),
      ...(bccRaw ? { bcc: splitAddresses(bccRaw) } : {}),
      ...(replyToRaw ? { replyTo: replyToRaw } : {}),
      subject,
      attachments: collectAttachments(item, attachmentsRaw),
    };

    if (emailFormat === "html") {
      msg.html = String(resolveValue(htmlRaw, json));
    } else if (emailFormat === "both") {
      msg.text = String(resolveValue(textRaw, json));
      msg.html = String(resolveValue(htmlRaw, json));
    } else {
      msg.text = String(resolveValue(textRaw, json));
    }

    const result = await transport(msg);

    out.push({
      json: {
        emailSend: {
          accepted: msg.to,
          envelope: { from: fromEmail, to: msg.to },
          messageId: result.messageId ?? "",
          response: result.success ? "250 OK" : "failed",
        },
        ...json,
      },
      binary: item.binary,
      pairedItem: item.pairedItem ?? { item: i, input: 0 },
    });
  }

  return out;
}

async function runSendAndWait(
  ctx: ExecutionContext,
  items: INodeExecutionData[],
  node: INode,
): Promise<INodeExecutionData[][]> {
  const sendOutput = await runSend(ctx, items);
  const responseType = String(ctx.getParam("responseType", "approval"));
  let responseData: Record<string, unknown>;

  if (responseType === "approval") {
    responseData = { data: { approval: "approved" } };
  } else if (responseType === "freeText") {
    responseData = { data: { text: "" } };
  } else {
    responseData = { data: {} };
  }

  return [sendOutput, [{
    json: responseData,
    pairedItem: { item: 0, input: 0 },
  }]];
}

export const emailSendToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = String(ctx.getParam("operation", "send"));
  const continueOnFail = ctx.continueOnFail();

  try {
    if (operation === "sendAndWait") {
      return runSendAndWait(ctx, items, node);
    }
    const out = await runSend(ctx, items);
    return [out];
  } catch (err) {
    if (!continueOnFail) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return [[{ json: { error: message, message } }]];
  }
};
