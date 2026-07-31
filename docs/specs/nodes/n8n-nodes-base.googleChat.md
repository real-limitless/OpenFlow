---
type: n8n-nodes-base.googleChat
displayName: Google Chat
category: Communication
versions: [1]
priority: medium
status: specced
---

# Google Chat

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlechat.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://developers.google.com/workspace/chat/api/reference/rest | Third-party service API docs |
| https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages | Third-party service API docs |
| https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.members | Third-party service API docs |
| https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleChat`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Google Chat OAuth2 or Google service-account authentication (`googleChatOAuth2Api` in the node credential contract)
- **AI tool:** The node may be exposed as an AI tool. Parameters that are expressions in a normal workflow may then be supplied by the agent.

## Parameters

The node selects a Google Chat resource and an operation. It does not expose every Google Chat API endpoint; its supported surface is the following three resource families:

| resource | operations | outcome |
|----------|------------|---------|
| `member` | `get`, `getAll` | Retrieve one membership or memberships belonging to a space |
| `message` | `create`, `delete`, `get`, `sendAndWait`, `update` | Create, inspect, remove, update, or send a message with an optional human response step |
| `space` | `get`, `getAll` | Retrieve one space or spaces visible to the authenticated caller |

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | option | `message` | yes | always | Selects `member`, `message`, or `space`. |
| `operation` | option | resource-dependent | yes | selected resource | Selects an operation supported by the resource. |
| `spaceId` | string or expression | none | operation-dependent | member/space/message operations that address a space | Identifies the Google Chat space. Use the provider's resource identifier, not a display name. |
| `memberId` | string or expression | none | yes for member get | `resource=member`, `operation=get` | Identifies the membership to retrieve. This operation must not require a separate membership and space identifier when the membership identifier is sufficient. |
| `messageId` | string or expression | none | yes for message get/delete/update | message operations that address an existing message | Identifies the message resource. The message resource name may include its space context. |
| `messageUi` | text or structured message input | none | yes for message create | `resource=message`, `operation=create` | Supplies either text or a JSON/card-style Google Chat message. Structured input must be valid for the Google Chat message API. |
| `message` | text or structured message input | none | yes for sendAndWait | `resource=message`, `operation=sendAndWait` | The message shown before waiting for a response. |
| `approvalOptions` | object | none | response-type dependent | `operation=sendAndWait`, approval response | Selects approval presentation and may provide approve/disapprove button labels. |
| `options.limitWaitTime` | interval or wall-time setting | none | no | `operation=sendAndWait` | Causes the workflow to resume after the configured limit if no response arrives. |
| response/form options | object | none | response-type dependent | `operation=sendAndWait` | Supports approval, free-text, or custom-form response collection, including labels, title/description, and custom form fields. |

For `getAll` operations, the node may expose a return-all choice and a bounded limit. The implementation must honor the selected limit and provider pagination rather than silently dropping available results. Optional message fields and Google Chat card/form structures are passed through at the level supported by the Google Chat API; they are not redefined by this spec.

## Runtime behavior

### Input

The node processes incoming items. Parameter expressions are evaluated against the current item, so identifiers and message content may be taken from `$json`. For ordinary operations, one API request is made for each input item. A workflow with no input items does not invent a request.

### Output

Each successful non-delete operation returns the corresponding Google Chat API resource or list result under the output item's `json` value. Returned data must preserve provider fields such as resource identifiers and message/space/member properties without replacing the provider response with a synthetic schema.

- `create`, `get`, and `update` return the affected message resource.
- `member.get` returns one membership; `member.getAll` returns the memberships found in the selected space.
- `space.get` returns one space; `space.getAll` returns spaces visible to the authenticated caller.
- `delete` performs the provider delete request and passes the input item through unchanged because the provider response has no resource body.
- `sendAndWait` first sends the configured message. Its completed result must contain the actual response/continuation data from the human interaction or timeout. It must not claim approval, disapproval, or a submitted message when no such event was received.

The intended complete `sendAndWait` behavior is to pause execution, expose the configured approval/free-text/custom-form interaction, resume on a response or `limitWaitTime`, and return the submitted response together with the relevant sent-message context. Cycle 1 may implement only the send portion; in that scope it returns the real create-message response and does not synthesize `approved`, `message`, or other HITL result fields.

### Errors

Missing credentials, invalid authentication, malformed message/card data, missing required identifiers, provider permission failures, unavailable spaces, and provider HTTP errors must fail the operation with an actionable node error. A failed request must not be reported as a successful message or membership result. If OpenFlow's `continueOnFail` mode is enabled, emit the repository-standard error item for that input item instead of aborting the whole batch.

### Expressions

String identifiers, message text, structured message values, labels, and wait-time values may be expression-backed where the corresponding parameter is exposed. Expressions are evaluated per input item. The node must not evaluate arbitrary code supplied as message JSON; it only interpolates workflow expressions before sending the resulting provider request.

## Acceptance tests

### Test: create a text message

**Given** input items:

```json
[{ "json": { "space": "spaces/AAA" } }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "create",
  "spaceId": "{{ $json.space }}",
  "messageUi": { "text": "Build completed" }
}
```

**Expect** one provider create request for `spaces/AAA`, with the text preserved, and output `json` containing the provider's created message resource and a non-empty resource identifier.

### Test: get a membership by membership identifier

**Given** input items:

```json
[{ "json": { "memberId": "spaces/AAA/members/BBB" } }]
```

**Parameters:**

```json
{
  "resource": "member",
  "operation": "get",
  "memberId": "{{ $json.memberId }}"
}
```

**Expect** a membership-get request addressed by `memberId`, without requiring an unrelated `spaceId` or `membershipId` parameter, and output `json` containing the returned membership resource.

### Test: delete preserves the input item

**Given** input items:

```json
[{ "json": { "messageId": "spaces/AAA/messages/CCC", "keep": "original" } }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "delete",
  "messageId": "{{ $json.messageId }}"
}
```

**Expect** a successful delete request using `messageId` and output `json.keep` equal to `"original"`; no fabricated delete response is required.

### Test: send-and-wait does not invent a human decision

**Given** input items:

```json
[{ "json": { "space": "spaces/AAA" } }]
```

**Parameters:**

```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "spaceId": "{{ $json.space }}",
  "message": "Please review this deployment.",
  "approvalOptions": { "values": { "approvalType": "single" } },
  "options": { "limitWaitTime": { "unit": "minutes", "value": 5 } }
}
```

**Expect** the message is sent to the selected space. If the cycle-1 implementation is send-only, output contains the real provider create-message response and contains no synthetic `approved: true` or approval message. A later full HITL implementation must instead pause and return only an actual response or timeout result.

### Test: get a space and list memberships

**Given** input items:

```json
[{ "json": { "spaceId": "spaces/AAA" } }]
```

**Parameters:**

```json
{
  "resource": "space",
  "operation": "get",
  "spaceId": "{{ $json.spaceId }}"
}
```

**Expect** output `json` contains the provider space resource. Changing only `resource` to `member` and `operation` to `getAll` performs a membership listing for the same space and returns the provider's membership resources without requiring a message identifier.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource families and operations | Documented | Google Chat node documentation lists Member, Message, and Space operations and describes send-and-wait response modes. |
| Google authentication | Documented | Google credentials documentation lists OAuth2 and service-account support for Google Chat. |
| Provider resource boundaries and HTTP outcomes | Documented | Google Chat REST reference defines spaces, memberships, messages, and their get/list/create/update/delete operations. |
| Exact OpenFlow parameter grouping | Inferred | Names such as `messageUi`, `message`, `memberId`, and `messageId` are the compatibility-facing abstraction for this implementation; nested UI layout is intentionally unspecified. |
| Human-in-the-loop continuation payload | Partly documented | Public node docs describe the response modes and timeout, but not a stable provider response JSON shape. Implementations must return observed continuation data, not a guessed schema. |
| Cycle-1 send-only behavior | Explicit scope gap | Full pause/resume requires workflow suspension and webhook continuation support; cycle 1 must not fabricate a decision result. |
| Pagination and list output itemization | Inferred | The Google API supports list responses and pagination; OpenFlow should expose all selected results as output items while honoring a configured limit. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleChat.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
