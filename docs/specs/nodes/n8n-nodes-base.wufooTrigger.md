---
type: n8n-nodes-base.wufooTrigger
displayName: Wufoo Trigger
category: Communication
versions: [1]
priority: medium
status: specced
alias: Form
---

# Wufoo Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.wufootrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wufoo/ | Public docs only |
| https://wufoo.github.io/docs/ | Public docs only |
| https://help.surveymonkey.com/en/wufoo/integrations/wufoo-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wufooTrigger`
- **Aliases:** `Form`
- **Inputs:** `main` × 0 (trigger nodes have no input)
- **Outputs:** `main` × 1
- **Credentials:** `wufooApi`

### Credential: wufooApi

Two fields:
- **API Key** — API token obtained from Wufoo Form Manager (More > API Information for a given form)
- **Subdomain** — the subdomain portion of the Wufoo account URL (e.g. `n8n` from `https://n8n.wufoo.com`)

The API base URL is constructed as `https://{subdomain}.wufoo.com/`.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| form | options (dynamic) | — | yes | — | List of Wufoo forms fetched from the API by the credential; user picks which form to watch for new entries |

## Runtime behavior

### Activation

On workflow activation, the node must register a webhook with Wufoo for the selected form. Wufoo's webhook system fires a POST request to the node's public callback URL whenever a new entry is submitted to that form. Webhook registration is done via the Wufoo Webhooks API (`POST /api/v3/forms/{formHash}/webhooks.json` with a `url` parameter).

The node must provide a publicly reachable HTTP endpoint (the n8n webhook URL) as the callback target.

### Deactivation

On workflow deactivation, the node should deregister the webhook by deleting it from Wufoo via `DELETE /api/v3/forms/{formHash}/webhooks/{webhookId}.json` to prevent stale callbacks.

### Input

No input is consumed — trigger nodes fire on external events.

### Output

Each incoming webhook POST from Wufoo is emitted as an output item. The body of the webhook request contains the form entry data submitted by the user. The exact payload structure is determined by Wufoo's webhook format and includes all form field values submitted with the entry.

Typical webhook payload fields include:
- `EntryId` — unique entry identifier
- `FormId` — the form identifier
- `DateCreated` — timestamp of submission
- Per-field values keyed by field ID/name as defined in the form

The node should output one item per webhook POST. The item JSON should contain the full webhook payload as a top-level object.

### Errors

- If webhook registration fails (e.g. invalid credentials, network error), the node should throw an error and fail activation.
- If an incoming webhook body is malformed or unparseable, the node should log a warning and skip the item (or throw depending on `continueOnFail`).
- Invalid or expired credentials should result in a descriptive error at activation time.

### Expressions

- The `form` parameter accepts an expression string.

## Acceptance tests

### Test: webhook registration

**Given** valid `wufooApi` credentials (API Key + Subdomain) and a selected form.

**Parameters:**
```json
{ "form": "some-form-hash" }
```

**Expect** the executor registers a webhook with Wufoo at `POST /api/v3/forms/some-form-hash/webhooks.json` containing the node's public callback URL. On success, the webhook registration details are stored and the node is marked as active.

### Test: incoming form entry

**Given** the node is active and a webhook is registered.

**When** Wufoo sends a POST to the callback URL with a form entry payload:
```json
{
  "EntryId": "12345",
  "FormId": "some-form-hash",
  "DateCreated": "2025-01-15 10:30:00",
  "Field1": "John Doe",
  "Field2": "john@example.com",
  "Field3": "Product feedback"
}
```

**Expect** output[0] contains one item whose `json` property matches the incoming payload:
```json
[{ "json": { "EntryId": "12345", "FormId": "some-form-hash", "DateCreated": "2025-01-15 10:30:00", "Field1": "John Doe", "Field2": "john@example.com", "Field3": "Product feedback" } }]
```

### Test: webhook deregistration

**Given** the node is active and a webhook was previously registered.

**When** the workflow is deactivated.

**Expect** the executor calls `DELETE /api/v3/forms/some-form-hash/webhooks/{webhookId}.json` to remove the webhook from Wufoo.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook registration mechanism | Documented | Wufoo docs specify POST/DELETE webhooks API; n8n docs confirm basic trigger behavior |
| Credential shape | Documented | API Key + Subdomain from n8n credential docs |
| Output payload structure | Inferred | Wufoo webhook payload structure varies per form; exact field names are form-defined |
| Form options list | Inferred | Dynamic loading from Wufoo Forms API is standard pattern for form-based triggers |
| Error handling | Inferred | Follows standard n8n trigger error patterns |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/wufooTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
