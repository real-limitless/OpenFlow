---
type: n8n-nodes-base.amqp
displayName: AMQP
category: Queue
versions: [1]
priority: medium
status: missing
---

# Sources

| URL | Source class |
|-----|-------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.amqp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/amqp.md | Public docs only |

## Wire format
- **Type string:** `amqp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** AMQP credentials (hostname, port, username, password, transport type)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| host | string |  | true |  | Hostname of the AMQP broker |
| port | number | 5672 | true |  | Port of the AMQP broker |
| username | string |  | true |  | User for authentication |
| password | string |  | true |  | Password for authentication |
| transport | string | tcp | false | advanced | `tcp` or `tls` |
| exchange | string |  | false | advanced | Target exchange name |
| routingKey | string |  | false | advanced | Routing key for the message |
| payload | string |  | false | advanced | Message payload content |
| payloadFormat | string | json | false | advanced | Format of payload (`json`, `string`) |

## Runtime behavior
When the node receives an input item it builds an AMQP message using the configured connection settings and message parameters and sends it to the configured AMQP broker. On successful send the node passes the input item through unchanged; on error the node follows the workflow’s error handling (e.g., routes to error output or stops). The node supports configurable exchange, routing key, payload content and optional TLS transport.

### Input
The node consumes items on its `main` input port. The item’s data is not consumed or transformed by the node itself; it is forwarded unchanged after the external AMQP publish operation completes.

### Output
The node outputs the original input item unchanged on its `main` output port, preserving all fields and metadata.

### Errors
If the broker cannot be reached, authentication fails, or the publish operation is rejected, the node will trigger an error token on its `main` output and optionally propagate an error according to the workflow’s `continueOnFail` setting.

## Acceptance tests

### Test: basic
**Given** input items:

```json
[ { "json": {} } ]
```

**When** the node is configured with reachable broker credentials and default message parameters.

**Expect** output[0]:

```json
[ { "json": {} } ]
```

### Test: json payload
**Given** input items:

```json
[ { "json": { "order": { "id": 123, "total": 45.67 } } } ]
```

**When** `payload` is set to `{{ $json }}` and `payloadFormat` is `json`.

**Expect** the node to forward the item unchanged after attempting to publish the JSON payload.

### Test: invalid credentials
**Given** a configuration with an invalid `username` or `password`.

**When** the node attempts to connect.

**Expect** an error token to be emitted on the output and the workflow to follow its error handling path.

### Test: tls transport
**Given** a broker reachable only over TLS and `transport` set to `tls`.

**When** the node connects.

**Expect** a successful publish if the broker accepts the TLS connection; otherwise an error token is emitted.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Default payload format | documented (`json` default) | Assumed based on typical n8n behavior |
| Error handling semantics | inferred from n8n core patterns | Not explicitly detailed in public docs |
| Message persistence options | not documented | May exist but not covered in sources |
| Exact default exchange/routing key behavior | inferred | Default exchange is usually `` (empty) and routing key is required |
| Broker URL format for TLS | inferred | `amqps://` scheme used for TLS connections |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/amqp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only