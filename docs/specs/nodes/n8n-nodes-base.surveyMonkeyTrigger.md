---
type: n8n-nodes-base.surveyMonkeyTrigger
displayName: SurveyMonkey Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# SurveyMonkey Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.surveymonkeytrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/surveymonkey/ | Public docs only |
| https://developer.surveymonkey.com/api/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.surveyMonkeyTrigger`
- **Aliases:** `Form`
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `surveyMonkeyApi` (Access Token), `surveyMonkeyOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options: `accessToken` \| `oAuth2` | `accessToken` | no | — | Which auth mode to use |
| objectType | options: `survey` \| `collector` | — | yes | — | The SurveyMonkey object type to listen for events on |
| event | options (see below) | — | no | show when `objectType` ∈ `["survey","collector"]` | Which event type(s) to trigger on. Hidden when `objectType` is unset. Defaults to empty string (no filter) |
| surveyIds | multi-option (dynamic from `getSurveys`) | `[]` | no | show when `objectType` = `"survey"`, hide when `event` = `"survey_created"` | Filter to specific surveys by ID; empty = all surveys. Loaded dynamically from the authenticated account |
| surveyId | option (dynamic from `getSurveys`) | — | no | show when `objectType` = `"collector"` | The survey whose collectors to monitor |
| collectorIds | multi-option (dynamic from `getCollectors`) | `[]` | no | show when `objectType` = `"collector"` | Filter to specific collectors by ID; empty = all collectors on the selected survey |
| resolveData | boolean | `true` | no | show when `event` = `"response_completed"` | When true, the node resolves the full response data instead of emitting only the webhook notification ID envelope |
| onlyAnswers | boolean | `true` | no | show when `resolveData`= true, `event` = `"response_completed"` | When true and `resolveData` is also true, emit only the answers portion of the resolved response |

**Event options** (shown when `objectType` is set):
- `collector_created`, `collector_deleted`, `collector_updated`
- `response_completed`, `response_created`, `response_deleted`, `response_disqualified`, `response_overquota`, `response_updated`
- `survey_created`, `survey_deleted`, `survey_updated`

## Runtime behavior

### Activation

On workflow activation, the node registers a webhook with SurveyMonkey via the SurveyMonkey Webhooks API (`POST /v3/webhooks`). The webhook payload URL points to the n8n instance's webhook endpoint for this node. SurveyMonkey credentials must include the `Create/Modify Webhooks` and `View Webhooks` OAuth scopes (or equivalent API key permissions). If a webhook for this node and event combination already exists (checked via `GET /v3/webhooks`), it is reused rather than duplicated.

### Deactivation

On workflow deactivation, the registered webhook is deleted via `DELETE /v3/webhooks/{webhookId}`.

### Input

None — this is a trigger node with no incoming connections.

### Output

Emits one item per incoming SurveyMonkey webhook event. The output shape depends on the configured parameters:

**Default (webhook envelope):** The raw SurveyMonkey webhook payload containing the event type, object ID, and links to the affected resource. Typical fields include `event_type`, `event_id`, `resource_id`, `resource_url`, and a `resources` object with survey/collector/response IDs.

**With `resolveData: true` and `event = "response_completed"`:** The node performs an additional API call (`GET /v3/collectors/{collectorId}/responses/{responseId}/details`) and emits the full response detail object, including survey questions and answers.

**With `resolveData: true` and `onlyAnswers: true`:** Only the `answers` section of the resolved response detail is emitted per item.

### Errors

- Credential or permission errors during webhook registration cause activation to fail.
- If webhook creation or deletion fails, the error propagates upward.
- Webhook payloads that fail to parse are silently dropped (the webhook is acknowledged with a 200 status).
- `continueOnFail` behavior follows the standard n8n trigger node convention: if a handler throws, the item is skipped.

### Expressions

The following parameters accept expression strings: `authentication`, `objectType`, `event`, `surveyId`, `resolveData`, `onlyAnswers`. Array parameters (`surveyIds`, `collectorIds`) accept expression strings for the entire array value.

## Acceptance tests

### Test: survey_created event with no filter

**Parameters:**
```json
{
  "authentication": "accessToken",
  "objectType": "survey",
  "event": "survey_created"
}
```

**Trigger:** Simulate a SurveyMonkey webhook POST with `event_type: "survey_created"`, `resource_id: "12345"`.

**Expect** output[0] contains one item whose JSON includes `event_type: "survey_created"`, `resource_id: "12345"`.

### Test: response_completed with resolveData and onlyAnswers

**Parameters:**
```json
{
  "authentication": "accessToken",
  "objectType": "survey",
  "event": "response_completed",
  "surveyIds": ["survey_123"],
  "resolveData": true,
  "onlyAnswers": true
}
```

**Trigger:** SurveyMonkey webhook POST with `event_type: "response_completed"`, `resources.survey_id: "survey_123"`, `resources.response_id: "resp_456"`.

**Expect** output[0] contains one item with only the answers portion of the resolved SurveyMonkey response detail (no metadata, no survey structure).

### Test: collector_updated event filtered to specific collector

**Parameters:**
```json
{
  "authentication": "accessToken",
  "objectType": "collector",
  "event": "collector_updated",
  "surveyId": "survey_123",
  "collectorIds": ["collector_789"]
}
```

**Trigger:** SurveyMonkey webhook POST with `event_type: "collector_updated"`, `resources.collector_id: "collector_789"`.

**Expect** output[0] contains one item with the webhook envelope.

### Test: unregistered event type ignored

**Parameters:**
```json
{
  "objectType": "survey",
  "event": "response_completed"
}
```

**Trigger:** Incoming webhook with `event_type: "collector_created"`.

**Expect** output is empty (no items emitted, webhook acknowledged as 200).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook registration behavior | inferred from type declarations | `checkExists`, `create`, `delete` methods declared in the type definition confirm the standard n8n webhook lifecycle |
| Event option names | confirmed from corpus schema | Schema shows exact event string values |
| Resolve data / only answers behavior | inferred from corpus schema | Parameter descriptions and display-options logic define the resolve chain |
| Credential types | documented | Public n8n credentials page documents both Access Token and OAuth2 methods |
| Exact SurveyMonkey API webhook payload shape | inferred | Not documented in n8n docs; spec describes the expected envelope at the outcome level |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/surveyMonkeyTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
