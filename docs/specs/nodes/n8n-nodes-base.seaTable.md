---
type: n8n-nodes-base.seaTable
displayName: SeaTable
category: Data & Storage
versions: [1, 2]
priority: medium
status: specced
---

# SeaTable

Collaborative database with a spreadsheet interface. This node enables
CRUD operations on rows, base management, link-table relationships, and
file/asset uploads against the SeaTable REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.seatable/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/seatable/ | Public docs only |
| https://api.seatable.io | Public docs only |
| https://seatable.io/en/docs/seatable-api/erzeugen-eines-api-tokens/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.seaTable`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `seaTableApi`

### Credential fields

| field | type | description |
|-------|------|-------------|
| environment | enum: cloudHosted, selfHosted | Selects the server environment |
| domain | string | SeaTable server URL (e.g. https://cloud.seatable.io) |
| token | string | API Token of a Base (generated from the base's Advanced > API Token settings) |

The node uses the API Token to obtain a temporary Base Token (valid ~3 days)
via the SeaTable app-access-token endpoint at `/api/v2.1/dtable/app-access-token/`.
The Base Token is then used for all subsequent data operations.

## Resources and operations

| resource | operations | description |
|----------|-----------|-------------|
| row | create, get, search, update, remove, lock, unlock, list | Row CRUD, search, and lock/unlock |
| base | snapshot, metadata, collaborator | Base metadata, snapshots, collaborator queries |
| link | add, list, remove | Link-table row relationships |
| asset | upload, getPublicURL | File upload and public URL retrieval |

### Row operations

**Create** — append a new row to a table. Accepts column values as
key-value pairs matching the table's columns. Inherited columns (`_id`,
`_creator`, `_ctime`, `_seq`, etc.) are set automatically by SeaTable.
Returns the created row including system fields.

Required: table name, column values. Optional: table view name.

**Get** — fetch a single row by its `_id`. Returns the complete row
object with all column values.

Required: table name, row ID.

**Search** — retrieve rows matching a column-based filter. Supports
equality comparison on any column. Uses the SeaTable SQL-like query API
internally.

Required: table name, column name, column value.

**Update** — modify column values on an existing row by `_id`. Only
included column keys are changed. Certain system columns (`_id`, `_ctime`,
`_creator`, `_mtime`, `_last_modifier`, `_seq`) are not updateable.

Required: table name, row ID, column values.

**Remove** — delete a row by `_id`.

Required: table name, row ID.

**Lock / Unlock** — toggle a row's locked state. Locked rows cannot be
edited by other users.

Required: table name, row ID.

**List** — enumerate rows in a table, optionally scoped to a view.
Supports pagination. Returns an array of row objects.

Required: table name. Optional: view name, pagination params.

### Base operations

**Metadata** — retrieve the full base schema: tables, columns (name, type,
key), views, and format version. Column types include text, long-text,
number, collaborator, date, duration, single-select, multiple-select,
image, file, email, url, checkbox, rate, formula, link-formula,
geolocation, link, creator, ctime, last-modifier, mtime, auto-number,
button, digital-sign.

Required: none.

**Snapshot** — create a snapshot (versioned backup) of the base.

Required: snapshot name.

**Collaborator** — list collaborators on the base (users with access).
Returns email, name, avatar URL.

Required: none.

### Link operations

**Add** — create a link between two rows in link-linked tables. Requires
the table name, the linked table name, and the row IDs of both rows.

Required: table name, linked table name, row ID, linked row ID.

**List** — list all links for a given row in a link column.

Required: table name, row ID, column name (the link column).

**Remove** — delete a link between two rows in link-linked tables.

Required: table name, linked table name, row ID, linked row ID.

### Asset operations

**Upload** — upload a file to the base's asset store. Returns the
relative path and upload link metadata for use in file/image column
values.

Required: binary input data (file). Optional: file name.

**Get Public URL** — generate a publicly accessible URL for an uploaded
asset.

Required: the relative path of the uploaded asset.

## Runtime behavior

### Input

The node passes input items through for row operations that use column
values — each incoming item may supply values for one row. For bulk
operations, each item produces one result.

For base, link, and asset operations that do not consume item data, the
node executes once using the first input item's context.

### Output

Each operation emits one output item per processed row or result. The
output item's `json` property contains:

- Row operations: the row object with all SeaTable fields (`_id`, `_ctime`,
  `_mtime`, plus all column values). List operations emit an array under
  a `results` key or an enveloped `rows` array.
- Base metadata: the complete metadata object under `metadata`.
- Collaborators: an array under `user_list`.
- Links: link metadata objects.
- Asset upload: an upload-link descriptor object.
- Snapshot: a success confirmation object.

### Errors

- Missing required fields (table name, row ID, column values) throw
  `NodeOperationError`.
- API errors (authentication failure, non-existent rows, invalid column
  names) propagate as `NodeApiError` with the server's error message.
- If `continueOnFail` is enabled, errored items are passed through with
  an `error` property instead of halting the workflow.

### Dynamic option loading

Table, column, view, and row ID parameters are populated dynamically by
querying the base metadata from the SeaTable API at edit time. The node
exposes the following load options:

- Table names and IDs
- Searchable column names (text, number, date, single-select, etc.)
- Link column names
- Asset column names (file, image)
- Digital-signature column names
- Updateable column names (excluding system columns)
- Row IDs (for get/update/delete)
- Table view names

### Expressions

All field-value parameters accept expressions. Resource and operation
selectors are static (not expression-capable) in the standard (non-tool)
variant.

## Acceptance tests

### Test: create row and verify system fields

**Given** input item:
```json
[{ "json": { "Name": "John Doe", "Email": "john@example.com" } }]
```

**Parameters:** resource=row, operation=create, table=Table1, columnValues
mapped from input item fields.

**Expect** output[0] to contain `_id`, `_ctime`, `_creator` plus the
submitted column values.

### Test: get row by ID

**Parameters:** resource=row, operation=get, table=Table1, rowId provided.

**Expect** output[0] to include all columns of the row matching the given
`_id`.

### Test: search rows by column value

**Parameters:** resource=row, operation=search, table=Table1,
searchColumn=Email, searchValue=john@example.com.

**Expect** output[0].results to be an array where every element has
`Email` equal to "john@example.com".

### Test: list rows with view filter

**Parameters:** resource=row, operation=list, table=Table1, view=Active
View.

**Expect** output[0].results to be a non-empty array of rows matching the
view's filter criteria.

### Test: update row and verify mutation

**Parameters:** resource=row, operation=update, table=Table1, rowId set,
columnValues `{ "Status": "Completed" }`.

**Expect** subsequent get of the same row shows `Status` equals
"Completed".

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Row list pagination details | Inferred from corpus (segment limit exists) | Exact page size default unknown, API uses offset/limit |
| Base snapshot parameters | Public docs + corpus | Snapshot name required; success response shape assumed |
| Asset upload public URL flow | Public docs | Two-step: upload then get public URL; exact response formats from docs |
| Link table operations | Corpus + API docs | Parameters are table name, linked table name, row IDs |
| Lock/unlock behavior | Corpus | Row lock/unlock available in v2; exact error on already-locked unknown |
| Trigger node `seaTableTrigger` | Public docs (page exists but content minimal) | Trigger is a separate node type; not covered by this spec |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/seaTable.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
