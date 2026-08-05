---
type: n8n-nodes-base.discourseTool
displayName: Discourse Tool
category: Communication
versions: [1]
priority: medium
status: specced
---

# Discourse Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discourse/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/discourse/ | Public docs only |
| https://docs.discourse.org/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.discourseTool`
- **Aliases:** (none; the base node `n8n-nodes-base.discourse` is `usableAsTool: true` and this is its tool registration)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `discourseApi` (API key + instance URL + username)

## Parameters

The Tool variant is a separate node registration that delegates to the same Discourse executor. The resource/operation matrix is identical to the base `n8n-nodes-base.discourse` node.

| Resource | Operation | Parameters | Discourse API endpoint |
|----------|-----------|------------|------------------------|
| `category` | `create` | `name` (string, required), `color` (color, required), `textColor` (color, required) | POST `/categories.json` |
| `category` | `getAll` | `returnAll` (boolean), `limit` (number, 1-100, default 50) | GET `/categories.json` |
| `category` | `update` | `categoryId` (string, required), `name` (string, required), `updateFields.color` (color, optional), `updateFields.textColor` (color, optional) | PUT `/categories/{id}.json` |
| `group` | `create` | `name` (string, required) | POST `/admin/groups.json` |
| `group` | `get` | `name` (string, required) | GET `/groups/{name}` |
| `group` | `getAll` | `returnAll` (boolean), `limit` (number, 1-100, default 50) | GET `/groups.json` |
| `group` | `update` | `groupId` (string, required), `name` (string, required) | PUT `/groups/{groupId}.json` |
| `post` | `create` | `content` (string, required), `title` (string), `additionalFields.category` (dynamic), `additionalFields.reply_to_post_number` (string), `additionalFields.topic_id` (string) | POST `/posts.json` |
| `post` | `get` | `postId` (string, required) | GET `/posts/{postId}` |
| `post` | `getAll` | `returnAll` (boolean), `limit` (number, 1-100, default 50) | GET `/posts.json` |
| `post` | `update` | `postId` (string, required), `content` (string, required), `updateFields.edit_reason` (string), `updateFields.cooked` (boolean) | PUT `/posts/{postId}.json` |
| `user` | `create` | `name` (string, required), `email` (string, required), `username` (string, required), `password` (string, masked, required), `additionalFields.active` (boolean), `additionalFields.approved` (boolean) | POST `/users.json` |
| `user` | `get` | `by` (enum: `username` / `externalId`), conditional `username` or `externalId` | GET `/users/{username}` or `/u/by-external/{externalId}.json` |
| `user` | `getAll` | `flag` (enum), `returnAll` (boolean), `limit` (number), `options` (asc, order, showEmails, stats) | GET `/admin/users/list/{flag}.json` |
| `userGroup` | `add` | `usernames` (string, comma-separated, required), `groupId` (string, required) | PUT `/groups/{groupId}/members.json` |
| `userGroup` | `remove` | `usernames` (string, comma-separated, required), `groupId` (string, required) | DELETE `/groups/{groupId}/members.json` |

**Resource parameter** (`resource`): options enum with values `category`, `group`, `post`, `user`, `userGroup`. Default: `post`.

**Tool-specific behavior:** When invoked by an AI agent, the node supports `$fromAI()` dynamic parameter population — the AI model supplies parameter values as part of function-calling. All string, number, boolean, and options parameters accept expressions.

## Runtime behavior

### Input

Each input item is processed independently. The `resource` and `operation` are read from item 0 (shared); per-field values support per-item expressions.

### Output

Output items contain the JSON response body from the Discourse API. The same output envelope unwrapping applies as the base node:
- `category.create/update` -> `response.category`
- `category.getAll` -> `response.category_list.categories`
- `group.create` -> `response.basic_group`
- `group.get` -> `response.group`
- `group.getAll` -> `response.groups`
- `post.getAll` -> `response.latest_posts`

### Errors

On API failure the node throws. If `continueOnFail` is enabled, an item `{ error: <message> }` is emitted.

### Expressions

All string, number, boolean, and options parameters accept expressions. `$fromAI()` is supported for AI-agent tool usage.

## Acceptance tests

### Test: tool category create

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "category",
  "operation": "create",
  "name": "TestCategory",
  "color": "FF0000",
  "textColor": "FFFFFF"
}
```

**Expect** POST `/categories.json` with body `{ name: "TestCategory", color: "FF0000", text_color: "FFFFFF" }`. Output contains Discourse category under `response.category`.

### Test: tool post create via AI agent with $fromAI()

**Given** the node is connected to an AI Agent root node.

**Parameters** populated dynamically by the AI model:
```json
{
  "resource": "post",
  "operation": "create",
  "content": "Agent-generated post content",
  "title": "AI Post"
}
```

**Expect** POST `/posts.json` with `title` and `raw` body fields. Output item contains the Discourse post object.

### Test: tool userGroup remove

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "userGroup",
  "operation": "remove",
  "usernames": "jdoe",
  "groupId": "10"
}
```

**Expect** DELETE `/groups/10/members.json` with body `{ usernames: "jdoe" }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations + parameters | Documented in public docs | Identical to base `n8n-nodes-base.discourse` node |
| Tool registration | Inferred from published npm package | The base node declares `usableAsTool: true`; n8n auto-registers the `*Tool` variant |
| $fromAI() support | Documented in public docs | Standard n8n AI-agent tool convention |
| Output envelope unwrapping | Inferred from published npm package | Not documented in public n8n docs for the tool variant |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/discourse.ts` (shared with base Discourse node)
- **SDK:** `defineNode` + native `ExecutionContext` only
