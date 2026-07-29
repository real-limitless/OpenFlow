import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { prisma } from "../db";
import workflowsRoute from "../routes/workflows";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../middleware/auth";

describe("Phase 7 Gate: Concurrent Runs", () => {
  let app: Hono<AppEnv>;
  let workflowId: string;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "true";

    await prisma.user.upsert({
      where: { id: "local" },
      update: {},
      create: { id: "local", email: "concurrent-gate@local.test", passwordHash: "hashed" },
    });

    app = new Hono<AppEnv>();
    app.use("*", authMiddleware);
    workflowsRoute(app);
  });

  afterAll(async () => {
    if (workflowId) {
      await prisma.execution.deleteMany({ where: { workflowId } });
      await prisma.workflow.deleteMany({ where: { id: workflowId } });
    }
    await prisma.user.deleteMany({ where: { email: "concurrent-gate@local.test" } });
    delete process.env.AUTH_DISABLED;
  });

  it("two concurrent executions complete successfully", async () => {
    // Create a workflow
    const createRes = await app.request("/api/v1/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Concurrent Gate Test",
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
    const wf = await createRes.json();
    workflowId = wf.id;

    // Trigger two executions concurrently
    const [res1, res2] = await Promise.all([
      app.request(`/api/v1/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      app.request(`/api/v1/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    ]);

    expect(res1.status).toBe(202);
    expect(res2.status).toBe(202);

    const { executionId: execId1 } = await res1.json();
    const { executionId: execId2 } = await res2.json();

    expect(execId1).toBeDefined();
    expect(execId2).toBeDefined();
    expect(execId1).not.toBe(execId2);

    // Wait for both to complete
    const waitForCompletion = async (execId: string) => {
      for (let i = 0; i < 100; i++) {
        const exec = await prisma.execution.findUnique({ where: { id: execId } });
        if (exec && (exec.status === "success" || exec.status === "error")) return exec;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`Execution ${execId} did not complete`);
    };

    const [result1, result2] = await Promise.all([
      waitForCompletion(execId1),
      waitForCompletion(execId2),
    ]);

    expect(result1!.status).toBe("success");
    expect(result2!.status).toBe("success");
    expect(result1!.mode).toBe("manual");
    expect(result2!.mode).toBe("manual");
    expect(result1!.finishedAt).toBeDefined();
    expect(result2!.finishedAt).toBeDefined();

    // Verify runData for both
    const runData1 = JSON.parse(result1!.runData);
    const runData2 = JSON.parse(result2!.runData);
    expect(runData1["Manual Trigger"].status).toBe("success");
    expect(runData1["Set"].status).toBe("success");
    expect(runData2["Manual Trigger"].status).toBe("success");
    expect(runData2["Set"].status).toBe("success");
  });
}, 30000);