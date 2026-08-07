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
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.discourseTool`
- **Aliases:** (none — this is the AI agent tool variant of `n8n-nodes-base.discourse`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `discourseApi` (API key + instance URL + username)

## Parameters

The Discourse Tool shares the same resources, operations, and parameter shapes as the base Discourse node (`docs/specs/nodes/n8n-nodes-base.discourse.md`). The full parameter table is defined there; this variant differs only in two behavioral aspects:

| Resource | Operation | Parameters (same as base) |
|----------|-----------|---------------------------|
| `category` | `create`, `getAll`, `update` | `name`, `color`, `textColor`, `categoryId`, `returnAll`, `limit`, `updateFields` |
| `group` | `create`, `get`, `getAll`, `update` | `name`, `groupId`, `returnAll`, `limit` |
| `post` | `create`, `get`, `getAll`, `update` | `content`, `title`, `postId`, `additionalFields`, `returnAll`, `limit` |
| `user` | `create`, `get`, `getAll` | `name`, `email`, `username`, `password`, `by`, `externalId`, `flag`, `returnAll`, `limit`, `options` |
| `userGroup` | `add`, `remove` | `usernames`, `groupId` |

### Discourse-specific parameters (tool mode)

When an AI agent invokes this tool via `$fromAI()`, the LLM supplies parameter values dynamically. Every field that accepts expressions in the base node is eligible for AI-driven population. The tool does not introduce any extra parameters beyond those in the base Discourse node.

## Runtime behavior

### Input

Each input item is processed independently. The `resource` and `operation` selectors are read from item 0, while per-field values support per-item expressions.

### Output

Same as the base Discourse node: each item produces one output item containing the JSON response body from the Discourse API. Response envelope unwrapping follows the same conventions (`response.category`, `response.category_list.categories`, `response.group`, `response.groups`, `response.latest_posts`, etc.).

### Errors

On API error the node throws. If `continueOnFail` is enabled, an item `{ error: <message> }` is emitted instead. The tool should be configured not to expose raw credential values in error messages sent back to the calling AI agent.

### Expressions

All string, number, boolean, and options parameters accept expressions. When invoked by an AI agent, the node additionally supports `$fromAI()` for dynamic parameter population — the LLM fills parameter values at runtime based on the tool description schema exposed by n8n's AI framework.

## Acceptance tests

### Test: post create via AI agent

**Given** an incoming AI agent invocation with the tool parameters resolved by `$fromAI()`:

```json
[{ "json": {} }]
```

**Parameters (supplied by LLM):**
```json
{
  "resource": "post",
  "operation": "create",
  "title": "AI-generated topic",
  "content": "This post was created by an AI agent.",
  "additionalFields": {
    "category": "announcements"
  }
}
```

**Expect** a POST request to `/posts.json` with body `{ title: "AI-generated topic", raw: "This post was created by an AI agent.", category: "announcements" }`. Output item matches the base `post.create` response shape.

### Test: user lookup by username

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "get",
  "by": "username",
  "username": "admin"
}
```

**Expect** a GET request to `/users/admin.json`. Output item contains user data (same as base Discourse node).

### Test: category list with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "category",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** a GET request to `/categories.json`. Output is truncated to at most 10 items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool-specific behavior | Public docs only | The Discourse Tool has no dedicated docs page (404). Behavior is identical to the base Discourse node with tool-mode activation via `usableAsTool: true`. |
| Base node resources + operations | Public docs + corpus cross-reference | Fully documented at docs.n8n.io for the Discourse app node. |
| `$fromAI()` support | Public docs only | Generic AI agent tool mechanism documented at docs.n8n.io; applies to any node with `usableAsTool: true`. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/discourseTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
