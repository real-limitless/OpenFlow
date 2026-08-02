import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.linkedIn";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get: () => "application/json",
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(responses: Array<ReturnType<typeof mockResponse>>) {
  let idx = 0;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return responses[idx++] ?? responses[responses.length - 1];
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { linkedInOAuth2Api: { accessToken: "mock-token" } };

beforeEach(() => {
  installFetch([mockResponse({ id: "urn:li:ugcPost:abc123" })]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue linkedin — n8n-nodes-base.linkedIn", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("LinkedIn");
  });

  it("creates a text-only post as a person", async () => {
    const out = await run({
      postAs: "Person",
      person: "urn:li:person:abcdefg",
      text: "Hello from OpenFlow",
      mediaCategory: "None",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.linkedin.com/v2/ugcPosts");
    expect(calls[0].headers["Authorization"]).toBe("Bearer mock-token");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.author).toBe("urn:li:person:abcdefg");
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toBe("Hello from OpenFlow");
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("NONE");
    expect(out[0][0].json).toMatchObject({ id: "urn:li:ugcPost:abc123" });
  });

  it("creates a text-only post as an organization", async () => {
    const out = await run({
      postAs: "Organization",
      organization: "03262013",
      text: "Company announcement",
      mediaCategory: "None",
    });

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.author).toBe("urn:li:organization:03262013");
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toBe("Company announcement");
    expect(out[0][0].json).toMatchObject({ id: "urn:li:ugcPost:abc123" });
  });

  it("creates a post with an article URL", async () => {
    const out = await run({
      postAs: "Person",
      person: "urn:li:person:abcdefg",
      text: "https://example.com/article",
      mediaCategory: "Article",
      additionalFields: { description: "Summary of the article" },
    });

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("ARTICLE");
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].originalUrl).toBe("https://example.com/article");
    expect(sentBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].description.text).toBe("Summary of the article");
    expect(out[0][0].json).toMatchObject({ id: "urn:li:ugcPost:abc123" });
  });

  it("creates a post with an image", async () => {
    installFetch([
      mockResponse({
        value: {
          uploadUrl: "https://upload.linkedin.com/image",
          image: "urn:li:image:img456",
        },
      }),
      mockResponse({}),
      mockResponse({ id: "urn:li:ugcPost:imgpost789" }),
    ]);

    const out = await run(
      {
        postAs: "Person",
        person: "urn:li:person:abcdefg",
        text: "Check out this image",
        mediaCategory: "Image",
        binaryPropertyName: "photo",
      },
      [
        {
          json: {},
          binary: {
            photo: { data: btoa("fake-image-data"), mimeType: "image/png", fileName: "banner.png" },
          },
        },
      ],
    );

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain("rest/images?action=initializeUpload");
    expect(calls[1].url).toBe("https://upload.linkedin.com/image");
    expect(calls[2].url).toContain("/ugcPosts");
    const postBody = JSON.parse(calls[2].body as string);
    expect(postBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("IMAGE");
    expect(postBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].media).toBe("urn:li:image:img456");
    expect(out[0][0].json).toMatchObject({ id: "urn:li:ugcPost:imgpost789" });
  });

  it("throws when person identifier is missing", async () => {
    await expect(
      run({
        postAs: "Person",
        text: "Missing author",
        mediaCategory: "None",
      }),
    ).rejects.toThrow(/person identifier is required/);
  });

  it("throws when organization identifier is missing", async () => {
    await expect(
      run({
        postAs: "Organization",
        text: "Missing org",
        mediaCategory: "None",
      }),
    ).rejects.toThrow(/organization identifier is required/);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          postAs: "Person",
          person: "urn:li:person:test",
          text: "No creds",
          mediaCategory: "None",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/linkedInOAuth2Api credential is not configured/);
  });

  it("throws on API error", async () => {
    installFetch([mockResponse({ message: "Unauthorized" }, 401)]);
    await expect(
      run({
        postAs: "Person",
        person: "urn:li:person:test",
        text: "Fail",
        mediaCategory: "None",
      }),
    ).rejects.toThrow(/LinkedIn API error/);
  });

  it("continueOnFail produces error item on API failure", async () => {
    installFetch([mockResponse({ message: "Unauthorized" }, 401)]);
    const out = await run(
      {
        postAs: "Person",
        person: "urn:li:person:test",
        text: "Fail",
        mediaCategory: "None",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("LinkedIn API error");
  });

  it("uses Community Management API endpoint", async () => {
    const communityCreds = { linkedInCommunityManagementOAuth2Api: { accessToken: "cm-token" } };
    const out = await run(
      {
        authentication: "Community Management",
        postAs: "Person",
        person: "urn:li:person:test",
        text: "CM post",
        mediaCategory: "None",
      },
      [{}],
      { credentials: communityCreds },
    );

    expect(calls[0].url).toBe("https://api.linkedin.com/v2/communityManagement/ugcPosts");
    expect(calls[0].headers["Authorization"]).toBe("Bearer cm-token");
    expect(out[0][0].json).toMatchObject({ id: "urn:li:ugcPost:abc123" });
  });

  it("throws on missing binary property for image posts", async () => {
    await expect(
      run(
        {
          postAs: "Person",
          person: "urn:li:person:test",
          text: "Image missing",
          mediaCategory: "Image",
          binaryPropertyName: "photo",
        },
        [{}],
      ),
    ).rejects.toThrow(/binary property "photo" not found/);
  });
});
