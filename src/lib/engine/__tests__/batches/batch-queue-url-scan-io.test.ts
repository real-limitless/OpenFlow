import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runNode, assertExecutorRegistered } from "../helpers";

describe("n8n-nodes-base.urlScanIo", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, _init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/v1/scan/")) {
        return new Response(
          JSON.stringify({
            uuid: "0e37e828-a9d9-45c0-ac50-1ca579b86c72",
            result: "https://urlscan.io/result/0e37e828-a9d9-45c0-ac50-1ca579b86c72/",
            api: "https://urlscan.io/api/v1/result/0e37e828-a9d9-45c0-ac50-1ca579b86c72/",
            visibility: "private",
            url: "https://example.com",
            message: "Submission successful",
            options: { useragent: "curl/7.54" },
            country: "US",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/result/")) {
        if (url.includes("00000000-0000")) {
          return new Response(JSON.stringify({ message: "Scan not found" }), { status: 404 });
        }
        return new Response(
          JSON.stringify({
            scanId: "0e37e828-a9d9-45c0-ac50-1ca579b86c72",
            task: { url: "https://example.com", method: "api" },
            page: { url: "https://example.com" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/search/")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                _id: "abc123",
                sort: [1],
                page: { url: "https://example.com" },
                task: { url: "https://example.com" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered", () => {
    assertExecutorRegistered("n8n-nodes-base.urlScanIo");
  });

  it("should submit a URL for scanning (Perform)", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.urlScanIo",
      {
        resource: "Scan",
        operation: "Perform",
        url: "={{ $json.targetUrl }}",
        apiKey: "test-key",
      },
      [{ targetUrl: "https://example.com" }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("uuid");
    expect(output[0].json).toHaveProperty("message", "Submission successful");
    expect(output[0].json).toHaveProperty("result");
    expect(typeof (output[0].json as Record<string, unknown>).uuid).toBe("string");
  });

  it("should retrieve a completed scan by ID (Get)", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.urlScanIo",
      {
        resource: "Scan",
        operation: "Get",
        scanId: "={{ $json.scanUuid }}",
        apiKey: "test-key",
      },
      [{ scanUuid: "0e37e828-a9d9-45c0-ac50-1ca579b86c72" }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("scanId");
    expect(output[0].json).toHaveProperty("task");
    expect((output[0].json as Record<string, unknown>).task as Record<string, unknown>).toHaveProperty("url");
  });

  it("should search scans with a query (Get All)", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.urlScanIo",
      {
        resource: "Scan",
        operation: "Get All",
        filters: { query: "={{ $json.query }}" },
        returnAll: false,
        limit: 10,
        apiKey: "test-key",
      },
      [{ query: "domain:example.com" }],
    );

    expect(output).toHaveLength(1);
    const results = (output[0].json as Record<string, unknown>).results as unknown[];
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(10);
    if (results.length > 0) {
      const first = results[0] as Record<string, unknown>;
      expect(first).toHaveProperty("_id");
      expect(first).toHaveProperty("task");
    }
  });

  it("should handle continue on fail with invalid scan ID", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.urlScanIo",
      {
        resource: "Scan",
        operation: "Get",
        scanId: "00000000-0000-0000-0000-000000000000",
        apiKey: "test-key",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("error");
  });
});
