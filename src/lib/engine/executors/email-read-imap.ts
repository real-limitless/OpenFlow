import type { NodeExecutor, INodeExecutionData, CredentialData } from "@/sdk";

export interface ImapCredentials {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  allowUnauthorizedCerts: boolean;
}

export interface ImapAttachment {
  filename?: string;
  mimeType?: string;
  size?: number;
  data: Buffer;
}

export interface ImapFetchMessage {
  uid: number;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  text?: string;
  html?: string;
  messageId?: string;
  size?: number;
  raw?: string;
  attachments?: ImapAttachment[];
}

export interface ImapPollOptions {
  mailbox: string;
  customEmailConfig?: string;
  trackLastMessageId?: boolean;
  downloadAttachments: boolean;
}

export interface ImapTransport {
  search(criteria: string[], options: { downloadAttachments: boolean }): Promise<ImapFetchMessage[]>;
  markAsRead(uids: number[]): Promise<void>;
  disconnect(): Promise<void>;
}

export type ImapTransportFactory = (credentials: ImapCredentials) => Promise<ImapTransport>;

let transportFactory: ImapTransportFactory | null = null;

export function setImapTransportFactory(factory: ImapTransportFactory | null): void {
  transportFactory = factory;
}

const DEFAULT_FACTORY: ImapTransportFactory = async () => {
  throw new Error(
    "EmailReadImap: no IMAP transport configured. Wire a real transport via setImapTransportFactory.",
  );
};

function buildSearchCriteria(
  customEmailConfig?: string,
  trackLastMessageId?: boolean,
): string[] {
  const criteria: string[] = [];
  if (customEmailConfig) {
    const parts = customEmailConfig.split(/\s+/);
    criteria.push(...parts);
    if (!criteria.includes("UNSEEN") && !criteria.some((c) => c.toUpperCase() === "UNSEEN")) {
      criteria.unshift("UNSEEN");
    }
  } else {
    criteria.push("UNSEEN");
  }
  return criteria;
}

export function shapeItem(
  msg: ImapFetchMessage,
  mailbox: string,
  format: string,
  dataPropertyAttachmentsPrefixName: string,
  downloadAttachments: boolean,
): INodeExecutionData {
  const item: INodeExecutionData = { json: {} };

  if (format === "raw") {
    item.json = {
      raw: msg.raw ?? "",
      subject: msg.subject,
      from: msg.from,
      to: msg.to,
      date: msg.date,
      messageId: msg.messageId,
      mailbox,
      size: msg.size,
    };
    return item;
  }

  item.json = {
    subject: msg.subject,
    from: msg.from,
    to: msg.to,
    date: msg.date,
    text: msg.text,
    html: msg.html,
    messageId: msg.messageId,
    mailbox,
    size: msg.size,
  };

  if (downloadAttachments && msg.attachments && msg.attachments.length > 0) {
    const binary: Record<string, { data: string; mimeType?: string; fileName?: string }> = {};
    for (let i = 0; i < msg.attachments.length; i++) {
      const att = msg.attachments[i];
      const key = `${dataPropertyAttachmentsPrefixName}${i}`;
      binary[key] = {
        data: att.data.toString("base64"),
        mimeType: att.mimeType,
        fileName: att.filename,
      };
      (item.json as Record<string, unknown>)[key] = {
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
      };
    }
    item.binary = binary;
  }

  return item;
}

export const emailReadImapExecutor: NodeExecutor = async (ctx) => {
  const mailbox = ctx.getParam<string>("mailbox", "INBOX") ?? "INBOX";
  const postProcessAction = ctx.getParam<string>("postProcessAction", "read") ?? "read";
  const downloadAttachments = ctx.getParam<boolean>("downloadAttachments", false) ?? false;
  const format = ctx.getParam<string>("format", "simple") ?? "simple";
  const dataPropertyAttachmentsPrefixName =
    ctx.getParam<string>("dataPropertyAttachmentsPrefixName", "attachment_") ?? "attachment_";
  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const customEmailConfig = (options.customEmailConfig as string) || undefined;
  const trackLastMessageId = (options.trackLastMessageId as boolean) ?? false;

  const credentials = await ctx.getCredential("imap");
  if (!credentials) {
    throw new Error('EmailReadImap: credential "imap" is not configured on this node');
  }

  const creds: ImapCredentials = {
    user: credentials.user as string,
    password: credentials.password as string,
    host: credentials.host as string,
    port: (credentials.port as number) ?? 993,
    secure: (credentials.secure as boolean) ?? true,
    allowUnauthorizedCerts: (credentials.allowUnauthorizedCerts as boolean) ?? false,
  };

  const factory = transportFactory ?? DEFAULT_FACTORY;
  const transport = await factory(creds);

  try {
    const criteria = buildSearchCriteria(customEmailConfig, trackLastMessageId);
    const messages = await transport.search(criteria, { downloadAttachments });

    const continueOnFail = ctx.continueOnFail();

    const items: INodeExecutionData[] = [];
    for (const msg of messages) {
      try {
        items.push(
          shapeItem(msg, mailbox, format, dataPropertyAttachmentsPrefixName, downloadAttachments),
        );
      } catch (err) {
        if (!continueOnFail) throw err;
        items.push({ json: { error: err instanceof Error ? err.message : String(err) } });
      }
    }

    if (postProcessAction === "read" && messages.length > 0) {
      const uids = messages.map((m) => m.uid);
      await transport.markAsRead(uids);
    }

    return [items];
  } finally {
    await transport.disconnect();
  }
};