---
type: n8n-nodes-base.amqp
displayName: AMQP Sender
category: Communication
versions: [1]
priority: medium
status: specced
---

# AMQP Sender

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.amqp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/amqp.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.amqp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `amqp` (required)
- **Usable as tool:** yes

## Credentials

The node connects to an AMQP 1.0 broker (e.g. ActiveMQ) using `amqp` credentials with these fields:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| hostname | string | (none) | Broker hostname |
| port | number | (none) | Broker port (commonly 5672 for TCP, 5671 for TLS) |
| user | string | (none) | Auth username |
| password | string | (none) | Auth password |
| transportType | string | `tcp` | `tcp` or `tls` |

A credential test (`amqpConnectionTest`) validates connectivity by attempting a broker connection before execution.

## Parameters

The node has a single operation: send a message to an AMQP 1.0 broker exchange with a routing key.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| exchange | string | (none) | no | Target exchange name; if omitted the default exchange is used |
| routingKey | string | (none) | yes | Routing key for message dispatch |
| sendInputData | boolean | true | no | When true, serializes incoming item JSON as the message body |
| message | string | (none) | conditional | Custom message body (shown when sendInputData=false) |

## Runtime behavior

### Input

Each item from `main` input is processed independently. Items carry data to be serialized as the AMQP message body.

### Output

The node publishes one AMQP 1.0 message per input item to the configured exchange with the given routing key. After the publish completes, the original input items are returned unmodified on output[0]. Each input item produces exactly one output item in order. No new keys are added on success.

### Errors

- Credential validation runs a broker connection test: if the client cannot connect, the credential test returns an error.
- Publish failures (connection refused, broker timeout, authentication failure) propagate as execution errors.
- `continueOnFail` is respected: when enabled, a failed item produces an error item on the output instead of halting.

### Expressions

`exchange`, `routingKey`, and `message` accept expression strings.

## Acceptance tests

### Test: send with input data as payload

**Given** input items:

```json
[{ "json": { "sensor": "temp-01", "value": 22.5 } }]
```

**Parameters:**

```json
{
  "exchange": "",
  "routingKey": "sensor.data",
  "sendInputData": true
}
```

**Expect** output[0] to equal the input items (identity passthrough). The executor must have published an AMQP message to the default exchange with routing key `sensor.data` and the JSON-serialized input as body.

### Test: send with custom message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "exchange": "alerts",
  "routingKey": "system.critical",
  "sendInputData": false,
  "message": "CRITICAL: system load exceeded threshold"
}
```

**Expect** output[0] equals input items. The executor must have published to exchange `alerts` with routing key `system.critical` and body `"CRITICAL: system load exceeded threshold"`.

### Test: TLS transport

**Given** an AMQP credential with `transportType` set to `tls` and a broker reachable over TLS.

**When** the node connects and publishes.

**Expect** a successful publish if the broker accepts the TLS connection; otherwise an error token is emitted.

### Test: publish failure with continueOnFail

**Given** input items:

```json
[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]
```

**Parameters:**

```json
{
  "routingKey": "test.fail",
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
| Credential fields | Documented | Public docs list hostname, port, user, password, transportType |
| Node parameters | Inferred | Public docs confirm single "Send message" operation; exact param names from corpus node descriptor |
| Output shape | Inferred | Follows MQTT/RabbitMQ passthrough convention; public docs don't specify |
| Credential connection test | Documented | Type descriptor confirms `amqpConnectionTest` method |
| Error item shape on continueOnFail | Inferred | n8n convention for `continueOnFail` |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/amqp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only