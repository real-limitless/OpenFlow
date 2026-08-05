---
type: n8n-nodes-base.gongTool
displayName: Gong Tool
category: Development, Developer Tools
versions: [1]
priority: medium
status: specced
---

# Gong Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gong/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gong/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

No dedicated GongTool docs page exists (returns 404). Behavior is inferred from the base Gong app node and the standard AI agent tool variant pattern.

## Wire format

- **Type string:** `n8n-nodes-base.gongTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (passthrough; tool output replaces input when used inside an AI Agent)
- **Outputs:** `main` × 1
- **Credentials:** `gongApi` (API access key + secret) or `gongOAuth2Api` (OAuth2)

## Parameters

This tool variant shares the same two-resource structure as the base Gong node, except parameters support `$fromAI()` dynamic population by the AI agent runtime.

### Resource selector (`resource`)

| option | notes |
|--------|-------|
| `call` | Exposes get and getMany operations for Gong call recordings |
| `user` | Exposes get and getMany operations for Gong users |

### Call operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | `get` or `getMany` |
| `callId` | string | if `get` | The Gong call ID to retrieve |
| `fromDateTime` | ISO-8601 string | no | Earliest call start time (getMany only) |
| `toDateTime` | ISO-8601 string | no | Latest call start time (getMany only) |
| `limit` | number | no | Max results per page (getMany only) |
| `offset` | number | no | Pagination offset (getMany only) |

### User operations

| name | type | required | notes |
|------|------|----------|-------|
| `operation` | string | yes | `get` or `getMany` |
| `userId` | string | if `get` | Gong user ID to retrieve |
| `email` | string | no | Email address lookup (get only) |

### Tool-specific behavior

- All parameter values support `$fromAI()` expressions, allowing the AI agent to dynamically populate fields based on conversation context.
- The tool node passes input items through and appends or replaces with the API response.

## Runtime behavior

### Input

Each input item triggers one API call. The node does not batch items.

### Output

Each operation returns the Gong API response body:

- **Call → Get:** Single call object (id, clientUniqueId, title, duration, started, participants, topics, etc.).
- **Call → Get Many:** Object with `calls` array and optional pagination metadata.
- **User → Get:** Single user object (id, email, name, title, phoneNumber, etc.).
- **User → Get Many:** Object with `users` array.

When used as an AI tool, the output is rendered as a tool result message to the AI model.

### Errors

- Authentication failures (4xx) throw with the Gong error body; `continueOnFail` can suppress per-item failures.
- Network errors throw; retry is left to external retry nodes.
- Invalid resource/operation combinations throw early.

### Expressions

All free-text parameters accept n8n expression strings (`={{ }}`) and `$fromAI()` calls.

## Acceptance tests

### Test: tool — call get by id with $fromAI

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "call",
  "operation": "get",
  "callId": "={{ $fromAI(\"Extract the Gong call ID from the conversation\") }}"
}
```

**Expect** output[0].json contains a call object with fields `id`, `title`, `started`, `duration`, `participants`.

### Test: tool — call get many with date range

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "call",
  "operation": "getMany",
  "fromDateTime": "2026-01-01T00:00:00Z",
  "toDateTime": "2026-01-31T23:59:59Z"
}
```

**Expect** output[0].json contains a `calls` array.

### Test: tool — user get many

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getMany"
}
```

**Expect** output[0].json contains a `users` array of user objects with `id` and `email`.

### Test: tool — invalid resource returns error

**Given** an invalid resource value, the execute function should throw or emit an error item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | inferred from base Gong node | Tool variant shares the same API surface |
| Credential types | documented | gongApi and gongOAuth2Api per n8n credentials page |
| $fromAI() support | inferred from Tool pattern | Standard for all AI agent tool variants |
| Exact parameter names | inferred | Abstracted; exact casing may differ from base node |
| Gong API call detail fields | inferred | The API returns many fields not enumerated in n8n docs |
| Separate docs page | absent | No dedicated gongTool page exists; behavior derived from base Gong node |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/gongTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
