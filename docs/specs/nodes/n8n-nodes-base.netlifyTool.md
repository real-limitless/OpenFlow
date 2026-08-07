---
type: n8n-nodes-base.netlifyTool
displayName: Netlify Tool
category: Action
versions: [1]
priority: medium
status: specced
---

# Netlify Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.netlify/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/netlify/ | Public docs only |
| https://docs.netlify.com/api/get-started/ | Public docs only |
| https://open-api.netlify.com | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.netlifyTool`
- **Aliases:** (none; base node `n8n-nodes-base.netlify` has `usableAsTool: true` and this is its AI agent tool variant)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `netlifyApi` (personal access token via `Authorization: Bearer <token>` header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `deploy`, `site` | `deploy` | Y | | Which Netlify resource to operate on |
| operation | depends on resource | `getAll`(deploy) / `delete`(site) | Y | | Operation to perform on the selected resource |
| siteId | string (expression or loaded value) | — | Y | resource=deploy,operation=get/create/getAll | Site UUID or domain name for scoping deploy operations; dynamically loaded via `getSites` method |
| deployId | string | — | Y | resource=deploy,operation=get/cancel | The deploy UUID |
| returnAll | boolean | false | N | resource=deploy/site,operation=getAll | Return all results (paginate through pages) |
| limit | number | 50 | N | resource=deploy/site,operation=getAll,returnAll=false | Max results per page (1–200) |
| additionalFields.branch | string | — | N | resource=deploy,operation=create | Git branch name for the deploy |
| additionalFields.title | string | — | N | resource=deploy,operation=create | Title to identify the deploy |
| siteId | string | — | Y | resource=site,operation=get/delete | The site UUID or domain name |

### Resource/operation matrix

| resource | operation | Netlify REST endpoint | Notes |
|----------|-----------|----------------------|-------|
| `deploy` | `cancel` | `POST /api/v1/deploys/{deploy_id}/cancel` | Cancels a deploy in progress; no `siteId` needed |
| `deploy` | `create` | `POST /api/v1/sites/{site_id}/deploys` | Creates a new deploy (file digest or ZIP body); optional `branch` and `title` |
| `deploy` | `get` | `GET /api/v1/sites/{site_id}/deploys/{deploy_id}` | Returns a single deploy by ID |
| `deploy` | `getAll` | `GET /api/v1/sites/{site_id}/deploys` | Lists all deploys for a site; paginated via `?page` and `?per_page` |
| `site` | `delete` | `DELETE /api/v1/sites/{site_id}` | Permanently deletes a site |
| `site` | `get` | `GET /api/v1/sites/{site_id}` | Returns a single site by ID or domain |
| `site` | `getAll` | `GET /api/v1/sites` | Returns all sites the token has access to; paginated via `?page` and `?per_page` |

## Runtime behavior

### Input

Each incoming item may supply expression-based parameter values. The `siteId` parameter can be either a UUID or the site's domain name (e.g., `mysite.netlify.app`) and accepts expressions or a value from the dynamic site list loaded via `getSites`. For deploy creation, the API accepts a file-details object or ZIP binary in the body via additional configuration not exposed through simple parameters in this tool variant.

### Output

Per input item, one output item is produced containing the API response as `json` on the `main` output.

- **Deploy cancel/get:** `{ id, site_id, name, url, deploy_url, state, created_at, updated_at, ... }`
- **Deploy create:** `{ id, site_id, name, url, required: string[], required_functions: string[], state: "preparing"|"prepared"|"uploading"|"uploaded"|"ready", ... }`
- **Deploy getAll:** Array of deploy objects `[{ id, site_id, name, state, created_at, updated_at, ... }]`
- **Site get:** `{ id, name, custom_domain, url, admin_url, created_at, updated_at, ... }`
- **Site getAll:** Array of site objects `[{ id, name, custom_domain, url, created_at, ... }]`
- **Site delete:** `{ success: true }` (empty object or success indicator)

### Pagination

For `getAll` operations, when `returnAll` is false (default), the tool issues a single API request with `?per_page={limit}`. When `returnAll` is true, the tool loops through pages using `?page=N&per_page={pageSize}`, consuming the `Link` header (rel="next") or simply incrementing the page counter until the response is empty. The `limit` parameter controls per-page size.

### Errors

- 400: Invalid parameters — thrown with NodeApiError
- 401: Unauthorized/invalid token — thrown
- 404: Resource not found (deploy or site) — thrown
- 429: Rate limit (500 req/min general, 3 deploys/min) — thrown (retry recommended by consumer)
- `continueOnFail`: If true, empty output (no item) is emitted for the failed item instead of aborting the execution

### Expressions

All string, number, and boolean parameters accept expression strings. The `$fromAI()` function is supported on all parameters when used as an AI agent tool.

## Acceptance tests

### Test: get all sites

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "site", "operation": "getAll", "returnAll": false, "limit": 10 }
```

**Expect** output[0]:

```json
[{ "json": [{ "id": "3970e0fe-8564-4903-9a55-c5f8de49fb8b", "name": "synergy", "url": "http://www.example.com", "created_at": "2024-01-15T10:30:00.000Z" }] }]
```

### Test: get a deploy

**Given** input items:

```json
[{ "json": { "siteName": "my-site", "deployUuid": "52465f435803544542000001" } }]
```

**Parameters:**

```json
{ "resource": "deploy", "operation": "get", "siteId": "={{$json.siteName}}", "deployId": "={{$json.deployUuid}}" }
```

**Expect** output[0]:

```json
[{ "json": { "id": "52465f435803544542000001", "site_id": "3970e0fe-8564-4903-9a55-c5f8de49fb8b", "name": "synergy", "state": "ready", "created_at": "2024-01-15T10:30:00.000Z" } }]
```

### Test: cancel a deploy (no siteId)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "deploy", "operation": "cancel", "deployId": "52465f435803544542000001" }
```

**Expect** output[0] (POST /api/v1/deploys/52465f435803544542000001/cancel returns the deploy with updated state):

```json
[{ "json": { "id": "52465f435803544542000001", "state": "cancelled" } }]
```

### Test: get a site by domain

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "site", "operation": "get", "siteId": "www.example.com" }
```

**Expect** output[0]:

```json
[{ "json": { "id": "3970e0fe-8564-4903-9a55-c5f8de49fb8b", "name": "synergy", "custom_domain": "www.example.com", "url": "http://www.example.com", "created_at": "2024-01-15T10:30:00.000Z" } }]
```

### Test: returnAll pagination for deploys

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "deploy", "operation": "getAll", "siteId": "my-site", "returnAll": true }
```

**Expect** output[0] contains an array of all deploy objects across all pages:

```json
[{ "json": [{ "id": "deploy-1", "state": "ready" }, { "id": "deploy-2", "state": "ready" }] }]
```

### Test: AI agent tool invocation via $fromAI

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "site", "operation": "getAll", "limit": 5 }
```

**Expect** output[0]:

```json
[{ "json": [{ "id": "site-uuid-1", "name": "project-alpha" }] }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string `netlifyTool` vs `netlify` | confirmed from known nodes | `netlifyTool` registered as an alias/separate entry for AI agent use; base node has `usableAsTool: true` |
| Deploy create accepts file digest or ZIP body | External API documented | Simple parameter mode only sets title/branch; actual file upload requires additional binary handling |
| Additional deploy-create body fields | documented | Netlify API supports `files`, `functions`, `async`, `draft` fields not exposed as simple parameters in this tool variant |
| Cancel endpoint does NOT require siteId | confirmed from types | Cancel calls POST /api/v1/deploys/{deploy_id}/cancel directly, no site path prefix |
| Pagination | documented | Netlify API uses `?page` and `?per_page` params with Link header; tool loops pages when returnAll=true |
| Parameters match base Netlify node | confirmed from types | Tool variant shares all parameters with the base `netlify` node; no extra properties |
| siteId required for deploy get/create/getAll | confirmed from types | `siteId` appears with `required: true` and `loadOptionsMethod: 'getSites'` for deploy get/create/getAll |
| `resource` default: `deploy`, `operation` default: `getAll` (deploy) / `delete` (site) | confirmed from types | Default values match the base node's UI property defaults |
| Deploy create `siteId` is required but schema marks optional | understood | Node UI requires it (loadOptions); Zod schema uses `.optional()` for expression-based resolution |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/netlifyTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
