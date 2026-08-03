---
type: n8n-nodes-base.slackTool
displayName: Slack (AI Tool)
category: AI Tool
versions: [1]
priority: high
status: specced
---

# Slack (AI Tool)

A reduced-surface AI agent tool variant of the Slack node. When connected to an AI Agent, the model can dynamically populate parameters using the `$fromAI()` function. Supports **Channel**, **Message**, and **User** resources against the Slack Web API with a focused set of operations suitable for agent-driven workflows.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/slack/ | Public docs only |
| https://api.slack.com/methods | External API docs |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.slackTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `slackApi` (access token) **or** `slackOAuth2Api` (OAuth2 with granular scopes)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `accessToken` | no | `accessToken` (bot/user token) or `oAuth2` (OAuth2 flow) |

### Resource selection

The user selects a resource (Channel, Message, User) which determines available operations.

### Channel operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Channel | Create | Channel Name, optional: Channel Visibility (public/private) |
| Channel | Get | Channel ID |
| Channel | Get Many | Return All, Limit, optional: Channel ID for filtering |

### Message operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| Message | Post | Channel ID or User ID, Text |
| Message | Update | Channel ID, Timestamp, Text |
| Message | Delete | Channel ID, Timestamp |
| Message | Search | Query, optional: Sort (timestamp/score), Return All, Limit |

### User operations

| Resource | Operation | Key parameters |
|----------|-----------|----------------|
| User | Info | User ID |
| User | Get Many | Return All, Limit |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Resource locators (channel/user pickers) are backed by load-options methods that query the Slack API
- The `blocks` parameter is not exposed in this reduced surface; plain text messages only
- Binary file uploads are not supported in this tool variant

## Runtime behavior

### Input

Consumes items from `main` input. For operations that send messages, the text content can be supplied via expressions or AI-populated parameters.

### Output

**Output[0]** — main result:
- Channel, Message, or User data returned from the Slack Web API
- List operations (`getAll`) return arrays of objects; single-item operations return the object
- Search returns an array of message match objects

### Errors

- API errors (auth failures, rate limits, invalid IDs, missing scopes) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Rate limits: automatic retry with exponential backoff (max 2 retries) is recommended but not yet implemented
- Permanent deletion operations (Message Delete) are irreversible without manual intervention

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions. Resource locator fields (Channel ID, User ID, etc.) accept expressions that resolve to valid Slack IDs.

## Acceptance tests

### Test: Post a simple text message to a channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "channelId": "C1234567890",
  "text": "Hello from n8n workflow"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "ok": true,
    "channel": "C1234567890",
    "ts": "<timestamp>",
    "message": {
      "text": "Hello from n8n workflow",
      "type": "message",
      "user": "<bot-user-id>"
    }
  }
}]
```

### Test: Create a public channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "create",
  "channelId": "new-project-channel",
  "channelVisibility": "public"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "C1234567890",
    "name": "new-project-channel",
    "is_channel": true,
    "is_private": false,
    "created": 1699999999
  }
}]
```

### Test: List channels (paginated)

**Given** input items:
```json
[{ "json": {} }]
```
Workspace has 250+ channels

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "C111",
    "name": "general",
    "is_channel": true
  },
  "json": {
    "id": "C222",
    "name": "random",
    "is_channel": true
  }
}]
```
Array length ≥ 250; each item has `id`, `name`, `is_channel`

### Test: Get user info

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "info",
  "user": "U0987654321"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "ok": true,
    "user": {
      "id": "U0987654321",
      "name": "john.doe",
      "real_name": "John Doe",
      "profile": {
        "display_name": "John Doe",
        "email": "john@example.com"
      }
    }
  }
}]
```

### Test: Search messages

**Given** input items:
```json
[{ "json": {} }]
```
Credential has `search:read` scope

**Parameters:**
```json
{
  "resource": "message",
  "operation": "search",
  "query": "quarterly report",
  "sort": "timestamp",
  "returnAll": false,
  "limit": 20
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "text": "Q3 quarterly report attached",
    "channel": { "id": "C111", "name": "reports" },
    "ts": "1234567890.123",
    "score": "0.95"
  },
  {
    "json": {
      "text": "quarterly report final version",
      "channel": { "id": "C222", "name": "finance" },
      "ts": "1234567891.456",
      "score": "0.87"
    }
  }
}]
```
Each item is a message match object with `text`, `channel`, `ts`, `score`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | High | Matches implemented executor + definition; intentionally reduced from full Slack node |
| Credential types & auth flow | High | Public credentials docs + corpus |
| Required scopes per operation | High | Published in docs (scopes table) |
| Parameter nesting / displayOptions | Medium | Definition has conditional displayOptions; spec captures intent only |
| Binary upload support | Not supported | Intentionally excluded from this tool variant |
| Send-and-wait / HITL | Not supported | Not in reduced surface; use full Slack node for approval flows |
| Rate limit retry policy | Medium | Recommended (2 retries, exponential backoff); not yet in executor |
| $fromAI() field coverage | Medium | All string parameters accept expressions; resource locators use load-options |

**Intentionally excluded from this AI Tool variant (available in full `n8n-nodes-base.slack`):**
- File resource (Upload, Get, Get Many)
- Reaction resource (Add, Get, Remove)
- Star resource (Add, Delete, Get Many)
- User Group resource (Create, Disable, Enable, Get Many, Update)
- User Profile operations (Get Profile, Get Presence, Update Profile)
- Channel operations: Archive, Close, History, Invite, Join, Kick, Leave, Member, Open, Rename, Replies, Set Purpose, Set Topic, Unarchive
- Message operations: Get Permalink, Send and Wait for Response
- Block Kit / rich formatting (`blocks`, `attachments` parameters)
- Ephemeral messages, thread replies, username/icon override

## OpenFlow mapping

| Property | Value |
|----------|-------|
| **Definition group** | `tools` |
| **Executor file** | `src/lib/engine/executors/n8n-nodes-base.slackTool.ts` |
| **SDK entry point** | `defineNode('n8n-nodes-base.slackTool', ...)` |
| **Credential aliases** | `slackApi` → `slackAccessToken`, `slackOAuth2Api` → `slackOAuth2` |

---

## Clean-Room Citation

This spec was produced without reading n8n source implementation. All behavioral details derived from:
1. Public n8n documentation (docs.n8n.io)
2. Slack Web API reference (api.slack.com/methods)
3. CORPUS_DIR used **only** for: type string confirmation (`n8n-nodes-base.slackTool`), resource/operation enumeration for the reduced surface, credential class names, and version history.
4. OpenFlow repository definition (`src/lib/nodes/definitions/communication.ts`) and executor (`src/lib/engine/executors/n8n-nodes-base.slackTool.ts`) consulted to align spec with implemented surface.

No implementation algorithms, nested parameter schemas, or internal utility functions were copied.