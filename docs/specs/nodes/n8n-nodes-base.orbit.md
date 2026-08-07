---
type: n8n-nodes-base.orbit
displayName: Orbit
category: Analytics
versions: [1]
priority: low
status: specced
deprecated: true
---

# Orbit

## Sources

| URL | Source class |
|-----|----------------|
| n8n package corpus (`/tmp` only) — type string + parameter names/enums | Published JSON descriptors |
| `https://orbit.love/blog/orbit-is-joining-postman` | Orbit shutdown announcement |
| `https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.orbit/` | Public docs only (404 — node removed from docs) |

## Wire format

- **Type string:** `n8n-nodes-base.orbit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `orbitApi` (API Token — Bearer token in `Authorization` header)
- **Base URL:** `https://app.orbit.love/api/v1`
- **Deprecated:** Service shut down July 11 (Orbit joined Postman). Executor should throw a clear deprecation error at runtime.

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `activity`, `member`, `note`, `post` | `member` | yes | Determines which entity type to operate on |

### Workspace (applies to all resources + operations)

Every operation requires `workspaceId` — a dynamic option loaded from the `GET /api/v1/workspaces` endpoint.

### Activity

#### Create

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| memberId | string | — | yes | Orbit member ID |
| title | string | — | yes | Activity title |
| activityType | options (dynamic) | — | no | User-defined activity type grouping |
| description | string | — | no | Timeline description |
| key | string | — | no | Unique deduplication key |
| link | string | — | no | URL for the timeline link |
| linkText | string | — | no | Display text for the timeline link |
| occurredAt | dateTime | — | no | When activity occurred; defaults to now |

#### Get Many

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | no | If false, paginated with limit |
| limit | number (1–500) | 100 | no | Max results when returnAll=false |
| memberId | string | — | no | Filter by member ID |

### Member

#### Create or Update (upsert)

Required: `workspaceId`, plus an identity block (source: discourse/email/github/twitter; username/id/email/host depending on source).
Optional additional fields: bio, birthday, company, location, name, pronouns, shippingAddress, slug, tagsToAdd (comma-separated), tagList (replaces all), tShirt, teammate (boolean), url.

#### Delete / Get

Required: `workspaceId`, `memberId`.
Get additionally supports `resolveIdentities` (boolean) — when true, inlines the full identity objects instead of references.

#### Get Many

Required: `workspaceId`. Supports `returnAll`, `limit` (1–500, default 100), `resolveIdentities`.
Options: `sort` (field name), `direction` (ASC/DESC).

#### Lookup

Required: `workspaceId`, `source` (discourse/email/github/twitter).
Conditional: `searchBy` (username/id) for discourse/github/twitter; `username` or `id` value; `email` for email source; `host` for discourse source.

#### Update

Required: `workspaceId`, `memberId`.
Optional update fields: bio, birthday, company, location, name, pronouns, shippingAddress, slug, tagsToAdd, tagList, tShirt, teammate, url.

### Note

#### Create

Required: `workspaceId`, `memberId`, `note` (string).

#### Get Many

Required: `workspaceId`, `memberId`. Supports `returnAll`, `limit`, `resolveMember`.

#### Update

Required: `workspaceId`, `memberId`, `noteId`, `note`.

### Post

#### Create

Required: `workspaceId`, `memberId`, `url`.
Optional: `publishedAt` (dateTime).

#### Get Many

Required: `workspaceId`. Supports `returnAll`, `limit`. Filter: `memberId`.

#### Delete

Required: `workspaceId`, `memberId`, `postId`.

## Runtime behavior

### API transport

All requests are `Bearer`-authenticated against `https://app.orbit.love/api/v1{resource}`. Response bodies are JSON. Pagination uses `?page=N` with `?limit=N` — iterate while `data` array is non-empty.

### Input

Each input item is processed independently. Parameters that are common (workspaceId, memberId, etc.) are read from the item-level parameter values.

### Output

Each operation emits one output item per API response record on `main`[0]. The JSON structure follows the Orbit JSON:API-style envelope with `data` (the primary resource array/object) and optional `included` (related resources). When `resolveIdentities` or `resolveMember` is enabled, the referenced identities/members from `included` are inlined into the `relationships` objects.

### Errors

- Missing required parameters (workspaceId, memberId, etc.) result in a validation error before any API call.
- API errors (auth failure, not found, rate limit) are surfaced as `NodeApiError`.
- The entire node is deprecated (service shut down July 11) — the executor should emit a `NodeApiError` with level `warning` describing the shutdown, or optionally allow execution if the service is temporarily still accessible.
- `continueOnFail` support: if enabled, the error item is returned with empty json and error details, and execution continues to the next item.

### Expressions

All string/number/boolean parameters accept n8n expressions (`={{ ... }}`).

## Acceptance tests

### Test: member get — resolves identity

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "get",
  "workspaceId": "test-workspace",
  "memberId": "123",
  "resolveIdentities": true
}
```

**Expect** output[0] to contain a single item whose `json` object has a `data` property with the member payload and the `relationships.identities.data` array containing full identity objects (not just ID references).

### Test: member lookup by GitHub username

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "lookup",
  "workspaceId": "test-workspace",
  "source": "github",
  "searchBy": "username",
  "username": "octocat"
}
```

**Expect** the API call to target `GET /api/v1/{workspace}/members/lookup?source=github&username=octocat` and output[0] to contain the matched member or an empty result.

### Test: activity create with additional fields

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "activity",
  "operation": "create",
  "workspaceId": "test-workspace",
  "memberId": "456",
  "title": "Opened a pull request",
  "additionalFields": {
    "description": "PR #42 merged",
    "link": "https://github.com/org/repo/pull/42",
    "occurredAt": "2024-03-15T10:00:00Z"
  }
}
```

**Expect** a POST to `/api/v1/{workspace}/activities` with a JSON body containing member_id, title, description, link, and occurred_at. Output[0] contains the created activity's `data`.

### Test: paginated member list with sort

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "getAll",
  "workspaceId": "test-workspace",
  "returnAll": false,
  "limit": 50,
  "options": {
    "sort": "created_at",
    "direction": "DESC"
  }
}
```

**Expect** a GET to `/api/v1/{workspace}/members?limit=50&sort=created_at&direction=DESC`. Output[0] contains at most 50 items from the `data` array, sorted descending by creation date.

### Test: deprecation error

**Given** any input items and any resource/operation:

**Expect** the executor to throw a `NodeApiError` with message indicating Orbit has shut down since July 11 and the service is deprecated. If `continueOnFail` is enabled, the error item is returned with empty JSON.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API endpoint paths | Inferred from compiled JS | Confirmed base URL + resource pattern from `GenericFunctions.js` |
| Parameter names/defaults | Inferred from compiled JS | Extracted from `MemberDescription.js`, `ActivityDescription.js`, `NoteDescription.js`, `PostDescription.js` |
| API response shapes | Inferred from compiled JS + d.ts interfaces | JSON:API-style with `data` + `included` |
| Credential schema | Inferred from compiled JS | `orbitApi` — single `accessToken` string field |
| Workspace/activity type dynamic loading | Inferred from compiled JS | `getWorkspaces` / `getActivityTypes` loadOptions |
| Service status | Documented in credential file | Shutdown July 11, 2025; Orbit joined Postman |
| Published n8n docs | 404 | Node removed from docs.n8n.io — spec derived from published npm corpus and blog post |

## OpenFlow mapping

- **Definition group:** `core` (deprecated)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.orbit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
