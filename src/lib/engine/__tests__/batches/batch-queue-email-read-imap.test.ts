import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setImapTransportFactory,
  type ImapTransport,
  type ImapFetchMessage,
  shapeItem,
} from "../../executors/email-read-imap";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emailReadImap";

const IMAP_CRED = {
  user: "test@example.com",
  password: "secret",
  host: "imap.example.com",
  port: 993,
  secure: true,
  allowUnauthorizedCerts: false,
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makePollTransport(
  messages: ImapFetchMessage[],
  markAsReadImpl?: (uids: number[]) => Promise<void>,
): ImapTransport {
  return {
    search: async (_criteria, _opts) => messages,
    markAsRead: markAsReadImpl ?? (async () => {}),
    disconnect: async () => {},
  };
}

async function runEmailReadImap(
  parameters: Record<string, unknown>,
  transport: ImapTransport,
  credentials: Record<string, Record<string, unknown>> = { imap: IMAP_CRED },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems([]);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  setImapTransportFactory(async () => transport);
  return executor(ctx, node);
}

afterEach(() => setImapTransportFactory(null));

describe("batch-queue emailReadImap — n8n-nodes-base.emailReadImap", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Email Trigger (IMAP)");
  });

  it("basic poll — simple format, mark as read (happy path)", async () => {
    const marked: number[] = [];
    const transport = makePollTransport(
      [
        {
          uid: 1,
          subject: "Hello",
          from: "sender@example.com",
          to: "recipient@example.com",
          date: "2026-07-31T12:00:00Z",
          text: "World",
          html: "<p>World</p>",
          messageId: "<abc@example.com>",
          size: 1024,
        },
      ],
      async (uids) => marked.push(...uids),
    );

    const out = await runEmailReadImap(
      {
        mailbox: "INBOX",
        postProcessAction: "read",
        format: "simple",
        downloadAttachments: false,
      },
      transport,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      subject: "Hello",
      text: "World",
      mailbox: "INBOX",
    });
    expect(out[0][0].json).not.toHaveProperty("raw");
    expect(out[0][0].binary).toBeUndefined();
    expect(marked).toEqual([1]);
  });

  it("poll with attachment download (resolved format)", async () => {
    const transport = makePollTransport([
      {
        uid: 2,
        subject: "With attachment",
        from: "a@example.com",
        to: "b@example.com",
        date: "2026-07-31T13:00:00Z",
        text: "See attached",
        messageId: "<def@example.com>",
        size: 2048,
        attachments: [
          {
            filename: "report.pdf",
            mimeType: "application/pdf",
            size: 1000,
            data: Buffer.from("pdf-content"),
          },
        ],
      },
    ]);

    const out = await runEmailReadImap(
      {
        mailbox: "INBOX",
        postProcessAction: "nothing",
        format: "resolved",
        downloadAttachments: true,
        dataPropertyAttachmentsPrefixName: "attachment_",
      },
      transport,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      subject: "With attachment",
      attachment_0: { filename: "report.pdf", mimeType: "application/pdf", size: 1000 },
    });
    expect(out[0][0].binary?.attachment_0).toBeDefined();
    expect(out[0][0].binary!.attachment_0.data).toBe(
      Buffer.from("pdf-content").toString("base64"),
    );
  });

  it("raw format output", async () => {
    const transport = makePollTransport([
      {
        uid: 3,
        subject: "Raw email",
        from: "x@example.com",
        to: "y@example.com",
        date: "2026-07-31T14:00:00Z",
        messageId: "<ghi@example.com>",
        size: 512,
        raw: Buffer.from("RFC 2822 raw content").toString("base64url"),
      },
    ]);

    const out = await runEmailReadImap(
      {
        mailbox: "INBOX",
        format: "raw",
      },
      transport,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.raw).toBeTruthy();
    expect(typeof out[0][0].json.raw).toBe("string");
    expect(out[0][0].json).not.toHaveProperty("text");
    expect(out[0][0].json).not.toHaveProperty("html");
  });

  it("no emails — empty poll", async () => {
    const transport = makePollTransport([]);

    const out = await runEmailReadImap(
      {
        mailbox: "INBOX",
      },
      transport,
    );

    expect(out[0]).toHaveLength(0);
  });

  it("custom email rule filtering", async () => {
    const transport = makePollTransport([
      {
        uid: 4,
        subject: "Filtered match",
        from: "sender@example.com",
        to: "me@example.com",
        date: "2026-07-31T15:00:00Z",
        text: "Matching email",
        messageId: "<jkl@example.com>",
        size: 256,
      },
    ]);

    const out = await runEmailReadImap(
      {
        mailbox: "INBOX",
        options: {
          customEmailConfig: 'UNSEEN FROM "sender@example.com"',
        },
      },
      transport,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.subject).toBe("Filtered match");
  });

  it("throws when the imap credential is missing", async () => {
    setImapTransportFactory(async () => makePollTransport([]));

    await expect(
      runEmailReadImap({ mailbox: "INBOX" }, makePollTransport([]), {}),
    ).rejects.toThrow(/credential "imap"/);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.emailReadImap")).toBe(canonical);
  });

  it("shapeItem produces raw format correctly", () => {
    const msg: ImapFetchMessage = {
      uid: 1,
      raw: Buffer.from("raw data").toString("base64url"),
      subject: "S",
      from: "F",
      to: "T",
      date: "D",
      messageId: "M",
      size: 100,
    };
    const item = shapeItem(msg, "INBOX", "raw", "attachment_", false);
    expect(item.json.raw).toBeTruthy();
    expect(item.json).not.toHaveProperty("text");
    expect(item.json).not.toHaveProperty("html");
  });

  it("shapeItem produces simple format (no attachments)", () => {
    const msg: ImapFetchMessage = {
      uid: 1,
      subject: "S",
      from: "F",
      to: "T",
      date: "D",
      text: "body",
      html: "<p>body</p>",
      messageId: "M",
      size: 100,
    };
    const item = shapeItem(msg, "INBOX", "simple", "attachment_", false);
    expect(item.json.text).toBe("body");
    expect(item.json.html).toBe("<p>body</p>");
    expect(item.json.mailbox).toBe("INBOX");
    expect(item.binary).toBeUndefined();
  });

  it("resolves the executor under the non-prefixed alias", () => {
    expect(getExecutor("nodes-base.emailReadImap")).toBe(getExecutor(TYPE));
  });
});