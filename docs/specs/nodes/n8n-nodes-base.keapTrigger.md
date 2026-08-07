---
type: n8n-nodes-base.keapTrigger
displayName: Keap Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# Keap Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.keaptrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/keap.md | Public docs only |
| https://developer.keap.com/docs/restv2/ | Third-party service API docs |
| https://developer.keap.com/getting-started-oauth-keys/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.keapTrigger`
- **Aliases:** `Infusionsoft`
- **Inputs:** none (trigger node; no `main` input)
- **Outputs:** `main` x 1
- **Credentials:** Keap OAuth2. Authorization Code grant at `https://accounts.infusionsoft.com/app/oauth/authorize` with `scope=full`, token exchange at `https://api.infusionsoft.com/token`. Refresh tokens rotate on each use. Bearer token auth against `https://api.infusionsoft.com/crm/rest/v2/`.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `eventId` | selection (string) | — | yes | always | The Keap webhook event type to subscribe to. Options are dynamically loaded from the Keap REST API via the authenticated OAuth2 credential. Corresponds to Keap hook event names (e.g. `contact.add`, `contact.update`, `invoice.add`, `subscription.add`, etc.). |
| `rawData` | boolean | false | no | always | When true, emit the raw Keap webhook payload envelope unchanged. When false, the node may restructure or simplify the output (e.g., extract the inner data object). |

### Dynamic options

The node loads the available `eventId` choices from the Keap REST API at configuration time. The user selects one event type to trigger on. The exact set of events is determined by the Keap API and may include events such as:
- Contact created/updated
- Invoice created/updated/paid
- Subscription created/updated/cancelled
- Order created/updated
- Payment created
- Lead source change
- And other Keap hook event types exposed by the Keap platform.

## Runtime behavior

### Activation lifecycle

Upon workflow activation, the node uses the Keap REST API to register a webhook subscription targeting the n8n webhook URL. It checks for an existing subscription before creating a new one (idempotent create). On deactivation, the node deletes its webhook subscription via the Keap API. The webhook URL is automatically provided by the n8n runtime — no user configuration is required.

### Input

This is a trigger node: it receives no input items. It fires when Keap sends an HTTP POST to the registered webhook URL.

### Output

For each received webhook event, the node emits one output item. The `json` property contains either:
- The raw Keap webhook event payload envelope (when `rawData` is true), or
- The relevant data portion extracted from the payload (when `rawData` is false, the default).

The exact payload shape is determined by the Keap REST API webhook delivery format. It typically includes the event type, a timestamp, and the affected entity data (contact, invoice, subscription, etc.).

### Errors

- Registration failure (network error, auth failure, API error) prevents the node from activating. The error is surfaced to the user during workflow activation.
- Signature verification: The node should verify incoming webhook signatures if Keap provides a signing mechanism. If signature verification fails, the request must be rejected with a 4xx status code and not processed.
- Unparseable payloads are rejected. 5xx-level delivery failures from Keap are not under the node's control.

### Expressions

`eventId` may be an expression (e.g., to pull from workflow variables or test context). `rawData` accepts a boolean expression.

## Acceptance tests

### Test: register webhook and receive a contact.add event

**Given** valid OAuth2 credentials and `eventId` set to a known Keap hook type (e.g., contact.add), activate the node.

**Expect:** the node makes a POST to the Keap REST API (`/crm/rest/v2/hooks` or similar) to register a webhook. Activation succeeds. Then simulate an incoming Keap webhook POST with a valid contact.add payload.

**Expect:** one output item whose `json` contains the contact.add event data.

### Test: rawData mode preserves payload envelope

**Given** `rawData` set to true, activate and receive a Keap webhook delivery.

**Expect:** the output item's `json` contains the full webhook envelope as received, not a restructured subset.

### Test: webhook deactivation

**Given** an active workflow with a registered Keap webhook, deactivate the workflow.

**Expect:** the node sends a DELETE to the Keap REST API to remove the hook subscription. No further events are processed.

### Test: event list is dynamically loaded

**Given** valid OAuth2 credentials in the node configuration, open the `eventId` dropdown.

**Expect:** the node queries the Keap REST API and populates the dropdown with available hook event types. The list reflects the Keap account's available events.

### Test: invalid eventId errors gracefully

**Given** an `eventId` value that does not match any known Keap hook type, attempt activation.

**Expect:** activation fails with an actionable error message indicating the event ID is invalid or unsupported.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, alias | documented | Public node JSON descriptor confirms `n8n-nodes-base.keapTrigger` and alias `Infusionsoft`. |
| Categories | documented | Sales, Communication (from node JSON). |
| Credential type and OAuth2 flow | documented | Keap credentials page + shared with Keap action node spec. |
| `eventId` parameter | inferred from corpus schema | Schema requires eventId (string). Dynamic loading from Keap API. |
| `rawData` parameter | inferred from corpus schema | Boolean, defaults to false. |
| Webhook lifecycle (create/check/delete) | inferred from corpus type declarations | The `.d.ts` declares `checkExists`, `create`, `delete` webhook methods. |
| Exact Keap hook event names and webhook API endpoints | inferred | The Keap REST API docs do not expose a dedicated "hooks" section in the public v2 docs index. Keap's internal hook system may be part of a different API surface (e.g., XML-RPC or deprecated endpoints). The implementation must discover available event types dynamically. |
| Webhook payload shape | inferred | Not publicly documented by n8n or Keap for the webhook path. Implementation should match Keap's actual delivery format. |
| Signature verification | inferred | Common pattern for webhook triggers; not confirmed in Keap public docs. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.keapTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
