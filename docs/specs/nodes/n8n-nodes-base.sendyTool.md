---
type: n8n-nodes-base.sendyTool
displayName: Sendy Tool
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
---

# Sendy Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sendy/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/sendy/ | Public docs only |
| https://sendy.co/api | Public docs only (external service) |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sendyTool`
- **Aliases:** (none — this is the tool-only alias; base type is `n8n-nodes-base.sendy`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sendyApi` (URL + API Key)
- **AI tool:** `usableAsTool: true` — registered as a tool variant for AI agents under the `sendyTool` type string. When invoked by an AI agent, all string parameters accept `$fromAI()` expressions that the model supplies dynamically at call time.

## Parameters

The node shares the same resource/operation discriminator and parameters as the base Sendy node (`n8n-nodes-base.sendy`). No additional parameters are introduced for the tool variant.

### Resource: `campaign` · Operation: `create`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `campaign` | yes | discriminator for campaign resource |
| operation | literal `create` | yes | create a new campaign |
| fromName | string | no | sender display name |
| fromEmail | string | no | sender email address |
| replyTo | string | no | reply-to email address |
| title | string | no | internal campaign title |
| subject | string | no | email subject line |
| htmlText | string | no | HTML body of the campaign |
| sendCampaign | boolean | no | immediately send after creation |
| brandId | string | no | required when sendCampaign is false; selects branded sending domain |

Additional fields (campaign create):

| name | type | notes |
|------|------|-------|
| listIds | string | comma-separated list IDs to target |
| segmentIds | string | comma-separated segment IDs to target |
| excludeListIds | string | comma-separated list IDs to exclude |
| excludeSegmentIds | string | comma-separated segment IDs to exclude |
| plainText | string | plain-text body alternative |
| queryString | string | custom query string for link tracking |
| trackClicks | boolean | enable click tracking |
| trackOpens | boolean | enable open tracking |

### Resource: `subscriber` · Operations: `add`, `count`, `delete`, `remove`, `status`

Common fields for all subscriber operations: `resource` (literal `subscriber`), `operation` (enum value), `email` (string), `listId` (string).

#### Operation: `add`

Additional fields:

| name | type | notes |
|------|------|-------|
| name | string | subscriber display name |
| country | string | two-letter country code |
| ipaddress | string | subscriber IP address |
| referrer | string | signup referrer URL |
| gdpr | boolean | GDPR consent indicator |
| hp | boolean | honeypot check (true = is a bot) |
| silent | boolean | suppress welcome/confirmation email |

#### Operation: `count`

Parameters: `resource`, `operation` (literal `count`), `listId`.

#### Operation: `delete`

Parameters: `resource`, `operation` (literal `delete`), `email`, `listId`.

#### Operation: `remove`

Parameters: `resource`, `operation` (literal `remove`), `email`, `listId`.

#### Operation: `status`

Parameters: `resource`, `operation` (literal `status`), `email`, `listId`.

## Runtime behavior

### Credentials

Sendy is a self-hosted email marketing platform. The `sendyApi` credential requires a base URL of the Sendy installation (e.g. `https://yourdomain.com/sendy`) and an API Key. The node authenticates by POSTing form-encoded parameters including `api_key` to the configured installation.

### Input

Each input item is processed independently. All string, boolean, and number parameters accept expression strings. When the node is used as an AI tool via `sendyTool`, parameters can also be dynamically populated via `$fromAI()` expressions that the connected language model resolves at call time.

### Output

Each operation sends a POST request to the corresponding Sendy API endpoint and returns the plain-text response body wrapped under a `response` key. The input item is cloned per output item.

Output shape per item:
```json
{
  "response": "<raw response from Sendy>"
}
```

### Errors

- If the Sendy API returns an error string (anything other than `"1"`), the node throws an error describing the failure.
- With `continueOnFail` enabled, the failing item produces an `error` property instead of `response` and execution continues.
- Network errors propagate as unhandled errors.

### Expressions

All parameters accept expression strings. The `listId` and `email` parameters are typically populated dynamically. When used as an AI tool, the AI agent provides values via `$fromAI()`.

## Acceptance tests

### Test: subscriber add via AI tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as set by AI agent via `$fromAI()`):
```json
{ "resource": "subscriber", "operation": "add", "email": "user@example.com", "listId": "abc123", "name": "Test User" }
```

**Mock Sendy response:** `1`

**Expect** output[0]:
```json
[{ "json": { "response": "1" } }]
```

### Test: campaign create with sendCampaign

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "create",
  "fromName": "Newsletter",
  "fromEmail": "news@example.com",
  "title": "August Updates",
  "subject": "August 2026",
  "htmlText": "<h1>Updates</h1>",
  "sendCampaign": true
}
```

**Mock Sendy response:** `1`

**Expect** output[0]:
```json
[{ "json": { "response": "1" } }]
```

### Test: subscriber status lookup

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{ "resource": "subscriber", "operation": "status", "email": "={{ $json.email }}", "listId": "abc123" }
```

**Mock Sendy response:** `"Subscribed"`

**Expect** output[0]:
```json
[{ "json": { "response": "Subscribed" } }]
```

### Test: error handling with continueOnFail

**Given** input items:
```json
[{ "json": { "email": "bad" } }, { "json": { "email": "good@example.com" } }]
```

**Parameters:**
```json
{ "resource": "subscriber", "operation": "add", "email": "={{ $json.email }}", "listId": "abc123", "continueOnFail": true }
```

**Mock behavior:** Item 1 -> Sendy returns `"Some fields missing."`; item 2 -> Sendy returns `"1"`

**Expect** output[0]:
```json
[{ "json": { "error": "Sendy: Some fields missing." } }, { "json": { "response": "1" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential shape | documented | URL + API Key confirmed from n8n credentials docs |
| Resource/operation set | documented | Shares same campaign/subscriber operations as base Sendy node |
| Tool variant behavior | documented | No additional parameters; all existing parameters accept `$fromAI()` expressions per n8n tool convention |
| Exact API endpoints | inferred | POSTs to standard Sendy REST endpoints per sendy.co/api |
| Response shape | inferred | Raw response body wrapped under `response` key |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/sendyTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
