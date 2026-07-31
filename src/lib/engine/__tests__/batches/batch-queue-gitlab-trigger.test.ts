import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gitlabTrigger";

const PUSH_PAYLOAD = {
  ref: "refs/heads/main",
  project: { id: 1, path_with_namespace: "example/repo" },
  commits: [{ id: "abc123", message: "Initial commit" }],
  user_username: "octocat",
};

const MERGE_REQUEST_PAYLOAD = {
  event_type: "merge_request",
  project: { id: 1, path_with_namespace: "example/repo" },
  object_attributes: { iid: 42, title: "Fix bug", action: "open" },
  user: { username: "octocat" },
};

describe("batch-queue gitlabTrigger — n8n-nodes-base.gitlabTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("GitLab Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("push event payload passes through", async () => {
    const out = await runNode(TYPE, { eventTypes: ["push"], projectId: "example/repo" }, [PUSH_PAYLOAD]);
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }]]);
  });

  it("merge_request event payload passes through", async () => {
    const out = await runNode(TYPE, { eventTypes: ["merge_request"], projectId: "example/repo" }, [
      MERGE_REQUEST_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: MERGE_REQUEST_PAYLOAD }]]);
  });

  it("multiple items pass through", async () => {
    const out = await runNode(TYPE, { eventTypes: ["push"], projectId: "example/repo" }, [
      PUSH_PAYLOAD,
      PUSH_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }, { json: PUSH_PAYLOAD }]]);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { eventTypes: ["push"], projectId: "example/repo" }, []);
    expect(out).toEqual([[]]);
  });
});