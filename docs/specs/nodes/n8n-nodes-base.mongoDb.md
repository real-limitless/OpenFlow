---
type: n8n-nodes-base.mongoDb
displayName: MongoDB
category: Action
versions: [1]
priority: medium
status: implemented
---

# MongoDB

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mongodb/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mongodb/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mongoDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mongoDb` (required; tested by `mongoDbCredentialTest`)

## Credentials

Two configuration types:

### Connection String

- **Configuration Type:** `connectionString`
- **Connection String:** Full MongoDB connection URI (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/`)
- **Database:** Name of the database to connect to
- **Use TLS:** Toggle with optional x.509 certificate fields (CA Certificate, Public Client Certificate, Private Client Key, Passphrase)

### Values

- **Configuration Type:** `values`
- **Host:** Server hostname or IP address
- **Database:** Database name
- **User:** Login username
- **Password:** Login password
- **Port:** Connection port (defaults to MongoDB standard port)
- **Use TLS:** Toggle with optional x.509 certificate fields (CA Certificate, Public Client Certificate, Private Client Key, Passphrase)

## Parameters

### Resource / Operation selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `document` | ✓ | `document`, `searchIndexes` |
| operation | options | — | ✓ | Depends on resource (see below) |

### Shared parameter (all operations)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| collection | string | — | — | MongoDB collection name (not used by search index operations that don't target a collection) |

### Resource: document — operations

Operation values: `aggregate`, `delete`, `find`, `findOneAndReplace`, `findOneAndUpdate`, `insert`, `update`

#### aggregate

| name | type | default | notes |
|------|------|---------|-------|
| query | json / string | — | MongoDB aggregation pipeline array as JSON |

#### delete

| name | type | default | notes |
|------|------|---------|-------|
| query | json / string | `{}` | MongoDB query filter as JSON; empty matches all documents |

#### find

| name | type | default | notes |
|------|------|---------|-------|
| query | json / string | `{}` | MongoDB query filter as JSON |
| options | object | `{}` | See options table below |

Find options:

| name | type | default | notes |
|------|------|---------|-------|
| limit | number | `0` | Maximum documents to return; `0` means unlimited |
| skip | number | `0` | Number of documents to skip |
| sort | json / string | `{}` | Sort specification as JSON (e.g. `{ "field": -1 }`) |
| projection | json / string | `{}` | Field selection or exclusion as JSON |

#### insert

| name | type | default | notes |
|------|------|---------|-------|
| fields | string | — | Comma-separated list of input item properties to include in the new document |
| options | object | `{}` | See options table |

Insert options:

| name | type | default | notes |
|------|------|---------|-------|
| dateFields | string | — | Comma-separated field names to parse as MongoDB Date type |
| useDotNotation | boolean | `false` | Whether to use dot notation to access date fields |

#### update / findOneAndUpdate / findOneAndReplace

| name | type | default | notes |
|------|------|---------|-------|
| updateKey | string | `id` | Property name used to match documents for update |
| fields | string | — | Comma-separated list of input item properties to include |
| upsert | boolean | `false` | Insert a new document if no match is found |
| options | object | `{}` | Same date fields options as insert |

### Resource: searchIndexes — operations

Operation values: `createSearchIndex`, `dropSearchIndex`, `listSearchIndexes`, `updateSearchIndex`

#### createSearchIndex

| name | type | default | notes |
|------|------|---------|-------|
| collection | string | — | MongoDB collection name |
| indexNameRequired | string | — | Name of the search index |
| indexDefinition | json / string | `{}` | Atlas Search index definition JSON |
| indexType | options | `vectorSearch` | `vectorSearch` or `search` |

#### dropSearchIndex

| name | type | default | notes |
|------|------|---------|-------|
| collection | string | — | MongoDB collection name |
| indexNameRequired | string | — | Name of the search index to drop |

#### listSearchIndexes

| name | type | default | notes |
|------|------|---------|-------|
| collection | string | — | MongoDB collection name |
| indexName | string | — | Optional; if provided, only lists indexes with this name |

#### updateSearchIndex

| name | type | default | notes |
|------|------|---------|-------|
| collection | string | — | MongoDB collection name |
| indexNameRequired | string | — | Name of the search index |
| indexDefinition | json / string | `{}` | Updated Atlas Search index definition JSON |

## Runtime behavior

### Input

Each input item is processed independently. Parameters are read from the first input item (`0` index). For insert/update/findOneAndReplace/findOneAndUpdate operations with `fields`, the specified properties from each input item are extracted and written to the MongoDB collection.

### Output

Output shape depends on the operation:

- **find / listSearchIndexes:** Array of matched documents/indexes as output items
- **insert:** Returns the inserted document with `_id` populated by MongoDB
- **update / findOneAndUpdate / findOneAndReplace:** Returns the modified document (or the updated count for update)
- **delete / dropSearchIndex:** Returns the count of deleted documents (or success acknowledgment)
- **aggregate:** Returns the aggregation pipeline result array
- **createSearchIndex / updateSearchIndex:** Returns the operation acknowledgment

Each output item includes a `pairedItem` reference to the originating input item index. When `continueOnFail` is enabled and an error occurs, the node emits `[{ json: { error } }]` for that item's output branch.

### Errors

- Invalid or unreachable credentials result in a `NodeApiError`.
- MongoDB query syntax errors, connection failures, and timeout errors propagate as node errors.
- `continueOnFail` (standard workflow engine mechanism) suppresses errors per-item.

### Expressions

All parameters accept expression strings (`{{ }}` syntax). Collection names, query filters, field lists, and option values can be dynamically set via expressions.

### Driver

The node uses the [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/) to connect and execute operations.

## Acceptance tests

### Test: find documents with query filter

**Given** input `[{ "json": {} }]`

**Parameters:**
```json
{
  "resource": "document",
  "operation": "find",
  "collection": "users",
  "query": "{ \"status\": \"active\" }",
  "options": {
    "limit": 10,
    "sort": "{ \"createdAt\": -1 }"
  }
}
```

**Expect** node connects to MongoDB via credentials, runs `db.collection("users").find({ status: "active" }).sort({ createdAt: -1 }).limit(10)`, and returns matching documents as output items. Each output item has fields as returned by MongoDB plus `pairedItem`.

### Test: insert document with specified fields

**Given** input `[{ "json": { "name": "Alice", "email": "alice@example.com", "role": "admin" } }]`

**Parameters:**
```json
{
  "resource": "document",
  "operation": "insert",
  "collection": "users",
  "fields": "name,email"
}
```

**Expect** node inserts `{ name: "Alice", email: "alice@example.com" }` into `db.users`. Output is the inserted document with MongoDB-generated `_id`.

### Test: update documents by updateKey

**Given** input `[{ "json": { "id": "abc123", "name": "Bob", "email": "bob@example.com" } }]`

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "collection": "users",
  "updateKey": "id",
  "fields": "name,email",
  "upsert": false
}
```

**Expect** node updates `db.users` document where `id = "abc123"` with `{ name: "Bob", email: "bob@example.com" }`. Output is the update acknowledgment with matched/updated count.

### Test: create search index

**Given** input `[{ "json": {} }]`

**Parameters:**
```json
{
  "resource": "searchIndexes",
  "operation": "createSearchIndex",
  "collection": "products",
  "indexNameRequired": "product_search",
  "indexType": "search",
  "indexDefinition": "{ \"mappings\": { \"dynamic\": true } }"
}
```

**Expect** node creates an Atlas Search index named `product_search` on `db.products` with the given definition. Output is the operation acknowledgment.

### Test: aggregate pipeline

**Given** input `[{ "json": {} }]`

**Parameters:**
```json
{
  "resource": "document",
  "operation": "aggregate",
  "collection": "orders",
  "query": "[{ \"$group\": { \"_id\": \"$status\", \"count\": { \"$sum\": 1 } } }]"
}
```

**Expect** node runs the aggregation pipeline on `db.orders` and returns the grouped result set as output items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list (Document × 7 + Search Index × 4) | Documented (public docs) | Full list matches public docs |
| Parameters per operation (collection, query, fields, updateKey, options) | Descriptor | Verified via corpus node-definition descriptors |
| Find options (limit, skip, sort, projection) | Descriptor | Object sub-parameters confirmed from schema |
| Insert/update options (dateFields, useDotNotation) | Descriptor | Confirmed from schema |
| Search index parameters (indexName, indexDefinition, indexType) | Descriptor | Confirmed from schema |
| Credential configuration types and fields | Documented (public docs) | Full credential page available |
| TLS x.509 certificate fields | Documented (public docs) | Listed in credential documentation |
| Exact output item shape per operation | Inferred | Each operation returns MongoDB driver result; exact field names depend on command result shape |
| MongoDB Node.js driver version | Inferred | Public docs state "MongoDB Node driver" is used |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/mongo-db.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only