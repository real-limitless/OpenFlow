import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { kickoffCommunityTemplateSync, SETUP_TEMPLATE_SOURCE_ID } from "../kickoff-sync";

describe("kickoffCommunityTemplateSync", () => {
  it("fires the n8n-community sync POST and returns before fetch settles", async () => {
    let settled = false;
    const fetchFn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      settled = true;
      return new Response(JSON.stringify({ started: true }), { status: 200 });
    });

    const t0 = Date.now();
    kickoffCommunityTemplateSync(fetchFn as never);
    expect(Date.now() - t0).toBeLessThan(40);
    expect(settled).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/template-sources/sync");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      sourceId: SETUP_TEMPLATE_SOURCE_ID,
    });

    await vi.waitFor(() => expect(settled).toBe(true));
  });

  it("swallows fetch failures so owner setup can still navigate", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(() => kickoffCommunityTemplateSync(fetchFn as never)).not.toThrow();
    await Promise.resolve();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("setup page owner create", () => {
  it("does not await template sync and guards double submit", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../../routes/setup.tsx"),
      "utf8",
    );
    expect(src).toContain("kickoffCommunityTemplateSync");
    expect(src).toContain("submittingRef");
    expect(src).not.toMatch(/await\s+apiFetch\s*\(/);
    expect(src).not.toMatch(/<input\s+[^>]*type="checkbox"/);
  });
});
