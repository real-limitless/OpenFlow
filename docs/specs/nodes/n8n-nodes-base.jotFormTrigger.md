---
type: n8n-nodes-base.jotFormTrigger
displayName: Jotform Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Jotform Trigger

Webhook-based trigger that fires when a Jotform form receives a new submission. On activation the node registers a webhook with Jotform for the chosen form; Jotform then POSTs each submission to the runtime and the node emits one workflow item per submission.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.jotformtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jotform.md | Public docs only (credentials) |
| https://api.jotform.com/docs/ | Public docs only (Jotform service API) |
| https://www.jotform.com/help/245-how-to-send-submission-data-via-a-webhook/ | Public docs only (Jotform webhook guide) |

## Wire format

- **Type string:** `n8n-nodes-base.jotFormTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — `jotFormApi` (API key + API domain)

### Credential: `jotFormApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| apiKey | string (password) | (empty) | yes | Jotform API key created under account Settings → API |
| apiDomain | fixed-select | `api.jotform.com` | no | API endpoint domain: `api.jotform.com` (standard), `eu-api.jotform.com` (EU Safe Forms), `hipaa-api.jotform.com` (HIPAA forms) |

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| form | resource-locator (string) | (empty) | yes | — | The Jotform form to watch, chosen from the account's forms (loaded via the API) or entered as a numeric form ID |
| resolveData | boolean | `true` (inferred) | no | — | Whether emitted answer keys use the human-readable question labels instead of Jotform's internal question IDs (e.g. `q3_name` → `Name`) |
| onlyAnswers | boolean | `true` (inferred) | no | — | Whether to emit only the submission's answers, discarding the metadata envelope (formID, submissionID, IP, form title, rawRequest wrapper, etc.) |

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** the node registers a webhook for the configured form via the Jotform API — `POST /v1/form/{formID}/webhooks` with the runtime's public webhook URL and the API key. If a registration for this form already exists, it is reused rather than duplicated.
2. **On webhook receive:** Jotform POSTs the submission to the registered URL as `multipart/form-data`.
3. **On workflow deactivation:** the node removes the webhook registration via the Jotform API.

### Incoming payload (external contract)

Jotform delivers each submission as an HTTP POST with a `multipart/form-data` body. Top-level form fields include `formID`, `submissionID`, `type` (e.g. `WEB`), `ip`, `formTitle`, `pretty` (human-readable answer summary), and `rawRequest`. The `rawRequest` field is a JSON-encoded string keyed by Jotform's internal question IDs (for example `q3_name`, `q4_email`); values may be plain strings or nested objects depending on field type (name fields as `{first, last}`, addresses as street/city/state subfields, date pickers as `{year, month, day}`, multi-selects as arrays). Jotform applies a request timeout of roughly 30 seconds and does not aggressively retry failed deliveries, so the node must respond `2xx` quickly.

### Output

Each accepted submission produces one output item.

- **`onlyAnswers = true` (default):** the item's `json` is the parsed submission answers object (the decoded `rawRequest` content), with the metadata envelope omitted.
  - If `resolveData = true` (default), the object keys are the resolved question labels rather than the raw question IDs.
- **`onlyAnswers = false`:** the item's `json` is the full decoded payload envelope — metadata fields (`formID`, `submissionID`, `type`, `ip`, `formTitle`, `pretty`, `customTitle`, `customParams`, `webhookURL`) plus the parsed `rawRequest` answers. With `resolveData = true`, the answers section's keys are resolved to question labels.

The node does not alter answer values; nested structures are passed through as delivered by Jotform.

### Manual trigger

In manual (test) mode the node registers the webhook, waits for a single submission, emits it, and deactivates the registration. In active production mode it stays registered and emits continuously.

### Errors

- **Webhook registration/deletion failures** (invalid API key/domain, Jotform API errors): throw and fail activation unless `continueOnFail` is set.
- **Invalid webhook payload** (no parseable `rawRequest`): reject the request without emitting output, still responding `2xx` so Jotform does not retry a malformed delivery.
- **Per-item failures** during emission respect `continueOnFail`.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: webhook registration on activation

**Given** a workflow with the Jotform Trigger configured for form `123456789` and valid `jotFormApi` credentials, activated with webhook base URL `https://example.openflow.test/hook`.

**Expect** the executor calls `POST https://api.jotform.com/v1/form/123456789/webhooks` with body containing the `webhookURL` (the runtime webhook URL) and the API key; on deactivation it calls the deletion endpoint for the created webhook.

### Test: answers-only output (default)

**Given** Jotform delivers the following multipart/form-data fields:

```
formID=123456789
submissionID=6055023196465256193
type=WEB
rawRequest={"q3_name":{"first":"Kin","last":"Lane"},"q4_email":"kin@example.com"}
```

**Parameters:**
```json
{ "form": "123456789" }
```

**Expect** output[0] contains one item whose `json` equals the decoded answers object:
```json
{ "q3_name": { "first": "Kin", "last": "Lane" }, "q4_email": "kin@example.com" }
```
i.e. the metadata fields (`formID`, `submissionID`, `type`) are absent.

### Test: full payload with metadata

**Parameters:**
```json
{ "form": "123456789", "onlyAnswers": false, "resolveData": false }
```

Deliver the same submission as above.

**Expect** output[0] item's `json` contains the metadata fields `formID = "123456789"`, `submissionID = "6055023196465256193"`, `type = "WEB"`, and the parsed `rawRequest` answers object (`{"q3_name": {"first": "Kin", "last": "Lane"}, "q4_email": "kin@example.com"}`) preserved under the answers key.

### Test: resolved field names

**Parameters:**
```json
{ "form": "123456789", "resolveData": true }
```

Deliver a submission whose `rawRequest` is `{"q3_name":{"first":"Kin","last":"Lane"},"q4_email":"kin@example.com"}` for a form whose questions map `q3` → "Name" and `q4` → "Email".

**Expect** output[0] item's `json` uses the resolved labels as keys:
```json
{ "Name": { "first": "Kin", "last": "Lane" }, "Email": "kin@example.com" }
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type string `n8n-nodes-base.jotFormTrigger` | documented | Confirmed from corpus node descriptor (n8n-nodes-base) |
| Credential `jotFormApi` (apiKey + apiDomain, three domain options) | documented | Public credentials page lists API Key and API Domain with the three endpoints verbatim |
| Parameter names `form` / `resolveData` / `onlyAnswers` | documented | Names confirmed from corpus descriptor; semantics described at requirement level |
| Defaults `resolveData=true`, `onlyAnswers=true` | inferred | Not enumerated in public n8n docs; consistent with the public parameter descriptions |
| Webhook delivered as multipart/form-data with JSON `rawRequest` field | documented | Jotform help/API docs and community references describe the payload contract |
| Payload fields (formID, submissionID, type, ip, formTitle, pretty, rawRequest) | documented | Jotform webhook payload shape from public help/community sources |
| Webhook registration via `POST /v1/form/{formID}/webhooks` | documented | Jotform API docs show the POST webhook setup example |
| Webhook deletion endpoint | inferred | Standard Jotform API resource; only the POST example is shown in public docs |
| Output = decoded answers / full envelope; pass-through of values | inferred | Abstraction of the node's documented purpose; exact output keys abstracted |
| resolveData key-resolution mechanism (question label lookup) | inferred | Requires mapping question IDs to labels; exact lookup mechanism not public |
| Manual-trigger single-shot behavior | inferred | Standard n8n webhook trigger pattern |
| Form selector loads forms from the API | documented | Node exposes a form list loaded from the account (load-options), consistent with the credential requiring an API key |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/jotform-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Webhook trigger. The executor implements the trigger lifecycle (activate = register webhook for the selected form, deactivate = delete registration, manual = single-shot listen), a Jotform API client for webhook registration/removal and form-question lookup (for `resolveData`), and multipart/form-data parsing that decodes the `rawRequest` field. Reuses the `jotFormApi` credential type (apiKey + apiDomain).
