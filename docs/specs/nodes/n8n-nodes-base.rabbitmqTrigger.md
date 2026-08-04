---
type: n8n-nodes-base.rabbitmqTrigger
displayName: RabbitMQ Trigger
category: Development
versions: [1]
priority: medium
status: specced
---

# RabbitMQ Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.rabbitmqtrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/rabbitmq/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rabbitmq/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.rabbitmqTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `rabbitmq` (required)
- **Is trigger:** true

## Credentials

Shares the same `rabbitmq` credential as the RabbitMQ app node. See `docs/specs/nodes/n8n-nodes-base.rabbitmq.md` for the credential schema (hostname, port, user, password, vhost, SSL fields).

## Parameters

### Queue

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| queue | string | (none) | no | Name of the queue to consume from. If not set, a broker-generated transient queue is used. |

### Options

| name | type | default | notes |
|------|------|---------|-------|
| options.acknowledge | enum | `immediately` | Controls when consumed messages are acknowledged: `immediately` (ack as soon as received), `executionFinishes` (ack after workflow execution completes regardless of outcome), `executionFinishesSuccessfully` (ack only after successful execution), `laterMessageNode` (defer ack to a downstream RabbitMQ Delete From Queue node) |
| options.assertExchange | boolean | true | Assert that the exchange exists before consuming |
| options.assertQueue | boolean | true | Assert that the queue exists before consuming |
| options.autoDelete | boolean | false | Delete the queue when consumer count drops to zero |
| options.durable | boolean | true | Queue survives broker restarts |
| options.exclusive | boolean | false | Scope the queue to this connection only |
| options.onlyContent | boolean | false | Emit only the message body content, omitting envelope/metadata |
| options.jsonParseBody | boolean | false | When true, attempt JSON.parse on the message body; emit the parsed object on success, fall back to raw string on failure |
| options.contentIsBinary | boolean | false | Treat the message body as binary data and include it as a binary attachment on the output item |
| options.parallelMessages | number | -1 | Max number of concurrent message processing threads. -1 means no limit. Only relevant when acknowledge is not `immediately`. |
| options.arguments | key-value[] | (none) | AMQP consumer arguments (key-value pairs) |
| options.headers | key-value[] | (none) | Custom headers to set on the consumer |
| options.binding | binding[] | (none) | Bind the queue to one or more exchanges. Each binding has an exchange name and a routing key. |

## Runtime behavior

### Connection lifecycle

When the workflow is activated, the trigger establishes a connection to the RabbitMQ broker using the configured credentials and begins consuming from the specified queue. If no queue is named, a broker-generated exclusive transient queue is created. If bindings are configured, the queue is bound to the specified exchanges.

### Message consumption

Each message received from the queue produces one output item on `main` output. Multiple messages received between polling cycles are emitted as a batch (multiple items in a single firing).

### Output item shape

Each output item contains:

- **`message`** — the message body (raw Buffer string, or JSON-parsed object when `jsonParseBody` is enabled, or omitted when `contentIsBinary` is true)
- **`fields`** — AMQP delivery fields:
  - `consumerTag` — the consumer tag string
  - `deliveryTag` — the delivery tag (number)
  - `redelivered` — boolean indicating if the message was redelivered
  - `exchange` — the exchange the message was published to
  - `routingKey` — the routing key used
- **`properties`** — AMQP message properties (contentType, contentEncoding, headers, deliveryMode, priority, correlationId, replyTo, expiration, messageId, timestamp, type, userId, appId, clusterId)

When `onlyContent` is true, the output item contains only the `message` field (or parsed content).

When `contentIsBinary` is true, the message body is stored in binary data and `message` contains the file name/metadata reference.

### Acknowledgment modes

- **immediately** — Message is ack'd before the workflow executes. Fastest but offers no replay on failure.
- **executionFinishes** — Message is ack'd after the workflow finishes, whether it succeeded or failed.
- **executionFinishesSuccessfully** — Message is ack'd only after successful workflow execution. On failure the message is nack'd (and requeued).
- **laterMessageNode** — No ack/nack is sent. It is deferred to a downstream RabbitMQ Delete From Queue node that references this trigger's delivery metadata (consumerTag and deliveryTag).

### Errors

- Connection failures to the broker throw an error during activation.
- Consumer cancellation (e.g. queue deleted) triggers an error.
- Individual message processing errors respect `continueOnFail`; when enabled, failed items are emitted with error metadata.

### Expressions

`queue` and option values that accept strings support expression interpolation.

## Acceptance tests

### Test: basic queue consumption

**Given** a RabbitMQ broker with a queue `test-q` containing one message `{"hello":"world"}`.

**Parameters:**
```json
{
  "queue": "test-q",
  "options": {
    "acknowledge": "immediately"
  }
}
```

**Expect** output[0] to contain one item with:
```json
{
  "json": {
    "message": "{\"hello\":\"world\"}",
    "fields": {
      "consumerTag": "<any-string>",
      "deliveryTag": 1,
      "redelivered": false,
      "exchange": "",
      "routingKey": "test-q"
    },
    "properties": {
      "contentType": "text/plain"
    }
  }
}
```

### Test: JSON parse body

**Given** a queue containing one message with body `{"temp": 22.5}`.

**Parameters:**
```json
{
  "queue": "test-q",
  "options": {
    "acknowledge": "immediately",
    "jsonParseBody": true
  }
}
```

**Expect** output[0].json.message to equal `{"temp": 22.5}` (parsed JSON object, not string).

### Test: onlyContent mode

**Parameters:**
```json
{
  "queue": "test-q",
  "options": {
    "acknowledge": "immediately",
    "onlyContent": true
  }
}
```

**Expect** output[0].json to contain only `message` (no `fields` or `properties`).

### Test: JSON parse fallback on invalid JSON

**Parameters:**
```json
{
  "queue": "test-q",
  "options": {
    "jsonParseBody": true,
    "onlyContent": true
  }
}
```

**And** a message body that is not valid JSON (e.g. `not-json`).

**Expect** output[0].json.message to equal `"not-json"` (raw string fallback).

### Test: deferred acknowledgment (laterMessageNode)

**Parameters:**
```json
{
  "queue": "test-q",
  "options": {
    "acknowledge": "laterMessageNode"
  }
}
```

**Expect** output items to include `fields.deliveryTag` and `fields.consumerTag`. The message is NOT ack'd by the trigger; it must be ack'd by a downstream RabbitMQ Delete From Queue node referencing these fields.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output item shape | Inferred from corpus type definition | Public docs do not describe output shape |
| Acknowledge modes | Inferred from corpus type definition enum | Four modes: immediately, executionFinishes, executionFinishesSuccessfully, laterMessageNode |
| Binding parameters | Inferred from corpus type definition | exchange + routingKey per binding entry |
| Connection lifecycle | Inferred | Standard for n8n trigger nodes with AMQP brokers |
| credential schema | Documented | Public docs cover all fields |
| contentIsBinary behavior | Inferred | Spec declares the intent; exact binary attachment format may vary |
| Error handling | Inferred | Standard n8n trigger conventions |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/rabbitmqTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
