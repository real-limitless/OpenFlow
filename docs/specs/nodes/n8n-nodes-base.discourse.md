---
type: n8n-nodes-base.discourse
displayName: Discourse
category: Communication
versions: [1]
priority: medium
status: specced
usableAsTool: true
---

# Discourse

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discourse/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/discourse/ | Public docs only |
| https://docs.discourse.org/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.discourse`
- **Aliases:** `n8n-nodes-base.discourseTool` (usableAsTool variant, same behavior)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `discourseApi` (API key + instance URL + username)

## Parameters

A user must pick a **Resource** (entity type), then an **Operation** within that resource. Each resource exposes its own parameter set.

| Resource | Operation | Parameters | Notes |
|----------|-----------|------------|-------|
| `category` | `create` | `name` (string, required), `color` (color, required), `textColor` (color, required) | POST `/categories.json` |
| `category` | `getAll` | `returnAll` (boolean), `limit` (number, 1–100, default 50, shown when returnAll=false) | GET `/categories.json` |
| `category` | `update` | `categoryId` (string, required), `name` (string, required), `updateFields.color` (color, optional), `updateFields.textColor` (color, optional) | PUT `/categories/{id}.json` |
| `group` | `create` | `name` (string, required) | POST `/admin/groups.json` |
| `group` | `get` | `name` (string, required) | GET `/groups/{name}` |
| `group` | `getAll` | `returnAll` (boolean), `limit` (number, 1–100, default 50) | GET `/groups.json` |
| `group` | `update` | `groupId` (string, required), `name` (string, required) | PUT `/groups/{groupId}.json` |
| `post` | `create` | `content` (string, required), `title` (string), `additionalFields.category` (dynamic options from instance), `additionalFields.reply_to_post_number` (string), `additionalFields.topic_id` (string) | POST `/posts.json`; `content` maps to Discourse `raw` field |
| `post` | `get` | `postId` (string, required) | GET `/posts/{postId}` |
| `post` | `getAll` | `returnAll` (boolean), `limit` (number, 1–100, default 50) | GET `/posts.json`; paginates via `before={lastPostId}` |
| `post` | `update` | `postId` (string, required), `content` (string, required), `updateFields.edit_reason` (string, optional), `updateFields.cooked` (boolean, optional) | PUT `/posts/{postId}.json` |
| `user` | `create` | `name` (string, required), `email` (string, required), `username` (string, required), `password` (string, masked, required), `additionalFields.active` (boolean), `additionalFields.approved` (boolean) | POST `/users.json` |
| `user` | `get` | `by` (enum: `username` / `externalId`), `username` (string, required when by=username), `externalId` (string, required when by=externalId) | GET `/users/{username}` or `/u/by-external/{externalId}.json` |
| `user` | `getAll` | `flag` (enum: active/blocked/new/staff/suspect/suspended), `returnAll` (boolean), `limit` (number, 1–100, default 50), `options.asc` (boolean), `options.order` (enum: created/days_visited/email/last_emailed/posts/posts_read/read_time/seen/topics_viewed/trust_level/username), `options.showEmails` (boolean), `options.stats` (boolean) | GET `/admin/users/list/{flag}.json` |
| `userGroup` | `add` | `usernames` (string, required, comma-separated), `groupId` (string, required) | PUT `/groups/{groupId}/members.json` |
| `userGroup` | `remove` | `usernames` (string, required, comma-separated), `groupId` (string, required) | DELETE `/groups/{groupId}/members.json` |

### Resource selection

| name | type | default | options |
|------|------|---------|---------|
| `resource` | options | `post` | `category`, `group`, `post`, `user`, `userGroup` |

**Note:** A Search resource (query operation with `term` and `simple` boolean) exists in the descriptor files but is commented out in the production executor. It is not currently exposed.

## Runtime behavior

### Input

Each input item is processed independently. The `resource` and `operation` parameters are read from item 0 (shared across all items), while per-field values support per-item expressions.

### Output

Each item produces one output item with the JSON response body from the Discourse API. The node unwraps response envelopes where applicable:
- `category.create` / `category.update` → `response.category`
- `category.getAll` → `response.category_list.categories`
- `group.create` → `response.basic_group`
- `group.get` → `response.group`
- `group.getAll` → `response.groups`
- `post.getAll` → `response.latest_posts` (paginated via `before` cursor)
- `post.update` → `response.post`

Read operations that accept `returnAll=false` splice results to `limit` items on the client side after fetching.

### Errors

On API error the node throws. If `continueOnFail` is enabled, an item `{ error: <message> }` is emitted instead and processing continues to the next item.

### Expressions

All string, number, boolean, and options parameters accept expressions.

## Acceptance tests

### Test: category create

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

**Expect** a POST request to `/categories.json` with body `{ name: "TestCategory", color: "FF0000", text_color: "FFFFFF" }`. Output item contains the Discourse category object under `response.category`.

### Test: post create with reply

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "create",
  "title": "Hello",
  "content": "This is a test post.",
  "additionalFields": {
    "topic_id": "42",
    "reply_to_post_number": "1"
  }
}
```

**Expect** a POST request to `/posts.json` with body `{ title: "Hello", raw: "This is a test post.", topic_id: "42", reply_to_post_number: "1" }`.

### Test: user getAll with flag and pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getAll",
  "flag": "active",
  "returnAll": false,
  "limit": 25,
  "options": {
    "order": "username",
    "asc": true,
    "showEmails": true
  }
}
```

**Expect** a GET request to `/admin/users/list/active.json?order=username&asc=true&show_emails=true`. Output is truncated to at most 25 items.

### Test: userGroup add

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "userGroup",
  "operation": "add",
  "usernames": "alice,bob",
  "groupId": "5"
}
```

**Expect** a PUT request to `/groups/5/members.json` with body `{ usernames: "alice,bob" }`.

### Test: error handling with continueOnFail

**Given** invalid parameters (e.g. missing required field) with `continueOnFail` enabled. **Expect** the item to produce `{ error: "<message>" }` and execution continues to subsequent items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available resources + operations | Documented in public docs | Public docs list Category, Group, Post, User, User Group; Search is listed in descriptor but commented out in production code |
| Parameter names and types | Inferred from published npm package | Cross-referenced against Discourse REST API docs at docs.discourse.org |
| Credential shape | Documented in public docs | API key + URL + username, documented at docs.n8n.io |
| API endpoints called | Inferred from published npm package | All reference docs.discourse.org paths in comments |
| Output envelope unwrapping | Inferred from published npm package | Not documented in public n8n docs |
| Search resource | Documented as excluded | Commented out in npm published code; not currently available |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/discourse.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
