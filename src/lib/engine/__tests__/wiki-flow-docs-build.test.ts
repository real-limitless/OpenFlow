import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWorkflowJson } from "@/lib/workflow/schema";
import type { IWorkflow } from "@/lib/workflow/types";
import { typesEqual } from "@/lib/nodes/type-ids";
import { resetCircuitBreakerRegistryForTests } from "@/lib/runtime/circuit-breaker";
import { executeWorkflow } from "../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../index";

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../workflows/integrations/wiki-flow",
);

seedBuiltinExecutors();

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

let calls: FetchCall[];

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const raw = init?.headers as Record<string, string> | undefined;
      if (raw) {
        for (const [key, value] of Object.entries(raw)) headers[key] = value;
      }
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
        headers,
      });
      const text = JSON.stringify({ ok: true });
      return {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: {
          get(name: string) {
            return name.toLowerCase() === "content-type" ? "application/json" : null;
          },
          entries() {
            return [["content-type", "application/json"]] as Iterable<[string, string]>;
          },
        },
        async json() {
          return { ok: true };
        },
        async text() {
          return text;
        },
        async arrayBuffer() {
          return new TextEncoder().encode(text).buffer;
        },
      };
    }),
  );
}

function loadWorkflow(file: string): { raw: Record<string, unknown>; workflow: IWorkflow } {
  const raw = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Record<string, unknown>;
  const parsed = parseWorkflowJson(raw);
  expect(parsed.ok, parsed.error).toBe(true);
  return { raw, workflow: parsed.workflow! };
}

function webhookNodes(workflow: IWorkflow) {
  return workflow.nodes.filter((node) => typesEqual(node.type, "n8n-nodes-base.webhook"));
}

describe("wiki-flow docs-build workflows", () => {
  beforeEach(() => {
    resetCircuitBreakerRegistryForTests();
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports both files through parseWorkflowJson", () => {
    const build = loadWorkflow("docs-build.json");
    const complete = loadWorkflow("docs-build-complete.json");

    expect(build.workflow.name).toBe("wiki-flow/docs-build");
    expect(complete.workflow.name).toBe("wiki-flow/docs-build-complete");

    for (const { workflow } of [build, complete]) {
      expect(webhookNodes(workflow)).toHaveLength(1);
      expect(
        workflow.nodes.some((node) => typesEqual(node.type, "n8n-nodes-base.respondToWebhook")),
      ).toBe(false);
      expect(workflow.settings.webhookAuthMode).toBe("header");
      expect(workflow.settings.webhookSecret).toBeUndefined();
      expect(workflow.settings.executionTimeout).toBe(600);
      const webhook = webhookNodes(workflow)[0];
      expect(webhook.parameters.httpMethod).toBe("POST");
      expect(webhook.parameters.responseMode).toBe("onReceived");
    }

    expect(build.workflow.nodes.find((node) => node.name === "Send Handoff")?.continueOnFail).toBe(
      true,
    );
    expect(webhookNodes(build.workflow)[0].parameters.path).toBe("wiki-build");
    expect(webhookNodes(complete.workflow)[0].parameters.path).toBe("wiki-build-complete");

    const handoff = build.workflow.nodes.find((node) => node.name === "Send Handoff");
    expect(String(handoff?.parameters.jsonBody)).toContain("$json.plan.seatId");
    expect(String(handoff?.parameters.jsonBody)).toContain("$json.runId");
    expect(String(handoff?.parameters.url)).toContain("$json.rosterUrl");
    expect(JSON.stringify(build.raw)).not.toMatch(/webhookSecret/);
    expect(JSON.stringify(complete.raw)).not.toMatch(/webhookSecret/);
  });

  it("splits each plan page and the runner resolves handoff bodies", async () => {
    const { workflow } = loadWorkflow("docs-build.json");
    const plan = [
      { seatId: "docs-writer", slug: "intro", brief: "Write the intro" },
      { seatId: "api-writer", slug: "api", brief: "Write the API page" },
      { seatId: "reviewer", slug: "review", brief: "Review the draft" },
    ];
    const sample = {
      owner: "acme",
      repo: "handbook",
      runId: "run-42",
      wikiUrl: "https://wiki.example",
      rosterUrl: "https://roster.example",
      plan,
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
      pinData: { Webhook: [{ json: sample }] },
      startNode: "Webhook",
    });

    expect(result.success).toBe(true);
    const pages = result.runData["Split Plan"]?.items?.[0] ?? [];
    expect(pages).toHaveLength(plan.length);
    expect(pages.map((item) => item.json.plan)).toEqual(plan);
    for (const item of pages) {
      expect(item.json.rosterUrl).toBe(sample.rosterUrl);
      expect(item.json.runId).toBe(sample.runId);
      expect(item.json.owner).toBe(sample.owner);
      expect(item.json.plan).not.toEqual(plan);
    }

    expect(calls).toHaveLength(plan.length);
    expect(calls.map((call) => call.url)).toEqual(
      plan.map(() => `${sample.rosterUrl}/api/v1/bus/send`),
    );
    expect(calls.map((call) => call.method)).toEqual(plan.map(() => "POST"));
    const bodies = calls.map((call) => JSON.parse(call.body ?? "") as Record<string, unknown>);
    expect(bodies).toEqual(
      plan.map((page) => ({
        from: "wiki-supervisor",
        to: page.seatId,
        kind: "handoff",
        wake: true,
        text: `${page.brief}\nrunId: ${sample.runId}\nslug: ${page.slug}`,
      })),
    );
    expect(result.runData["Send Handoff"]?.items?.[0]).toHaveLength(plan.length);
  });

  it("resolves the docs-build-complete URL through the runner", async () => {
    const { workflow } = loadWorkflow("docs-build-complete.json");
    const sample = {
      owner: "acme",
      repo: "handbook",
      runId: "run-42",
      status: "success",
      wikiUrl: "https://wiki.example",
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
      pinData: { Webhook: [{ json: sample }] },
      startNode: "Webhook",
    });

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://wiki.example/api/v1/repos/acme/handbook/runs/run-42/complete",
    );
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      owner: "acme",
      repo: "handbook",
      runId: "run-42",
      status: "success",
    });
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
  });
});
