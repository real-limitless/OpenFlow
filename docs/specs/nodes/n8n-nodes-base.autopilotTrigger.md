---
type: n8n-nodes-base.autopilotTrigger
displayName: Autopilot Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# Autopilot Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.autopilottrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/autopilot.md | Public docs only |
| https://autopilot.docs.apiary.io/ | Public docs only (external API) |

## Wire format

- **Type string:** `n8n-nodes-base.autopilotTrigger`
- **Aliases:** (none)
- **Categories:** Marketing (from public descriptor metadata)
- **Inputs:** none (trigger node — starts a workflow)
- **Outputs:** `main` × 1
- **Credentials:** `autopilotApi` (API key from Settings > Autopilot API; required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | options (string) | — | yes | — | Which Autopilot event type to subscribe to |

Valid `event` values (from public docs):

| Value | Description |
|-------|-------------|
| `contactAdded` | A new contact is created |
| `contactAddedToList` | An existing contact is added to a contact list |
| `contactEnteredSegment` | A contact matches segment conditions and enters it |
| `contactLeftSegment` | A contact no longer matches segment conditions |
| `contactRemovedFromList` | A contact is removed from a contact list |
| `contactUnsubscribed` | A contact unsubscribes from communications |
| `contactUpdated` | An existing contact's properties are modified |

## Runtime behavior

### Activation / deactivation

On activation, the node registers a webhook with Autopilot for the chosen event type. On deactivation, it deregisters that webhook. Autopilot sends HTTP POST requests to the registered webhook URL when the subscribed event fires.

### Input

The node consumes no input items (it is a trigger).

### Output

Each incoming webhook POST from Autopilot produces exactly one output item. The item `json` field contains the full Autopilot event payload as received. The body shape is defined by the Autopilot REST API (apiary documentation) and varies by event type — generally a JSON object with a `contact` sub-object containing standard contact fields (email, name, custom fields, timestamps, etc.) and an event-specific envelope.

### Errors

If the webhook registration (activation) or deregistration (deactivation) fails — e.g. invalid credentials, network error — the node should surface the error and fail the activation lifecycle.

If a received webhook body is unparseable or does not match the expected Autopilot format, the node should log a warning and not emit an item (continue silently) to avoid crashing the workflow on malformed payloads.

When `continueOnFail` is enabled on the trigger node, transient errors during webhook processing emit the error metadata as an output item rather than failing.

### Expressions

The `event` parameter accepts expressions for dynamic event-type selection (though in practice it is typically set once at design time).

## Acceptance tests

### Test: contact added event fires output

**Given** Autopilot sends a POST payload for a `contactAdded` event with:

```json
{
  "contact": {
    "email": "alice@example.com",
    "firstName": "Alice",
    "lastName": "Example",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "event": "contact_added",
  "timestamp": 1705312200
}
```

**Parameters:**
```json
{ "event": "contactAdded" }
```

**Expect** output[0]:
```json
[{
  "json": {
    "contact": {
      "email": "alice@example.com",
      "firstName": "Alice",
      "lastName": "Example",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "event": "contact_added",
    "timestamp": 1705312200
  }
}]
```

### Test: contact updated event fires output

**Given** Autopilot sends a POST payload for a `contactUpdated` event:

```json
{
  "contact": {
    "email": "bob@example.com",
    "firstName": "Bob",
    "lastName": "Updated",
    "updated_at": "2024-02-20T14:00:00Z"
  },
  "event": "contact_updated",
  "timestamp": 1708437600
}
```

**Parameters:**
```json
{ "event": "contactUpdated" }
```

**Expect** output[0]:
```json
[{
  "json": {
    "contact": {
      "email": "bob@example.com",
      "firstName": "Bob",
      "lastName": "Updated",
      "updated_at": "2024-02-20T14:00:00Z"
    },
    "event": "contact_updated",
    "timestamp": 1708437600
  }
}]
```

### Test: unparseable webhook body is silently discarded

**Given** Autopilot sends a POST with malformed JSON body `not-json`

**Parameters:**
```json
{ "event": "contactAdded" }
```

**Expect** no output items emitted. Node does not crash.

### Test: credential failure on activation surfaces error

**Given** an invalid Autopilot API key

**Expect** the activation lifecycle throws a descriptive error indicating the credential is rejected by Autopilot's API.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event value names | Documented | Public docs list 7 event types verbatim |
| Credential shape | Documented | Public docs describe API key from Settings > Autopilot API |
| Webhook registration and deregistration lifecycle | Inferred | Standard n8n trigger pattern; exact Autopilot webhook API endpoints from apiary docs |
| Output payload shape | Inferred | Depends on Autopilot REST API response; test assertions use representative contact shapes from public Autopilot API docs |
| Error handling semantics | Inferred | follow standard n8n trigger conventions |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/autopilotTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
