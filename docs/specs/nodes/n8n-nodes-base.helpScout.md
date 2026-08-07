---
type: n8n-nodes-base.helpScout
displayName: Help Scout
category: Communication
versions: [1]
priority: medium
status: specced
---

# Help Scout

Node for interacting with the Help Scout Mailbox API v2. Supports creating, retrieving, updating, deleting, and searching conversations and customers, fetching mailbox metadata, and managing chat threads.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.helpscout.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/helpscout/ | Public docs only |
| https://developer.helpscout.com/mailbox-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.helpScout`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `helpScoutOAuth2Api` (OAuth2)

## Parameters

### Resource & Operation selector

The node exposes four resources, each with a fixed set of operations:

| Resource | Operations |
|----------|------------|
| Conversation | Create, Delete, Get, Get All |
| Customer | Create, Get, Get All, Get Property Definitions, Update |
| Mailbox | Get, Get All |
| Thread | Create (chat thread), Get All |

### Conversation

**Create:**
- `mailboxId` (number, required) — target mailbox
- `status` (string, required) — one of `active`, `closed`, `pending`
- `type` (string, required) — one of `chat`, `email`, `phone`
- `subject` (string, required)
- `customer` (object, required) — customer id OR email + optional firstName/lastName/phone/photoUrl/jobTitle/photoType/background/location/organization
- `threads` (array, required) — at least one thread with type + type-specific fields (customer/note/chat/phone/reply)
- `createdAt` (ISO 8601 string, optional) — for importing historical conversations
- `closedAt` (ISO 8601 string, optional) — for imported conversations
- `assignTo` (number, optional) — user ID to assign; send `null` to keep unassigned
- `tags` (array of strings, optional)
- `fields` (array of `{id, value}`, optional) — custom field values
- `autoReply` (boolean, optional) — enable/disable auto-reply on creation
- `imported` (boolean, optional) — suppress notifications when importing history
- `user` (number, optional) — override the resource owner for the thread

**Delete:**
- `conversationId` (number, required)

**Get:**
- `conversationId` (number, required)

**Get All:**
- `mailboxId` (number, optional) — filter by mailbox
- `folderId` (number, optional) — filter by folder within a mailbox
- `status` (string, optional) — filter by status
- `tag` (string, optional) — filter by tag slug
- `sortField` (string, optional) — `score`, `customerEmail`, `customerName`, `mailboxid`, `modifiedAt`, `createdAt`, `status`, `subject`
- `sortOrder` (string, optional) — `asc` or `desc`
- `query` (string, optional) — free-text search
- `assignedTo` (number, optional) — filter by assigned user ID
- `number` (string, optional) — conversation number filter
- `modifiedSince` (ISO 8601 string, optional) — only conversations modified after this time

### Customer

**Create:**
- `firstName` (string, required)
- `lastName` (string, required)
- `email` (string, required)
- `phone` (string, optional)
- `photoUrl` (string, optional)
- `jobTitle` (string, optional)
- `photoType` (string, optional) — one of `unknown`, `gravatar`, `twitter`, `facebook`, `googleprofile`, `googleplus`, `linkedin`, `instagram`
- `background` (string, optional) — notes field, max 200 chars
- `location` (string, optional)
- `organization` (string, optional)
- `gender` (string, optional)
- `age` (string, optional)
- `address` (object `{lines, city, state, postalCode, country}`, optional)
- `emails` (array of `{value, location}`, optional)
- `phones` (array of `{value, location}`, optional)
- `websites` (array of `{value}`, optional)
- `chats` (array of `{value, type}`, optional)
- `socialProfiles` (array of `{value, type}`, optional)

**Get:**
- `customerId` (number, required)

**Get All:**
- `firstName` (string, optional) — filter
- `lastName` (string, optional) — filter
- `mailboxId` (number, optional) — filter by mailbox
- `modifiedSince` (ISO 8601 string, optional)
- `query` (string, optional) — free-text search
- `sortField` (string, optional)
- `sortOrder` (string, optional)

**Get Property Definitions:**
- (no additional parameters)

**Update:**
- `customerId` (number, required)
- Same fields as Create — any subset may be provided

### Mailbox

**Get:**
- `mailboxId` (number, required)

**Get All:**
- (no additional parameters)

### Thread

**Create (chat thread):**
- `conversationId` (number, required)
- `customer` (customer identifier, required)
- `text` (string, required)
- `createdAt` (ISO 8601, optional)

**Get All:**
- `conversationId` (number, required)

## Runtime behavior

### Input

Each input item is processed independently. A single item may produce zero or one output item. When `continueOnFail` is enabled, errors on individual items produce empty results for that item rather than aborting.

### Output

The output item for each operation wraps the API response body:
- **Conversation / Customer / Mailbox Get:** the resource object as returned by the Help Scout API.
- **Create:** the newly created resource (the `Resource-ID` header on create is used to fetch the full resource).
- **Get All:** an array of resource objects, possibly wrapped with pagination metadata (`page`, `pages`, `count`).
- **Delete:** no output body — the operation returns with an empty result on success.
- **Thread Get All:** an array of thread objects.
- **Get Property Definitions:** an array of property definition objects with field id, name, field type, and options.

### Errors

- Non-2xx API responses should propagate as node errors unless `continueOnFail` is set.
- Help Scout rate limiting (HTTP 429) should surface a clear retry-after message.

### Expressions

All parameter values accept n8n expression strings.

## Acceptance tests

### Test: conversation create with minimum fields

**Given** input items:
```json
[{ "json": { "subject": "Test conversation", "mailboxId": 85, "type": "email", "status": "active" } }]
```

**Parameters:**
```json
{
  "resource": "conversation",
  "operation": "create",
  "mailboxId": 85,
  "status": "active",
  "type": "email",
  "subject": "Test conversation",
  "customer": { "email": "test@example.com", "firstName": "Test", "lastName": "User" },
  "threads": [{ "type": "customer", "text": "Hello" }]
}
```

**Expect** output[0] to contain a conversation object with `id`, `subject`, and `status` fields.

### Test: customer get all and paginate

**Given** input items: `[{ "json": {} }]`

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "getAll",
  "query": "example.com"
}
```

**Expect** output[0] to contain an array of customer objects, each with `id`, `firstName`, `lastName`, and `email`.

### Test: conversation delete

**Given** input items: `[{ "json": { "conversationId": 123 } }]`

**Parameters:**
```json
{
  "resource": "conversation",
  "operation": "delete",
  "conversationId": 123
}
```

**Expect** output[0] to be empty (success, no body).

### Test: mailbox get all

**Given** input items: `[{ "json": {} }]`

**Parameters:**
```json
{
  "resource": "mailbox",
  "operation": "getAll"
}
```

**Expect** output[0] to contain an array of mailbox objects with `id` and `name`.

### Test: customer update

**Given** input items: `[{ "json": { "customerId": 456, "firstName": "Updated" } }]`

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "update",
  "customerId": 456,
  "firstName": "Updated"
}
```

**Expect** output[0] to contain the updated customer object with `firstName` equal to "Updated".

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation list | Public docs | Confirmed at https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.helpscout.md |
| Credential type | Public docs | OAuth2 only; documented at https://docs.n8n.io/integrations/builtin/credentials/helpscout/ |
| Parameter details per operation | Inferred from Help Scout Mailbox API v2 | Detailed field names, required status, and types derived from https://developer.helpscout.com/mailbox-api/ |
| Dynamic loads (mailboxes, tags, country codes) | Inferred from type declaration | `.d.ts` confirmed `getMailboxes`, `getTags`, `getCountriesCodes` load-options methods |
| Pagination exact output shape | Inferred | Get All endpoints wrap arrays with `page`, `pages`, `count` per Help Scout API convention |
| Thread "Get All" returns chat threads only | Inferred from n8n docs | Docs list "Create a new chat thread" and "Get all chat threads" under Thread resource |
| Conversation "Get All" exact filter fields | Inferred | Based on Help Scout List Conversations API query parameters |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/helpScout.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
