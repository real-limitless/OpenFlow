import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.securityScorecard";
const CRED = { securityScorecardApi: { apiKey: "test-key" } };

function mockJsonResponse(body: unknown) {
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: {
      get: () => "application/json",
      entries: () => new Map(),
      forEach: (fn: (v: string, k: string) => void) => {
        fn("application/json", "content-type");
      },
    },
    text: async () => JSON.stringify(body),
    async json() { return body; },
  };
}

function mockNotFoundResponse() {
  return {
    status: 404,
    statusText: "Not Found",
    ok: false,
    headers: {
      get: () => "text/plain",
      entries: () => new Map(),
      forEach: (_fn: unknown) => {},
    },
    text: async () => "Not Found",
    async json() { return null; },
  };
}

let calls: Array<{ url: string; init?: RequestInit }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = String(url).split("?")[0];
      calls.push({ url: String(url), init });
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      return mockNotFoundResponse();
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue SecurityScorecard — n8n-nodes-base.securityScorecard", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("SecurityScorecard");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.securityScorecard")).toBe(canonical);
  });

  it("company getScorecard calls correct endpoint", async () => {
    const fakeBody = { name: "Example Inc", score: 85, grade: "A" };
    installFetch({ "https://api.securityscorecard.io/companies/example.com": fakeBody });
    const out = await runNode(TYPE, { resource: "company", operation: "getScorecard", scorecardIdentifier: "example.com" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.score).toBe(85);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.securityscorecard.io/companies/example.com");
  });

  it("company getFactor with pagination returns truncated entries", async () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({ factor: `F${i}`, score: i }));
    const fakeBody = { entries };
    installFetch({ "https://api.securityscorecard.io/companies/example.com/factors": fakeBody });
    const out = await runNode(TYPE, { resource: "company", operation: "getFactor", scorecardIdentifier: "example.com", returnAll: false, limit: 10 }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(10);
    expect(out[0][0].json.factor).toBe("F0");
    expect(out[0][9].json.factor).toBe("F9");
  });

  it("portfolio create sends correct POST body", async () => {
    const fakeBody = { id: "pf-123", name: "My Portfolio", privacy: "private" };
    installFetch({ "https://api.securityscorecard.io/portfolios": fakeBody });
    const out = await runNode(TYPE, { resource: "portfolio", operation: "create", name: "My Portfolio", description: "Test portfolio", privacy: "private" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("pf-123");
    expect(calls).toHaveLength(1);
    const init = calls[0].init;
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.name).toBe("My Portfolio");
    expect(body.description).toBe("Test portfolio");
    expect(body.privacy).toBe("private");
  });

  it("invite create with additional fields", async () => {
    const fakeBody = { id: "inv-1", email: "user@example.com" };
    installFetch({ "https://api.securityscorecard.io/invitations": fakeBody });
    const out = await runNode(TYPE, {
      resource: "invite",
      operation: "create",
      email: "user@example.com",
      firstName: "John",
      lastName: "Doe",
      message: "Join our scorecard",
      additionalFields: { domain: "example.com", sendme_copy: true },
    }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("inv-1");
    const init = calls[0].init;
    const body = JSON.parse(init?.body as string);
    expect(body.email).toBe("user@example.com");
    expect(body.first_name).toBe("John");
    expect(body.last_name).toBe("Doe");
    expect(body.domain).toBe("example.com");
    expect(body.sendme_copy).toBe(true);
  });

  it("industry getScore calls correct endpoint", async () => {
    const fakeBody = { industry: "technology", score: 78 };
    installFetch({ "https://api.securityscorecard.io/industries/technology/score": fakeBody });
    const out = await runNode(TYPE, { resource: "industry", operation: "getScore", industry: "technology" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.score).toBe(78);
  });

  it("portfolio delete returns success", async () => {
    installFetch({ "https://api.securityscorecard.io/portfolios/pf-123": null });
    const out = await runNode(TYPE, { resource: "portfolio", operation: "delete", portfolioId: "pf-123" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.success).toBe(true);
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("report generate with detailed report type", async () => {
    const fakeBody = { url: "https://api.securityscorecard.io/reports/rpt-123/download" };
    installFetch({ "https://api.securityscorecard.io/reports/detailed": fakeBody });
    const out = await runNode(TYPE, { resource: "report", operation: "generate", report: "detailed", scorecardIdentifier: "example.com" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.url).toBeTruthy();
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.scorecard_identifier).toBe("example.com");
  });

  it("missing credential throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "company", operation: "getScorecard", scorecardIdentifier: "example.com" }, [{}], { credentials: {} }),
    ).rejects.toThrow(/Credential/);
  });

  it("continueOnFail with bad request yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "company", operation: "getScorecard", scorecardIdentifier: "bad.example.com" },
      [{}],
      { continueOnFail: true, credentials: CRED },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeBody = { name: "Example", score: 80 };
    installFetch({ "https://api.securityscorecard.io/companies/example.com": fakeBody });
    const out = await runNode(TYPE, { resource: "company", operation: "getScorecard", scorecardIdentifier: "example.com" }, [{}, {}], { credentials: CRED });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.score).toBe(80);
    expect(out[0][1].json.score).toBe(80);
    expect(calls).toHaveLength(2);
  });

  it("company getFactor passes severity and severity_in query params", async () => {
    const entries = [{ factor: "F1", score: 85 }];
    installFetch({ "https://api.securityscorecard.io/companies/example.com/factors": { entries } });
    const out = await runNode(TYPE, { resource: "company", operation: "getFactor", scorecardIdentifier: "example.com", filters: { severity: "high", severity_in: "critical,high" }, returnAll: true }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.securityscorecard.io/companies/example.com/factors?severity=high&severity_in=critical%2Chigh");
  });

  it("company getScorePlan expands entries into individual items", async () => {
    const entries = [{ action: "Fix DNS", impact: 5 }, { action: "Upgrade TLS", impact: 3 }];
    const fakeBody = { entries };
    installFetch({ "https://api.securityscorecard.io/companies/example.com/score-plans/by-target/90": fakeBody });
    const out = await runNode(TYPE, { resource: "company", operation: "getScorePlan", scorecardIdentifier: "example.com", score: 90, returnAll: true }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.action).toBe("Fix DNS");
    expect(out[0][1].json.action).toBe("Upgrade TLS");
  });

  it("company getScorePlan with limit truncates entries", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ action: `A${i}`, impact: i }));
    const fakeBody = { entries };
    installFetch({ "https://api.securityscorecard.io/companies/example.com/score-plans/by-target/90": fakeBody });
    const out = await runNode(TYPE, { resource: "company", operation: "getScorePlan", scorecardIdentifier: "example.com", score: 90, returnAll: false, limit: 5 }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(5);
  });

  it("report download sets binary data", async () => {
    const binaryContent = "fake-pdf-content";
    const binaryBuffer = Buffer.from(binaryContent, "utf-8");
    const blobUrl = "https://api.securityscorecard.io/reports/rpt-123/download";
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return {
          status: 200,
          ok: true,
          headers: {
            get: (h: string) => h === "content-type" ? "application/pdf" : 'attachment; filename="report.pdf"',
            forEach: (fn: (v: string, k: string) => void) => {
              fn("application/pdf", "content-type");
              fn('attachment; filename="report.pdf"', "content-disposition");
            },
            entries: () => new Map(),
          },
          arrayBuffer: async () => new Uint8Array(binaryBuffer).buffer,
        };
      }),
    );
    const out = await runNode(TYPE, { resource: "report", operation: "download", url: blobUrl, binaryPropertyName: "reportData" }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.reportData.mimeType).toBe("application/pdf");
    expect(out[0][0].binary!.reportData.fileName).toBe("report.pdf");
    expect(out[0][0].binary!.reportData.data).toBe(binaryBuffer.toString("base64"));
  });

  it("industry getFactor expands entries into individual items", async () => {
    const entries = [{ factor: "A", score: 90 }, { factor: "B", score: 80 }];
    installFetch({ "https://api.securityscorecard.io/industries/technology/factors": { entries } });
    const out = await runNode(TYPE, { resource: "industry", operation: "getFactor", industry: "technology", returnAll: true }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.factor).toBe("A");
  });

  it("portfolio getAll expands entries", async () => {
    const entries = [{ id: "p1", name: "Port1" }, { id: "p2", name: "Port2" }];
    installFetch({ "https://api.securityscorecard.io/portfolios": { entries } });
    const out = await runNode(TYPE, { resource: "portfolio", operation: "getAll", returnAll: true }, [{}], { credentials: CRED });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("p1");
    expect(out[0][1].json.id).toBe("p2");
  });

  it("multi-item report download produces one item per input with one fetch", async () => {
    const binaryContent = "binary-data";
    const binaryBuffer = Buffer.from(binaryContent, "utf-8");
    const blobUrl = "https://api.securityscorecard.io/reports/rpt-456/download";
    calls = [];
    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        fetchCount++;
        return {
          status: 200,
          ok: true,
          headers: {
            get: (h: string) => h === "content-type" ? "application/pdf" : 'attachment; filename="report.pdf"',
            forEach: (fn: (v: string, k: string) => void) => {
              fn("application/pdf", "content-type");
              fn('attachment; filename="report.pdf"', "content-disposition");
            },
            entries: () => new Map(),
          },
          arrayBuffer: async () => new Uint8Array(binaryBuffer).buffer,
        };
      }),
    );
    const out = await runNode(TYPE, { resource: "report", operation: "download", url: blobUrl, binaryPropertyName: "reportData" }, [{}, {}], { credentials: CRED });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!.reportData.mimeType).toBe("application/pdf");
    expect(out[0][1].binary).toBeDefined();
    expect(out[0][1].binary!.reportData.mimeType).toBe("application/pdf");
    expect(fetchCount).toBe(2);
  });
});