---
type: n8n-nodes-base.rabbitmq
displayName: RabbitMQ
category: Communication
versions: [1, 1.1]
priority: medium
status: specced
---

# RabbitMQ

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rabbitmq.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/rabbitmq.md | Public docs only |
| https://www.rabbitmq.com/docs/connections | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.rabbitmq`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `rabbitmq` (required)
- **Usable as tool:** yes

## Credentials

The node connects to a RabbitMQ broker using `rabbitmq` credentials with these fields:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| hostname | string | (none) | Broker hostname or IP |
| port | number | (none) | Broker port |
| user | string | guest | Auth username |
| password | string | guest | Auth password |
| vhost | string | `/` | Virtual host |
| ssl | boolean | false | Enable TLS |
| passwordless | boolean | false | SASL EXTERNAL cert auth (when ssl=true) |
| ca | string | (none) | CA certificates (when ssl=true) |
| cert | string | (none) | Client certificate (when ssl=true) |
| key | string | (none) | Client key (when ssl=true) |
| passphrase | string | (none) | SSL passphrase (when ssl=true) |

A credential test (`rabbitmqConnectionTest`) validates connectivity by attempting a broker connection before execution.

## Parameters

### Common

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | hidden/options | `sendMessage` | yes | `sendMessage` (Send a Message to RabbitMQ) or `deleteMessage` (Delete From Queue) |

### Send Message parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| mode | enum | `queue` | yes | `queue` — publish directly to a named queue; `exchange` — publish to an exchange with routing |
| queue | string | (none) | conditional | Queue name (required when mode=queue) |
| exchange | string | (none) | conditional | Exchange name (required when mode=exchange) |
| exchangeType | enum | `fanout` | conditional | One of `direct`, `topic`, `headers`, `fanout` (used when mode=exchange) |
| routingKey | string | (none) | conditional | Routing key for the exchange (used when mode=exchange) |
| sendInputData | boolean | true | no | When true, serializes incoming item JSON as the message payload |
| message | string | (none) | conditional | Custom message text (shown when sendInputData=false) |

### Options (sendMessage)

| name | type | default | notes |
|------|------|---------|-------|
| options.alternateExchange | string | (none) | Fallback exchange when primary exchange cannot route (exchange mode only) |
| options.arguments | key-value[] | (none) | AMQP publish arguments (key-value pairs) |
| options.autoDelete | boolean | false | Delete queue when consumer count drops to zero |
| options.durable | boolean | true | Queue survives broker restarts |
| options.exclusive | boolean | false | Scope queue to this connection only (queue mode) |
| options.headers | key-value[] | (none) | Custom message headers (key-value pairs) |

### Delete Message

The deleteMessage operation has no configurable parameters beyond the operation selector. It works in conjunction with a RabbitMQ Trigger node: items received by the trigger with `acknowledge` set to `laterMessageNode` are acknowledged (deleted from queue) when passed through this node later in the workflow. A notice explains this behavior.

## Runtime behavior

### Input

Each item from `main` input is processed independently. Items carry data to be published, or for deleteMessage, the acknowledgment routing metadata from a prior RabbitMQ Trigger node.

### Output (sendMessage)

The node publishes one RabbitMQ message per input item to the configured queue or exchange. After all publishes complete, it waits for broker confirmation (when publisher confirms are enabled) and returns the original input items unmodified on output[0]. Each input item produces exactly one output item in order. No new keys are added on success.

### Output (deleteMessage)

Items passed through are acknowledged/deleted from their source queue. Output[0] contains the same items unmodified, representing successful acknowledgment.

### Errors

- Credential validation runs a broker connection test: if the client cannot connect, the credential test returns an error.
- Publish failures (connection refused, invalid queue/exchange, broker timeout) propagate as execution errors.
- `continueOnFail` is respected: when enabled, a failed item produces an error item — `{ json: { ...item.json, error: <error message> }, pairedItem: { item: <index> } }` — on the output instead of halting. Non-failed items pass through as identity.

### Expressions

`queue`, `exchange`, `routingKey`, `message`, `alternateExchange`, and credential fields that accept expressions support expression strings.

## Acceptance tests

### Test: send to default queue

**Given** input items:

```json
[{ "json": { "sensor": "temp-01", "value": 22.5 } }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "mode": "queue",
  "queue": "test-queue",
  "sendInputData": true
}
```

**Expect** output[0] to equal the input items (identity passthrough). The executor must have published a message to queue `test-queue` with the JSON-serialized input as payload.

### Test: send to exchange with routing key

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "mode": "exchange",
  "exchange": "events",
  "exchangeType": "topic",
  "routingKey": "sensor.temperature",
  "sendInputData": false,
  "message": "alert: high temperature"
}
```

**Expect** output[0] equals input items. The executor must have published to exchange `events` with routing key `sensor.temperature` and payload `"alert: high temperature"`.

### Test: send with options (durable, headers)

**Given** input items:

```json
[{ "json": { "id": 1 } }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "mode": "queue",
  "queue": "opts-queue",
  "sendInputData": false,
  "message": "test",
  "options": {
    "durable": true,
    "autoDelete": false,
    "headers": [
      { "key": "source", "value": "openflow" }
    ]
  }
}
```

**Expect** publish executed with durable=true and custom header `source: openflow`. Output[0] equals input items.

### Test: delete from queue

**Given** input items carrying RabbitMQ trigger metadata:

```json
[{ "json": { "fields": { "consumerTag": "tag-1", "deliveryTag": 42 } } }]
```

**Parameters:**

```json
{
  "operation": "deleteMessage"
}
```

**Expect** output[0] equals input items. The executor must have acknowledged the message with deliveryTag 42.

### Test: publish failure with continueOnFail

**Given** input items:

```json
[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]
```

**Parameters:**

```json
{
  "operation": "sendMessage",
  "mode": "queue",
  "queue": "test/fail",
  "sendInputData": false,
  "message": "fail",
  "continueOnFail": true
}
```

**And** a broker that rejects the publish (e.g. connection refused).

**Expect** output[0] to contain two items with error metadata on failed publishes. The node does not throw; it returns all items with error info on failed ones.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential fields | Documented | Public docs list all fields (hostname, port, user, password, vhost, SSL) |
| Node parameters | Inferred | Public docs confirm "Send a Message" and "Delete From Queue" at high level; exact param names and option structure from corpus |
| deleteMessage behavior | Inferred | Works with RabbitMQ Trigger `laterMessageNode` acknowledge mode to ack messages |
| Output shape | Inferred | Public docs don't specify passthrough behavior; follow MQTT convention |
| Credential connection test | Documented | Public docs confirm broker-connect test pattern |
| Error item shape on continueOnFail | Inferred | n8n convention for `continueOnFail` with `pairedItem` |
| Usable as tool | Documented | Available in nodes JSON descriptor |
| Exchange types | Documented | direct, topic, headers, fanout are standard AMQP exchange types |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/rabbitmq.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only