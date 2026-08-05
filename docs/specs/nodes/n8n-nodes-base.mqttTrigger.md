---
type: n8n-nodes-base.mqttTrigger
displayName: MQTT Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# MQTT Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mqtttrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mqtt.md | Public docs only |
| https://mqtt.org/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mqttTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** `mqtt` (required)

## Credentials

Uses the same `mqtt` credentials as the MQTT publish node. See [docs/specs/nodes/n8n-nodes-base.mqtt.md](n8n-nodes-base.mqtt.md) for the full credential table. Fields include protocol (mqtt/mqtts/ws), host, port, username, password, clean session, client ID, SSL, and TLS certificates.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| topics | string | (none) | yes | always | Comma-separated topic filters. Wildcards `+` (single-level) and `#` (multi-level) are supported. Per-topic QoS can be set with a colon suffix, e.g. `topicA:1,topicB:2`. Default QoS is 0. QoS values outside 0–2 are clamped to 0. |
| options.jsonParseBody | boolean | false | no | always | When true, attempts to JSON-decode the raw payload string. If parsing fails the raw string is preserved. |
| options.onlyMessage | boolean | false | no | always | When true, each emitted item carries only the message value itself as the item JSON (instead of `{ message, topic }`). |
| options.parallelProcessing | boolean | true | no | always | When true, emits are not gated on completion of previous handler — messages are processed concurrently. When false, a deferred promise serializes handler execution. |

## Runtime behavior

### Input

No input items. As a trigger, this node activates when the workflow starts (or when manually executed in the editor) by connecting to the configured MQTT broker and subscribing to the given topic filters. During manual execution, the node waits for exactly one message before resolving.

### Output

Each received MQTT message produces one output item on `output[0]`. The emitted item shape depends on `onlyMessage`:

- **`onlyMessage: false` (default):** `{ topic: string, message: string | object }` where `topic` is the MQTT topic the message arrived on and `message` is the UTF-8 decoded payload (or parsed JSON if `jsonParseBody` is on).
- **`onlyMessage: true`:** Each emitted item is a single value — either the raw string or the parsed JSON object. There is no wrapping envelope.

Multiple messages received between poll intervals are emitted as multiple items in a single firing.

### Errors

- Credential validation runs a broker connection test: if the client cannot connect, the node throws an execution error and no subscription is made.
- Subscription failures (invalid topic filter, broker disconnect) propagate as execution errors.
- `continueOnFail` is respected for runtime message-processing errors. The behavior follows standard n8n trigger conventions for error handling.

### Expressions

`topics` accepts expression strings. Credential fields (`clientId`) also support expressions.

## Acceptance tests

### Test: subscribe and emit a message

**Parameters:**

```json
{
  "topics": "sensors/#"
}
```

**And** the configured broker publishes `22.5` on topic `sensors/temperature`.

**Expect** output[0] contains one item:
```json
[{ "json": { "topic": "sensors/temperature", "message": "22.5" } }]
```

### Test: JSON parse of message body

**Parameters:**

```json
{
  "topics": "data/json",
  "options": { "jsonParseBody": true }
}
```

**And** the broker publishes `{"temp":22.5,"unit":"C"}` on topic `data/json`.

**Expect** output[0] contains:
```json
[{ "json": { "topic": "data/json", "message": { "temp": 22.5, "unit": "C" } } }]
```

### Test: onlyMessage mode

**Parameters:**

```json
{
  "topics": "test/hello",
  "options": { "onlyMessage": true }
}
```

**And** the broker publishes `"hello world"` on topic `test/hello`.

**Expect** output[0] contains:
```json
[{ "json": "hello world" }]
```

### Test: per-topic QoS

**Parameters:**

```json
{
  "topics": "critical:2,info:0,debug"
}
```

**Expect** the executor subscribes to `critical` with QoS 2, `info` with QoS 0, and `debug` with QoS 0 (default).

### Test: multiple messages in one firing

**Parameters:**

```json
{
  "topics": "events/#"
}
```

**And** the broker publishes `"a"` on `events/1`, `"b"` on `events/2` before the next poll.

**Expect** output[0] contains two items:
```json
[
  { "json": { "topic": "events/1", "message": "a" } },
  { "json": { "topic": "events/2", "message": "b" } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | Inferred | Public docs only mention "subscribe to topics" at high level; exact names/defaults from corpus |
| Per-topic QoS syntax | Inferred | Colon-suffix pattern (`topic:qos`) extracted from corpus |
| Option `parallelProcessing` | Inferred | Deferred-promise serialization visible in corpus; default `true` |
| Output item shape | Inferred | Default shape `{ message, topic }` from corpus; onlyMessage variant also from corpus |
| Manual trigger behavior | Inferred | Waits for single message then resolves, standard trigger pattern confirmed from corpus |
| JSON parse fallback | Inferred | On parse failure, raw string is preserved (from corpus) |
| Credential test | Documented | Public credentials doc confirms broker connection test pattern |
| Connection lifecycle | Inferred | Subscription on activate, cleanup on deactivate per n8n trigger pattern |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/mqttTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
