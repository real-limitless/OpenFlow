import { describe, it, expect, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNodeWithCtx, runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.totp";
const TEST_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function makeTotpCtx(
  items: Array<Record<string, unknown>> = [],
  parameters: Record<string, unknown> = {},
  credential: unknown = { secret: TEST_SECRET, label: "test:user" },
) {
  const node = makeNode({ name: "TOTP", type: TYPE, parameters });
  const normalized = items.map((item) => ({ json: item }));
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail: false,
    getCredential: async (_name: string) => credential,
  });
}

describe("batch-queue totp — n8n-nodes-base.totp", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("TOTP");
  });

  it("generates a 6-digit TOTP code with default parameters", async () => {
    const ctx = makeTotpCtx([{ userId: 1 }]);
    const map = getExecutor("n8n-nodes-base.totp");
    const out = await map!(ctx, makeNode({ type: TYPE, parameters: {} }));
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.totpCode).toMatch(/^\d{6}$/);
    expect(out[0][0].json.userId).toBe(1);
  });

  it("generates an 8-digit code with SHA256", async () => {
    const ctx = makeTotpCtx([{}], { algorithm: "SHA256", digits: 8 });
    const map = getExecutor(TYPE);
    const out = await map!(ctx, makeNode({ type: TYPE, parameters: { algorithm: "SHA256", digits: 8 } }));
    expect(out[0][0].json.totpCode).toMatch(/^\d{8}$/);
  });

  it("generates a code with custom period of 60s", async () => {
    const ctx = makeTotpCtx([{}], { period: 60 });
    const map = getExecutor(TYPE);
    const out = await map!(ctx, makeNode({ type: TYPE, parameters: { period: 60 } }));
    expect(out[0][0].json.totpCode).toMatch(/^\d{6}$/);
  });

  it("throws an error when no credential is configured", async () => {
    await expect(
      runNodeWithCtx(TYPE, {}, [{}], { continueOnFail: false }),
    ).rejects.toThrow("TOTP credential is required");
  });

  it("passes through multiple items with shared TOTP code", async () => {
    const ctx = makeTotpCtx([{ userId: 1 }, { userId: 2 }]);
    const map = getExecutor(TYPE);
    const out = await map!(ctx, makeNode({ type: TYPE, parameters: {} }));
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.totpCode).toBe(out[0][1].json.totpCode);
    expect(out[0][0].json.userId).toBe(1);
    expect(out[0][1].json.userId).toBe(2);
  });

  it("uses different codes for different algorithms with same secret", async () => {
    const ctx1 = makeTotpCtx([{}], { algorithm: "SHA1" });
    const ctx2 = makeTotpCtx([{}], { algorithm: "SHA256" });
    const map = getExecutor(TYPE);
    const out1 = await map!(ctx1, makeNode({ type: TYPE, parameters: { algorithm: "SHA1" } }));
    const out2 = await map!(ctx2, makeNode({ type: TYPE, parameters: { algorithm: "SHA256" } }));
    expect(out1[0][0].json.totpCode).not.toBe(out2[0][0].json.totpCode);
  });

  it("rejects invalid algorithm", async () => {
    const ctx = makeTotpCtx([{}], { algorithm: "MD5" });
    const map = getExecutor(TYPE);
    await expect(map!(ctx, makeNode({ type: TYPE, parameters: { algorithm: "MD5" } }))).rejects.toThrow(
      'Invalid algorithm "MD5"',
    );
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.totp")).toBe(canonical);
  });
});