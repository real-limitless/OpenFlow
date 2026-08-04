---
type: n8n-nodes-base.zammad
displayName: Zammad
category: Communication
versions: [1]
priority: medium
status: specced
---

# Zammad

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zammad.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zammad.md | Public docs only |
| https://docs.zammad.org/en/latest/api/intro.html | Public docs only |
| https://docs.zammad.org/en/latest/api/group.html | Public docs only |
| https://docs.zammad.org/en/latest/api/organization.html | Public docs only |
| https://docs.zammad.org/en/latest/api/user.html | Public docs only |
| https://docs.zammad.org/en/latest/api/ticket/index.html | Public docs only |
| https://docs.zammad.org/en/latest/api/ticket/articles.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zammad`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `zammadApi` (basic auth or token auth)

### Credential fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| baseUrl | string | - | yes | URL of the Zammad instance (trailing slash tolerated) |
| authType | string | basicAuth | yes | `basicAuth` or `tokenAuth` |
| email | string | - | only basicAuth | email address for basic auth login |
| password | string | - | only basicAuth | password for basic auth |
| accessToken | string | - | only tokenAuth | API access token (recommended auth method) |
| allowUnauthorizedCerts | boolean | false | no | skip SSL certificate validation |

**Required token permissions for full node access:** `admin.group`, `admin.organization`, `admin.user`, `ticket.agent`, `ticket.customer`

**Authentication header mapping:**
- `basicAuth`: HTTP Basic Authentication — `Authorization: Basic <base64(email:password)>`.
- `tokenAuth`: HTTP header `Authorization: Token token=<accessToken>` (not Bearer).
- `oAuth2` (Zammad-native, not an n8n credential type): HTTP header `Authorization: Bearer <accessToken>`.

**API base path:** All requests go to `{baseUrl}/api/v1/{endpoint}`. Content-Type is always `application/json`.

**Pagination (getAll):** The Zammad REST API uses query parameters `per_page` (page size, server-enforced hard cap) and `page` (1-indexed). The `limit` parameter maps to `per_page`; when `returnAll` is false and a specific page offset is provided, both `per_page` and `page` are sent. When `returnAll` is true the executor fetches all pages by incrementing `page` until an empty response.

**Search (getAll):** Resources that support search (Group, Organization, Ticket, User) accept a `query` parameter containing a Zammad search expression passed as a query string to the search endpoint (`/api/v1/{resources}/search?query=...`).

## Parameters

The node is resource-oriented with four resources, each offering create / get / getAll / update / delete operations. The `User` resource also exposes a `getSelf` operation.

### Resource selector

| name | type | required | notes |
|------|------|----------|-------|
| resource | string | yes | One of: `group`, `organization`, `ticket`, `user` |

### Group operations

| operation | required params | optional / additional params |
|-----------|----------------|------------------------------|
| create | name | active, note, custom fields |
| get | groupId | - |
| getAll | - | query (text search), limit, sort options, custom fields |
| update | groupId | name, active, note, custom fields |
| delete | groupId | - |

### Organization operations

| operation | required params | optional / additional params |
|-----------|----------------|------------------------------|
| create | name | active, shared, domain, domainAssignment, vip, note, members, custom fields |
| get | organizationId | - |
| getAll | - | query (text search), limit, sort options, custom fields |
| update | organizationId | name, active, shared, domain, domainAssignment, vip, note, members, custom fields |
| delete | organizationId | - |

### Ticket operations

| operation | required params | optional / additional params |
|-----------|----------------|------------------------------|
| create | title | group, customer, article (subject, body, type, visibility, sender), priority, state, owner, note, mentions, custom fields |
| get | ticketId | - |
| getAll | - | query (text search), limit, sort options, custom fields |
| update | ticketId | title, group, customer, priority, state, owner, note, article, custom fields |
| delete | ticketId | - |

### User operations

| operation | required params | optional / additional params |
|-----------|----------------|------------------------------|
| create | firstname, lastname, email | login, active, verified, note, phone, fax, mobile, web, department, street, city, zip, country, address, organization (by name), roles (by name array), vip, custom fields |
| get | userId | - |
| getAll | - | query (text search), limit, sort options |
| getSelf | - | - |
| update | userId | firstname, lastname, email, login, active, verified, note, phone, fax, mobile, web, department, street, city, zip, country, address, organization, roles, vip, custom fields |
| delete | userId | - |

### Cross-cutting parameter notes

- **Custom fields** are represented as key-value pairs (field name + value). The list of custom field names is dynamically loaded from the Zammad API per resource type.
- **Sort options** comprise a sort key (dynamically loaded field) and sort order (`ascending` / `descending`).
- **Ticket article** is a sub-object with: subject, body, type (chat/email/fax/note/phone/sms), visibility (external/internal — maps to API boolean `internal`), sender (Agent/Customer/System), and optional reply_to. On Ticket create the article is required; on Ticket update the article adds a new article to the ticket.
- **Ticket customer / group / priority / state** references accept either a name string or an ID. The API resolves names (e.g. `"customer": "jane@example.com"`, `"group": "Sales"`, `"state": "open"`, `"priority": "3 high"`). The `guess:` prefix on customer email resolves or creates the user.
- **User address** fields (street, city, zip, country) are flat top-level keys on the user object — not nested under an address sub-object. The `address` field is a separate free-text line field.
- **User organization and roles** accept names (e.g. `"organization": "Zammad Foundation"`, `"roles": ["Agent", "Customer"]`).
- **Limit** caps the number of items returned by a `getAll` operation. When `returnAll` is used, the executor fetches all pages.
- All resource ID parameters support expression evaluation.
- All string parameters (name, title, note, etc.) support expression evaluation.

## Runtime behavior

### Input

The node receives items on `main` input 0. Parameter values are resolved per-item. Each item may independently drive one API call.

### Output

Each operation produces one or more output items on `main` output 0:

- **create / get / update** operations return the single full JSON object from the API response (e.g. `{ "id": 123, "name": "...", ... }`).
- **getSelf** returns the authenticated user's full JSON object.
- **getAll** operations return one item per result entity. If pagination applies, only the requested page of results is emitted.
- **delete** operations return `{}` (empty JSON object) as indicated by the Zammad API on successful deletion.
- When `continueOnFail` is enabled, a failed per-item API call emits the error as the output item rather than halting the node.

### Errors

- **Missing required parameters:** The node must throw a `NodeOperationError` listing the missing parameter before making any API call.
- **Empty update body:** When no fields change on an update call, the node throws a meaningful error (e.g. "No update data provided").
- **API errors:** HTTP 4xx/5xx from the Zammad API are surfaced directly with the API error message. Delete on a resource with active references returns error `"Can't delete, object has references."`.

### Expressions

All parameters accept expression strings. Dynamic parameters such as resource IDs and field values are commonly populated via `$json`, `$input`, or `$node` references.

## Acceptance tests

### Test: Create and retrieve a group

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "group",
  "operation": "create",
  "name": "Test Group",
  "active": true,
  "note": "Created via workflow"
}
```

**Expect** output[0] to contain a JSON object with `name` equal to `"Test Group"` and `active` equal to `true`.

**Then** with `operation: "get"` and `groupId` set to the `id` from the create output, **expect** the returned object to have the same `name` and `active` values.

### Test: Get many tickets with limit

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "ticket",
  "operation": "getAll",
  "limit": 5
}
```

**Expect** the request to use query parameters `per_page=5`. Output items each contain a ticket object with numeric `id` and string `title` properties, and at most 5 items are emitted.

### Test: Create user with address

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "firstname": "Jane",
  "lastname": "Doe",
  "email": "jane@example.com",
  "street": "Main St 1",
  "city": "Berlin",
  "zip": "10115",
  "country": "Germany"
}
```

The executor must map these flat fields into the API body as top-level keys `street`, `city`, `zip`, `country` (not nested under an `address` object).

**Expect** output[0] to contain a user object with `firstname` equal to `"Jane"`, `lastname` equal to `"Doe"`, `email` equal to `"jane@example.com"`, and `city` equal to `"Berlin"`.

### Test: Self retrieval

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getSelf"
}
```

**Expect** output[0] to contain a user object with `id` and `email` fields matching the authenticated credential's user. The API endpoint is `GET /api/v1/users/me`.

### Test: Create ticket with article

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "ticket",
  "operation": "create",
  "title": "Support request",
  "articleSubject": "Help needed",
  "articleBody": "Please assist with this issue",
  "articleType": "email",
  "articleVisibility": "external",
  "articleSender": "Customer"
}
```

The executor must map these flat article fields into the API body as a nested `article` object: `{ article: { subject, body, type, internal: visibility === "internal", sender } }`.

**Expect** output[0] to contain a ticket object with `title` equal to `"Support request"` and an `article_count` of at least 1.

### Test: Token auth header format

**Given** credential type `tokenAuth` with `accessToken` = `"abc123"` and `baseUrl` = `"https://zammad.example.com"`.

**Expect** every API request to include the header `Authorization: Token token=abc123` (not `Bearer abc123`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Confirmed from public n8n docs and Zammad API reference |
| Credential schema | documented | Confirmed from n8n credentials page and Zammad API docs |
| Parameter shapes | inferred | Extracted from npm package type descriptors; abstracted per clean-room rules |
| Custom field mechanism | inferred | Key-value pair pattern from type definitions; dynamic field loading from GenericFunctions |
| Ticket article nesting | documented | Article sub-object documented in Zammad API ticket create example |
| User address flat mapping | documented | Zammad API response shows street/city/zip/country as top-level keys |
| Group/organization advanced fields | documented | Additional fields like members, shared, domain from Zammad API docs |
| Sort/pagination | documented | per_page/page and sort_by/order_by documented in Zammad API |
| delete return value | documented | Zammad API returns `{}` on successful DELETE |
| Error messages for empty updates | inferred | `throwOnEmptyUpdate` function name from GenericFunctions |
| Search query support | documented | Zammad API documents `/search?query=` for groups, orgs, tickets, users |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.zammad.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
