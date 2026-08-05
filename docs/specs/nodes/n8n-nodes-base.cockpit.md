---
type: n8n-nodes-base.cockpit
displayName: Cockpit
category: Data & Content
versions: [1]
priority: medium
status: specced
---

# Cockpit

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cockpit/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cockpit/ | Public docs only |
| https://getcockpit.com/documentation/core/api/introduction | Public docs only |
| https://getcockpit.com/documentation/core/api/authentication | Public docs only |
| https://getcockpit.com/documentation/core/api/content | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.cockpit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `cockpitApi` (Cockpit URL + API Access Token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | collection | yes | — | One of: `collection`, `form`, `singleton` |
| operation | string | create | yes | — | Depends on resource (see Runtime behavior) |
| collection | string | — | yes | resource=collection | Name of the Cockpit collection (slug) to target |
| singleton | string | — | yes | resource=singleton | Name of the Cockpit singleton (slug) to retrieve |
| form | string | — | yes | resource=form | Name of the Cockpit form (slug) to submit to |
| data | json | — | no | resource=collection & operation=create/update | Field data for the collection entry, as a JSON object whose keys match the collection field names |
| filter | json | — | no | resource=collection & operation=getAll | Query filter to restrict returned entries (passed as Cockpit content API filter object) |
| limit | number | — | no | resource=collection & operation=getAll | Max entries returned |
| skip | number | — | no | resource=collection & operation=getAll | Number of entries to skip (pagination) |
| sort | json | — | no | resource=collection & operation=getAll | Sort spec, e.g. `{"_created": -1}` |
| populate | boolean | false | no | resource=same | Whether to resolve linked content references |

## Runtime behavior

### Input

Each input item is processed independently. For `create` and `update` operations, the `data` parameter can reference fields from the input item via expressions.

### Output

Per resource and operation:

- **Collection / Create** — Creates a new entry in the named collection with the provided `data` fields. Emits the created entry object (including `_id`, `_created`, fields).
- **Collection / GetAll** — Queries the collection with optional `filter`, `limit`, `skip`, `sort`, and `populate`. Emits each matching entry as a separate output item. If nothing matches, emits zero items.
- **Collection / Update** — Updates an existing collection entry; requires an entry identifier (typically `_id` or a field from the input) within `data`. Emits the updated entry.
- **Form / Store data** — Submits the provided form data to the named form endpoint. Emits the server response (typically `{"success": true}` with optional saved entry data).
- **Singleton / Get** — Retrieves the singleton content object by slug name. Emits the entire singleton data object.

### Errors

On API failure (invalid credentials, non-existent collection/singleton/form, network error), the node throws an error unless `continueOnFail` is enabled, in which case it passes the input item through with an error property appended.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: create a collection entry

**Given** input items:

```json
[{ "json": { "title": "Hello", "body": "World" } }]
```

**Parameters:**

```json
{
  "resource": "collection",
  "operation": "create",
  "collection": "news",
  "data": "={{ {\"title\": $json.title, \"body\": $json.body} }}"
}
```

**Expect** output[0] to contain a JSON object with `_id`, `_created`, and the fields `title` and `body`.

### Test: get all collection entries

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "collection",
  "operation": "getAll",
  "collection": "news",
  "limit": 10
}
```

**Expect** output[0] to be an array of entry objects (or zero items if empty). Each entry has at least `_id`.

### Test: store form submission

**Given** input items:

```json
[{ "json": { "email": "test@example.com", "message": "Hi" } }]
```

**Parameters:**

```json
{
  "resource": "form",
  "operation": "store",
  "form": "contact",
  "data": "={{ {\"email\": $json.email, \"message\": $json.message} }}"
}
```

**Expect** output[0] to contain a success response object.

### Test: get singleton

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "singleton",
  "operation": "get",
  "singleton": "site_settings"
}
```

**Expect** output[0] to contain the singleton content object with its defined fields.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Collection update identifier mechanism | Inferred | n8n docs state "Update a collection entry" but do not specify how the entry is identified; likely via `data` containing `_id` or similar key |
| Exact filter/sort/populate semantics | Inferred from Cockpit REST API content endpoints | The node passes filter/sort/populate parameters to the underlying Cockpit Content API; exact filter syntax depends on the Cockpit version |
| Form endpoint schema | Inferred | Form submission expects a JSON body; the exact response shape may vary between Cockpit versions |
| Error messages | Inferred | Standard HTTP error propagation expected |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/cockpit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
