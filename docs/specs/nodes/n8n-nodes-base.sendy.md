---
type: n8n-nodes-base.sendy
displayName: Sendy
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
---

# Sendy

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sendy/ | Public docs only |
| https://docs.n8n.io/credentials/sendy | Public docs only |
| https://sendy.co/api | Public docs only (external service) |

## Wire format

- **Type string:** `n8n-nodes-base.sendy`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `sendyApi` (URL + API Key)

## Parameters

The node exposes a resource/operation discriminator with two resources:

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
| sendCampaign | boolean | no | immediately send after creation; if false, a brandId becomes available |
| brandId | string | no | required only when sendCampaign is false; selects which branded sending domain to use |

Additional fields (campaign create):

| name | type | notes |
|------|------|-------|
| listIds | string | comma-separated list IDs to send to |
| segmentIds | string | comma-separated segment IDs to target |
| excludeListIds | string | comma-separated list IDs to exclude |
| excludeSegmentIds | string | comma-separated segment IDs to exclude |
| plainText | string | plain-text body alternative |
| queryString | string | custom query string appended to links for tracking |
| trackClicks | boolean | enable click tracking |
| trackOpens | boolean | enable open tracking |

### Resource: `subscriber` · Operations: `add`, `count`, `delete`, `remove`, `status`

#### Operation: `add`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `subscriber` | yes | discriminator |
| operation | literal `add` | yes | subscribe an email to a list |
| email | string | no | subscriber email address |
| listId | string | no | target list ID |

Additional fields (subscriber add):

| name | type | notes |
|------|------|-------|
| name | string | subscriber display name |
| country | string | two-letter country code |
| ipaddress | string | subscriber IP address |
| referrer | string | signup referrer URL |
| gdpr | boolean | indicate GDPR consent (true = consent given) |
| hp | boolean | honeypot check (true = is a bot) |
| silent | boolean | if true, suppresses welcome/confirmation email |

#### Operation: `count`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `subscriber` | yes | discriminator |
| operation | literal `count` | yes | count active subscribers in a list |
| listId | string | no | target list ID |

#### Operation: `delete`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `subscriber` | yes | discriminator |
| operation | literal `delete` | yes | permanently delete subscriber from a list |
| email | string | no | subscriber email address |
| listId | string | no | target list ID |

#### Operation: `remove`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `subscriber` | yes | discriminator |
| operation | literal `remove` | yes | unsubscribe (mark as unsubscribed, not deleted) |
| email | string | no | subscriber email address |
| listId | string | no | target list ID |

#### Operation: `status`

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal `subscriber` | yes | discriminator |
| operation | literal `status` | yes | get subscriber subscription status in a list |
| email | string | no | subscriber email address |
| listId | string | no | target list ID |

## Runtime behavior

### Credentials

Sendy is a self-hosted email marketing platform. The `sendyApi` credential requires:
- **URL:** base URL of the Sendy installation (e.g. `https://yourdomain.com/sendy`)
- **API Key:** the Sendy installation API key

The node authenticates by POSTing form-encoded parameters including `api_key` to the configured Sendy installation.

### Input

Each input item is processed independently. Values from each item's JSON are accessible via expressions in the parameters. Parameters not populated via expressions use the static values configured on the node.

### Output

Each operation sends a POST request to the corresponding Sendy API endpoint and returns the plain-text response body from Sendy (typically "1" for success or an error string) wrapped in a JSON object under a `response` key. The input item is cloned per output item so that upstream data is preserved alongside the `response` property.

Output shape per item:
```json
{
  "response": "<raw response from Sendy>"
}
```

### Errors

- If the Sendy API returns an error message string (anything other than "1"), the node should throw an error describing the failure.
- If `continueOnFail` is enabled, the failing item produces an `error` property instead of `response` and execution continues to the next item.
- Network errors (timeout, connection refused, DNS failure) should be propagated as unhandled errors.

### Expressions

All string, boolean, and number parameters accept expression strings. The `listId` parameter in particular is typically populated dynamically.

## Acceptance tests

### Test: subscriber add — success

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{ "resource": "subscriber", "operation": "add", "email": "={{ $json.email }}", "listId": "abc123" }
```

**Mock Sendy response:** `1`

**Expect** output[0]:
```json
[{ "json": { "response": "1" } }]
```

### Test: campaign create with send now

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "create",
  "fromName": "My Newsletter",
  "fromEmail": "newsletter@example.com",
  "title": "May Newsletter",
  "subject": "May 2026 Updates",
  "htmlText": "<h1>Hello!</h1>",
  "sendCampaign": true
}
```

**Mock Sendy response:** `1`

**Expect** output[0] contains `"response": "1"`.

### Test: subscriber count

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "subscriber", "operation": "count", "listId": "abc123" }
```

**Mock Sendy response:** `"1234"`

**Expect** output[0]:
```json
[{ "json": { "response": "1234" } }]
```

### Test: error propagation with continueOnFail

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

### Test: subscriber status

**Given** input items:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{ "resource": "subscriber", "operation": "status", "email": "={{ $json.email }}", "listId": "abc123" }
```

**Mock Sendy response:** `"Subscribed"` or `"Unsubscribed"` or `"Bounced"` or `"Soft Bounced"` or `"Unconfirmed"`

**Expect** output[0] contains the raw status string in `"response"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential shape | documented | URL + API Key confirmed from n8n credentials docs and published descriptor |
| Resource/operation set | documented | Campaign (create) and Subscriber (add/count/delete/remove/status) confirmed from n8n docs and schema descriptors |
| Additional fields for subscriber add | documented (inferred from schema) | name, country, ipaddress, referrer, gdpr, hp, silent — confirmed via corpus schema; parameter names match Sendy public API conventions |
| Additional fields for campaign create | documented (inferred from schema) | listIds, segmentIds, excludeListIds, excludeSegmentIds, plainText, queryString, trackClicks, trackOpens — confirmed via corpus schema |
| Exact API endpoints | inferred | The node POSTs to standard Sendy REST endpoints (e.g. /api/subscribers/subscription.php, /api/campaigns/create.php) based on Sendy's public API documentation; n8n docs do not enumerate endpoint paths |
| Response shape | inferred | Node returns raw response body wrapped under `response` key; Sendy API returns "1" for success or error strings |
| sendCampaign/brandId conditional | inferred from schema | brandId only appears when sendCampaign is false |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/sendy.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
