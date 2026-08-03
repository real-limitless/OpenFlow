import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.spotify.com/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveId(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") {
    const parts = resolved.split(":");
    return parts[parts.length - 1];
  }
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    const v = String((resolved as Record<string, unknown>).value ?? "");
    const parts = v.split(":");
    return parts[parts.length - 1];
  }
  return String(resolved ?? "");
}

function extractUri(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") {
    if (resolved.startsWith("spotify:")) return resolved;
    return `spotify:track:${resolved.split(":").pop()}`;
  }
  return String(resolved ?? "");
}

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("spotifyOAuth2Api");
  const token = cred ? String(cred.accessToken ?? "") : "";
  if (!token) {
    throw new Error("Spotify: spotifyOAuth2Api credential is not configured");
  }
  return token;
}

type SpotifyError = { reason?: string; message?: string };

function extractError(body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as Record<string, unknown>).error as SpotifyError | undefined;
    if (err?.message) return err.message;
    if (err && typeof err === "string") return err as string;
    if (typeof err === "object" && err !== null) return JSON.stringify(err);
    return String((body as Record<string, unknown>).error ?? body);
  }
  return String(body);
}

async function spotifyApiRequest(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const res = await sdkHttpRequest({ method, url: `${API_BASE}${path}`, headers, body, timeoutMs: 30000 });
  if (res.status === 204) return {};
  if (res.status === 404) {
    const b = res.body as Record<string, unknown> ?? {};
    const err = b.error as SpotifyError | undefined;
    if (err?.reason === "NO_ACTIVE_DEVICE") return {};
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Spotify: HTTP ${res.status} - ${extractError(res.body)}`);
  }
  return (res.body as Record<string, unknown>) ?? {};
}

async function spotifyApiRequestRaw(
  method: string,
  path: string,
  token: string,
  reqBody?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const res = await sdkHttpRequest({ method, url: `${API_BASE}${path}`, headers, body: reqBody, timeoutMs: 30000 });
  if (res.status === 204) return {};
  if (res.status === 404) {
    const b = res.body as Record<string, unknown> ?? {};
    const err = b.error as SpotifyError | undefined;
    if (err?.reason === "NO_ACTIVE_DEVICE") return {};
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Spotify: HTTP ${res.status} - ${extractError(res.body)}`);
  }
  return res.body;
}

function getAdditionalFields(node: INode): Record<string, unknown> {
  const af = node.parameters.additionalFields;
  if (af && typeof af === "object" && !Array.isArray(af)) {
    return af as Record<string, unknown>;
  }
  return {};
}

function getFilters(node: INode): Record<string, unknown> {
  const f = node.parameters.filters;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    return f as Record<string, unknown>;
  }
  return {};
}

function shouldReturnAll(node: INode): boolean {
  return node.parameters.returnAll === true;
}

function getLimit(node: INode): number {
  const limit = Number(node.parameters.limit ?? 50);
  return Math.min(Math.max(1, limit), 50);
}

async function collectPaginated(
  path: string,
  token: string,
  returnAll: boolean,
  limit: number,
): Promise<unknown> {
  if (!returnAll) {
    const sep = path.includes("?") ? "&" : "?";
    return spotifyApiRequestRaw("GET", `${path}${sep}limit=${limit}`, token);
  }
  const sep = path.includes("?") ? "&" : "?";
  const items: unknown[] = [];
  let url = `${path}${sep}limit=50`;
  while (url) {
    const result = await sdkHttpRequest({ method: "GET", url: `${API_BASE}${url}`, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeoutMs: 30000 });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Spotify: HTTP ${result.status} - ${extractError(result.body)}`);
    }
    const body = result.body as Record<string, unknown> ?? {};
    if (body.items && Array.isArray(body.items)) {
      for (const item of body.items) {
        items.push(item);
      }
    } else if (body.artists && typeof body.artists === "object") {
      const artistsBody = body.artists as Record<string, unknown>;
      if (artistsBody.items && Array.isArray(artistsBody.items)) {
        for (const item of artistsBody.items) {
          items.push(item);
        }
      }
    } else if (body.albums && typeof body.albums === "object") {
      const albumsBody = body.albums as Record<string, unknown>;
      if (albumsBody.items && Array.isArray(albumsBody.items)) {
        for (const item of albumsBody.items) {
          items.push(item);
        }
      }
    } else if (body.playlists && typeof body.playlists === "object") {
      const playlistsBody = body.playlists as Record<string, unknown>;
      if (playlistsBody.items && Array.isArray(playlistsBody.items)) {
        for (const item of playlistsBody.items) {
          items.push(item);
        }
      }
    } else if (body.tracks && typeof body.tracks === "object") {
      const tracksBody = body.tracks as Record<string, unknown>;
      if (tracksBody.items && Array.isArray(tracksBody.items)) {
        for (const item of tracksBody.items) {
          items.push(item);
        }
      }
    }
    const next = body.next as string | undefined;
    if (next) {
      const nextUrl = new URL(next);
      url = nextUrl.pathname + nextUrl.search;
    } else {
      url = "";
    }
  }
  return items;
}

export const spotifyExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "player");
  const operation = String(node.parameters.operation ?? "addSongToQueue");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r as Record<string, unknown>, pairedItem: { item: idx, input: 0 } });
        }
      } else {
        out.push({ json: (result ?? {}) as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  const token = await getToken(ctx);
  const id = resolveId(node.parameters.id, itemJson);

  switch (resource) {
    case "album":
      return runAlbumOperation(token, node, operation, id, itemJson);
    case "artist":
      return runArtistOperation(token, node, operation, id, itemJson);
    case "library":
      return runLibraryOperation(token, node, operation);
    case "myData":
      return runMyDataOperation(token, node, operation);
    case "player":
      return runPlayerOperation(token, node, operation, id, itemJson);
    case "playlist":
      return runPlaylistOperation(ctx, token, node, operation, id, itemJson);
    case "track":
      return runTrackOperation(token, node, operation, id, itemJson);
    default:
      throw new Error(`Spotify: unknown resource "${resource}"`);
  }
}

/* ---- Album ---- */
async function runAlbumOperation(
  token: string,
  node: INode,
  operation: string,
  id: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "get":
      return spotifyApiRequest("GET", `/albums/${id}`, token);
    case "getNewReleases": {
      const filters = getFilters(node);
      let path = "/browse/new-releases";
      const country = String(filters.country ?? "");
      if (country) path += `?country=${encodeURIComponent(country)}`;
      return spotifyApiRequestRaw("GET", path, token);
    }
    case "getTracks": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(`/albums/${id}/tracks`, token, returnAll, limit);
    }
    case "search": {
      const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
      const filters = getFilters(node);
      let path = `/search?type=album&q=${encodeURIComponent(query)}`;
      const market = String(filters.market ?? "");
      if (market) path += `&market=${encodeURIComponent(market)}`;
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(path, token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown album operation "${operation}"`);
  }
}

/* ---- Artist ---- */
async function runArtistOperation(
  token: string,
  node: INode,
  operation: string,
  id: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "get":
      return spotifyApiRequest("GET", `/artists/${id}`, token);
    case "getAlbums": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(`/artists/${id}/albums`, token, returnAll, limit);
    }
    case "getRelatedArtists":
      return spotifyApiRequest("GET", `/artists/${id}/related-artists`, token);
    case "getTopTracks": {
      const country = String(node.parameters.country ?? "US");
      return spotifyApiRequest("GET", `/artists/${id}/top-tracks?market=${encodeURIComponent(country)}`, token);
    }
    case "search": {
      const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
      const filters = getFilters(node);
      let path = `/search?type=artist&q=${encodeURIComponent(query)}`;
      const market = String(filters.market ?? "");
      if (market) path += `&market=${encodeURIComponent(market)}`;
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(path, token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown artist operation "${operation}"`);
  }
}

/* ---- Library ---- */
async function runLibraryOperation(
  token: string,
  node: INode,
  operation: string,
): Promise<unknown> {
  switch (operation) {
    case "getLikedTracks": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated("/me/tracks", token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown library operation "${operation}"`);
  }
}

/* ---- My Data ---- */
async function runMyDataOperation(
  token: string,
  node: INode,
  operation: string,
): Promise<unknown> {
  switch (operation) {
    case "getFollowingArtists": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated("/me/following?type=artist", token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown myData operation "${operation}"`);
  }
}

/* ---- Player ---- */
async function runPlayerOperation(
  token: string,
  node: INode,
  operation: string,
  id: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "addSongToQueue": {
      const uri = extractUri(node.parameters.id, itemJson);
      return spotifyApiRequest("POST", `/me/player/queue?uri=${encodeURIComponent(uri)}`, token);
    }
    case "currentlyPlaying":
      return spotifyApiRequest("GET", "/me/player/currently-playing", token);
    case "nextSong":
      return spotifyApiRequest("POST", "/me/player/next", token);
    case "pause":
      return spotifyApiRequest("PUT", "/me/player/pause", token);
    case "previousSong":
      return spotifyApiRequest("POST", "/me/player/previous", token);
    case "recentlyPlayed": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated("/me/player/recently-played", token, returnAll, limit);
    }
    case "resume":
      return spotifyApiRequest("PUT", "/me/player/play", token);
    case "volume": {
      const volumePercent = Number(node.parameters.volumePercent ?? 50);
      return spotifyApiRequest("PUT", `/me/player/volume?volume_percent=${Math.round(volumePercent)}`, token);
    }
    case "startMusic": {
      const body: Record<string, unknown> = {};
      const rawId = resolveValue(node.parameters.id, itemJson);
      const contextUri = typeof rawId === "string" ? rawId : "";
      if (contextUri) {
        body.context_uri = contextUri;
      }
      return spotifyApiRequest("PUT", "/me/player/play", token, body);
    }
    default:
      throw new Error(`Spotify: unknown player operation "${operation}"`);
  }
}

/* ---- Playlist ---- */
async function runPlaylistOperation(
  ctx: ExecutionContext,
  token: string,
  node: INode,
  operation: string,
  id: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "add": {
      const trackID = extractUri(node.parameters.trackID, itemJson);
      const additionalFields = getAdditionalFields(node);
      const position = additionalFields.position;
      let path = `/playlists/${id}/tracks?uris=${encodeURIComponent(trackID)}`;
      if (position !== undefined && position !== "") {
        path += `&position=${Number(position)}`;
      }
      return spotifyApiRequest("POST", path, token);
    }
    case "create": {
      const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
      const additionalFields = getAdditionalFields(node);
      const me = await spotifyApiRequest("GET", "/me", token);
      const userId = String(me.id ?? "");
      if (!userId) throw new Error("Spotify: could not determine user ID for playlist creation");
      const body: Record<string, unknown> = {
        name,
        public: additionalFields.public ?? true,
      };
      if (additionalFields.description) {
        body.description = String(additionalFields.description);
      }
      return spotifyApiRequest("POST", `/users/${userId}/playlists`, token, body);
    }
    case "get":
      return spotifyApiRequest("GET", `/playlists/${id}`, token);
    case "getUserPlaylists": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated("/me/playlists", token, returnAll, limit);
    }
    case "getTracks": {
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(`/playlists/${id}/tracks`, token, returnAll, limit);
    }
    case "delete": {
      const trackID = extractUri(node.parameters.trackID, itemJson);
      return spotifyApiRequest("DELETE", `/playlists/${id}/tracks`, token, { tracks: [{ uri: trackID }] });
    }
    case "search": {
      const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
      const filters = getFilters(node);
      let path = `/search?type=playlist&q=${encodeURIComponent(query)}`;
      const market = String(filters.market ?? "");
      if (market) path += `&market=${encodeURIComponent(market)}`;
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(path, token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown playlist operation "${operation}"`);
  }
}

/* ---- Track ---- */
async function runTrackOperation(
  token: string,
  node: INode,
  operation: string,
  id: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (operation) {
    case "get":
      return spotifyApiRequest("GET", `/tracks/${id}`, token);
    case "getAudioFeatures":
      return spotifyApiRequest("GET", `/audio-features/${id}`, token);
    case "search": {
      const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
      const filters = getFilters(node);
      let path = `/search?type=track&q=${encodeURIComponent(query)}`;
      const market = String(filters.market ?? "");
      if (market) path += `&market=${encodeURIComponent(market)}`;
      const returnAll = shouldReturnAll(node);
      const limit = getLimit(node);
      return collectPaginated(path, token, returnAll, limit);
    }
    default:
      throw new Error(`Spotify: unknown track operation "${operation}"`);
  }
}
