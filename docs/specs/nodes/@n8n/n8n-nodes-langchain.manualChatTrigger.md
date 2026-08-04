---
type: @n8n/n8n-nodes-langchain.manualChatTrigger
displayName: Manual Chat Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Manual Chat Trigger

Legacy trigger node that starts an AI workflow from the n8n editor's **Test** panel (manual execution). It accepts a single chat message typed by the user in the "Chat" tab of the manual execution sidebar and passes that message to a connected Agent or Chain root node. Replaced by the Chat Trigger node as of n8n 1.24.0.

This node does **not** support hosted web chat, embedded chat, authentication, or multi-turn session management. It exists purely for interactive testing during workflow development.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/common-issues.md | Public docs only |

**Confidence note:** The Manual Chat Trigger has no standalone documentation page (the URL returns 404). Its behavior is documented only by the Chat Trigger page which states: "This node replaces the Manual Chat Trigger node from version 1.24.0." The following specification is inferred from that relationship and from the node's package decl.

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.manualChatTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (no incoming connections expected; this is a trigger node)
- **Outputs:** `main` × 1 (fires when manual execution begins and a chat message is submitted)
- **Credentials:** None
- **Connections:** None — no sub-node connectors (no `ai_memory`, no `ai_languageModel`, etc.)
- **Webhook:** None — this node does not register HTTP endpoints

## Parameters

The node exposes **no parameters** in the n8n editor. All behavior is driven by the manual execution context:

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none) | | | | | No user-configurable properties |

There are no node options panels, no credential selectors, and no sub-node connectors. The node is purely a passive trigger that forwards the manual-chat input to downstream nodes.

## Runtime behavior

### Trigger activation

When the user clicks **Test workflow** in the n8n editor and the manual chat panel is visible, the node registers itself as the active trigger. On each message submission (user types text in the Chat panel and presses Enter), the node fires, producing a single output item.

### Input

The node receives its input from the **manual chat sidebar** in the n8n editor — not from workflow upstream nodes. The user types a plain-text message in the Chat tab.

### Output

Each firing produces a single output item on `main` × 1 with the following shape:

```json
{
  "json": {
    "chatInput": "<message text>",
    "content": "<message text>",
    "message": "<message text>"
  }
}
```

- `chatInput` — the raw text the user typed.
- `content` — alias of `chatInput` for compatibility with downstream Agent/Chain nodes.
- `message` — alias of `chatInput`.

The output item **must** contain a field named `chatInput`, `content`, or `text` (or a downstream Agent node's output parser may silently fail).

No metadata, headers, session IDs, or binary data are produced.

### Expressions

No parameters accept expression strings (there are no parameters).

### Errors

- If no agent or chain root node is connected downstream, the workflow executes without error but produces no useful output.
- If the manual chat sidebar never received a message (e.g., workflow runs before user input), the node may stall waiting for input. The n8n runtime and the user must coordinate — the workflow only proceeds when the user types a message.

### continueOnFail

Not applicable — this node has no parameter to set `continueOnFail`.

## Acceptance tests

### Test: basic message forward

**Given** the user types `"Hello, world!"` in the manual chat sidebar.

**Expect** output[0]:
- `json.chatInput` equals `"Hello, world!"`
- `json.content` equals `"Hello, world!"`
- `json.message` equals `"Hello, world!"`

### Test: downstream Agent receives chat input

**Given** an Agent root node connected after Manual Chat Trigger.
**Given** the user types `"What is the capital of France?"`.
**When** the Agent executes, its input must contain `chatInput`.

**Expect** the Agent's `input` property to include a string value of `"What is the capital of France?"`.

### Test: no formatting applied

**Given** the user types text with newlines or special characters.
**Then** the output must contain the exact text the user typed, with no escaping, truncation, or transformation applied by the trigger node itself.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output field names | Inferred from Chat Trigger backward compatibility | Chat Trigger uses `chatInput`, `content`, `message`; Manual Chat Trigger likely uses the same contract |
| Parameter surface | Inferred from package declaration and Chat Trigger replacement note | The `.d.ts` shows `description: INodeTypeDescription` with no mandatory properties; no parameters are expected |
| Sub-node connectors | Inferred from replacement note | Chat Trigger gained `ai_memory`; Manual Chat Trigger predates this and has none |
| Version history | Inferred from Chat Trigger docs | Replaced in v1.24.0; the Manual Chat Trigger node likely remains in the package for backward compatibility with older workflows but is hidden from the node panel for new workflows |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/@n8n/n8n-nodes-langchain.manualChatTrigger.ts`
- **SDK:** `defineNode` as trigger with manual-execution-only mode; no polling or webhook integration
