---
type: n8n-nodes-base.slackTrigger
displayName: Slack Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Slack Trigger

Webhook-based trigger that starts a workflow when a subscribed event occurs in a Slack workspace. The node relies on the Slack **Events API**: during activation it exposes a request URL that must be registered as the Slack app's single Event Subscriptions **Request URL**, and every matching event delivered to that URL emits one workflow item.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.slacktrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/slack.md | Public docs only (credentials) |
| https://api.slack.com/apis/connections/events-api | Public docs only (Slack Events API) |

## Wire format

- **Type string:** `n8n-nodes-base.slackTrigger`
- **Aliases:** (none)
- **Inputs:** none (webhook trigger)
- **Outputs:** `main` × 1
- **Credentials:** required — `slackApi` (API access token). OAuth2 is **not** supported for this node (public docs state API access token is required and OAuth2 does not work with the trigger).

### Credential: `slackApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| accessToken | string (password) | (empty) | yes | Slack "Bot User OAuth Token" for an app installed to the workspace with Event Subscriptions enabled. |
| signatureSecret | string (password) | (empty) | no | Slack Signing Secret. When set, incoming requests are verified against Slack's signed requests; recommended from node version `1.106.0` onward. |

## External service requirements (Slack side)

- A Slack app installed to the workspace with **Event Subscriptions** enabled.
- The node's request URL registered as the app's single Event Subscriptions Request URL (Slack permits **one** request URL per app — see common issues).
- Minimum scopes on the app token: `conversations.list` and `users.list` (used to look up the channel list and to resolve IDs). The recommended manifest additionally grants `channels:read`, `channels:history`, `files:read`, `groups:read`, `groups:history`, `im:read`, `im:history`, `mpim:read`, `mpim:history`, `reactions:read`, `users:read`, and related `usergroups`/`users.profile` scopes.
- Bot events subscribed in the Slack app determine which events Slack sends; the node's **Trigger on** selection filters which of those deliveries are accepted.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events (Trigger on) | multiOptions | (none selected) | no | — | Which Slack events to accept. Documented families: Any Event, App Home Opened, Bot / App Mention, File Made Public, File Shared, New Message Posted to Channel, New Public Channel Created, New User, Reaction Added. Events not offered in the list can still be received by subscribing them on the Slack app and selecting **Any Event**. |
| watchWholeWorkspace | boolean | false | no | — | Watch for the selected events everywhere the app is present (one execution per matching event) instead of a single channel. |
| channel | resourceLocator | `{ mode: list }` | conditional | hidden when `watchWholeWorkspace` is on | Single channel to watch. Modes: **From list** (enumerated via the credential), **By ID** (channel ID), **By URL** (`https://app.slack.com/client/<channel-address>`). |
| downloadFiles | boolean | false | no | — | Download files referenced by **File Made Public** / **File Shared** events and include them in the output item. |
| options.resolveIds | boolean | false | no | — | Resolve Slack IDs (users, channels) to their names in the emitted payload. |
| options.ignoreUsers | multiOptions / string | (empty) | no | — | Usernames or a comma-separated list of encoded user IDs whose events are dropped. |
| options.emojiFilter | string | (empty) | no | shown for Reaction Added events | Comma-separated (not colon-separated) emoji names, e.g. `thumbsup, eyes, white_check_mark`; limits **Reaction Added** to those reactions. Empty = any reaction. |

## Runtime behavior

### Input

None. The node is activated by HTTP delivery of Slack Events API requests to its registered request URL.

### Output

One item per accepted event on `main`. The item `json` carries the Slack event payload. When `resolveIds` is on, IDs inside the payload are replaced with resolved names. When `downloadFiles` is on for a file event, the referenced file is fetched and exposed as binary data alongside the event payload.

### Filtering

Only events that satisfy **all** active constraints are emitted: the event type must be in the **Trigger on** selection; the event must come from the configured channel (when `watchWholeWorkspace` is off) or be workspace-wide (when on); the acting user must not be in the ignore list; and, for reactions, the emoji must match the emoji filter. Non-matching events are silently ignored (no output).

### Errors

- When `signatureSecret` is set, requests whose Slack signature fails verification are rejected and do not trigger the workflow.
- Missing or invalid credentials prevent the trigger from activating.
- Slack-side misconfiguration (Request URL not registered, wrong scopes, token rotation enabled) surfaces as an activation/connection error, not as per-event failures.

### Expressions

Parameters (especially the channel resource locator) accept expression strings. There is no per-item input to evaluate against; configuration is resolved at activation / per received event.

## Acceptance tests

### Test: New message in the watched channel

**Given** `watchWholeWorkspace` is off and an incoming webhook delivery:

```json
{
  "token": "…",
  "type": "event_callback",
  "event": {
    "type": "message",
    "channel": "C1234567890",
    "user": "U1234567890",
    "text": "Hello world",
    "ts": "1699999999.123456"
  }
}
```

**Parameters:**
```json
{
  "events": ["New Message Posted to Channel"],
  "watchWholeWorkspace": false,
  "channel": { "mode": "id", "value": "C1234567890" }
}
```

**Expect** output[0] has exactly one item whose `json.text` is `"Hello world"` and `json.channel` is `"C1234567890"`.

### Test: Events outside the watched channel are dropped

**Given** the same configuration as the previous test and an incoming `event_callback` whose `event.channel` is `C0000000001`:

**Expect** output[0] is an empty array (event ignored because it is not in the watched channel).

### Test: Ignored user is filtered out

**Parameters:**
```json
{
  "events": ["New Message Posted to Channel"],
  "watchWholeWorkspace": false,
  "channel": { "mode": "id", "value": "C1234567890" },
  "options": { "ignoreUsers": ["U9999999999"] }
}
```

**Given** a `message` event from `event.user` = `U9999999999` in `C1234567890`:

**Expect** output[0] is empty.

### Test: Emoji filter restricts reactions

**Parameters:**
```json
{
  "events": ["Reaction Added"],
  "watchWholeWorkspace": false,
  "channel": { "mode": "id", "value": "C1234567890" },
  "options": { "emojiFilter": "thumbsup, eyes" }
}
```

**Given** a `reaction_added` event with `event.reaction` = `+1`: **Expect** output[0] is empty.
**Given** a `reaction_added` event with `event.reaction` = `thumbsup`: **Expect** output[0] has exactly one item.

### Test: Signature verification rejects unsigned requests

**Parameters:** `signatureSecret` set on the credential.

**Given** an incoming request with no valid `X-Slack-Signature` header:

**Expect** the request is rejected (no item emitted, no workflow error surfaced), and the same request signed with the correct signature does emit one item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event families (Trigger on list) | documented | Public trigger-node page lists the nine event families; exact wire event type strings (e.g. `message.channels`) are not listed on the current page and are **inferred**. |
| Any Event catch-all | documented | Docs describe subscribing extra bot events on Slack and selecting Any Event to receive them. |
| Channel resource locator modes (list / id / url) | documented | URL format `https://app.slack.com/client/<channel-address>` from docs. |
| Watch Whole Workspace + downloadFiles | documented | Documented parameters with their documented caution (one execution per event). |
| Resolve IDs output shape | inferred | Docs say IDs resolve to names; the exact enrichment layout is not specified. |
| File download output format | inferred | Docs say files are downloaded for File Made Public / File Shared; binary attachment layout is not specified. |
| Signature verification behavior | documented | Available from version 1.106.0; verifies requests come from Slack with a trusted signature. |
| OAuth2 unsupported for trigger | documented | Credentials page: API access token required; OAuth2 does not work with the trigger node. |
| Single request URL per app constraint | documented | Documented as a common issue affecting test vs production URLs. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/slack-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only (trigger interface)
- **Credential types:** `slackApi` (accessToken; optional `signatureSecret`)
