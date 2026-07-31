# Factory job – SPEC (clean‑room half A)

**Node type:** `n8n-nodes-base.gitlabTrigger`  
**Sources (public docs only)**
- https://docs.n8n.io/integrations/builtin/n8n-nodes-base.gitlabTrigger/   (Primary public documentation)

**Wire format**
- **Type string:** `n8n-nodes-base.gitlabTrigger`
- **Credentials:** `GitLabOAuth2` (OAuth2 token credential with read‑project access)
- **Execution Model:** Trigger runs when a GitLab event (push, merge request, issue, etc.) is received.

**Parameters (high‑level, abstracted)**
1. **Repository URL / Resource** – abstract identifier for the GitLab project (e.g., `projectId` or `repoSlug`).
2. **Event Types** – a list of GitLab webhook events the node should react to (push, merge_request, issue, etc.).
3. **Authentication** – reference to a pre‑configured `GitLabOAuth2` credential.
4. **Branch Filter (optional)** – high‑level filter for which branches the trigger applies to.
5. **Additional Options** – e.g., secret‑token handling, debounce behavior, but only when required for public contract.

**Runtime behavior**
- Upon receipt of a matching GitLab webhook, the node creates an OpenFlow **trigger execution**.
- Input payload is normalized to an OpenFlow **TriggerEvent** object containing the event type, project identifier, and minimal payload (e.g., commit SHA, ref, actor). No nested original webhook fields are preserved beyond what is necessary for contract compatibility.
- Output shape: a single **Trigger** node output that can be consumed by downstream OpenFlow workflows, exposing `type`, `project`, `event`, and `payload` fields at the outcome level.
- Errors such as missing/invalid credential or unauthorized webhook are surfaced as **AuthenticationError** or **WebhookValidationError** with clear messages.

**Acceptance tests**
1. **Test 1 – Push event delivery**
   - Simulate a webhook push event for a known repository.
   - Verify that a trigger execution is created with `event: "push"` and contains the commit SHA and ref.
2. **Test 2 – Merge Request event filter**
   - Send a merge‑request webhook with the node’s `event_types` set to include `merge_request`.
   - Confirm the trigger fires and the output shows `event: "merge_request"` and the MR ID.
3. **Test 3 – Invalid credential**
   - Configure the node with a non‑existent or revoked `GitLabOAuth2` credential.
   - Ensure the node raises an **AuthenticationError** and does not create a trigger.
4. **Test 4 – Branch filter**
   - Set `branch_filter` to `main`.
   - Send push events to `feature-branch`.
   - Verify the node does **not** trigger.
5. **Test 5 – Secret token validation**
   - Enable secret‑token option and provide a matching token.
   - Submit an event with the token; ensure the node validates it and processes the event.

**Gaps / confidence**
- The specification assumes public docs provide sufficient details on webhook payload reduction and credential handling; any internal field not present in public docs is omitted.
- Confidence: **High** for event detection and credential flow based on public docs; **Medium** for optional secret‑token handling, as docs mention it only briefly.

**OpenFlow mapping**
- **Definition group:** `gitlab`
- **Intended executor filename:** `gitlab-trigger-executor.ts`
- The executor will implement the normalized payload mapping described above and expose the `n8n-nodes-base.gitlabTrigger` OpenFlow type.

**Node citations**
- Added to `docs/clean-room.md` under *Node citations* as:
```
- n8n-nodes-base.gitlabTrigger: https://docs.n8n.io/integrations/builtin/n8n-nodes-base.gitlabTrigger/
```
