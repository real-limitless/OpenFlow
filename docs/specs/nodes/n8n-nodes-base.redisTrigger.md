---
type: n8n-nodes-base.redisTrigger
displayName: Redis Trigger
category: Communication, Development, Data & Storage
versions: [1]
priority: medium
status: specced
---

# Redis Trigger

Subscribe to one or more Redis channels and emit a workflow item for each received message. Supports glob-style pattern subscriptions.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.redistrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/redis/ | Public docs only (credentials) |

## Wire format

- **Type string:** `n8n-nodes-base.redisTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — type `redis` (password, user, host, port, database, SSL, disableTlsVerification)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| channels | string | | yes | — | Comma-separated Redis channel names or glob patterns (supports `*` wildcard). Whitespace around commas is trimmed. |
| options | collection | `{}` | no | — | Nested options below |
| options.jsonParseBody | boolean | `false` | no | options | Attempt to parse each message string as JSON before emission; on parse failure the raw string is preserved |
| options.onlyMessage | boolean | `false` | no | options | When true, emit only the message payload; when false, emit `{ channel, message }` |

## Runtime behavior

### Connection lifecycle

On workflow activation, the node establishes a connection to Redis using the provided credentials. It calls `PING` to verify connectivity before subscribing. If the connection fails (wrong host/port, auth failure, timeout) the node throws an error and activation fails.

### Subscription

The node calls Redis `PSUBSCRIBE` with the configured channel patterns. Standard Redis glob patterns apply: `*` matches any sequence, and comma-separated entries subscribe to multiple patterns in a single command. The subscription remains active for the lifetime of the workflow.

### Message emission

Each received message is emitted as an output item. The default shape is:

```json
{
  "channel": "channel-name",
  "message": "raw message string"
}
```

When `onlyMessage` is enabled, the shape is:

```json
{
  "message": "raw message string"
}
```

When `jsonParseBody` is enabled, the message string is run through `JSON.parse`. If parsing succeeds the emitted value is a structured object; if parsing fails the raw string is emitted unchanged.

### Manual trigger

In manual mode (workflow editor test), the node subscribes, emits the first message received, then completes. In production trigger mode, it continues emitting indefinitely.

### Cleanup

On workflow deactivation, the node calls `PUNSUBSCRIBE` for all channels and closes the Redis connection.

### Errors

- Missing channels parameter → throw on activation.
- Redis connection failure (wrong host/port, auth failure, timeout) → throw; workflow fails to activate.
- Redis server error during subscription → depends on the Redis client error handling; typically throws.
- Individual message parse failure (jsonParseBody) is silently swallowed — the raw string is emitted.

### Expressions

The `channels` string parameter accepts expression strings.

## Acceptance tests

### Test: basic subscription and message emission

**Given** a running Redis instance.

**Parameters:**

```json
{
  "channels": "test:events"
}
```

Publish a message `"hello"` to channel `test:events`.

**Expect** output[0] contains one item:
```json
{
  "channel": "test:events",
  "message": "hello"
}
```

### Test: glob pattern subscription

**Parameters:**

```json
{
  "channels": "test:*"
}
```

Publish a message to `test:alpha`.

**Expect** output[0] contains one item with `channel` = `"test:alpha"`.

Publish a message to `other:beta`.

**Expect** no output item (pattern does not match).

### Test: JSON parse body option

**Parameters:**

```json
{
  "channels": "test:json",
  "options": { "jsonParseBody": true }
}
```

Publish `"{\"count\":5}"` to `test:json`.

**Expect** `item.json.message` is the parsed object `{ count: 5 }`.

Publish `"not-json"` to `test:json`.

**Expect** `item.json.message` is the raw string `"not-json"`.

### Test: onlyMessage option

**Parameters:**

```json
{
  "channels": "test:onlymsg",
  "options": { "onlyMessage": true }
}
```

Publish `"hello"` to `test:onlymsg`.

**Expect** output[0] contains one item:
```json
{ "message": "hello" }
```
No `channel` field should be present.

### Test: multiple channels

**Parameters:**

```json
{
  "channels": "test:a, test:b"
}
```

Publish a message to `test:a` and another to `test:b`.

**Expect** two output items, one with `channel` = `"test:a"` and one with `channel` = `"test:b"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public docs existence | documented | Docs page exists but contains only a one-paragraph summary; no parameter details |
| Type string | corpus | Confirmed from package metadata |
| Credential fields | documented | Shared with Redis action node; credential fields listed on public creds page |
| Parameter names and purpose | corpus | channels, jsonParseBody, onlyMessage from descriptor; behavior abstracted |
| PSBUSCRIBE (glob pattern) vs SUBSCRIBE | inferred | Implementation uses pSubscribe for wildcard support |
| Manual trigger behavior | inferred | Standard n8n trigger pattern |
| Connection lifecycle and cleanup | inferred | Standard Redis client pattern |
| Error handling on connection failure | inferred | Standard node behavior |
| Comma-split whitespace trimming | inferred | Implementation detail abstracted |
| jsonParseBody silent fallback | inferred | Try/catch with no re-throw |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/redisTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Depends on a Redis client library (e.g. `ioredis` or `redis`). Reuses the same `redis` credential type as the Redis action node. The executor must implement the trigger lifecycle: activate (connect + subscribe), deactivate (unsubscribe + disconnect), and manual trigger (first-message-then-complete).