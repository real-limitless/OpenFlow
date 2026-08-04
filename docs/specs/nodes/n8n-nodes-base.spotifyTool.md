---
type: n8n-nodes-base.spotifyTool
displayName: Spotify Tool
category: AI
versions: [1]
priority: medium
status: specced
aliases: [n8n-nodes-base.spotifyTool]
---

# Spotify Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.spotify.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/spotify.md | Public docs only |
| https://developer.spotify.com/documentation/web-api | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.spotifyTool`
- **Aliases:** (none — the base `n8n-nodes-base.spotify` is the non-tool variant)
- **Inputs:** none (connected via `ai_tool` channel from AI Agent root node)
- **Outputs:** `main` × 1 (tool-call result sent back to the agent)
- **Credentials:** `spotifyOAuth2Api` (OAuth2, required)

## Parameters

The Spotify Tool exposes the exact same Resource/Operation structure as the base Spotify node, with the addition that all parameters support dynamic population via the `$fromAI()` expression function when connected to a Tools AI Agent. The AI model selects the resource, operation, and fills parameter values from conversational context.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `player` | yes | always | One of: `album`, `artist`, `library`, `myData`, `player`, `playlist`, `track` |
| `operation` | options | `addSongToQueue` (player) | yes | per resource | See operation tables below; model selects based on user intent |
| `id` | string | `""` | yes | album: get/getTracks; artist: all except search; player: startMusic/addSongToQueue; playlist: get/getTracks/add/delete; track: get/getAudioFeatures | Spotify URI or Spotify ID; model fills from context |
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

### AI Agent tool contract

The Spotify Tool is connected to an AI Agent root node via the `ai_tool` channel. It receives no main-input items; instead, the AI model selects parameter values at runtime through one of two mechanisms:

1. **Manual parameter binding** — the workflow author pre-fills parameters with fixed values or expressions.
2. **`$fromAI()` dynamic population** — the AI model fills parameters from conversational context using `{{ $fromAI('key') }}` expressions.

When invoked by the agent, the tool executes the selected resource/operation against the Spotify Web API and returns the result as a single output item on `main`[0]. The agent incorporates the returned data into its response to the user.

### Operations

The tool delegates to the same Spotify Web API endpoints as the base node:

| Resource | Operations |
|----------|-----------|
| Album | get (GET /albums/{id}), getNewReleases (GET /browse/new-releases), getTracks (GET /albums/{id}/tracks), search (GET /search?type=album) |
| Artist | get (GET /artists/{id}), getAlbums (GET /artists/{id}/albums), getRelatedArtists (GET /artists/{id}/related-artists), getTopTracks (GET /artists/{id}/top-tracks), search (GET /search?type=artist) |
| Library | getLikedTracks (GET /me/tracks) |
| My Data | getFollowingArtists (GET /me/following?type=artist) |
| Player | addSongToQueue (POST /me/player/queue), currentlyPlaying (GET /me/player/currently-playing), nextSong (POST /me/player/next), pause (PUT /me/player/pause), previousSong (POST /me/player/previous), recentlyPlayed (GET /me/player/recently-played), resume (PUT /me/player/play), volume (PUT /me/player/volume), startMusic (PUT /me/player/play with context URI) |
| Playlist | add (POST /playlists/{id}/tracks), create (POST /users/{userId}/playlists), get (GET /playlists/{id}), getUserPlaylists (GET /me/playlists), getTracks (GET /playlists/{id}/tracks), delete (DELETE /playlists/{id}/tracks), search (GET /search?type=playlist) |
| Track | get (GET /tracks/{id}), getAudioFeatures (GET /audio-features/{id}), search (GET /search?type=track) |

### Output

The tool returns the Spotify Web API response body as the output item on `main`[0]. Single-item fetches return the direct response; list/search operations return the paginated response body.

### Errors

- Non-2xx responses from Spotify API cause the tool to throw an error, failing the agent's tool call.
- The `continueOnFail` option on the node allows the agent to continue on error.
- Player operations that require an active device may receive a 404 `NO_ACTIVE_DEVICE`; the tool should handle this gracefully.

### Expressions

All parameters accept `$fromAI()` expressions in addition to standard expression syntax.

## Acceptance tests

### Test: search for an artist via AI tool

**Given** no input items (tool invoked by AI Agent with `$fromAI()` populated parameters):

**Parameters:**
```json
{
  "resource": "artist",
  "operation": "search",
  "query": "{{ $fromAI('artist_name', 'The artist to search for', 'string') }}"
}
```

**Expect** the tool calls `GET /search?type=artist&q=<model-supplied-value>` and returns the Spotify search response with `artists.items` as an array of artist objects.

### Test: add a song to queue

**Given** no input items:

**Parameters:**
```json
{
  "resource": "player",
  "operation": "addSongToQueue",
  "id": "{{ $fromAI('track_id', 'Spotify track URI or ID', 'string') }}"
}
```

**Expect** the tool calls `POST /me/player/queue?uri=<model-supplied-id>` and returns a 204/200 response (or empty body).

### Test: get currently playing track

**Given** no input items:

**Parameters:**
```json
{
  "resource": "player",
  "operation": "currentlyPlaying"
}
```

**Expect** the tool calls `GET /me/player/currently-playing` and returns the currently-playing object or an empty response if nothing is playing.

### Test: create a playlist with AI-specified name

**Given** no input items:

**Parameters:**
```json
{
  "resource": "playlist",
  "operation": "create",
  "name": "{{ $fromAI('playlist_name', 'Name for the new playlist', 'string') }}"
}
```

**Expect** the tool calls `POST /users/{userId}/playlists` and returns the created playlist object with `id`, `name`, `owner`, `public` fields.

### Test: get track audio features

**Given** no input items:

**Parameters:**
```json
{
  "resource": "track",
  "operation": "getAudioFeatures",
  "id": "{{ $fromAI('track_id', 'Spotify track URI or ID', 'string') }}"
}
```

**Expect** the tool calls `GET /audio-features/{id}` and returns audio features (e.g., `danceability`, `energy`, `tempo`, `key`).

## Gaps / confidence

| Topic | Source | Notes |
|-------|--------|-------|
| Tool type string (`spotifyTool` vs `spotify`) | Public docs + npm node registry — the `spotify` node has `usableAsTool: true` | Medium-high — the Tool variant follows the same pattern as other Tool variants (e.g., `dropboxTool`, `gmailTool`) which are registered as separate type strings pointing to the same base node class |
| Resource/operation structure | Public docs.n8n.io | High confidence — matches the base Spotify node exactly |
| `$fromAI()` support | Public n8n docs | High confidence — documented AI parameter population feature |
| Player device requirements | Public docs | High confidence — Spotify API requirement |
| Pagination support | npm schema | High confidence — standard across all nodes |
| Tool-specific wire format | Assumed from other Tool node patterns | Medium — Tool variant nodes connect via `ai_tool` channel with no main input |

## OpenFlow mapping

- **Definition group:** `transform` (AI tool category)
- **Executor file:** `src/lib/engine/executors/spotify.ts` (shared with base spotify node)
- **SDK:** `defineNode` + native `ExecutionContext` only
