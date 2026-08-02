---
type: n8n-nodes-base.twitter
displayName: X (Formerly Twitter)
category: Marketing
versions: [1]
priority: medium
status: specced
---

# X (Formerly Twitter)

Automates the X (formerly Twitter) platform: posting, replying, deleting,
searching, liking, and retweeting tweets, sending direct messages, looking up
users, and managing list membership, all through the X API v2.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twitter.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twitter.md | Public docs only |
| https://developer.x.com/en/docs/twitter-api | Public docs only (third-party service docs) |
| https://developer.x.com/en/docs/twitter-api/direct-messages/manage | Public docs only (X API v2 DM contract) |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata (type string + credential names only) |

## Wire format

- **Type string:** `n8n-nodes-base.twitter`
- **Aliases:** `Tweet`, `Twitter`, `X`, `X API`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twitterOAuth2Api` (current, OAuth 2.0 PKCE, Client ID +
  Client Secret) or `twitterOAuth1Api` (deprecated, OAuth 1.0a), selected by an
  `authentication` parameter.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | fixed (OAuth2 / OAuth1) | OAuth2 | yes | | Selects the credential variant. OAuth1 is deprecated by the service and only kept for legacy workflows. |
| resource | fixed (Direct Message / Tweet / User / List) | Tweet | yes | | The X resource to act on. |
| operation | fixed (per resource) | — | yes | | See per-resource list below. |
| tweetId | string | — | conditional | shown when an operation targets one tweet | Identifier of the tweet to delete, like, retweet, or reply to. |
| text | string | — | conditional | shown when the operation writes tweet content | The tweet body. For replies this is paired with `tweetId`. |
| searchQuery | string | — | conditional | shown when operation=Search | X search query syntax used to find tweets. |
| userIdentifier | string | — | conditional | shown when operation=Get user | User id or @username of the user to look up. |
| recipientIdentifier | string | — | conditional | shown when operation=Create direct message | User id or @username of the message recipient. |
| messageText | string | — | conditional | shown when operation=Create direct message | The direct message body. |
| listId | string | — | conditional | shown when operation=Add member to a list | Identifier of the list to modify. |
| memberIdentifier | string | — | conditional | shown when operation=Add member to a list | User id or @username of the member to add. |
| simplify | boolean | true | no | | Collapse verbose API expansions into the core object fields on output. |
| additionalFields | collection | {} | no | | Service-level options: field expansions (`tweet.fields`, `user.fields`), pagination tokens, and any operation-specific extra parameters. |

Per-resource operations (as listed in public docs):

- **Direct Message:** create a direct message.
- **Tweet:** create a tweet, create a reply, delete a tweet, search tweets,
  like a tweet, retweet a tweet.
- **User:** get a user.
- **List:** add a member to a list.

All string parameters accept expressions. Because the node can be used as an AI
agent tool, most parameters may also be populated dynamically by the calling
agent (see `$fromAI()` usage in n8n docs).

## Runtime behavior

### Input

Each input item is processed independently; values are rendered per item.
Empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` carries the
operation outcome at a functional level:

- **Create / reply / delete / like / retweet:** the server-confirmed result —
  typically the created object identifier (tweet id) and, where the API returns
  it, a success flag.
- **Create direct message:** the created message outcome — the server returns
  `data.dm_conversation_id` and `data.dm_event_id`, which the node surfaces.
  The recipient identifier must be resolved to a **numeric X user id** before
  the DM request: an `@username` input is resolved through
  `GET /2/users/by/username/{name}` first, and the resolved id is then
  substituted into `POST /2/dm_conversations/with/{id}/messages`. The URL must
  carry the resolved numeric id, never a placeholder token.
- **Search / get user / list membership:** the returned resource(s) — tweet
  objects for a search, the user object for a lookup, and membership
  confirmation for list operations.
- `simplify: false` preserves the full server payload (including API
  `data`/`includes`/`meta` envelopes) for downstream use.

### Errors

- HTTP failures (4xx/5xx) from the X API surface as node errors, including
  rate-limit responses.
- Unresolvable identifiers (user, tweet, or list) throw before a successful
  API call. A username lookup that returns no user (404) is treated as an
  unresolvable recipient and fails the operation.
- `continueOnFail` yields an item carrying the error instead of halting the run.
- Deletion of a tweet not owned by the authenticated user fails (service
  constraint).
- Empty input items (zero items) produce empty output on the single output
  (that is, an empty result set, `[[]]`), never a crash or a sentinel item.

### Expressions

All string parameters (`tweetId`, `text`, `searchQuery`, `userIdentifier`,
`recipientIdentifier`, `messageText`, `listId`, `memberIdentifier`) and the
`additionalFields` collection accept expressions.

## Acceptance tests

### Test: create a tweet

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Tweet",
  "operation": "create",
  "text": "Hello from OpenFlow",
  "simplify": true
}
```

**Expect** output[0] `json` contains the id of the created tweet (matching the
X API v2 `POST /2/tweets` response) and the request body sent `text` as given.

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

**Expect** the API call targets `POST /2/tweets` with `reply.in_reply_to_tweet_id`
set from the expression-rendered `tweetId`, and output[0] `json` contains the
new tweet id.

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
  "searchQuery": "openflow -is:retweet",
  "simplify": true
}
```

**Expect** output[0] `json` contains the list of matching tweets from the
search endpoint (one tweet per returned result) with the query passed through.

### Test: like and retweet

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Tweet",
  "operation": "like",
  "tweetId": "1445880548472328192",
  "simplify": true
}
```

**Expect** the call targets the like endpoint with `tweetId` and output[0]
`json` confirms the like was registered.

### Test: create a direct message

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
  "messageText": "Hi there",
  "simplify": true
}
```

**Expect** the node resolves the recipient before the DM call: because
`recipientIdentifier` starts with `@`, it first calls
`GET /2/users/by/username/someUser`, reads the returned user id, then posts to
`POST /2/dm_conversations/with/{resolvedUserId}/messages` with body
`{ "text": "Hi there" }`. The request URL must contain the resolved numeric
user id — never a `:participant_id`-style placeholder. Output[0] `json` carries
the created message outcome (`dm_conversation_id` / `dm_event_id`).

### Test: create a direct message to a numeric user id

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Direct Message",
  "operation": "create",
  "recipientIdentifier": "906948460078698496",
  "messageText": "Hello",
  "simplify": true
}
```

**Expect** no username lookup is performed: `recipientIdentifier` is already a
numeric id, so the node posts directly to
`POST /2/dm_conversations/with/906948460078698496/messages`.

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

**Expect** output[0] contains a single item whose `json` carries the API error
rather than halting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public docs enumerate Direct Message, Tweet, User, List and their operations. |
| Credential variants | documented | Credentials page documents OAuth2 (current) and the deprecated OAuth 1.0a method; package descriptor confirms both credential type names. |
| Wire type string | documented | `n8n-nodes-base.twitter` from the package descriptor. |
| Underlying X API v2 endpoints | documented | Public service docs map each operation to a v2 endpoint (`POST /2/tweets`, search, like, retweet, user lookup, list members). |
| DM recipient resolution | documented | X API v2 DM endpoint requires a numeric `participant_id` (`POST /2/dm_conversations/with/{participant_id}/messages`); username lookup via `GET /2/users/by/username/{username}` is documented by the service. |
| Parameter naming/nesting | inferred | Exact parameter names and nesting are inferred; spec describes them at outcome level and only requires documented identifiers (tweet id, user id/@username, list id). |
| `simplify` behavior | partially documented | Collapsing verbose expansions is a common n8n pattern; exact default confirmed only at a high level. |
| Exact response body shape | inferred | Spec requires outcome-level data (ids, success flags, result lists) plus passthrough, not a fixed schema. |
| Operation default values | inferred | OAuth2 default and which operation is pre-selected are not needed for correctness. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/twitter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
