import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setSmtpTransportFactory,
  type SmtpTransport,
  type EmailMessage,
  type EmailSendResult,
} from "../../executors/email-send";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emailSend";

const SMTP_CRED = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  user: "bot@example.com",
  password: "secret",
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

async function runEmail(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = { smtp: SMTP_CRED },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockTransport(impl?: (msg: EmailMessage) => Promise<EmailSendResult>): SmtpTransport {
  return async (msg) => {
    if (impl) return impl(msg);
    return { success: true, messageId: `<test-${Date.now()}@example.com>` };
  };
}

afterEach(() => setSmtpTransportFactory(null));

describe("batch-queue emailSend — n8n-nodes-base.emailSend", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Send Email");
  });

  it("throws when the smtp credential is missing", async () => {
    setSmtpTransportFactory(async () => mockTransport());

    await expect(
      runEmail(
        {
          fromEmail: "bot@example.com",
          toEmail: "user@example.com",
          subject: "Hi",
          emailFormat: "text",
          message: "Hello",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "smtp"/);
  });

  it("sends a plain text email — happy path", async () => {
    const sent: EmailMessage[] = [];
    setSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true, messageId: "<abc@example.com>" };
    });

    const out = await runEmail(
      {
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "Hello",
        emailFormat: "text",
        message: "Hi there",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      success: true,
      messageId: "<abc@example.com>",
      to: ["user@example.com"],
      subject: "Hello",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Hi there");
    expect(sent[0].html).toBeUndefined();
  });

  it("sends an HTML email with cc and multiple recipients", async () => {
    const sent: EmailMessage[] = [];
    setSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    const out = await runEmail(
      {
        fromEmail: "bot@example.com",
        fromName: "Bot",
        toEmail: "a@example.com, b@example.com",
        ccEmail: "c@example.com",
        subject: "Report",
        emailFormat: "html",
        htmlMessage: "<h1>Hi</h1>",
      },
      [{}],
    );

    expect(out[0][0].json.to).toEqual(["a@example.com", "b@example.com"]);
    expect(sent[0].to).toHaveLength(2);
    expect(sent[0].cc).toEqual(["c@example.com"]);
    expect(sent[0].fromName).toBe("Bot");
    expect(sent[0].html).toBe("<h1>Hi</h1>");
    expect(sent[0].text).toBeUndefined();
  });

  it("includes attachments from binary properties", async () => {
    const sent: EmailMessage[] = [];
    setSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    const out = await runEmail(
      {
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "File",
        emailFormat: "text",
        message: "See attached",
        attachmentsUi: {
          attachments: [{ binaryPropertyName: "data" }],
        },
      },
      [
        {
          json: {},
          binary: {
            data: {
              data: Buffer.from("file-content").toString("base64"),
              mimeType: "text/plain",
              fileName: "notes.txt",
            },
          },
        },
      ],
    );

    expect(out[0][0].json.success).toBe(true);
    expect(sent[0].attachments).toHaveLength(1);
    expect(sent[0].attachments[0].filename).toBe("notes.txt");
    expect(sent[0].attachments[0].content.toString("utf8")).toBe("file-content");
  });

  it("throws when fromEmail is missing", async () => {
    setSmtpTransportFactory(async () => mockTransport());

    await expect(
      runEmail(
        {
          toEmail: "user@example.com",
          subject: "Hi",
          emailFormat: "text",
          message: "Hello",
        },
        [{}],
      ),
    ).rejects.toThrow(/fromEmail is required/);
  });

  it("throws when toEmail is missing", async () => {
    setSmtpTransportFactory(async () => mockTransport());

    await expect(
      runEmail(
        {
          fromEmail: "bot@example.com",
          subject: "Hi",
          emailFormat: "text",
          message: "Hello",
        },
        [{}],
      ),
    ).rejects.toThrow(/toEmail is required/);
  });

  it("sends one email per input item", async () => {
    const sent: EmailMessage[] = [];
    setSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    const out = await runEmail(
      {
        fromEmail: "bot@example.com",
        toEmail: "={{ $json.email }}",
        subject: "Hi",
        emailFormat: "text",
        message: "Hello",
      },
      [{ email: "a@example.com" }, { email: "b@example.com" }],
    );

    expect(out[0]).toHaveLength(2);
    expect(sent).toHaveLength(2);
    expect(sent[0].to).toEqual(["a@example.com"]);
    expect(sent[1].to).toEqual(["b@example.com"]);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.emailSend")).toBe(canonical);
  });
});
