import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.bitbucketTrigger";

const PUSH_PAYLOAD = {
  actor: { username: "octocat" },
  repository: { full_name: "acme/demo" },
  push: { changes: [{ new: { name: "main" } }] },
};

const FORK_PAYLOAD = {
  actor: { username: "octocat" },
  repository: { full_name: "acme/demo" },
  fork: { name: "forked-repo" },
};

describe("batch-queue bitbucketTrigger — n8n-nodes-base.bitbucketTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Bitbucket Trigger");
    expect(getNodeType(TYPE).inputs).toEqual([]);
    expect(getNodeType(TYPE).outputs).toEqual(["main"]);
  });

  it("repository push payload passes through as one event", async () => {
    const out = await runNode(
      TYPE,
      { subjectScope: "repository", subjectIdentifier: "acme/demo", eventSelection: ["repo:push"] },
      [PUSH_PAYLOAD],
    );
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }]]);
  });

  it("fork payload passes through with correct shape", async () => {
    const out = await runNode(
      TYPE,
      { subjectScope: "repository", subjectIdentifier: "acme/demo", eventSelection: ["repo:push", "repo:fork"] },
      [FORK_PAYLOAD],
    );
    expect(out).toEqual([[{ json: FORK_PAYLOAD }]]);
  });

  it("multiple items pass through", async () => {
    const out = await runNode(
      TYPE,
      { subjectScope: "repository", subjectIdentifier: "acme/demo", eventSelection: ["repo:push"] },
      [PUSH_PAYLOAD, PUSH_PAYLOAD],
    );
    expect(out).toEqual([[{ json: PUSH_PAYLOAD }, { json: PUSH_PAYLOAD }]]);
  });

  it("empty input yields empty output (edge)", async () => {
    const out = await runNode(
      TYPE,
      { subjectScope: "repository", subjectIdentifier: "acme/demo", eventSelection: ["repo:push"] },
      [],
    );
    expect(out).toEqual([[]]);
  });
});