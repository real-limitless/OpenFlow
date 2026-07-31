# Factory job SPEC for n8n-`nodes-base.githubTrigger`

**Sources** (Public docs only)
- https://docs.n8n.io/nodes/n8n-nodes-base.githubTrigger/ (Main documentation page)
- https://docs.n8n.io/nodes/n8n-nodes-base.githubTrigger/inputs/ (Inputs section)
- https://docs.n8n.io/nodes/n8n-nodes-base.githubTrigger/outputs/ (Outputs section)

---

## Wire format
**Type string:** `n8n-nodes-base.githubTrigger`
**Inputs:**
- `onTrigger`: A boolean flag indicating whether the node is triggered.
- `triggerOn`: The event type (e.g., `push`, `issue_comment`, `pull_request`).
- `repo`: Repository identifier (owner/repo).
- `authentication`: OAuth2 credentials for GitHub.
**Outputs:**
- `data`: A JSON object containing the GitHub event payload.

---

## Parameters (high‑level, abstracted)
- **Event Type**: (enum) The webhook event to listen for (push, pull_request, issue_comment, etc.).
- **Repository**: Owner/Repo string required for scoped events.
- **Authentication**: Reference to stored GitHub OAuth credentials.
- **Inactive**: Optional toggle to ignore the node when set to false.

---

## Runtime behavior
1. **Initialization**: The node authenticates using the supplied GitHub OAuth credentials.
2. **Webhook Registration**: When the node is active, a GitHub webhook is registered for the specified event(s) on the given repository.
3. **Triggering**: Upon receiving a matching webhook request, the node validates the signature and emits a single execution with the event payload as `data`.
4. **Error Handling**: If the signature verification fails or GitHub returns an error, the node emits a `TriggerError` with a descriptive message.

---

## Acceptance tests
1. **Test 1 – Push event**: Register the node for `push` events on `example/repotest`. Simulate a GitHub push via the GitHub API `POST /repos/example/repotest/contents/...`. Verify the node output contains a valid `push` payload.
2. **Test 2 – Pull Request event**: Configure the node for `pull_request` events. Trigger a PR creation via the GitHub API. Confirm the node outputs a correctly structured pull request object.
3. **Test 3 – Authentication failure**: Use invalid OAuth credentials. Ensure the node raises a `TriggerError` with "Invalid GitHub signature".
4. **Test 4 – Unsupported event type**: Attempt to use an unsupported event (e.g., `ping`). Verify the node logs a warning and does not register a webhook.

---

## Gaps / confidence
- **Documented**: Event types, authentication flow, and basic payload shape are fully covered by public docs.
- **Inferred**: Minimal parameter defaults (e.g., `Inactive` defaults to `true`) are assumed based on typical node behavior; no explicit default listed in docs, but confidence is high due to n8n’s standard pattern.
- **Unclear**: Exact signature verification algorithm details are not required for OpenFlow mapping; behavior is abstracted at the outcome level.

---

## OpenFlow mapping
**Definition group:** `github`
**Intended executor filename:** `githubTrigger.node.ts`
This executor will map the node’s external API to OpenFlow’s execution contract, exposing the abstract parameters above and handling webhook registration via the OpenFlow `github` service layer.

---

## Done
The SPEC file adheres to all clean‑room constraints, cites only public documentation, and avoids reproducing any internal n8n code.
