import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.Brandfetch";

function mockBrandResponse(overrides: Record<string, unknown> = {}) {
  return {
    name: "n8n",
    description: "Workflow automation platform",
    links: ["https://n8n.io"],
    social: { linkedin: "https://linkedin.com/company/n8n", twitter: "https://twitter.com/n8n_io" },
    colors: [
      { hex: "#EA4B4B", type: "primary" },
      { hex: "#2D2D2D", type: "secondary" },
      { hex: "#FFFFFF", type: "accent" },
    ],
    fonts: [
      { name: "Inter", type: "sans-serif", cssUrl: "https://fonts.googleapis.com/css2?family=Inter" },
    ],
    company: {
      industries: [{ name: "Computer Software" }],
    },
    logos: [
      {
        type: "logo",
        formats: [
          { src: "https://brandfetch.io/n8n/logo.png", format: "png" },
          { src: "https://brandfetch.io/n8n/logo.svg", format: "svg" },
        ],
      },
      {
        type: "icon",
        formats: [
          { src: "https://brandfetch.io/n8n/icon.png", format: "png" },
        ],
      },
    ],
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      if (key.startsWith("https://brandfetch.io")) {
        return mockJsonResponse(null, 200);
      }
      if (key.includes("brandfetch.io")) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(null, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue Brandfetch — n8n-nodes-base.Brandfetch", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Brandfetch");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.Brandfetch")).toBe(canonical);
  });

  it("company operation returns full brand data", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "company", domain: "n8n.io" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("n8n");
    expect(out[0][0].json.description).toBe("Workflow automation platform");
    expect(calls).toHaveLength(1);
  });

  it("color operation returns colors array", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "color", domain: "n8n.io" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.colors).toBeInstanceOf(Array);
    expect(out[0][0].json.colors).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("font operation returns fonts", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "font", domain: "n8n.io" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.fonts).toBeInstanceOf(Array);
    expect(out[0][0].json.fonts).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("industry operation returns industry string", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "industry", domain: "n8n.io" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.industry).toBe("Computer Software");
    expect(calls).toHaveLength(1);
  });

  it("logo operation returns URLs without download", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "logo", domain: "n8n.io", download: false }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.logo).toBeInstanceOf(Array);
    expect(out[0][0].json.icon).toBeInstanceOf(Array);
    expect(out[0][0].binary).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("logo download produces binary attachments", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(
      TYPE,
      {
        operation: "logo",
        domain: "n8n.io",
        download: true,
        imageTypes: ["logo", "icon"],
        imageFormats: ["png", "svg"],
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!["logo_png"]).toBeDefined();
    expect(out[0][0].binary!["icon_png"]).toBeDefined();
    expect(out[0][0].binary!["logo_svg"]).toBeDefined();
    expect(out[0][0].binary!["logo_png"].mimeType).toBe("image/png");
    expect(out[0][0].binary!["logo_svg"].mimeType).toBe("image/svg+xml");
  });

  it("missing domain throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { operation: "company", domain: "" }, [{}]),
    ).rejects.toThrow(/domain is required/i);
  });

  it("continueOnFail with bad domain yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { operation: "company", domain: "invalid.example.com", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeBody = mockBrandResponse();
    installFetch({
      "https://api.brandfetch.io/v2/brands/n8n.io": fakeBody,
    });
    const out = await runNode(TYPE, { operation: "company", domain: "n8n.io" }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("n8n");
    expect(out[0][1].json.name).toBe("n8n");
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { operation: "company", domain: "nonexistent.io" }, [{}]),
    ).rejects.toThrow(/HTTP 404/);
  });
});
