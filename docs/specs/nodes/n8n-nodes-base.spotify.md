---
type: n8n-nodes-base.spotify
displayName: Spotify
category: Input
versions: [1]
priority: medium
status: specced
aliases: [n8n-nodes-base.spotify]
---

# Spotify

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.spotify.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/spotify.md | Public docs only |
| https://developer.spotify.com/documentation/web-api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.spotify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `spotifyOAuth2Api` (OAuth2, required)

## Parameters

The node exposes a **Resource** selector followed by an **Operation** selector for that resource. Resource-specific parameters appear conditionally based on the selected resource + operation. Return-all and limit controls are shared across list/search operations.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `player` | yes | always | One of: `album`, `artist`, `library`, `myData`, `player`, `playlist`, `track` |
| `operation` | options | `addSongToQueue` (for player) | yes | per resource | See operation tables below |
| `id` | string | `""` | yes | album: get/getTracks; artist: all except search; player: startMusic/addSongToQueue; playlist: get/getTracks/add/delete; track: get/getAudioFeatures | Spotify URI or Spotify ID |
| `query` | string | `""` | yes | album/artist/playlist/track: search | Free-text keyword for search |
| `name` | string | `""` | yes | playlist: create | Name of new playlist |
| `trackID` | string | `""` | yes | playlist: add/delete | Track URI or ID to add/remove |
| `volumePercent` | number | `50` | yes | player: volume | Volume value 0–100 |
| `country` | string | `US` | yes | artist: getTopTracks | Country code (ISO 3166-1 alpha-2) |
| `returnAll` | boolean | `false` | yes | list/search operations | When false, obey `limit` |
| `limit` | number | `50` | yes | list/search when returnAll=false | Max items per page |
| `additionalFields` | collection | `{}` | no | playlist: create/add | See sub-params below |
| `filters` | collection | `{}` | no | search; album: getNewReleases | See sub-params below |

### additionalFields sub-parameters

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| `description` | string | `""` | playlist: create | Playlist description |
| `public` | boolean | `true` | playlist: create | Whether the playlist is publicly accessible |
| `position` | number | `0` | playlist: add | Insertion position for the added track |

### filters sub-parameters

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| `country` | options | `US` | album: getNewReleases | Country code to filter new releases |
| `market` | options | `""` | search across album/artist/playlist/track | ISO 3166-1 alpha-2 country code for market filter |

## Runtime behavior

### Album resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Get (`get`) | `GET /albums/{id}` | album object |
| Get New Releases (`getNewReleases`) | `GET /browse/new-releases` | `albums` object |
| Get Tracks (`getTracks`) | `GET /albums/{id}/tracks` | array of track objects |
| Search (`search`) | `GET /search?type=album&q={query}` | `albums` object |

### Artist resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Get (`get`) | `GET /artists/{id}` | artist object |
| Get Albums (`getAlbums`) | `GET /artists/{id}/albums` | array of album objects |
| Get Related Artists (`getRelatedArtists`) | `GET /artists/{id}/related-artists` | array of artist objects |
| Get Top Tracks (`getTopTracks`) | `GET /artists/{id}/top-tracks?market={country}` | `tracks` array |
| Search (`search`) | `GET /search?type=artist&q={query}` | `artists` object |

### Library resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Get Liked Tracks (`getLikedTracks`) | `GET /me/tracks` | `items` array of saved track objects |

### My Data resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Get Following Artists (`getFollowingArtists`) | `GET /me/following?type=artist` | `artists` object |

### Player resource operations

| Operation | HTTP method + path | Notes |
|-----------|-------------------|-------|
| Add Song to Queue (`addSongToQueue`) | `POST /me/player/queue?uri={id}` | Body optional; requires active device |
| Currently Playing (`currentlyPlaying`) | `GET /me/player/currently-playing` | Returns currently-playing object or empty |
| Next Song (`nextSong`) | `POST /me/player/next` | Requires active device |
| Pause (`pause`) | `PUT /me/player/pause` | Requires active device |
| Previous Song (`previousSong`) | `POST /me/player/previous` | Requires active device |
| Recently Played (`recentlyPlayed`) | `GET /me/player/recently-played` | Returns `items` array |
| Resume (`resume`) | `PUT /me/player/play` | No body needed; requires active device |
| Set Volume (`volume`) | `PUT /me/player/volume?volume_percent={volumePercent}` | 0–100 |
| Start Music (`startMusic`) | `PUT /me/player/play` | Context URI may be passed in the request body |

### Playlist resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Add an Item (`add`) | `POST /playlists/{id}/tracks` | snapshot_id |
| Create a Playlist (`create`) | `POST /users/{userId}/playlists` | playlist object |
| Get (`get`) | `GET /playlists/{id}` | playlist object |
| Get User's Playlists (`getUserPlaylists`) | `GET /me/playlists` | `items` array |
| Get Tracks (`getTracks`) | `GET /playlists/{id}/tracks` | `items` array |
| Remove an Item (`delete`) | `DELETE /playlists/{id}/tracks` | snapshot_id |
| Search (`search`) | `GET /search?type=playlist&q={query}` | `playlists` object |

### Track resource operations

| Operation | HTTP method + path | Key response field |
|-----------|-------------------|-------------------|
| Get (`get`) | `GET /tracks/{id}` | track object |
| Get Audio Features (`getAudioFeatures`) | `GET /audio-features/{id}` | audio-features object |
| Search (`search`) | `GET /search?type=track&q={query}` | `tracks` object |

### Output

For each operation, the node passes the **JSON response body** from the Spotify Web API as the output item under its existing key. Items from the incoming input are processed one at a time.

- Single-item fetches (get, currentlyPlaying) output the direct response body.
- List/search operations that support pagination output the response body directly; the `returnAll` / `limit` parameters control whether the executor fetches full paginated results or only one page.

### Errors

- Non-2xx responses from the Spotify API should cause the node to throw an error, unless `continueOnFail` is enabled on the node.
- Unauthorized (401) errors indicate expired/revoked OAuth2 tokens.
- Operations that require an active device (player commands) return a 204 No Content or a 404 `NO_ACTIVE_DEVICE`; the executor should handle the 404 gracefully and may return an empty output or a descriptive message.

### Expressions

All string/number/boolean parameters accept expression strings (`={{ }}`).

## Acceptance tests

### Test: get album by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "album",
  "operation": "get",
  "id": "spotify:album:1YZ3k65Mqw3G8FzYlW1mmp"
}
```

**Expect** output[0] contains a JSON object with `album_type`, `artists`, `id`, `name`, `tracks` fields (matching the Spotify API album response shape).

### Test: search artists

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "artist",
  "operation": "search",
  "query": "Radiohead"
}
```

**Expect** output[0] to be the Spotify search response with `artists.items` as an array of artist objects.

### Test: pause playback (player)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "player",
  "operation": "pause"
}
```

**Expect** the node to call `PUT /me/player/pause` and produce an output item (the response, often empty 204).

### Test: create a playlist

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "playlist",
  "operation": "create",
  "name": "My Test Playlist"
}
```

**Expect** output[0] to be the playlist object with `id`, `name`, `owner`, `public` fields.

### Test: get track audio features

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "track",
  "operation": "getAudioFeatures",
  "id": "spotify:track:0xE4LEFzSNGsz1F6kvXsHU"
}
```

**Expect** output[0] to contain audio features (e.g., `danceability`, `energy`, `tempo`, `key`).

## Gaps / confidence

| Topic | Source | Notes |
|-------|--------|-------|
| Resource/operation structure | docs.n8n.io + npm schema | High confidence — public docs enumerate all operations |
| Parameter names and defaults | npm schema | High confidence — standardized parameter schema |
| Pagination (returnAll/limit) | npm schema | High confidence — consistent pattern across nodes |
| Spotify Web API endpoint mapping | Public Spotify Developer API + inferred from operation names | Medium-high — the REST paths follow Spotify conventions |
| Additional field sub-options | npm schema | High confidence |
| Market options list | Inferred | Low confidence on exact market option list — likely a dynamic Spotify API dropdown |

## OpenFlow mapping

- **Definition group:** `input`
- **Executor file:** `src/lib/engine/executors/spotify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
