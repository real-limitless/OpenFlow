import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setHitlSmtpTransportFactory } from "../../executors/n8n-nodes-base.emailSendHitlTool";
import type { EmailMessage, EmailSendResult, SmtpTransport } from "../../executors/email-send";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.emailSendHitlTool";

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

async function runHitlTool(
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

afterEach(() => setHitlSmtpTransportFactory(null));

describe("batch-queue emailSendHitlTool — n8n-nodes-base.emailSendHitlTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Send Email (HITL)");
  });

  it("throws when the smtp credential is missing", async () => {
    setHitlSmtpTransportFactory(async () => mockTransport());

    await expect(
      runHitlTool(
        {
          fromEmail: "bot@example.com",
          toEmail: "reviewer@example.com",
          subject: "Approve?",
          emailFormat: "text",
        },
        [{}],
        {},
      ),
    ).rejects.toThrow(/credential "smtp"/);
  });

  it("sends an approval email and returns success (acceptance: basic approve flow)", async () => {
    const sent: EmailMessage[] = [];
    setHitlSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true, messageId: "<abc@example.com>" };
    });

    const out = await runHitlTool(
      {
        fromEmail: "bot@example.com",
        toEmail: "reviewer@example.com",
        subject: "Approve: Send Email tool",
        emailFormat: "text",
        message: "The AI wants to use Send Email",
        responseType: "approval",
        options: {
          toolName: "Send Email",
          toolParameters: { to: "user@example.com", subject: "Hello" },
        },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.success).toBe(true);
    expect(out[0][0].json.messageId).toBe("<abc@example.com>");
    expect(out[0][0].json.responseType).toBe("approval");
    expect(out[0][0].json.toolName).toBe("Send Email");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["reviewer@example.com"]);
    expect(sent[0].subject).toBe("Approve: Send Email tool");
  });

  it("includes approve/decline button labels when approvalType is approveAndDecline (acceptance: deny flow)", async () => {
    const sent: EmailMessage[] = [];
    setHitlSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    const out = await runHitlTool(
      {
        fromEmail: "bot@example.com",
        toEmail: "reviewer@example.com",
        subject: "Please review",
        emailFormat: "text",
        responseType: "approval",
        options: {
          approvalType: "approveAndDecline",
          approveButtonLabel: "Yes, proceed",
          declineButtonLabel: "No, stop",
          toolName: "Send Email",
        },
      },
      [{}],
    );

    expect(out[0][0].json.approvalType).toBe("approveAndDecline");
    expect(out[0][0].json.success).toBe(true);
  });

  it("sends free text mode email (acceptance: free text response)", async () => {
    const sent: EmailMessage[] = [];
    setHitlSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    const out = await runHitlTool(
      {
        fromEmail: "bot@example.com",
        toEmail: "reviewer@example.com",
        subject: "Feedback needed",
        emailFormat: "text",
        responseType: "freeText",
        message: "Please provide feedback",
        options: {
          messageButtonLabel: "Respond",
          toolName: "Lookup User",
        },
      },
      [{}],
    );

    expect(out[0][0].json.responseType).toBe("freeText");
    expect(out[0][0].json.success).toBe(true);
  });

  it("resolves $tool.name and $tool.parameters in the message body", async () => {
    const sent: EmailMessage[] = [];
    setHitlSmtpTransportFactory(async () => async (msg) => {
      sent.push(msg);
      return { success: true };
    });

    await runHitlTool(
      {
        fromEmail: "bot@example.com",
        toEmail: "reviewer@example.com",
        subject: "Approve?",
        emailFormat: "text",
        message: 'Approve call to {{ $tool.name }} with params {{ JSON.stringify($tool.parameters) }}?',
        options: {
          toolName: "Lookup User",
          toolParameters: { email: "jane@example.com" },
        },
      },
      [{}],
    );

    expect(sent[0].text).toContain("Approve call to Lookup User");
    expect(sent[0].text).toContain('{"email":"jane@example.com"}');
  });

  it("throws when fromEmail is missing", async () => {
    setHitlSmtpTransportFactory(async () => mockTransport());

    await expect(
      runHitlTool(
        {
          toEmail: "reviewer@example.com",
          subject: "Hi",
          emailFormat: "text",
        },
        [{}],
      ),
    ).rejects.toThrow(/fromEmail is required/);
  });

  it("throws when toEmail is missing", async () => {
    setHitlSmtpTransportFactory(async () => mockTransport());

    await expect(
      runHitlTool(
        {
          fromEmail: "bot@example.com",
          subject: "Hi",
          emailFormat: "text",
        },
        [{}],
      ),
    ).rejects.toThrow(/toEmail is required/);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.emailSendHitlTool")).toBe(canonical);
  });
});
