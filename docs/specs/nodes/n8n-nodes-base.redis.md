---
type: n8n-nodes-base.redis
displayName: Redis
category: Development, Data & Storage
versions: [1]
priority: high
status: implemented
---

# Redis

Execute Redis commands: get, set, delete, increment, publish, list operations (push/pop/llen), key search, and instance info.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/redis/ | Public docs only (credentials) |

## Wire format

- **Type string:** `n8n-nodes-base.redis`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** required — type `redis` (password, user, host, port, database, SSL, disableTlsVerification)

### Credential fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| password | password | | no | Redis AUTH password |
| user | string | | no | Username for ACL-based auth; blank = password-only |
| host | string | `localhost` | yes | Redis server hostname |
| port | number | `6379` | yes | Redis server port |
| database | number | `0` | yes | Redis logical database number |
| ssl | boolean | `false` | no | Enable TLS connection |
| disableTlsVerification | boolean | `false` | no | Only when ssl=true; skip certificate verification |

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `info` | yes | — | One of: delete, get, incr, info, keys, llen, pop, publish, push, set |
| key | string | | yes* | delete, get, incr, set | Redis key name |
| propertyName | string | `propertyName` | yes* | get | Dot-notation property name for storing the retrieved value on the output item |
| keyType | options | `automatic` | no | get | `automatic` \| `hash` \| `list` \| `sets` \| `string` — hints the data type for get |
| keyPattern | string | | yes* | keys | Glob-style pattern (e.g. `user:*`) |
| getValues | boolean | `true` | no | keys | Fetch matching values alongside key names |
| value | string | | | set | The value to write |
| valueIsJSON | boolean | `true` | no | set, keyType=hash | When keyType is hash, parse value as JSON vs. key/value pairs |
| expire | boolean | `false` | no | incr, set | Enable TTL on the key |
| ttl | number | `60` | no | incr/set + expire=true | Seconds until key expiration (min 1) |
| channel | string | | yes* | publish | Redis channel name |
| messageData | string | | yes* | publish, push | Data payload to publish/push |
| list | string | | yes* | llen, push, pop | Redis list key |
| tail | boolean | `false` | no | push, pop | true = RPUSH/RPOP (end); false = LPUSH/LPOP (head) |
| propertyName | string | `propertyName` | no | pop | Optional output field for popped value (dot-notation) |
| options | collection | `{}` | no | get, pop | Nested options below |
| options.dotNotation | boolean | `true` | no | get, pop | When true, `"a.b"` sets nested `{ a: { b: value } }`; when false, sets `{ "a.b": value }` |

\*Required when displayOptions show the field.

## Runtime behavior

### Input

One key/command operation per input item (standard item loop).

### Output

| operation | Output shape |
|-----------|----------------|
| **get** | Same item count as input. Each item receives a new property named by `propertyName` containing the Redis value (string, number, array for list/set types). |
| **set** | Success confirmation; input item passed through. |
| **delete** | Deletion confirmation; input item passed through. |
| **incr** | Incremented value (number) returned on each item. |
| **info** | Redis `INFO` response string or parsed object on each item. |
| **keys** | One output item per matching key (expand). Each item contains key name and optionally the value. |
| **llen** | List length (number) returned on each item. |
| **push** | New list length (number) returned on each item. |
| **pop** | Popped value stored on input item at `propertyName` (or default `propertyName`). |
| **publish** | Number of subscribers that received the message (number) on each item. |

Data type coercion: Redis stores all values as strings. The node parses numbers/JSON as appropriate per operation. Hash, list, and set types are returned as arrays/objects.

### Errors

- Connection failure (wrong host/port, auth failure, timeout) → fail item/node.
- Missing required param (key for get/delete/incr/set, channel for publish, etc.) → fail.
- Non-existent key for get/delete → may return null/empty (no error).
- Type mismatch (e.g. `llen` on a non-list key) → fail.
- `continueOnFail`: failed item yields error shape on output per engine policy.

### Expressions

All string parameters (`key`, `propertyName`, `value`, `channel`, `messageData`, `list`, `keyPattern`) and numeric/boolean fields accept expression strings where the UI allows expressions.

## Acceptance tests

### Test: set then get string value

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "set",
  "key": "test:hello",
  "value": "world"
}
```

**Expect** output[0]: success; item passes through.

Then with the same connection, **get** the key:

**Parameters:**

```json
{
  "operation": "get",
  "key": "test:hello",
  "propertyName": "myValue"
}
```

**Expect** output[0] contains `item.json.myValue === "world"`.

### Test: increment with TTL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "incr",
  "key": "test:counter",
  "expire": true,
  "ttl": 30
}
```

**Expect** output[0] contains `item.json` with integer incremented value (1 on first call). Key disappears from Redis after 30 seconds.

### Test: publish to channel

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "publish",
  "channel": "test:events",
  "messageData": "{\"event\":\"completed\"}"
}
```

**Expect** output[0] contains the count of subscribers that received the message (0 if none listening).

### Test: list push and pop

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters (push):**

```json
{
  "operation": "push",
  "list": "test:mylist",
  "messageData": "item1",
  "tail": true
}
```

**Expect** RPUSH returns new list length.

**Parameters (pop):**

```json
{
  "operation": "pop",
  "list": "test:mylist",
  "tail": false,
  "propertyName": "popped"
}
```

**Expect** LPOP returns `"item1"` stored at `item.json.popped`.

### Test: keys with pattern

**Given** items already inserted with keys `user:1`, `user:2`, `user:3`.

**Parameters:**

```json
{
  "operation": "keys",
  "keyPattern": "user:*",
  "getValues": true
}
```

**Expect** output[0] contains 3 items, each with a key name and its value.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations & primary params | documented | 10 operations listed in docs; wire names from descriptor |
| Credential fields | documented | Host/port/db/SSL/password/user from public creds page |
| Default operation `info` | descriptor | From package node-definition schema |
| Output item shapes | inferred | Docs describe behavior; exact JSON output keys inferred |
| Data type coercion for get/set | inferred | Redis is string-only; node likely auto-parses numbers & JSON |
| ValueIsJSON for hash set | descriptor | From descriptor |
| DotNotation option | descriptor | From descriptor |
| Error on type mismatch | inferred | Redis protocol errors |
| TTL behavior (expire flag + ttl) | documented at descriptor level | From descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/redis.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Depends on a Redis client library (e.g. `ioredis`). Credential fields map 1:1 to connection options. Operation dispatch by switch on `operation` value.
