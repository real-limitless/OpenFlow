---
type: n8n-nodes-base.lemlistTrigger
displayName: Lemlist Trigger
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
---

# Lemlist Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.lemlisttrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/lemlist.md | Public docs only |
| https://developer.lemlist.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.lemlistTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `lemlistApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | options / expression | `*` | no | — | The lemlist webhook event type to listen for. Value must equal the `type` field in the webhook POST body. `*` subscribes to all events. |
| options.campaignId | string / expression | — | no | — | Filter webhooks to a specific campaign ID. When set, only events from this campaign trigger an output. |
| options.isFirst | boolean | false | no | — | If true, only fire on the first occurrence of this event for a given lead. |

### Event catalog

The node can subscribe to any of the following event types. The UI option `value` must match the lemlist webhook payload `type` string (camelCase):

| Wire value | Display label |
|------------|---------------|
| `*` | All events (catch-all) |
| `contacted` | Contacted |
| `hooked` | Hooked |
| `attracted` | Attracted |
| `warmed` | Warmed |
| `interested` | Interested |
| `skipped` | Skipped |
| `notInterested` | Not Interested |
| `emailsSent` | Emails Sent |
| `emailsOpened` | Emails Opened |
| `emailsClicked` | Emails Clicked |
| `emailsReplied` | Emails Replied |
| `emailsBounced` | Emails Bounced |
| `emailsSendFailed` | Emails Send Failed |
| `emailsFailed` | Emails Failed |
| `emailsUnsubscribed` | Emails Unsubscribed |
| `emailsInterested` | Emails Interested |
| `emailsNotInterested` | Emails Not Interested |
| `opportunitiesDone` | Opportunities Done |
| `aircallCreated` | Aircall Created |
| `aircallEnded` | Aircall Ended |
| `aircallDone` | Aircall Done |
| `aircallInterested` | Aircall Interested |
| `aircallNotInterested` | Aircall Not Interested |
| `apiDone` | Api Done |
| `apiInterested` | Api Interested |
| `apiNotInterested` | Api Not Interested |
| `apiFailed` | Api Failed |
| `linkedinVisitDone` | LinkedIn Visit Done |
| `linkedinVisitFailed` | LinkedIn Visit Failed |
| `linkedinInviteDone` | LinkedIn Invite Done |
| `linkedinInviteFailed` | LinkedIn Invite Failed |
| `linkedinInviteAccepted` | LinkedIn Invite Accepted |
| `linkedinReplied` | LinkedIn Replied |
| `linkedinSent` | LinkedIn Sent |
| `linkedinVoiceNoteDone` | LinkedIn Voice Note Done |
| `linkedinVoiceNoteFailed` | LinkedIn Voice Note Failed |
| `linkedinInterested` | LinkedIn Interested |
| `linkedinNotInterested` | LinkedIn Not Interested |
| `linkedinSendFailed` | LinkedIn Send Failed |
| `manualInterested` | Manual Interested |
| `manualNotInterested` | Manual Not Interested |
| `paused` | Paused |
| `resumed` | Resumed |
| `customDomainErrors` | Custom Domain Errors |
| `connectionIssue` | Connection Issue |
| `sendLimitReached` | Send Limit Reached |
| `lemwarmPaused` | Lemwarm Paused |

## Runtime behavior

### Activation

On workflow activation, the node registers a unique webhook URL with the lemlist API. The webhook is configured to deliver only the selected event type. On deactivation, the registered webhook is deleted. If a webhook with the same target URL already exists, the existing webhook is reused.

### Input

This node has no input (trigger node with no `main` input connector).

### Output

When a lemlist webhook event fires, the node emits a single output item per received POST body. The `json` property mirrors the top-level fields of the lemlist webhook payload:

```json
{
  "type": "emailsOpened",
  "data": {
    "campaignId": "string",
    "leadId": "string",
    "email": "string",
    "type": "emailsOpened",
    "subject": "string",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "ip": "string",
    "userAgent": "string"
  }
}
```

The `type` field matches the selected event value. The `data` object contains the lemlist event payload; fields vary by event type (common fields include `campaignId`, `leadId`, `email`, `updatedAt`).

### Filtering

When `event` is not `*`, the node compares the incoming webhook body `type` field against the selected event value. Only matching events produce an output item. When `options.campaignId` is set, only events whose `data.campaignId` matches produce an output item. When `options.isFirst` is true, the node tracks seen lead IDs and only emits for the first occurrence per lead.

### Errors

- Invalid or missing credentials cause activation to fail with a descriptive error.
- If the lemlist API webhook registration returns a non-2xx status, activation fails.
- With `continueOnFail` enabled, processing continues after individual event handler failures.

### Expressions

The `event` parameter accepts expression strings for dynamic event selection.

## Acceptance tests

### Test: Subscribe to all events and match an incoming webhook

**Given:** the trigger is active with:
```json
{ "event": "*" }
```

**When:** lemlist sends a POST with body:
```json
{
  "type": "emailsOpened",
  "data": {
    "campaignId": "camp_123",
    "leadId": "lead_456",
    "email": "user@example.com",
    "type": "emailsOpened",
    "subject": "Hello",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Expect:** output[0] contains exactly one item with `json.type` equal to `"emailsOpened"` and `json.data.campaignId` equal to `"camp_123"`.

### Test: Filtered event — match emits, non-match ignores

**Given:** the trigger is active with:
```json
{ "event": "emailsBounced" }
```

**When:** lemlist sends a webhook with `type: "emailsBounced"`.

**Then:** the item is emitted normally.

**When:** lemlist sends a webhook with `type: "linkedinInviteAccepted"`.

**Then:** no output item is produced (the event is silently ignored).

### Test: Campaign ID filter

**Given:** the trigger is active with:
```json
{ "event": "emailsOpened", "options": { "campaignId": "camp_123" } }
```

**When:** lemlist sends a webhook with `type: "emailsOpened"` and `data.campaignId: "camp_123"`.

**Then:** the item is emitted.

**When:** the same event arrives with `data.campaignId: "camp_OTHER"`.

**Then:** no output item is produced.

### Test: isFirst filter

**Given:** the trigger is active with:
```json
{ "event": "emailsOpened", "options": { "isFirst": true } }
```

**When:** two webhooks arrive, both with `type: "emailsOpened"` and the same `data.leadId`.

**Then:** only the first webhook produces an output item.

### Test: Manual execution produces no output

**Given:** the trigger is executed manually (Test workflow button).

**Expect:** no output items are produced.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type list | Documented (public n8n docs) | High confidence — displayed in docs page as labels; wire values confirmed from the published API schema |
| Credential type | Documented (public n8n credentials docs) | Uses `lemlistApi` (API key), shared with the action node |
| Webhook lifecycle hooks | Inferred | Standard n8n webhook pattern; `checkExists`/`create`/`delete` confirmed from type signature |
| Output response shape | Inferred (public lemlist API docs) | Top-level `type` + `data` structure consistent with lemlist webhook contract |
| `options.campaignId` and `options.isFirst` | Inferred | Existence and types confirmed from published schema; exact server-side filtering behavior is inferred |
| Event wire values vs display labels | Confirmed | Published Zod schema confirms all event wire values are camelCase (e.g. `emailsBounced`) not the display labels shown in public docs |
| Duplicate detection | Inferred | Standard n8n webhook trigger behavior |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.lemlistTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
