import { describe, it, expect, beforeEach, vi } from "vitest";
import { sdkHttpRequest } from "@/sdk/helpers/http";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.spotify";
const BEARER = "test-spotify-token";

function makeSpotifyCtx(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): ExecutionContext {
  const node = makeNode({ name: "N", type: TYPE, parameters: params });
  const normalized: INodeExecutionData[] = inputItems.map((item) => ({ json: item }));
  return createExecutionContext({
    node,
    workflow: { id: "wf-test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => normalized,
    continueOnFail,
    getCredential: async (_name: string) => ({ accessToken: BEARER }),
  });
}

function mockFetchOk(body: unknown) {
  const text = JSON.stringify(body);
  const headerMap = new Map([["content-type", "application/json"]]);
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: {
      forEach(cb: (v: string, k: string) => void) { headerMap.forEach((v, k) => cb(v, k)); },
      get(name: string) { return headerMap.get(name.toLowerCase()) ?? null; },
    },
    text() { return Promise.resolve(text); },
    json() { return Promise.resolve(JSON.parse(text)); },
  };
}

function mockFetch204() {
  const headerMap = new Map([["content-type", "application/json"]]);
  return {
    status: 204,
    statusText: "No Content",
    ok: true,
    headers: {
      forEach(cb: (v: string, k: string) => void) { headerMap.forEach((v, k) => cb(v, k)); },
      get(name: string) { return headerMap.get(name.toLowerCase()) ?? null; },
    },
    text() { return Promise.resolve(""); },
    json() { return Promise.resolve({}); },
  };
}

describe("n8n-nodes-base.spotify", () => {
  let executor: ReturnType<typeof getExecutor>;

  beforeEach(() => {
    vi.restoreAllMocks();
    executor = getExecutor(TYPE);
  });

  it("should register the spotify executor", () => {
    expect(executor).toBeDefined();
  });

  describe("credential error", () => {
    it("should throw when no credential is configured", async () => {
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "player", operation: "pause" } });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "wf-test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      await expect(executor!(ctx, node)).rejects.toThrow(/credential/);
    });
  });

  describe("album get", () => {
    it("should call GET /albums/{id} and return the API body", async () => {
      const mockAlbum = { album_type: "album", id: "1YZ3k65Mqw3G8FzYlW1mmp", name: "Test Album" };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mockAlbum));
      const ctx = makeSpotifyCtx({ resource: "album", operation: "get", id: "spotify:album:1YZ3k65Mqw3G8FzYlW1mmp" });
      const out = await executor!(ctx, ctx.node);
      expect(out[0][0].json).toMatchObject({ album_type: "album", id: "1YZ3k65Mqw3G8FzYlW1mmp" });
    });
  });

  describe("search artists", () => {
    it("should call search with type=artist and q=Radiohead", async () => {
      const mockSearch = { artists: { items: [{ id: "1", name: "Radiohead" }], next: null } };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mockSearch));
      const ctx = makeSpotifyCtx({ resource: "artist", operation: "search", query: "Radiohead" });
      const out = await executor!(ctx, ctx.node);
      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const url = fetchCalls[0][0] as string;
      expect(url).toContain("/search");
      expect(url).toContain("type=artist");
      expect(url).toContain("q=Radiohead");
      expect(out[0][0].json).toBeDefined();
    });
  });

  describe("player pause", () => {
    it("should call PUT /me/player/pause", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetch204());
      const ctx = makeSpotifyCtx({ resource: "player", operation: "pause" });
      const out = await executor!(ctx, ctx.node);
      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const call = fetchCalls.find((c: unknown[]) => {
        const reqInit = c[1] as RequestInit;
        return reqInit?.method === "PUT" || (c[0] as string).includes("pause");
      });
      expect(call).toBeTruthy();
      if (call) expect(call[0]).toContain("/me/player/pause");
      expect(out[0][0].json).toEqual({});
    });
  });

  describe("create playlist", () => {
    it("should GET /me then POST /users/{userId}/playlists", async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(mockFetchOk({ id: "user123", display_name: "Test User" }))
        .mockResolvedValueOnce(mockFetchOk({ id: "pl123", name: "My Test Playlist", owner: { id: "user123" }, public: true }));
      const ctx = makeSpotifyCtx({ resource: "playlist", operation: "create", name: "My Test Playlist" });
      const out = await executor!(ctx, ctx.node);
      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(fetchCalls[0][0]).toContain("/me");
      expect(fetchCalls[1][0]).toContain("/users/user123/playlists");
      expect(out[0][0].json).toMatchObject({ id: "pl123", name: "My Test Playlist" });
    });
  });

  describe("get audio features", () => {
    it("should call GET /audio-features/{id}", async () => {
      const mockFeatures = { danceability: 0.8, energy: 0.9, tempo: 120, key: 2 };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mockFeatures));
      const ctx = makeSpotifyCtx({ resource: "track", operation: "getAudioFeatures", id: "spotify:track:0xE4LEFzSNGsz1F6kvXsHU" });
      const out = await executor!(ctx, ctx.node);
      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(fetchCalls[0][0]).toContain("/audio-features/0xE4LEFzSNGsz1F6kvXsHU");
      expect(out[0][0].json).toMatchObject({ danceability: 0.8, energy: 0.9 });
    });
  });
});
