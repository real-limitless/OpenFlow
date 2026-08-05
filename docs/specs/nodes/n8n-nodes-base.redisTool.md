---
type: n8n-nodes-base.redisTool
displayName: Redis (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Redis (AI Tool)

An AI agent tool variant of the Redis node. When connected to an AI Agent root node, the agent model can dynamically populate parameters using the `$fromAI()` function. Provides six Redis key-value operations and one informational operation against a configurable Redis server.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/redis/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://redis.readthedocs.io/en/stable/ | External service docs |

## Wire format

- **Type string:** `n8n-nodes-base.redisTool`
- **Aliases:** `Redis`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `redis` (host, port, password, database number, SSL)

## Parameters

### Operation selection

The user selects one of seven operations. Parameters are minimal — each operation requires only the key and optionally a value or pattern.

| Operation | Functional outcome | Key parameters |
|-----------|--------------------|----------------|
| **Delete** | Deletes a key from the Redis instance | `key` (string, required) |
| **Get** | Retrieves the value stored at a key | `key` (string, required) |
| **Info** | Returns generic server information (Redis INFO output) | (none) |
| **Increment** | Atomically increments the numeric value at a key by 1; creates the key with value 1 if absent | `key` (string, required) |
| **Keys** | Returns all keys matching a glob pattern | `pattern` (string, required, e.g. `*` or `user:*`) |
| **Set** | Writes a value to a key (creates or overwrites) | `key` (string, required), `value` (string, required) |
| **Publish** | Publishes a message to a Redis channel (PUBLISH command) | `channel` (string, required), `message` (string, required) |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description are configurable in the AI Agent node
- All operations return their result as a JSON payload on output[0]

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions. The credential provides the Redis connection details (host, port, password, database index, SSL toggle).

### Output

**Output[0]** — one item per input item, with a JSON payload containing the operation result:

- **Delete:** `{ "deleted": <number> }` (number of keys removed, typically 1 or 0)
- **Get:** `{ "value": <string|null> }` (null if key does not exist)
- **Info:** `{ "info": <string> }` (raw Redis INFO command output)
- **Increment:** `{ "value": <number> }` (the new value after increment)
- **Keys:** `{ "keys": [<string>, ...] }` (array of matching key names; empty if no match)
- **Set:** `{ "status": "OK" }` (confirmation)
- **Publish:** `{ "subscribers": <number> }` (number of subscribers that received the message)

### Errors

- Connection errors (unreachable host, auth failure, wrong database) propagate as node errors
- Attempting to increment a non-numeric key throws a Redis error
- Missing required parameters (key, value, pattern, channel/message) throw before the Redis call
- `continueOnFail` allows the workflow to proceed on error

### Expressions

All string parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Set and Get a value

**Given** input items:
```json
[{ "json": { "myKey": "test:spec" } }, { "json": {} }]
```

**Parameters** (item 0 — Set):
```json
{
  "operation": "set",
  "key": "test:spec",
  "value": "hello-spec"
}
```

**Expect** output[0].json to contain `{ "status": "OK" }`.

**Parameters** (item 1 — Get):
```json
{
  "operation": "get",
  "key": "test:spec"
}
```

**Expect** output[1].json to contain `{ "value": "hello-spec" }`.

### Test: Increment a key

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "increment",
  "key": "test:counter"
}
```

**Expect** output[0].json to contain `{ "value": 1 }`. (Running twice yields value 2.)

### Test: Keys pattern matching

**Given** a Redis instance that contains keys `user:1`, `user:2`, `admin:1`.

**Parameters:**
```json
{
  "operation": "keys",
  "pattern": "user:*"
}
```

**Expect** output[0].json.keys to contain both `user:1` and `user:2` but not `admin:1`.

### Test: Publish message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "publish",
  "channel": "test-channel",
  "message": "hello from spec"
}
```

**Expect** output[0].json to contain `{ "subscribers": <number> }` indicating the count of subscribers (may be 0).

### Test: Delete a key

**Given** a Redis instance with an existing key `test:spec`.

**Parameters:**
```json
{
  "operation": "delete",
  "key": "test:spec"
}
```

**Expect** output[0].json to contain `{ "deleted": 1 }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Public docs list all 7 operations (Delete, Get, Info, Increment, Keys, Set, Publish) |
| Credential fields | documented | Redis credential page documents host, port, password, database, SSL |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Exact key/value parameter names | inferred | Parameter names are abstracted to `key`, `value`, `pattern`, `channel`, `message` |
| Output shape details | inferred | Only functional outcomes are spec'd; Redis command responses vary by version |
| Tool-specific display/UX | inferred | The tool variant wraps the standard Redis operations identically in agent context |
| Info command output parsing | inferred | Raw INFO string is returned; no structured parsing is expected |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.redisTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
