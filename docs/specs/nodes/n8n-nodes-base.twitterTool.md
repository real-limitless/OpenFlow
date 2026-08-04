---
type: n8n-nodes-base.twitterTool
displayName: X (Twitter) Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# X (Twitter) Tool

An AI agent tool variant of the X (Twitter) node, wrapping the X API v2 for use by AI agents. When connected to an AI Agent root node, the model can dynamically populate parameters via `$fromAI()` or the "let model fill" toggle. Supports Direct Message, Tweet, User, and List resources.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twitter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twitter.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.x.com/en/docs/twitter-api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.twitterTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twitterOAuth2Api` (OAuth 2.0 PKCE, Client ID + Client Secret, current) or `twitterOAuth1Api` (OAuth 1.0a, deprecated), selected by an `authentication` parameter.

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | fixed (OAuth2 / OAuth1) | OAuth2 | yes | Selects credential variant. OAuth1 is deprecated. |

### Resource and operation selection

The user selects a resource (Direct Message, Tweet, User, List) and an operation for that resource:

- **Direct Message:** create a direct message.
- **Tweet:** create a tweet, reply to a tweet, delete a tweet, search tweets, like a tweet, retweet a tweet.
- **User:** get a user.
- **List:** add a member to a list.

### Operation parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tweetId | string | — | conditional | shown when the operation targets one tweet | Identifier of the tweet to delete, like, retweet, or reply to. |
| text | string | — | conditional | shown when the operation writes tweet content | Tweet body text. For replies this is paired with `tweetId`. |
| searchQuery | string | — | conditional | shown when operation is search | X search query syntax for finding tweets. |
| userIdentifier | string | — | conditional | shown when operation is get user | User id or @username of the target user. |
| recipientIdentifier | string | — | conditional | shown when operation is create direct message | User id or @username of the DM recipient. |
| messageText | string | — | conditional | shown when operation is create direct message | Direct message body text. |
| listId | string | — | conditional | shown when operation is add list member | Identifier of the target list. |
| memberIdentifier | string | — | conditional | shown when operation is add list member | User id or @username of the member to add. |
| simplify | boolean | true | no | | Collapse verbose API expansions into core object fields on output. |
| additionalFields | collection | {} | no | | Service-level options: field expansions (tweet.fields, user.fields), pagination tokens, and any operation-specific extra parameters. |

All string parameters accept expressions. When used as an AI agent tool, parameters may be populated dynamically by the calling agent via `$fromAI()`.

## Runtime behavior

### Input

Each input item is processed independently; values are rendered per item. Empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` carries the operation outcome:

- **Create / reply / delete / like / retweet:** the server-confirmed result — typically the created object identifier and a success flag.
- **Create direct message:** the created message outcome. The recipient identifier must resolve to a numeric X user id before the DM request: an @username input triggers `GET /2/users/by/username/{name}` first, and the resolved id substitutes directly into `POST /2/dm_conversations/with/{id}/messages`.
- **Search / get user / list membership:** the returned resources — tweet objects for search, user object for lookup, and membership confirmation for list operations.
- `simplify: false` preserves the full server payload (data/includes/meta envelopes) for downstream use.

### Errors

- HTTP failures (4xx/5xx) from the X API surface as node errors, including rate-limit responses.
- Unresolvable identifiers (user, tweet, list) throw before a successful API call.
- `continueOnFail` yields an item carrying the error instead of halting the run.
- Empty input items produce empty output.

### Expressions

All string parameters (`tweetId`, `text`, `searchQuery`, `userIdentifier`, `recipientIdentifier`, `messageText`, `listId`, `memberIdentifier`) and the `additionalFields` collection accept expressions.

### AI tool mode

When connected to an AI Agent root node, parameters can be:
- Populated dynamically via `$fromAI()` expressions.
- Set by the model at tool-calling time.
- Configured with the "let model fill" toggle in the node editor.

## Acceptance tests

### Test: create a tweet via AI agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Tweet",
  "operation": "create",
  "text": "=$fromAI('text')",
  "simplify": true
}
```

**Expect** output[0] `json` contains the id of the created tweet. The `text` parameter is populated dynamically by the AI agent at runtime.

### Test: reply to a tweet

**Given** input items:

```json
[{ "json": { "tweetId": "1445880548472328192" } }]
```

**Parameters:**

```json
{
  "resource": "Tweet",
  "operation": "reply",
  "text": "Agreed",
  "simplify": true
}
```

**Expect** the API call targets `POST /2/tweets` with `reply.in_reply_to_tweet_id` set from `tweetId`, and output[0] `json` contains the new tweet id.

### Test: search tweets

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Tweet",
  "operation": "search",
  "searchQuery": "n8n automation -is:retweet",
  "simplify": true
}
```

**Expect** output[0] `json` contains matching tweets from the search endpoint.

### Test: create a direct message with username resolution

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Direct Message",
  "operation": "create",
  "recipientIdentifier": "@someUser",
  "messageText": "Hello from the agent",
  "simplify": true
}
```

**Expect** the node resolves `@someUser` via `GET /2/users/by/username/someUser`, substitutes the numeric id into `POST /2/dm_conversations/with/{id}/messages`, and output[0] `json` carries `dm_conversation_id` and `dm_event_id`.

### Test: continueOnFail produces error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "continueOnFail": true,
  "resource": "Tweet",
  "operation": "delete",
  "tweetId": "does-not-exist"
}
```

**Expect** output[0] contains a single item whose `json` carries the API error rather than halting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public docs for the base `twitter` node enumerate Direct Message, Tweet, User, List and their operations. |
| Credential variants | documented | Credentials page documents OAuth2 and OAuth 1.0a. |
| Wire type string | inferred | Type `n8n-nodes-base.twitterTool` follows the naming pattern of other tool variants (e.g. `gmailTool`, `googleSheetsTool`). No dedicated docs page exists. |
| Underlying X API v2 endpoints | documented | Public service docs map each operation to a v2 endpoint. |
| AI tool parameter mode | documented | `$fromAI()` pattern documented for all AI tool nodes. |
| Parameter nesting / exact defaults | inferred | Described at outcome level; exact UI nesting may differ. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/twitterTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
