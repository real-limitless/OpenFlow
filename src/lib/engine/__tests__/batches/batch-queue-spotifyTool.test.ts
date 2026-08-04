import { describe, it, expect, beforeEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, getExecutorMap } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.spotifyTool";
const BEARER = "test-spotify-token";

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

function makeToolCtx(
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

describe("n8n-nodes-base.spotifyTool", () => {
  let executor: ReturnType<typeof getExecutor>;

  beforeEach(() => {
    vi.restoreAllMocks();
    executor = getExecutor(TYPE);
  });

  it("should register the spotifyTool executor", () => {
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

  describe("search for an artist", () => {
    it("should call /search with type=artist and return results", async () => {
      const mockSearch = { artists: { items: [{ id: "1", name: "Radiohead" }], next: null } };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mockSearch));
      const ctx = makeToolCtx({ resource: "artist", operation: "search", query: "Radiohead" });
      const out = await executor!(ctx, ctx.node);
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("/search");
      expect(calls[0][0]).toContain("type=artist");
      expect(calls[0][0]).toContain("q=Radiohead");
      expect(out[0][0].json).toBeDefined();
    });
  });

  describe("add song to queue", () => {
    it("should POST /me/player/queue with track URI", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetch204());
      const ctx = makeToolCtx({ resource: "player", operation: "addSongToQueue", id: "spotify:track:0xE4LEFzSNGsz1F6kvXsHU" });
      const out = await executor!(ctx, ctx.node);
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("/me/player/queue");
      expect(calls[0][0]).toContain("uri=spotify%3Atrack%3A0xE4LEFzSNGsz1F6kvXsHU");
      expect(out[0][0].json).toEqual({});
    });
  });

  describe("get currently playing track", () => {
    it("should GET /me/player/currently-playing", async () => {
      const mock = { device: { id: "abc" }, item: { id: "track1", name: "Test Song" } };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mock));
      const ctx = makeToolCtx({ resource: "player", operation: "currentlyPlaying" });
      const out = await executor!(ctx, ctx.node);
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("/me/player/currently-playing");
      expect(out[0][0].json).toMatchObject({ device: { id: "abc" }, item: { id: "track1" } });
    });
  });

  describe("create a playlist", () => {
    it("should GET /me then POST /users/{userId}/playlists", async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(mockFetchOk({ id: "user123", display_name: "Test User" }))
        .mockResolvedValueOnce(mockFetchOk({ id: "pl1", name: "AI Playlist", owner: { id: "user123" }, public: true }));
      const ctx = makeToolCtx({ resource: "playlist", operation: "create", name: "AI Playlist" });
      const out = await executor!(ctx, ctx.node);
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("/me");
      expect(calls[1][0]).toContain("/users/user123/playlists");
      expect(out[0][0].json).toMatchObject({ id: "pl1", name: "AI Playlist" });
    });
  });

  describe("get track audio features", () => {
    it("should GET /audio-features/{id}", async () => {
      const mockFeatures = { danceability: 0.8, energy: 0.9, tempo: 120, key: 2 };
      globalThis.fetch = vi.fn().mockResolvedValue(mockFetchOk(mockFeatures));
      const ctx = makeToolCtx({ resource: "track", operation: "getAudioFeatures", id: "spotify:track:0xE4LEFzSNGsz1F6kvXsHU" });
      const out = await executor!(ctx, ctx.node);
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("/audio-features/0xE4LEFzSNGsz1F6kvXsHU");
      expect(out[0][0].json).toMatchObject({ danceability: 0.8, energy: 0.9 });
    });
  });
});
