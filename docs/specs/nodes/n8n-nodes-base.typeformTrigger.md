---
type: n8n-nodes-base.typeformTrigger
displayName: Typeform Trigger
category: trigger
versions: [1, 1.1]
priority: medium
status: specced
---

# Typeform Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.typeformtrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/typeform/ | Public docs only |
| https://www.typeform.com/developers/get-started/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.typeformTrigger`
- **Aliases:** `Form`
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:**
  - `typeformApi` — Access Token authentication (required when `authentication` = `accessToken`)
  - `typeformOAuth2Api` — OAuth2 authentication (required when `authentication` = `oAuth2`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options (accessToken, oAuth2) | accessToken | yes | — | Selects credential type |
| formId | options (loadOptions: getForms) | — | yes | — | Form to watch for submissions; loaded via Typeform API |
| simplifyAnswers | boolean | true | no | — | Convert answers to `fieldTitle: value` key-value pairs |
| onlyAnswers | boolean | true | no | — | Return only answers vs full webhook payload |

## Runtime behavior

### Webhook registration

On workflow activation, the node registers a webhook with Typeform for the selected form:
- HTTP method: `POST`
- Path: `webhook`
- Response mode: `onReceived` (acknowledges immediately)
- Secret: generates a random 32-byte hex secret for HMAC-SHA256 signature verification

On workflow deactivation, the node deletes the registered webhook.

### Input processing

The node receives Typeform form submission webhooks at the registered endpoint. Each webhook contains:
- `form_response` object with `definition` (form structure) and `answers` (submission data)
- Headers include `Typeform-Signature` for verification

**Signature verification:** Validates HMAC-SHA256 signature using the stored secret. Rejects requests with invalid or missing signatures (returns 401). If no secret is stored (legacy), skips verification for backward compatibility.

### Output

The node emits one item per form submission. Output shape depends on parameter combination:

| simplifyAnswers | onlyAnswers | Output |
|-----------------|-------------|--------|
| true | true | Single object: `{ [fieldTitle]: value }` — simplified key-value pairs |
| true | false | Full webhook payload with `form_response.answers` replaced by simplified key-value pairs |
| false | true | Single object: `{ [fieldId]: answerObject }` — raw answers keyed by field ID (v1.1+) or array of answer objects (v1) |
| false | false | Full webhook payload as received from Typeform |

**Answer simplification logic** (when `simplifyAnswers=true`):
- Maps field IDs to field titles from `definition.fields`
- Sanitizes titles: replaces `{{` with `[` and `}}` with `]`
- Extracts primitive value from answer objects (handles `label`, `labels`, and type-specific value fields)

### Errors

- **Missing payload structure:** Throws `NodeApiError` if `form_response`, `definition`, or `answers` are missing
- **Invalid signature:** Returns 401 Unauthorized, no workflow execution
- **Credential failure:** Workflow activation fails if credentials are invalid or missing
- **Webhook registration failure:** Workflow activation fails if Typeform API returns error

### Expressions

- `formId` supports expressions for dynamic form selection

## Acceptance tests

### Test: basic submission with defaults

**Given** a registered webhook for form `abc123` with secret `secret123`, and an incoming POST to `/webhook` with valid `Typeform-Signature` header and body:
```json
{
  "form_response": {
    "definition": {
      "fields": [
        { "id": "field1", "title": "What is your name?" },
        { "id": "field2", "title": "What is your email?" }
      ]
    },
    "answers": [
      { "field": { "id": "field1" }, "type": "text", "text": "John Doe" },
      { "field": { "id": "field2" }, "type": "email", "email": "john@example.com" }
    ]
  }
}
```

**Parameters:** `authentication: accessToken`, `formId: abc123`, `simplifyAnswers: true`, `onlyAnswers: true`

**Expect** output[0] (one item):
```json
{
  "json": {
    "What is your name?": "John Doe",
    "What is your email?": "john@example.com"
  }
}
```

### Test: full payload with simplified answers

**Given** same webhook and payload as above

**Parameters:** `authentication: accessToken`, `formId: abc123`, `simplifyAnswers: true`, `onlyAnswers: false`

**Expect** output[0] contains full webhook payload with `form_response.answers` replaced by simplified key-value pairs.

### Test: raw answers only

**Given** same webhook and payload as above

**Parameters:** `authentication: accessToken`, `formId: abc123`, `simplifyAnswers: false`, `onlyAnswers: true`

**Expect** output[0] (v1.1+):
```json
{
  "json": {
    "field1": { "field": { "id": "field1" }, "type": "text", "text": "John Doe" },
    "field2": { "field": { "id": "field2" }, "type": "email", "email": "john@example.com" }
  }
}
```

### Test: invalid signature rejected

**Given** a registered webhook with secret, incoming POST with invalid/missing `Typeform-Signature` header

**Expect** HTTP 401 response, no workflow execution, no output items emitted.

### Test: webhook registration lifecycle

**Given** workflow with Typeform Trigger node configured with valid credentials and formId

**When** workflow is activated
**Then** node calls Typeform API `PUT /forms/{formId}/webhooks/{webhookId}` to register webhook

**When** workflow is deactivated
**Then** node calls Typeform API `DELETE /forms/{formId}/webhooks/{webhookId}` to remove webhook

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook registration (PUT/DELETE endpoints) | inferred | Confirmed via corpus; public docs mention webhook management but not exact API paths |
| Signature verification algorithm | inferred | Confirmed via corpus; public docs reference webhook signing but not HMAC-SHA256 details |
| Version 1.1 behavior differences | inferred | v1.1 changes `onlyAnswers` + `!simplifyAnswers` output from array to keyed object |
| `getForms` loadOptions method | inferred | Confirmed via corpus; public docs show form selection UI |
| Exact answer type handling (choice, date, etc.) | gap | Public docs don't detail all Typeform field types; simplification logic handles `label`/`labels` generically |
| Rate limits / retry behavior | gap | Not documented in public sources |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.typeformTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only