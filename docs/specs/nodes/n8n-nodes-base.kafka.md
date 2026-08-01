---
type: n8n-nodes-base.kafka
displayName: Kafka
category: Transform
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
| https://docs.n8n.io/integrations/builtin/credentials/schemaregistry.md | Public docs only |

## Wire format

- **Type string:** `kafka`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `kafka` (required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| topic | string | "" | no | — | Name of the Kafka topic to publish to (placeholder "topic-name") |
| sendInputData | boolean | true | no | — | Whether to send the incoming item data as JSON to Kafka |
| message | string | "" | no | (shown only when sendInputData is false) | Direct message payload to send |
| useSchemaRegistry | boolean | false | no | — | Whether to use Confluent Schema Registry for serialization |
| schemaRegistryUrl | string | "" | no | (visible when useSchemaRegistry is true) | URL of the Schema Registry (placeholder "https://schema-registry-domain:8081") |
| eventName | string | "" | no | (visible when useSchemaRegistry is true) | Schema name in the Registry (namespace.name) |
| useKey | boolean | false | no | — | Whether to attach a message key |
| key | string | "" | no | (visible when useKey is true) | Message key value |
| headers | json | "" | no | — | Header key‑value pairs for the Kafka message |
| acks | boolean | false | no | — | Whether to wait for acknowledgment from all Kafka replicas |
| compression | boolean | false | no | — | Whether to compress the message using GZIP |
| timeout | number | 30000 | no | — | How long to wait for a response before timing out (ms) |

## Runtime behavior

### Input
Items arriving on the `main` input are processed to build a Kafka message.  
- If **Send Input Data** is enabled, the full item payload is serialized and used as the message body.  
- If disabled, the **Message** field provides the message payload.  
- Optional **Key** can be attached when **Use Key** is enabled.  
- Optional **Headers** can be added.  
- When **Use Schema Registry** is enabled, the message may be serialized according to a registered schema identified by **Event Name**.

### Output
The node emits items on the `main` output after attempting to publish the Kafka message.  
- On successful publish, the original item is typically passed through unchanged.  
- On failure, the node throws an error, which can be caught by an error trigger downstream.

### Errors
If publishing fails (e.g., broker unavailable, schema validation error, timeout), the node throws an error. The error can be intercepted by linking to an error-trigger node or using the `$error` output. The node does not swallow errors.

### Expressions
Parameters that accept expression strings include **topic**, **key**, **schemaRegistryUrl**, and **headers**. Expressions allow dynamic construction of these values at runtime.

## Acceptance tests
### Test: Basic message send
**Given** an input item `{"json": {}}`.

**Parameters:** topic = "test-topic", sendInputData = true.

**Expect** a Kafka message to be sent containing the original JSON payload.

### Test: Direct message payload
**Given** an input item `{}`, and parameters: message = "hello world", sendInputData = false.

**Expect** a Kafka message to be sent containing the string "hello world".

### Test: Use Schema Registry
**Given** a registered schema "my-schema" in the Schema Registry.

**Parameters:** useSchemaRegistry = true, schemaRegistryUrl = "https://schema-registry-domain:8081", eventName = "my-schema".

**Expect** the message to be serialized using the specified schema before sending.

### Test: Include Message Key
**Given** input items, enable **Use Key** and set **Key** = "item-123".

**Expect** the Kafka message to be published with the key "item-123".

### Test: Error handling
**Given** an invalid Kafka broker URL or connection failure.

**When** the node attempts to publish, **Expect** it to throw an error (observable on the `$error` output).

## Gaps / confidence
| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact mapping of **Headers** JSON structure | documented (field names) | Behavior of header propagation is clear |
| Error propagation details (e.g., timeout handling) | inferred | Based on typical n8n error model |
| Support for advanced Kafka options (e.g., batch size) | documented (via Options collection) | May require future verification |
| Expression support for all configurable fields | partially documented | Some fields may accept expressions implicitly |

## OpenFlow mapping
- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/kafkaNode.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only