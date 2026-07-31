---
type: n8n-nodes-base.youTube
displayName: YouTube
category: Marketing
versions: [1]
priority: medium
status: implemented
---

# YouTube

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.youtube/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.youTube`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `youTubeOAuth2Api` (Google OAuth2 single-service)

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `channel` | Y | — | Options: `channel`, `playlist`, `playlistItem`, `video`, `videoCategory` |

### Channel operations

#### Operation: get (Retrieve a channel)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | Y | resource=channel | Options: `get`, `getAll`, `update`, `uploadBanner` |
| channelId | string | `''` | Y | operation=get | YouTube channel ID |
| part | multiOptions | `['*']` | Y | operation=get | `*`, `brandingSettings`, `contentDetails`, `contentOwnerDetails`, `id`, `localizations`, `snippet`, `statistics`, `status`, `topicDetails` |

#### Operation: getAll (Retrieve many channels)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| part | multiOptions | `['*']` | Y | operation=getAll | Same options as get |
| returnAll | boolean | `false` | N | operation=getAll | — |
| limit | number | `25` | N | operation=getAll, returnAll=false | Min 1, max 50 |
| filters | collection | `{}` | N | operation=getAll | See filter sub-params |
| options | collection | `{}` | N | operation=getAll | See option sub-params |

**filters sub-params:** `categoryId` (string), `forUsername` (string), `id` (string, comma-separated channel IDs), `managedByMe` (boolean)

**options sub-params:** `h1` (language code, dynamic options `getLanguages`), `onBehalfOfContentOwner` (string)

#### Operation: update (Update a channel)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | string | `''` | Y | operation=update | — |
| updateFields | collection | `{}` | N | operation=update | Contains `brandingSettingsUi` (fixedCollection) + `onBehalfOfContentOwner` |

**brandingSettingsUi options:**
- `channelSettingsValues.channel`: sub-collection with `country`, `description`, `defaultLanguage`, `defaultTab`, `featuredChannelsTitle`, `featuredChannelsUrls` (multipleValues), `keywords`, `moderateComments` (boolean), `profileColor`, `showRelatedChannels` (boolean), `showBrowseView` (boolean), `trackingAnalyticsAccountId`, `unsubscribedTrailer`
- `imageSettingsValues.image`: sub-collection with `bannerExternalUrl`, `trackingImageUrl`, `watchIconImageUrl`
- `statusValue.status`: sub-collection with `selfDeclaredMadeForKids` (boolean)

#### Operation: uploadBanner (Upload a channel banner)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channelId | string | `''` | Y | operation=uploadBanner | — |
| binaryProperty | string | `data` | Y | operation=uploadBanner | Input binary field name |

### Playlist operations

#### Operation: create

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | Y | resource=playlist | Options: `create`, `delete`, `get`, `getAll`, `update` |
| title | string | `''` | Y | operation=create | — |
| options | collection | `{}` | N | operation=create | See sub-params |

**options sub-params:** `description` (string), `privacyStatus` (options: `private`, `public`, `unlisted`), `tags` (string, comma-separated), `defaultLanguage` (dynamic `getLanguages`), `onBehalfOfContentOwnerChannel` (string), `onBehalfOfContentOwner` (string)

#### Operation: delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistId | string | `''` | Y | operation=delete | — |
| options | collection | `{}` | N | operation=delete | `onBehalfOfContentOwner` (string) |

#### Operation: get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistId | string | `''` | Y | operation=get | — |
| part | multiOptions | `['*']` | Y | operation=get | `*`, `contentDetails`, `id`, `localizations`, `player`, `snippet`, `status` |
| options | collection | `{}` | N | operation=get | `onBehalfOfContentOwner`, `onBehalfOfContentOwnerChannel` |

#### Operation: getAll

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| part | multiOptions | `['*']` | Y | operation=getAll | Same options as get |
| returnAll | boolean | `false` | N | operation=getAll | — |
| limit | number | `25` | N | operation=getAll, returnAll=false | Min 1, max 50 |
| filters | collection | `{}` | N | operation=getAll | `channelId` (string), `id` (string) |
| options | collection | `{}` | N | operation=getAll | `onBehalfOfContentOwnerChannel`, `onBehalfOfContentOwner` |

#### Operation: update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistId | string | `''` | Y | operation=update | — |
| title | string | `''` | Y | operation=update | — |
| updateFields | collection | `{}` | N | operation=update | `defaultLanguage`, `description`, `onBehalfOfContentOwner`, `privacyStatus`, `tags` |

### Playlist Item operations

#### Operation: add

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `add` | Y | resource=playlistItem | Options: `add`, `delete`, `get`, `getAll` |
| playlistId | options | `''` | Y | operation=add | Dynamic from `getPlaylists` |
| videoId | string | `''` | Y | operation=add | — |
| options | collection | `{}` | N | operation=add | `endAt` (dateTime), `note` (string), `onBehalfOfContentOwner`, `position` (number, min 0), `startAt` (dateTime) |

#### Operation: delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistItemId | string | `''` | Y | operation=delete | — |
| options | collection | `{}` | N | operation=delete | `onBehalfOfContentOwner` |

#### Operation: get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistItemId | string | `''` | Y | operation=get | — |
| part | multiOptions | `['*']` | Y | operation=get | `*`, `contentDetails`, `id`, `snippet`, `status` |
| options | collection | `{}` | N | operation=get | `onBehalfOfContentOwner` |

#### Operation: getAll

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| playlistId | options | `''` | Y | operation=getAll | Dynamic from `getPlaylists` |
| part | multiOptions | `['*']` | Y | operation=getAll | Same options as get |
| returnAll | boolean | `false` | N | operation=getAll | — |
| limit | number | `25` | N | operation=getAll, returnAll=false | Min 1, max 50 |
| options | collection | `{}` | N | operation=getAll | `onBehalfOfContentOwner` |

### Video operations

#### Operation: delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | Y | resource=video | Options: `delete`, `get`, `getAll`, `rate`, `update`, `upload` |
| videoId | string | `''` | Y | operation=delete | — |
| options | collection | `{}` | N | operation=delete | `onBehalfOfContentOwner` |

#### Operation: get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| videoId | string | `''` | Y | operation=get | — |
| part | multiOptions | `['*']` | Y | operation=get | `*`, `contentDetails`, `id`, `liveStreamingDetails`, `localizations`, `player`, `recordingDetails`, `snippet`, `statistics`, `status`, `topicDetails` |
| options | collection | `{}` | N | operation=get | `onBehalfOfContentOwner` |

#### Operation: getAll

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | `false` | N | operation=getAll | — |
| limit | number | `25` | N | operation=getAll, returnAll=false | Min 1, max 50 |
| filters | collection | `{}` | N | operation=getAll | See sub-params |
| options | collection | `{}` | N | operation=getAll | See sub-params |

**filters sub-params:** `channelId` (string), `forDeveloper` (boolean), `publishedAfter` (dateTime), `publishedBefore` (dateTime), `q` (string, search query), `regionCode` (dynamic `getCountriesCodes`), `relatedToVideoId` (string), `videoCategoryId` (string), `videoSyndicated` (boolean), `videoType` (options: `any`, `episode`, `movie`)

**options sub-params:** `order` (options: `date`/`relevance`, default `relevance`), `safeSearch` (options: `moderate`/`none`/`strict`)

#### Operation: rate

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| videoId | string | `''` | Y | operation=rate | — |
| rating | options | `''` | Y | operation=rate | Options: `dislike`, `like`, `none` |

#### Operation: update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| videoId | string | `''` | Y | operation=update | — |
| title | string | `''` | Y | operation=update | — |
| regionCode | options | `''` | N | operation=update | Dynamic `getCountriesCodes` |
| categoryId | options | `''` | N | operation=update | Dynamic `getVideoCategories`, depends on regionCode |
| updateFields | collection | `{}` | N | operation=update | `defaultLanguage`, `description`, `embeddable` (boolean), `license` (options: `creativeCommon`/`youtube`), `notifySubscribers` (boolean), `privacyStatus` (options: `private`/`public`/`unlisted`), `publicStatsViewable` (boolean), `publishAt` (dateTime), `recordingDate` (dateTime), `selfDeclaredMadeForKids` (boolean), `tags` (string) |

#### Operation: upload

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| title | string | `''` | Y | operation=upload | — |
| regionCode | options | `''` | N | operation=upload | Dynamic `getCountriesCodes` |
| categoryId | options | `''` | N | operation=upload | Dynamic `getVideoCategories`, depends on regionCode |
| binaryProperty | string | `data` | Y | operation=upload | Input binary field name |
| options | collection | `{}` | N | operation=upload | `defaultLanguage`, `description`, `embeddable` (boolean), `license` (options), `notifySubscribers` (boolean), `privacyStatus` (options), `publicStatsViewable` (boolean, default true), `publishAt` (dateTime), `recordingDate` (dateTime), `selfDeclaredMadeForKids` (boolean), `tags` (string) |

### Video Category operations

#### Operation: getAll

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `getAll` | Y | resource=videoCategory | Single option: `getAll` |
| regionCode | options | `''` | Y | operation=getAll | Dynamic `getCountriesCodes` |
| returnAll | boolean | `false` | N | operation=getAll | — |
| limit | number | `25` | N | operation=getAll, returnAll=false | Min 1, max 50 |

## Runtime behavior

### Input

Each input item is processed independently. Parameters are read per-item index, so different items may use different operations/resources (though operations are typically uniform across items in practice).

### Output

Produces `main` × 1 output. For list operations (`getAll`), each returned API item becomes a separate output item. For single-get operations, the response `items[0]` is the output. Create/update/delete operations return the API response directly. Delete operations return `{ success: true }`.

### Errors

Standard `continueOnFail` behavior: on error, produces `[{ json: { error: message } }]` for that item and continues. Video getAll throws `NodeOperationError` when `relatedToVideoId` and `forDeveloper` are both set.

### Expressions

All parameters accept expression strings. The `noDataExpression: true` flag is set on `resource` and `operation` selectors, meaning they cannot use expressions.

### Load options (dynamic parameters)

| Method | Endpoint | Used by |
|--------|----------|---------|
| `getLanguages` | `GET /youtube/v3/i18nLanguages` | Language dropdowns |
| `getCountriesCodes` | ISO country code list (static) | Region Code dropdowns |
| `getVideoCategories` | `GET /youtube/v3/videoCategories` (depends on regionCode) | Category dropdowns |
| `getPlaylists` | `GET /youtube/v3/playlists?part=snippet&mine=true` | Playlist selection |

## Acceptance tests

### Test: channel get single

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "channel",
  "operation": "get",
  "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
  "part": ["snippet", "statistics"]
}
```

**Expect** output[0]:

```json
[{ "json": { "kind": "youtube#channel", "id": "UC_x5XG1OV2P6uZZ5FSM9Ttw", "snippet": {}, "statistics": {} } }]
```

### Test: playlist create with privacy

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "playlist",
  "operation": "create",
  "title": "My Automation Playlist",
  "options": {
    "description": "Generated by n8n",
    "privacyStatus": "unlisted"
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "id": "PL...", "snippet": { "title": "My Automation Playlist", "description": "Generated by n8n" }, "status": { "privacyStatus": "unlisted" } } }]
```

### Test: video getAll with filters

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "video",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5,
  "filters": {
    "q": "n8n tutorial",
    "videoType": "any"
  },
  "options": {
    "order": "relevance"
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "kind": "youtube#searchResult", "id": { "videoId": "abc123" }, "snippet": { "title": "..." } } }]
```

### Test: video upload (binary input)

**Given** input items:

```json
[{ "json": {}, "binary": { "data": { "data": "base64encoded...", "mimeType": "video/mp4", "fileName": "demo.mp4" } } }]
```

**Parameters:**

```json
{
  "resource": "video",
  "operation": "upload",
  "title": "My Upload",
  "binaryProperty": "data",
  "options": {
    "privacyStatus": "private",
    "notifySubscribers": false
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "uploadId": "...", "id": "...", "snippet": { "title": "My Upload" }, "status": { "privacyStatus": "private" } } }]
```

### Test: playlistItem add

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "playlistItem",
  "operation": "add",
  "playlistId": "PL...",
  "videoId": "abc123",
  "options": {
    "position": 0
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "id": "...", "snippet": { "playlistId": "PL...", "resourceId": { "videoId": "abc123" }, "position": 0 } } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API endpoint paths | Inferred from corpus | All endpoints map to YouTube Data API v3 |
| Channel update body shape | Inferred from corpus | brandingSettings nested structure reconstructed |
| Video upload resumable protocol | Inferred from corpus | Uses resumable upload with chunked PUT |
| Load option data sources | documented | i18nLanguages API + static country codes |
| Error edge cases | Partially inferred | `relatedToVideoId` + `forDeveloper` mutual exclusion documented |

## OpenFlow mapping

- **Definition group:** `core` (app-node)
- **Executor file:** `src/lib/engine/executors/youTube.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
