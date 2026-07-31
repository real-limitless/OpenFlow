import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.githubTrigger";

const PUSH_PAYLOAD = {
  ref: "refs/heads/main",
  repository: { full_name: "example/repotest" },
  pusher: { name: "octocat" },
  commits: [{ message: "Initial commit" }],
};

const PULL_REQUEST_PAYLOAD = {
  action: "opened",
  number: 1,
  repository: { full_name: "example/repotest" },
  pull_request: { title: "Fix bug", body: "Description" },
};

const ISSUE_COMMENT_PAYLOAD = {
  action: "created",
  repository: { full_name: "example/repotest" },
  issue: { number: 1, title: "Bug report" },
  comment: { body: "Thanks for reporting" },
};

describe("batch-queue githubTrigger — n8n-nodes-base.githubTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("GitHub Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("push event payload passes through", async () => {
    const out = await runNode(TYPE, { triggerOn: "push", repo: "example/repotest" }, [PUSH_PAYLOAD]);
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }]]);
  });

  it("pull_request event payload passes through", async () => {
    const out = await runNode(TYPE, { triggerOn: "pull_request", repo: "example/repotest" }, [
      PULL_REQUEST_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: PULL_REQUEST_PAYLOAD }]]);
  });

  it("multiple items pass through", async () => {
    const out = await runNode(TYPE, { triggerOn: "push", repo: "example/repotest" }, [
      PUSH_PAYLOAD,
      PUSH_PAYLOAD,
    ]);
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }, { json: PUSH_PAYLOAD }]]);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(TYPE, { triggerOn: "push", repo: "example/repotest" }, []);
    expect(out).toEqual([[]]);
  });
});