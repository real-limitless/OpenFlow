import { describe, it, expect, vi } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import {
  getExecutor,
  hasExecutor,
} from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.npmTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() {
        return "application/json";
      },
      entries() {
        return new Map([["content-type", "application/json"]]).entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credential?: Record<string, unknown> | null,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items: INodeExecutionData[] = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  const ctx = createExecutionContext({
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
    continueOnFail: false,
    getCredential: async () => credential ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

describe("batch-queue n8n-nodes-base.npmTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("npm (AI Tool)");
  });

  it("package getMetadata: returns package metadata", async () => {
    const body = {
      name: "lodash",
      "dist-tags": { latest: "4.17.21" },
      versions: { "4.17.21": { version: "4.17.21" } },
      time: { "4.17.21": "2021-02-20T08:00:00.000Z" },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(body)));
    const [out] = await runTool({
      resource: "package",
      operation: "getMetadata",
      packageName: "lodash",
    });
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).name).toBe("lodash");
    expect((out[0].json as Record<string, unknown>)["dist-tags"]).toBeDefined();
    expect((out[0].json as Record<string, unknown>).versions).toBeDefined();
    expect((out[0].json as Record<string, unknown>).time).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("package getVersions: uses abbreviated accept header", async () => {
    const body = {
      name: "lodash",
      modified: "2024-01-01",
      versions: { "4.17.21": { version: "4.17.21" } },
    };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const [out] = await runTool({
      resource: "package",
      operation: "getVersions",
      packageName: "lodash",
    });
    expect(out).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/lodash");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["accept"]).toBe(
      "application/vnd.npm.install-v1+json",
    );
    vi.unstubAllGlobals();
  });

  it("package search: returns search result shape", async () => {
    const body = {
      objects: [{ package: { name: "react" } }],
      total: 1,
      time: "2024-01-01",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(body)));
    const [out] = await runTool({
      resource: "package",
      operation: "search",
      packageName: "react",
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(Array.isArray(json.objects)).toBe(true);
    expect(
      (json.objects as Array<Record<string, unknown>>)[0].package.name,
    ).toBe("react");
    expect(json.total).toBe(1);
    vi.unstubAllGlobals();
  });

  it("distTag getAll: returns tag map", async () => {
    const body = { latest: "4.17.21", beta: "5.0.0" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(body)));
    const [out] = await runTool({
      resource: "distTag",
      operation: "getAll",
      packageName: "lodash",
    });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.latest).toBe("4.17.21");
    expect(json.beta).toBe("5.0.0");
    vi.unstubAllGlobals();
  });

  it("distTag update: sends PUT with body and auth", async () => {
    const body = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const credential = {
      npmApi: { accessToken: "npm_secret_token", registryUrl: "https://registry.npmjs.org" },
    };
    const [out] = await runTool(
      {
        resource: "distTag",
        operation: "update",
        packageName: "lodash",
        distTag: "latest",
        distVersion: "4.17.21",
      },
      [{}],
      credential.npmApi,
    );
    expect(out).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/-/package/lodash/dist-tags/latest");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.body).toBe("4.17.21");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer npm_secret_token");
    expect(headers["content-type"]).toBe("application/json");
    vi.unstubAllGlobals();
  });

  it("uses credential registryUrl and Authorization header when present", async () => {
    const body = { name: "private-pkg" };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const credential = {
      npmApi: { accessToken: "my_token", registryUrl: "https://registry.example.com/" },
    };
    const [out] = await runTool(
      { resource: "package", operation: "getMetadata", packageName: "private-pkg" },
      [{}],
      credential.npmApi,
    );
    expect(out).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://registry.example.com/private-pkg");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my_token");
    vi.unstubAllGlobals();
  });

  it("public read ops work without credentials", async () => {
    const body = { name: "public-pkg" };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const [out] = await runTool({
      resource: "package",
      operation: "getMetadata",
      packageName: "public-pkg",
    });
    expect(out).toHaveLength(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("strips trailing slash from registry base", async () => {
    const body = { name: "pkg" };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const credential = {
      npmApi: { accessToken: "tok", registryUrl: "https://custom.registry.com///" },
    };
    await runTool(
      { resource: "package", operation: "getMetadata", packageName: "pkg" },
      [{}],
      credential.npmApi,
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://custom.registry.com/pkg");
    vi.unstubAllGlobals();
  });

  it("throws on missing packageName", async () => {
    await expect(
      runTool({
        resource: "package",
        operation: "getMetadata",
        packageName: "",
      }),
    ).rejects.toThrow("packageName is required");
  });
});
