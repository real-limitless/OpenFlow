import { createTransport, type Transporter } from "nodemailer";
import type { CredentialData } from "@/sdk";
import type { EmailMessage, SmtpTransport, SmtpTransportFactory } from "./email-send";

/**
 * Default SMTP transport for the `n8n-nodes-base.emailSend` executor, over
 * nodemailer.
 *
 * Connection details come from the node's `smtp` credential; `options` carries
 * the node-level toggles (currently just allowUnauthorizedCerts).
 */

function str(value: unknown): string | undefined {
  return value != null && String(value).trim() !== "" ? String(value).trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * RFC 5322 display-name + address. nodemailer handles the encoding of non-ASCII
 * display names, so the name is passed through structurally rather than
 * pre-formatted into a string.
 */
function fromField(msg: EmailMessage): string | { name: string; address: string } {
  return msg.fromName ? { name: msg.fromName, address: msg.from } : msg.from;
}

export const defaultSmtpTransportFactory: SmtpTransportFactory = async (
  credentials: CredentialData,
  options: Record<string, unknown>,
) => {
  const cred = credentials as Record<string, unknown>;

  const host = str(cred.host);
  if (!host) throw new Error("EmailSend: smtp credential is missing host");

  // 465 is implicit TLS; 587/25 start plaintext and upgrade via STARTTLS.
  const port = Number(cred.port ?? 587) || 587;
  const secure = bool(cred.secure) ?? port === 465;

  const user = str(cred.user) ?? str(cred.username);
  const password = str(cred.password);

  const transporter: Transporter = createTransport({
    host,
    port,
    secure,
    // Only send AUTH when the credential actually carries a user; many
    // internal relays accept unauthenticated submission.
    ...(user ? { auth: { user, pass: password ?? "" } } : {}),
    ...(bool(options.allowUnauthorizedCerts)
      ? { tls: { rejectUnauthorized: false } }
      : {}),
  });

  const send: SmtpTransport = async (msg: EmailMessage) => {
    const info = await transporter.sendMail({
      from: fromField(msg),
      to: msg.to,
      ...(msg.cc?.length ? { cc: msg.cc } : {}),
      ...(msg.bcc?.length ? { bcc: msg.bcc } : {}),
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      subject: msg.subject,
      ...(msg.text !== undefined ? { text: msg.text } : {}),
      ...(msg.html !== undefined ? { html: msg.html } : {}),
      ...(msg.attachments.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
    });

    return {
      // sendMail rejects on failure, so reaching here means the server
      // accepted the message for at least one recipient.
      success: true,
      ...(info?.messageId ? { messageId: info.messageId } : {}),
    };
  };

  return send;
};
