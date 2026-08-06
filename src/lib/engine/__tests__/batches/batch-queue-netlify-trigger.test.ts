import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.netlifyTrigger";

const DEPLOY_SUCCEEDED_PAYLOAD = {
  id: "deploy-abc-123",
  site_id: "site-xyz-789",
  name: "my-site",
  url: "https://my-site.netlify.app",
  ssl_url: "https://my-site.netlify.app",
  admin_url: "https://app.netlify.com/sites/my-site",
  deploy_url: "http://deploy-abc-123--my-site.netlify.app",
  created_at: "2024-01-15T10:30:00Z",
  updated_at: "2024-01-15T10:30:00Z",
  state: "ready",
  branch: "main",
  commit_ref: "a1b2c3d4",
  commit_url: "https://github.com/owner/repo/commit/a1b2c3d4",
  context: "production",
  locked: false,
  published_at: "2024-01-15T10:30:05Z",
  site: {
    id: "site-xyz-789",
    name: "my-site",
    url: "https://my-site.netlify.app",
    ssl_url: "https://my-site.netlify.app",
    admin_url: "https://app.netlify.com/sites/my-site",
    created_at: "2023-06-01T00:00:00Z",
    updated_at: "2024-01-15T10:30:05Z",
    user_id: "user-456",
  },
};

describe("batch-queue netlifyTrigger — n8n-nodes-base.netlifyTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Netlify Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.netlifyTrigger")).toBe(canonical);
  });

  it("emits item per received deploy-succeeded payload", async () => {
    const out = await runNode(TYPE, { events: ["deploySucceeded"] }, [DEPLOY_SUCCEEDED_PAYLOAD]);
    expect(out).toEqual([[{ json: DEPLOY_SUCCEEDED_PAYLOAD }]]);
  });

  it("emits item per received deploy-failed payload", async () => {
    const payload = {
      id: "deploy-def-456",
      site_id: "site-xyz-789",
      name: "my-site",
      state: "error",
      error_message: "Build failed",
    };
    const out = await runNode(TYPE, { events: ["deployFailed"] }, [payload]);
    expect(out).toEqual([[{ json: payload }]]);
  });

  it("emits a single empty item on manual run with no event", async () => {
    const out = await runNode(TYPE, { events: ["deploySucceeded"] }, []);
    expect(out).toEqual([[]]);
  });

  it("passes through multiple payloads in a single invocation", async () => {
    const p1 = { id: "deploy-a", state: "ready" };
    const p2 = { id: "deploy-b", state: "error" };
    const out = await runNode(TYPE, { events: ["deploySucceeded", "deployFailed"] }, [p1, p2]);
    expect(out).toEqual([[{ json: p1 }, { json: p2 }]]);
  });

  it("feeds NoOp downstream when webhook payload is injected via input items", async () => {
    const payload = { id: "deploy-1", state: "ready", name: "prod" };
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Netlify Trigger",
          type: TYPE,
          typeVersion: 1,
          parameters: { events: ["deploySucceeded"] },
        }),
        makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      { "Netlify Trigger": { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await runWorkflowFixture(wf, {
      pinData: { "Netlify Trigger": [{ json: payload }] },
    });
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
    expect(result.runData["No Operation"]?.items?.[0][0].json).toEqual(payload);
  });
});
