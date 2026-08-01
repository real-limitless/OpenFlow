---
type: n8n-nodes-base.kafka
displayName: Kafka
category: Development
versions: [1]
priority: medium
status: specced
---

# Kafka

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.kafka.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/kafka.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.kafka`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `kafka` (required)
- **Usable as tool:** yes

## Credentials

The node authenticates to a Kafka broker using `kafka` credentials:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| clientId | string | (none) | Client / consumer-group identifier |
| brokers | string | (none) | Comma-separated `host:port` list, e.g. `kafka-1:9092,kafka-2:9092` |
| ssl | boolean | true | Enable TLS |
| authentication | boolean | false | Enable SASL authentication |
| username | string | (none) | SASL username (when authentication is enabled) |
| password | string | (none) | SASL password (when authentication is enabled) |
| saslMechanism | enum | (none) | `Plain`, `scram-sha-256`, or `scram-sha-512` (when authentication is enabled) |

A credential test (`kafkaConnectionTest`) validates broker connectivity before execution.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| topic | string | (none) | yes | always | Kafka topic to publish to |
| sendInputData | boolean | true | no | always | When true, the incoming item JSON is serialized as the message payload |
| message | string | (none) | conditional | shown when `sendInputData` is false | Custom message text payload |
| jsonParameters | boolean | false | no | always | When true, headers are specified as a raw JSON object instead of the key-value collection |
| useSchemaRegistry | boolean | false | no | always | Enable Confluent Schema Registry for Avro serialization |
| schemaRegistryUrl | string | (none) | conditional | shown when `useSchemaRegistry` is true | URL of the Schema Registry (e.g. `https://schema-registry-domain:8081`) |
| eventName | string | (none) | conditional | shown when `useSchemaRegistry` is true | Schema name in the Registry (`namespace.name`) |
| useKey | boolean | false | no | always | Whether to attach a partition key |
| key | string | (none) | conditional | shown when `useKey` is true | Message key value |
| headersUi.headerValues | fixedCollection | (none) | no | shown when `jsonParameters` is false | Repeated key-value header pairs (each with `key` and `value` strings) |
| headerParametersJson | json | (none) | no | shown when `jsonParameters` is true | Headers as a flat JSON object |
| options.acks | boolean | false | no | always | Wait for acknowledgment from all in-sync replicas |
| options.compression | boolean | false | no | always | Enable GZIP compression for the message |
| options.timeout | number | 30000 | no | always | Time to wait for a broker response in milliseconds |

## Runtime behavior

### Input

Each item from the `main` input is processed independently. When `sendInputData` is true, the item's JSON payload is serialized to a string and used as the Kafka message body. When false, the literal `message` string is used. Optional key, headers, and Schema Registry serialization are applied per the parameters above.

A separate Schema Registry credential is required when `useSchemaRegistry` is enabled. The Schema Registry credential is referenced by name and provides authentication to the registry endpoint.

### Output

The node publishes one Kafka message per input item to the configured topic. After all publishes complete, the original input items are returned unmodified on `output[0]`. Each input item produces exactly one output item in the same order. No new keys are added on success.

### Errors

- Credential validation runs `kafkaConnectionTest`: if the broker is unreachable or SASL/SSL handshake fails, the credential test returns an error.
- Publish failures (broker unavailable, topic not found, schema validation error, timeout) propagate as execution errors.
- `continueOnFail` is respected: when enabled, a failed item produces an error item on the output instead of halting. The error item shape follows the n8n convention — `{ json: { ...originalJson, error: <message> }, pairedItem: { item: <index> } }`. Non-failed items pass through as identity. Output length equals input length.

### Expressions

`topic`, `message`, `key`, `eventName`, `schemaRegistryUrl`, and header values accept expression strings. The `brokers` and `clientId` credential fields also accept expressions.

## Acceptance tests

### Test: publish input data as JSON

**Given** input items:

```json
[{ "json": { "sensor": "temp-01", "value": 23.4 } }]
```

**Parameters:**

```json
{
  "topic": "sensors/temperature",
  "sendInputData": true
}
```

**Expect** output[0] to equal the input items. The executor must have published to topic `sensors/temperature` with payload `{"sensor":"temp-01","value":23.4}`.

### Test: publish static message

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "topic": "alerts/system",
  "sendInputData": false,
  "message": "System health check passed"
}
```

**Expect** output[0] to equal the input items. The published payload must be the string `"System health check passed"`.

### Test: message with key and headers

**Given** input items:

```json
[{ "json": { "orderId": "ord-42" } }]
```

**Parameters:**

```json
{
  "topic": "orders/new",
  "sendInputData": false,
  "message": "Order created",
  "useKey": true,
  "key": "={{ $json.orderId }}",
  "headersUi": {
    "headerValues": [
      { "key": "event-type", "value": "order.created" },
      { "key": "version", "value": "1.0" }
    ]
  }
}
```

**Expect** output[0] to equal the input items. The key resolved to `ord-42`. Two headers (`event-type` and `version`) were attached to the Kafka record.

### Test: Schema Registry serialization

**Given** input items:

```json
[{ "json": { "userId": 1, "name": "Alice" } }]
```

**Parameters:**

```json
{
  "topic": "users/created",
  "sendInputData": true,
  "useSchemaRegistry": true,
  "schemaRegistryUrl": "https://sr.example.com:8081",
  "eventName": "com.example.User"
}
```

**Expect** the executor to retrieve the schema `com.example.User` from the Schema Registry, serialize the message payload using that schema, and publish the encoded bytes to `users/created`. Output[0] equals input items.

### Test: publish failure with continueOnFail

**Given** input items:

```json
[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]
```

**Parameters:**

```json
{
  "topic": "test/error",
  "sendInputData": false,
  "message": "fail",
  "continueOnFail": true
}
```

**And** a broker that rejects the publish.

**Expect** output[0] to contain two items: the first is `{ json: { id: 1, error: <message> }, pairedItem: { item: 0 } }` and the second is identity passthrough of the second input item. The node does not throw.

### Test: credential failure

**Given** invalid Kafka broker credentials (e.g. unreachable host).

**Expect** the node to throw an execution error. No items produced on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential fields | Documented | Public docs detail brokers, SSL, SASL auth |
| Node parameters | Inferred | Public docs confirm "send message" at high level; exact param names/defaults from corpus |
| Schema Registry integration | Documented | Public docs mention Schema Registry credential and behavior |
| Output shape (passthrough) | Inferred | Public docs don't specify passthrough; follows n8n message-node convention confirmed from MQTT parallel |
| Error item shape on continueOnFail | Inferred | n8n convention for `continueOnFail` with `pairedItem`; consistent with MQTT node |
| Usable as tool | Documented | Confirmed in node JSON descriptor |
| Schema Registry credential fields | Inferred | Referenced as separate credential type; exact fields not enumerated in this spec |
| LZ4/Snappy/ZSTD limitation on consume | Documented | Only on trigger side; publish node uses GZIP for compression |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/kafka.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only