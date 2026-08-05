import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setEmailSendToolTransportFactory,
} from "../../executors/emailSendTool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emailSendTool";

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

async function runEmailTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = { smtp: SMTP_CRED },
  overrides?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters,
    ...(overrides?.continueOnFail ? { continueOnFail: true } : {}) });
  const items = toItems(inputItems);
  const ctx = createExecutionContext({
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
    continueOnFail: overrides?.continueOnFail ?? false,
    getCredential: async (name) => credentials[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => setEmailSendToolTransportFactory(null));

describe("batch-queue emailSendTool — n8n-nodes-base.emailSendTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Send Email");
  });

  it("throws when the smtp credential is missing", async () => {
    setEmailSendToolTransportFactory(async () => async () => ({
      success: true,
      messageId: "<test@example.com>",
    }));

    await expect(
      runEmailTool(
        {
          operation: "send",
          fromEmail: "bot@example.com",
          toEmail: "user@example.com",
          subject: "Hi",
          emailFormat: "text",
          text: "Hello",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "smtp"/);
  });

  it("sends a plain text email — happy path", async () => {
    const sent: Array<{ from: string; to: string[]; subject: string; text?: string; html?: string }> = [];
    setEmailSendToolTransportFactory(
      async () => async (msg) => {
        sent.push(msg);
        return { success: true, messageId: "<abc@example.com>" };
      },
    );

    const out = await runEmailTool(
      {
        operation: "send",
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "Hello",
        emailFormat: "text",
        text: "Hi there",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      emailSend: {
        accepted: ["user@example.com"],
        envelope: { from: "bot@example.com", to: ["user@example.com"] },
        messageId: "<abc@example.com>",
        response: "250 OK",
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Hi there");
    expect(sent[0].html).toBeUndefined();
  });

  it("sends an HTML email with CC", async () => {
    const sent: Array<{ from: string; to: string[]; cc?: string[]; subject: string; html?: string }> = [];
    setEmailSendToolTransportFactory(
      async () => async (msg) => {
        sent.push(msg);
        return { success: true };
      },
    );

    const out = await runEmailTool(
      {
        operation: "send",
        fromEmail: "ann@example.com",
        toEmail: "bob@example.com",
        subject: "HTML test",
        emailFormat: "html",
        html: "<h1>Hello</h1><p>World</p>",
        options: { ccEmail: "carol@example.com" },
      },
      [{}],
    );

    expect(out[0][0].json.emailSend.accepted).toContain("bob@example.com");
    expect(sent[0].to).toEqual(["bob@example.com"]);
    expect(sent[0].cc).toEqual(["carol@example.com"]);
    expect(sent[0].html).toBe("<h1>Hello</h1><p>World</p>");
    expect(sent[0].text).toBeUndefined();
  });

  it("includes attachments from binary property name", async () => {
    const sent: Array<{ attachments: Array<{ filename: string; content: Buffer }> }> = [];
    setEmailSendToolTransportFactory(
      async () => async (msg) => {
        sent.push(msg);
        return { success: true };
      },
    );

    const out = await runEmailTool(
      {
        operation: "send",
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "File",
        emailFormat: "text",
        text: "See attached",
        options: { attachments: "report" },
      },
      [
        {
          json: {},
          binary: {
            report: {
              data: Buffer.from("file-content").toString("base64"),
              mimeType: "text/plain",
              fileName: "report.txt",
            },
          },
        },
      ],
    );

    expect(out[0][0].json.emailSend.response).toBe("250 OK");
    expect(sent[0].attachments).toHaveLength(1);
    expect(sent[0].attachments[0].filename).toBe("report.txt");
  });

  it("throws when fromEmail is missing", async () => {
    setEmailSendToolTransportFactory(
      async () => async () => ({ success: true }),
    );

    await expect(
      runEmailTool(
        {
          operation: "send",
          toEmail: "user@example.com",
          subject: "Hi",
          emailFormat: "text",
          text: "Hello",
        },
        [{}],
      ),
    ).rejects.toThrow(/fromEmail is required/);
  });

  it("throws when toEmail is missing", async () => {
    setEmailSendToolTransportFactory(
      async () => async () => ({ success: true }),
    );

    await expect(
      runEmailTool(
        {
          operation: "send",
          fromEmail: "bot@example.com",
          subject: "Hi",
          emailFormat: "text",
          text: "Hello",
        },
        [{}],
      ),
    ).rejects.toThrow(/toEmail is required/);
  });

  it("sends one email per input item with expression", async () => {
    const sent: Array<{ to: string[] }> = [];
    setEmailSendToolTransportFactory(
      async () => async (msg) => {
        sent.push(msg);
        return { success: true };
      },
    );

    const out = await runEmailTool(
      {
        operation: "send",
        fromEmail: "bot@example.com",
        toEmail: "={{ $json.email }}",
        subject: "Hi",
        emailFormat: "text",
        text: "Hello",
      },
      [{ email: "a@example.com" }, { email: "b@example.com" }],
    );

    expect(out[0]).toHaveLength(2);
    expect(sent).toHaveLength(2);
    expect(sent[0].to).toEqual(["a@example.com"]);
    expect(sent[1].to).toEqual(["b@example.com"]);
  });

  it("sendAndWait returns two outputs", async () => {
    setEmailSendToolTransportFactory(
      async () => async () => ({ success: true, messageId: "<wait@test.com>" }),
    );

    const out = await runEmailTool(
      {
        operation: "sendAndWait",
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "Approve?",
        emailFormat: "text",
        text: "Please approve",
        responseType: "approval",
      },
      [{}],
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.emailSend).toBeDefined();
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({ data: { approval: "approved" } });
  });

  it("resolves expressions in options fields", async () => {
    const sent: Array<{ cc?: string[]; bcc?: string[] }> = [];
    setEmailSendToolTransportFactory(
      async () => async (msg) => {
        sent.push(msg);
        return { success: true };
      },
    );

    await runEmailTool(
      {
        operation: "send",
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "Test",
        emailFormat: "text",
        text: "Body",
        options: {
          ccEmail: "={{ $json.ccAddr }}",
          bccEmail: "={{ $json.bccAddr }}",
        },
      },
      [{ ccAddr: "cc@example.com", bccAddr: "bcc@example.com" }],
    );

    expect(sent[0].cc).toEqual(["cc@example.com"]);
    expect(sent[0].bcc).toEqual(["bcc@example.com"]);
  });

  it("handles continueOnFail", async () => {
    setEmailSendToolTransportFactory(
      async () => async () => {
        throw new Error("SMTP connection refused");
      },
    );

    const out = await runEmailTool(
      {
        operation: "send",
        fromEmail: "bot@example.com",
        toEmail: "user@example.com",
        subject: "Fail",
        emailFormat: "text",
        text: "Body",
      },
      [{}],
      { smtp: SMTP_CRED },
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("SMTP connection refused");
  });
});
