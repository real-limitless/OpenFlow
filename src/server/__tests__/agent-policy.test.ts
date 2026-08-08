import { describe, expect, it } from "vitest";
import {
  assertAgentWorkflowAccess,
  grantAllows,
  normalizeGrantInputs,
  type WorkflowPolicy,
} from "../services/agent-policy";

describe("agent-policy", () => {
  it("normalizeGrantInputs defaults read on", () => {
    const g = normalizeGrantInputs([
      { workflowId: "w1", canWrite: true, canExecute: false },
    ]);
    expect(g[0].canRead).toBe(true);
    expect(g[0].canWrite).toBe(true);
  });

  it("unrestricted policy allows any workflow", () => {
    expect(() =>
      assertAgentWorkflowAccess({ mode: "unrestricted" }, "w1", "execute"),
    ).not.toThrow();
  });

  it("grants mode denies missing workflow", () => {
    const policy: WorkflowPolicy = {
      mode: "grants",
      canCreateWorkflows: false,
      grants: [
        {
          workflowId: "w1",
          canRead: true,
          canWrite: false,
          canExecute: false,
          expiresAt: null,
        },
      ],
    };
    expect(() => assertAgentWorkflowAccess(policy, "w2", "read")).toThrow(/No MCP grant/);
    expect(() => assertAgentWorkflowAccess(policy, "w1", "write")).toThrow(/lacks write/);
    expect(() => assertAgentWorkflowAccess(policy, "w1", "read")).not.toThrow();
  });

  it("expired grants are inactive", () => {
    const policy: WorkflowPolicy = {
      mode: "grants",
      canCreateWorkflows: false,
      grants: [
        {
          workflowId: "w1",
          canRead: true,
          canWrite: true,
          canExecute: true,
          expiresAt: new Date(Date.now() - 1000),
        },
      ],
    };
    expect(() => assertAgentWorkflowAccess(policy, "w1", "read")).toThrow(/No MCP grant/);
  });

  it("grantAllows", () => {
    const g = {
      workflowId: "w",
      canRead: true,
      canWrite: false,
      canExecute: true,
      expiresAt: null,
    };
    expect(grantAllows(g, "read")).toBe(true);
    expect(grantAllows(g, "write")).toBe(false);
    expect(grantAllows(g, "execute")).toBe(true);
  });
});
