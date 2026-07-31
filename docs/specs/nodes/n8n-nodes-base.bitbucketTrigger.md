---
type: n8n-nodes-base.bitbucketTrigger
displayName: Bitbucket Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# Bitbucket Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.bitbuckettrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bitbucket.md | Public docs only |
| https://developer.atlassian.com/cloud/bitbucket/rest/api-group-webhooks/ | Public docs only |
| https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/ | Public docs only |
| https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bitbucketTrigger`
- **Aliases:** (none documented)
- **Inputs:** none; this is a trigger node.
- **Outputs:** `main` x 1.
- **Credentials:** a Bitbucket credential with an access token. The token must have access to the selected subject and the webhook permissions required to create, inspect, and remove the subscription. Bitbucket API tokens and access tokens are subject to the provider's scopes.

The node receives an HTTP `POST` delivery at its generated webhook URL. The webhook URL is an OpenFlow/runtime deployment concern and must not be treated as a provider payload field.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| subject scope | option | — | yes | — | Select the Bitbucket resource whose events are observed. The documented scopes are repository and workspace. |
| subject identifier | string or resource locator | — | yes | subject scope | Workspace/repository identifier used when registering the subscription. It may be supplied by a picker or an expression. |
| event selection | multi-select | provider-defined | yes | subject scope | One or more event types available for the selected subject. The provider exposes the authoritative subscribable event list; do not assume that repository and workspace event names are interchangeable. |

The editor should expose provider event labels while retaining the provider event key needed to create the webhook. It should make the generated test and production callback URLs available through the normal trigger lifecycle, without requiring users to construct provider API URLs manually.

## Runtime behavior

### Trigger registration

When the workflow listens for a test event or is activated for production, the runtime registers a Bitbucket webhook for the configured subject, callback URL, and selected event keys. When the registration is no longer needed, the runtime should remove or deactivate the subscription it created. Registration and cleanup failures are node errors, not successful empty executions.

Bitbucket webhooks are notifications: after a subscription exists, Bitbucket sends a request whenever a selected event occurs. The provider supports multiple events on one webhook and has repository and workspace subject types. Workspace is the current provider scope for workspace-level subscriptions; deprecated subject types must not be introduced by this spec.

### Input

The node consumes no upstream items. Each matching incoming webhook delivery starts one workflow execution. The request body is parsed as JSON when it is a JSON payload, and the provider event payload is passed through without renaming or flattening its domain objects. Request metadata, including the event key from `X-Event-Key` and delivery identifiers from Bitbucket headers, should remain available to downstream nodes through the trigger's normal request metadata representation.

The provider payload is event-specific. For example, a repository push includes actor, repository, and push/change information, while a fork event includes actor, repository, and fork information. The implementation must preserve unknown fields so new Bitbucket event versions do not discard data.

### Output

For every accepted delivery, output[0] contains one item on the `main` output. The item's `json` value represents the received Bitbucket event and its request metadata according to OpenFlow's webhook item convention. There is no output for a request that is rejected before trigger execution.

The node must not emit one item per changed ref, commit, or nested provider object. Bitbucket's event payload remains one event delivery and is forwarded as one trigger item.

### HTTP response

The callback must acknowledge a valid delivery promptly, using the trigger's received/acknowledged response mode. The response body is not part of the workflow item contract. A failed registration or an invalid request may return an error response; a valid event should not wait for all downstream workflow work before acknowledgement.

### Errors

- Missing, invalid, or insufficient credentials: fail registration with an actionable authentication/authorization error.
- Unknown subject, inaccessible subject, or unsupported event key: fail registration rather than silently subscribing to a different resource or event.
- Provider API failure, timeout, or rate limit while creating or deleting a webhook: surface the failure and retain enough context for retry or diagnosis.
- Malformed request body: reject the delivery or surface a trigger execution error; do not emit a fabricated empty event.
- A trigger has no upstream items, so `continueOnFail` does not provide item-level recovery semantics.

### Expressions

The subject identifier may be expression-backed when the deployment/runtime can resolve it before webhook registration. Event selection and credentials are configuration values and should be resolved before registration. Incoming event fields are available to downstream expressions through the emitted item; they are not evaluated as node configuration.

## Acceptance tests

### Test: repository push delivery is forwarded as one event

**Parameters:** Configure repository scope for `acme/demo` and subscribe to the provider's repository push event.

**Request:** `POST` to the generated webhook URL with `X-Event-Key: repo:push` and a valid Bitbucket push payload containing `actor`, `repository`, and `push` data.

**Expect:** One execution starts with exactly one item on output[0]. The item preserves the complete request payload, including the push changes, and exposes the event key/request metadata without splitting the changes into multiple items.

### Test: multiple selected events share one configured trigger

**Parameters:** Configure a repository and select both repository push and repository fork events.

**Requests:** Deliver one valid `repo:push` request and one valid `repo:fork` request.

**Expect:** Each request starts one execution, and each output item retains its corresponding event payload and event key. The fork delivery must not be shaped as a push delivery.

### Test: workspace subscription uses the selected workspace

**Parameters:** Configure workspace scope for `acme-workspace` and select an event returned by Bitbucket's workspace subscribable-event list.

**Expect:** Registration targets the workspace subject and selected event key, not a repository endpoint. A matching delivery is acknowledged and forwarded as one item.

### Test: registration authorization failure

**Parameters:** Use a credential without webhook creation permission or without access to the configured repository/workspace.

**Expect:** Activation/listen fails with an authentication or authorization error; no successful trigger subscription is reported and no workflow execution is emitted.

### Test: malformed delivery is not fabricated

**Parameters:** Use an otherwise valid registration.

**Request:** Send a matching event header with an invalid JSON body or an invalid content type/body combination.

**Expect:** The delivery is rejected or reported as a trigger error, and output[0] contains no synthetic empty event item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and webhook-based trigger | documented | n8n describes the node as handling Bitbucket events through webhooks. |
| Repository/workspace subject scopes | documented | Bitbucket's webhook API documents both subject types and n8n's public node metadata exposes these high-level scopes. |
| Provider event-key selection | documented | Bitbucket exposes a subscribable event list per subject type and sends the selected event key in `X-Event-Key`. |
| Access-token credential | documented | n8n's Bitbucket credential page documents access-token authentication and webhook-related scopes. |
| Exact editor parameter names, defaults, and event enum list | intentionally unspecified | Public node documentation does not provide a complete stable property schema. The implementation should derive event choices from the provider's public event list. |
| Exact OpenFlow request-metadata nesting | inferred | This spec requires preservation and availability of payload/metadata but leaves the repository's common webhook item convention to the SDK implementation. |
| Registration and cleanup lifecycle | inferred from webhook semantics | Bitbucket documents creating subscriptions and delivering events; the test/production activation lifecycle follows the normal OpenFlow trigger contract. |
| Retry/deduplication policy | undocumented | Bitbucket documents attempt headers and retries, but this spec does not mandate a deduplication algorithm. Implementers should preserve attempt/request identifiers. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/bitbucket-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
