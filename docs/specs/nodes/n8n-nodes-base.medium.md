---
type: n8n-nodes-base.medium
displayName: Medium
category: Action
versions: [1]
priority: medium
status: specced
---

# Medium

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.medium.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/medium.md | Public docs only |
| https://github.com/Medium/medium-api-docs | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.medium`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mediumApi` (API access token) or `mediumOAuth2Api` (OAuth2)

## Parameters

### Resource: Post

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `post` | Y | Fixed to `post` when this resource is selected |
| operation | string | `create` | Y | Fixed to `create` |
| title | string | — | Y | Post headline |
| contentFormat | string | `markdown` | Y | Format of the post body: `markdown` or `html` |
| content | string | — | Y | Body text of the post |
| canonicalUrl | string | — | N | Original URL if content was first published elsewhere |
| tags | string | — | N | Comma-separated list of tags (max 5, per Medium policy) |
| publishStatus | string | `public` | N | `public`, `draft`, or `unlisted` |
| license | string | `all-rights-reserved` | N | `all-rights-reserved`, `cc-40-by`, `cc-40-by-sa`, `cc-40-by-nd`, `cc-40-by-nc`, `cc-40-by-nc-nd`, `cc-40-by-nc-sa`, `cc-40-zero`, `public-domain` |
| notifyFollowers | boolean | `true` | N | Whether to notify followers on publish |
| authorId | string | — | N | Medium user ID of the author (defaults to authenticated user) |

### Resource: Publication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `publication` | Y | Fixed to `publication` when this resource is selected |
| operation | string | `getAll` | Y | Fixed to `getAll` |
| userId | string | — | Y | Medium user ID whose publications to list |

## Runtime behavior

### Input

Each input item is processed independently. For the `post` → `create` operation, the node uses the item's fields to construct a Medium story. For `publication` → `getAll`, each item triggers a listing of publications for the given `userId`.

### Output

**Post → Create:** Each output item contains the input item's `json` merged with the API response. The response includes the newly created post's `id`, `title`, `url`, `canonicalUrl`, `publishStatus`, `license`, `licenseUrl`, `authorId`, `tags`, and `content` (with `subtitle` and `mediumUrl` under the `content` object).

**Publication → GetAll:** Each output item contains the input item's `json` merged with one publication object from the response list. Each publication includes `id`, `name`, `description`, `url`, `imageUrl`, and `twitterUsername`.

When the response is empty (no publications), the node returns an empty output array.

### Errors

- API authentication failure (invalid/expired token) throws an error and halts execution unless `continueOnFail` is enabled.
- Network or API rate-limit errors throw and halt.
- Invalid or missing required parameters (e.g., `title` or `content` for post creation) throw and halt.
- On `continueOnFail: true`, the failed input item is returned with an `error` property and execution continues to the next item.

### Expressions

All scalar parameters accept expression strings.

## Acceptance tests

### Test: create a draft post

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "create",
  "title": "Test Post",
  "contentFormat": "markdown",
  "content": "Hello from n8n",
  "publishStatus": "draft",
  "notifyFollowers": false
}
```

**Expect** output[0] to contain `json.id` (non-empty string), `json.title` === `"Test Post"`, `json.url` (string matching `https://medium.com/*`), and `json.publishStatus` === `"draft"`. The underlying API call is `POST /v1/users/{authorId}/posts`.

### Test: list publications

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "publication",
  "operation": "getAll",
  "userId": "12345"
}
```

**Expect** output[0] to be an array of objects each containing `json.id` and `json.name`. The underlying API call is `GET /v1/users/{userId}/publications`.

### Test: error on missing required title

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "create",
  "contentFormat": "markdown",
  "content": "Missing title test"
}
```

**Expect** the node to throw an error (or return error in item when `continueOnFail: true`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and high-level parameters | documented | Public docs list Post (Create) and Publication (Get All) |
| Detail fields on create (canonicalUrl, tags, publishStatus, license, notifyFollowers, authorId) | inferred | Reasonable publishing metadata; Medium's own API docs describe these fields |
| Exact response shape | inferred | Based on Medium API v1 `POST /users/{authorId}/posts` and `GET /users/{userId}/publications` responses |
| API deprecation | documented | Medium has stopped supporting the Medium API; no new credential configuration possible |
| Tool mode | documented | The public docs indicate this node can be used as an AI tool with $fromAI() dynamic parameter population |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/medium.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
