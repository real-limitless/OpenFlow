---
type: n8n-nodes-base.amqpTrigger
displayName: AMQP Trigger
category: Development
versions: [1]
priority: medium
status: specced
---

# AMQP Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.amqptrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/amqp.md | Public docs only |
| https://www.amqp.org/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.amqpTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** `amqp` (required)

## Credentials

Uses the same `amqp` credentials as the AMQP Sender node. See [docs/specs/nodes/n8n-nodes-base.amqp.md](n8n-nodes-base.amqp.md) for the full credential table. Fields include hostname, port (default 5672), username, password, and transport type (tcp/tls).

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| sink | string | (none) | yes | Name of the queue or topic to listen on. Supports URI-like topic syntax e.g. `topic://sourcename.something`. |
| clientname | string | (none) | no | Client identifier for durable/persistent topic subscriptions. Leave empty for non-durable subscriptions or queues. |
| subscription | string | (none) | no | Subscription name for durable/persistent topic subscriptions. Leave empty for non-durable subscriptions or queues. |
| options.containerId | string | (none) | no | Custom container ID passed to the RHEA backend as `container_id`. |
| options.jsonConvertByteArrayToString | boolean | false | no | When true, converts byte-array content to string. Needed for Azure Service Bus compatibility. |
| options.jsonParseBody | boolean | false | no | When true, attempts to JSON-decode the message body to an object. |
| options.onlyBody | boolean | false | no | When true, each emitted item carries only the body value instead of the full response envelope. |
| options.pullMessagesNumber | number | 100 | no | Number of messages to pull from the broker per polling cycle. |
| options.parallelProcessing | boolean | true | no | When true, messages are processed concurrently. When false, handler execution is serialized. |
| options.reconnect | boolean | true | no | Whether to automatically reconnect on disconnect. |
| options.reconnectLimit | number | 50 | no | Maximum number of reconnect attempts. |
| options.sleepTime | number | 10 | no | Milliseconds to sleep after each polling cycle. |

## Runtime behavior

### Input

No input items. As a polling trigger, this node activates when the workflow starts by connecting to the configured AMQP 1.0 broker and subscribing to the given queue or topic. During manual execution, the node waits for message(s) then resolves.

### Output

Each received AMQP message produces one output item on `output[0]`. The emitted item shape depends on `onlyBody`:

- **`onlyBody: false` (default):** The full AMQP message envelope including the body, application properties, and delivery metadata.
- **`onlyBody: true`:** Each emitted item is the message body value directly (no wrapping envelope).

When `jsonParseBody` is enabled, the body is parsed as JSON. If `jsonConvertByteArrayToString` is enabled, byte-array body content is converted to a string before any JSON parse attempt.

Multiple messages accumulated in a polling cycle are emitted as multiple items in a single firing.

### Errors

- Credential validation runs a broker connection test: if the client cannot connect, the node throws an execution error.
- Subscription failures (invalid queue/topic, broker disconnect) propagate as execution errors.
- `continueOnFail` is respected for runtime message-processing errors, following standard n8n trigger conventions.

### Expressions

All text parameters (`sink`, `clientname`, `subscription`, `options.containerId`) accept expression strings.

## Acceptance tests

### Test: subscribe to a queue and emit a message

**Parameters:**

```json
{
  "sink": "my-queue"
}
```

**And** the broker delivers a message with body `"hello"` on queue `my-queue`.

**Expect** output[0] contains one item with the full message envelope including body `"hello"`.

### Test: JSON parse of message body

**Parameters:**

```json
{
  "sink": "events",
  "options": { "jsonParseBody": true }
}
```

**And** the broker delivers a message with body `{"temp":22.5,"unit":"C"}` on queue `events`.

**Expect** output[0] contains one item where the body is the parsed object `{ "temp": 22.5, "unit": "C" }`.

### Test: onlyBody mode

**Parameters:**

```json
{
  "sink": "notifications",
  "options": { "onlyBody": true }
}
```

**And** the broker delivers a message with body `"alert"` on queue `notifications`.

**Expect** output[0] contains:
```json
[{ "json": "alert" }]
```

### Test: durable subscription with clientname and subscription

**Parameters:**

```json
{
  "sink": "topic://orders",
  "clientname": "n8n-worker",
  "subscription": "order-processor"
}
```

**Expect** the executor establishes a durable/persistent topic subscription and receives messages published to `topic://orders` even when the consumer was temporarily disconnected.

### Test: multiple messages in one firing

**Parameters:**

```json
{
  "sink": "telemetry",
  "options": { "pullMessagesNumber": 200 }
}
```

**And** the broker has 3 messages queued on `telemetry` before the next poll.

**Expect** output[0] contains three items, one per received message.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | Inferred | Public docs mention AMQP trigger at high level only; exact names and defaults from corpus descriptor |
| Output item shape | Inferred | Full envelope vs `onlyBody` behavior from corpus; exact shape depends on broker response |
| Durable subscription mechanics | Inferred | `clientname` and `subscription` params from corpus; exact behavior follows AMQP 1.0 spec |
| Connection lifecycle | Inferred | Polling trigger — connect on activate, poll on schedule, cleanup on deactivate per n8n trigger pattern |
| Credential fields | Documented | Public credentials doc confirms hostname, port, username, password, transportType |
| `jsonConvertByteArrayToString` need | Inferred | Azure Service Bus compatibility flag from corpus |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/amqpTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
