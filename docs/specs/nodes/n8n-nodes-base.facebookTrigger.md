---
type: n8n-nodes-base.facebookTrigger
displayName: Facebook Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Facebook Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/facebookapp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/ad-account.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/application.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/certificate-transparency.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/group.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/instagram.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/link.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/page.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/permissions.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/user.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/whatsapp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/workplace-security.md | Public docs only |
| https://developers.facebook.com/docs/graph-api/webhooks/reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.facebookTrigger`
- **Aliases:** `FB`
- **Inputs:** `main` × 0 (trigger node — no input)
- **Outputs:** `main` × 1
- **Credentials:** `facebookGraphApi` (App Access Token + optional App Secret)

The credential uses an App Access Token for a Meta for Developers app. The optional App Secret enables payload verification via HMAC-SHA256 `appsecret_proof`. Refer to the Facebook App credential docs for the creation flow.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| appId | string | — | yes | — | The numeric App ID of the Meta Developer application |
| object | enum | — | yes | — | Which Facebook Graph object to subscribe to (see Object values below) |
| fields | string[] | `["*"]` | no | — | Subset of field/event names to monitor; `*` = all fields for the selected object |
| options.includeValues | boolean | false | no | — | Whether to include the new values in change updates; some objects (Ad Account, Application, Certificate Transparency, Group, Instagram, Link, Page, WhatsApp Business Account, Workplace Security) fail without this enabled |

### Object values

| value | Description |
|-------|-------------|
| `adAccount` | Ads change events in an Ad Account |
| `application` | Updates sent to a Meta application |
| `certificateTransparency` | New security certificates for subscribed domains |
| `group` | Activity and events in a Facebook Group |
| `instagram` | Comments, mentions, messages, and story events for Instagram |
| `link` | Rich preview link updates |
| `page` | Page profile, feed, leadgen, live video, mention, review, ratings, and video events |
| `permissions` | Permission grant/revoke events |
| `user` | User profile change events |
| `whatsappBusinessAccount` | WhatsApp Business Account template, phone number, and account status events |
| `workplaceSecurity` | Workplace security events (admin changes, user join/leave) |

### Per-object fields

Each object exposes a set of event types selectable via the `fields` parameter. The full set is documented at Meta's Graph API Webhooks reference. Examples include:

- **adAccount:** `adAccountInProcessAdObjects`, `adAccountWithIssuesAdObjects`
- **application:** `addAccount`, `adsRulesEngine`, `asyncRequests`, `asyncSessions`, `groupInstall`, `oeResellerOnboardingRequestCreated`, `pluginComment`, `pluginCommentReply`
- **certificateTransparency:** `certificate`, `phishing`
- **instagram:** `comments`, `messagingHandover`, `mentions`, `messages`, `messagingSeen`, `standby`, `storyInsights`
- **page:** `feed`, `leadgen`, `liveVideos`, `mention`, `merchantReview`, `pageChangeProposal`, `pageUpcomingChange`, `productReview`, `ratings`, `videos` (plus individual profile field names)
- **whatsappBusinessAccount:** `messageTemplateStatusUpdate`, `phoneNumberNameUpdate`, `phoneNumberQualityUpdate`, `accountReviewUpdate`, `accountUpdate`
- **group, link, permissions, user, workplaceSecurity:** individual field/event names from Meta's API

## Runtime behavior

### Registration (activation)

When the workflow is activated, the node must expose a webhook URL (synthesized from the execution environment). The user copies this URL into their Meta app's Webhooks product configuration as the Callback URL, providing the App Access Token as the Verify Token. Meta verifies the webhook URL by sending a `hub.mode`, `hub.verify_token`, `hub.challenge` GET request; the node must respond with the challenge value on success.

### Input

No input items — this is a trigger node. Activation triggers the webhook registration flow.

### Output

Each received webhook POST emits one item per delivered change. The output shape follows Meta's Graph API webhook payload structure:

```json
{
  "entry": [
    {
      "id": "string",
      "time": 1234567890,
      "changes": [
        {
          "field": "feed",
          "value": { ... }
        }
      ]
    }
  ],
  "object": "page"
}
```

The node passes the raw payload through as received from Meta's servers. The exact shape of `changes[].value` depends on the object and field subscribed to.

### Errors

- If the Meta verification handshake (GET) fails, the webhook is not registered and the workflow activation should report the failure.
- If the optional App Secret is configured, the node must validate the `X-Hub-Signature-256` header on every POST and reject mismatched payloads with a 403 response.
- `continueOnFail`: Standard n8n behavior — when enabled, failed items are passed to the error output branch instead of halting.

### Expressions

All parameter values (appId, object, fields, includeValues) accept expression strings.

## Acceptance tests

### Test: basic webhook registration

**Given** a workflow with a Facebook Trigger node configured with an appId and an adAccount object.

**Activation:** The node exposes an HTTPS webhook URL. When Meta sends a GET with `hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=challenge123`, the node responds with `challenge123` and status 200.

**Expect:** The webhook is registered. Subsequent POST requests with a valid body produce output items.

### Test: emits one item per webhook event

**Given** an active Facebook Trigger node listening for page events.

**When** Meta sends a POST with a payload containing one entry with two changes:

```json
{
  "object": "page",
  "entry": [{
    "id": "12345",
    "time": 1700000000,
    "changes": [
      { "field": "feed", "value": { "item": "post", "post_id": "123_456" } },
      { "field": "mention", "value": { "item": "comment", "page_id": "12345" } }
    ]
  }]
}
```

**Expect** output[0] contains one item with the full payload as JSON.

### Test: signature verification

**Given** a Facebook Trigger node with an App Secret configured.

**When** a POST arrives with an incorrect `X-Hub-Signature-256` header.

**Expect** the node responds with HTTP 403 and does not emit any items.

### Test: includeValues required for adAccount

**Given** a Facebook Trigger node configured with object=adAccount and options.includeValues=false.

**Expect** the node warns that the Ad Account object requires Include Values to be enabled. At runtime, Meta's webhook may deliver empty or incomplete payloads.

### Test: all fields wildcard

**Given** a Facebook Trigger node with object=application and fields=`["*"]`.

**Expect** the node subscribes to all available Application events via Meta's webhook API using the `*` wildcard field filter.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Object enum values | documented | All 11 object types documented on public n8n docs pages |
| Per-object field names | documented | Exact event names per object documented on n8n sub-pages and Meta's webhook reference |
| Credential type | documented | `facebookGraphApi` credential with App Access Token |
| Webhook registration flow | documented | Standard Meta webhook verification (hub.mode/challenge/verify_token) |
| Output payload shape | inferred from Meta API | Raw Graph API webhook delivery; shape varies by object/field |
| Signature verification | documented | Optional App Secret with X-Hub-Signature-256 validation |
| Alias | inferred from corpus | `FB` alias from node JSON descriptor |
| Include Values requirement | documented | Required for most object types; optional for Permissions and User |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/facebookTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
