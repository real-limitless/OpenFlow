import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import workflowsRoute from "../routes/workflows";
import chatRoute from "../routes/chat";
import chatHubRoute from "../routes/chat-hub";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../middleware/auth";

const setNode = {
  id: "set1",
  name: "Set",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [220, 0],
  parameters: {
    assignments: {
      assignments: [{ id: "a1", name: "output", type: "string", value: "pong" }],
    },
    includeOtherFields: true,
  },
};

function chatWorkflowBody(name: string, extra: Record<string, unknown>) {
  return {
    name,
    nodes: [
      {
        id: "chat1",
        name: "Chat Trigger",
        type: "openflow-node-langchain.chatTrigger",
        typeVersion: 1.2,
        position: [0, 0],
        parameters: extra,
      },
      setNode,
    ],
    connections: {
      "Chat Trigger": { main: [[{ node: "Set", type: "main", index: 0 }]] },
    },
  };
}

describe("Chat Trigger host routes", () => {
  let app: Hono<AppEnv>;
  const ids: string[] = [];

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "true";
    await prisma.user.upsert({
      where: { id: "local" },
      update: {},
      create: { id: "local", email: "chat-test@local.test", passwordHash: "hashed" },
    });
    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    workflowsRoute(app);
    chatRoute(app);
    chatHubRoute(app);
  });

  afterAll(async () => {
    for (const id of ids) {
      await prisma.execution.deleteMany({ where: { workflowId: id } });
      await prisma.chatRoute.deleteMany({ where: { workflowId: id } });
      await prisma.workflow.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { email: "chat-test@local.test" } });
    delete process.env.AUTH_DISABLED;
  });

  it("activates a public chat route, POSTs a message, and extracts last-node output", async () => {
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Public Chat WF", {
          public: true,
          mode: "hosted",
          options: { chatPath: "gate-chat-public", responseMode: "whenLastNode" },
        }),
      ),
    });
    expect(createRes.status).toBe(201);
    const wf = (await createRes.json()) as { id: string };
    ids.push(wf.id);

    const activateRes = await app.request(`/api/v1/workflows/${wf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(activateRes.status).toBe(200);

    const route = await prisma.chatRoute.findUnique({ where: { path: "gate-chat-public" } });
    expect(route?.active).toBe(true);
    expect(route?.public).toBe(true);

    const post = await app.request("/chat/gate-chat-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: "Hello", sessionId: "s1", action: "sendMessage" }),
    });
    expect(post.status).toBe(200);
    const body = (await post.json()) as { output: string; executionId: string };
    expect(body.output).toBe("pong");
    expect(body.executionId).toBeTruthy();

    const exec = await prisma.execution.findUnique({ where: { id: body.executionId } });
    expect(exec?.status).toBe("success");
    const runData = JSON.parse(exec!.runData) as Record<string, { items?: { json?: unknown }[][] }>;
    expect(runData["Chat Trigger"]?.items?.[0]?.[0]?.json).toMatchObject({
      chatInput: "Hello",
      sessionId: "s1",
    });
  });

  it("returns 404 when the chat is inactive", async () => {
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Inactive Chat WF", {
          public: true,
          options: { chatPath: "gate-chat-inactive" },
        }),
      ),
    });
    const wf = (await createRes.json()) as { id: string };
    ids.push(wf.id);
    await app.request(`/api/v1/workflows/${wf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    await app.request(`/api/v1/workflows/${wf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });

    const post = await app.request("/chat/gate-chat-inactive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: "Hi" }),
    });
    expect(post.status).toBe(404);
  });

  it("rejects basicAuth without credentials", async () => {
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Auth Chat WF", {
          public: true,
          authentication: "basicAuth",
          options: { chatPath: "gate-chat-auth" },
        }),
      ),
    });
    const wf = (await createRes.json()) as { id: string };
    ids.push(wf.id);
    await app.request(`/api/v1/workflows/${wf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });

    const post = await app.request("/chat/gate-chat-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: "Hi" }),
    });
    expect(post.status).toBe(401);
  });

  it("lists hub agents only when makeAvailableInChat is set", async () => {
    const hidden = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Hidden Chat WF", {
          public: true,
          makeAvailableInChat: false,
          options: { chatPath: "gate-chat-hidden" },
        }),
      ),
    });
    const hiddenWf = (await hidden.json()) as { id: string };
    ids.push(hiddenWf.id);
    await app.request(`/api/v1/workflows/${hiddenWf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });

    const shown = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Hub Chat WF", {
          public: false,
          makeAvailableInChat: true,
          agentName: "Desk Agent",
          agentDescription: "Answers tickets",
          options: { chatPath: "gate-chat-hub" },
        }),
      ),
    });
    const shownWf = (await shown.json()) as { id: string };
    ids.push(shownWf.id);
    await app.request(`/api/v1/workflows/${shownWf.id}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });

    const list = await app.request("/api/v1/chat-hub/agents");
    expect(list.status).toBe(200);
    const agents = (await list.json()) as Array<{ workflowId: string; name: string }>;
    expect(agents.some((a) => a.workflowId === shownWf.id && a.name === "Desk Agent")).toBe(true);
    expect(agents.some((a) => a.workflowId === hiddenWf.id)).toBe(false);

    const msg = await app.request(`/api/v1/chat-hub/agents/${shownWf.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatInput: "help" }),
    });
    expect(msg.status).toBe(200);
    expect(((await msg.json()) as { output: string }).output).toBe("pong");
  });

  it("accepts pinData.chatInput on manual execute", async () => {
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatWorkflowBody("Execute Pin Chat", {
          options: { chatPath: "gate-chat-pin" },
        }),
      ),
    });
    const wf = (await createRes.json()) as { id: string };
    ids.push(wf.id);

    const execRes = await app.request(`/api/v1/workflows/${wf.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startNode: "Chat Trigger",
        pinData: {
          "Chat Trigger": [{ json: { chatInput: "from-pin", sessionId: "pin-1", action: "sendMessage" } }],
        },
      }),
    });
    expect(execRes.status).toBe(202);
    const { executionId } = (await execRes.json()) as { executionId: string };
    let execution;
    for (let i = 0; i < 50; i++) {
      execution = await prisma.execution.findUnique({ where: { id: executionId } });
      if (execution && (execution.status === "success" || execution.status === "error")) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(execution?.status).toBe("success");
    const runData = JSON.parse(execution!.runData) as Record<
      string,
      { items?: { json?: { chatInput?: string } }[][] }
    >;
    expect(runData["Chat Trigger"]?.items?.[0]?.[0]?.json?.chatInput).toBe("from-pin");
  });
});
