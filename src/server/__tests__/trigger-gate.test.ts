import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import workflowsRoute from "../routes/workflows";
import executionsRoute from "../routes/executions";
import webhooksRoute from "../routes/webhooks";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../middleware/auth";

describe("Phase 4 Gate: Trigger Integration", () => {
  let app: Hono<AppEnv>;
  let testWorkflowId: string;
  let webhookWorkflowId: string;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "true";

    await prisma.user.upsert({
      where: { id: "local" },
      update: {},
      create: { id: "local", email: "gate-test@local.test", passwordHash: "hashed" },
    });

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    workflowsRoute(app);
    executionsRoute(app);
    webhooksRoute(app);
  });

  afterAll(async () => {
    for (const id of [testWorkflowId, webhookWorkflowId]) {
      if (id) {
        await prisma.execution.deleteMany({ where: { workflowId: id } });
        await prisma.webhookRoute.deleteMany({ where: { workflowId: id } });
        await prisma.scheduledTrigger.deleteMany({ where: { workflowId: id } });
        await prisma.workflow.deleteMany({ where: { id } });
      }
    }
    await prisma.user.deleteMany({ where: { email: "gate-test@local.test" } });
    delete process.env.AUTH_DISABLED;
  });

  it("executes workflow via API and persists result", async () => {
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Gate Test Workflow",
        nodes: [
          { id: "1", name: "Manual Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
          { id: "2", name: "Set", type: "n8n-nodes-base.set", typeVersion: 3, position: [200, 0], parameters: {} },
        ],
        connections: {
          "Manual Trigger": { main: [[{ node: "Set", type: "main", index: 0 }]] },
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const workflow = await createRes.json();
    testWorkflowId = workflow.id;

    const execRes = await app.request(`/api/v1/workflows/${testWorkflowId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(execRes.status).toBe(202);
    const { executionId } = await execRes.json();
    expect(executionId).toBeDefined();

    let execution;
    for (let i = 0; i < 50; i++) {
      execution = await prisma.execution.findUnique({ where: { id: executionId } });
      if (execution && (execution.status === "success" || execution.status === "error")) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(execution).toBeDefined();
    expect(execution!.status).toBe("success");
    expect(execution!.mode).toBe("manual");
    expect(execution!.finishedAt).toBeDefined();

    const runData = JSON.parse(execution!.runData);
    expect(runData["Manual Trigger"]).toBeDefined();
    expect(runData["Manual Trigger"].status).toBe("success");
    expect(runData["Set"]).toBeDefined();
    expect(runData["Set"].status).toBe("success");
  });

  it("activates workflow, hits webhook, sees execution", async () => {
    // Create a workflow with a Webhook trigger
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Webhook Gate Test",
        nodes: [
          {
            id: "wh1",
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 2,
            position: [0, 0],
            parameters: {
              httpMethod: "POST",
              path: "gate-test-webhook",
              responseMode: "onReceived",
            },
          },
          {
            id: "set1",
            name: "Set",
            type: "n8n-nodes-base.set",
            typeVersion: 3,
            position: [200, 0],
            parameters: {},
          },
        ],
        connections: {
          Webhook: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const wf = await createRes.json();
    webhookWorkflowId = wf.id;

    // Activate the workflow — registers webhook route
    const activateRes = await app.request(`/api/v1/workflows/${webhookWorkflowId}/activate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(activateRes.status).toBe(200);
    const activateBody = await activateRes.json();
    expect(activateBody.active).toBe(true);

    // Verify webhook route was registered
    const route = await prisma.webhookRoute.findUnique({ where: { path: "gate-test-webhook" } });
    expect(route).toBeDefined();
    expect(route!.active).toBe(true);
    expect(route!.method).toBe("POST");

    // Hit the webhook endpoint
    const webhookRes = await app.request("/webhook/gate-test-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    expect(webhookRes.status).toBe(202);
    const webhookBody = await webhookRes.json();
    expect(webhookBody.executionId).toBeDefined();

    // Wait for execution to complete
    let execution;
    for (let i = 0; i < 50; i++) {
      execution = await prisma.execution.findUnique({ where: { id: webhookBody.executionId } });
      if (execution && (execution.status === "success" || execution.status === "error")) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(execution).toBeDefined();
    expect(execution!.status).toBe("success");
    expect(execution!.mode).toBe("webhook");
    expect(execution!.finishedAt).toBeDefined();

    const runData = JSON.parse(execution!.runData);
    expect(runData["Webhook"]).toBeDefined();
    expect(runData["Set"]).toBeDefined();
  });
});
