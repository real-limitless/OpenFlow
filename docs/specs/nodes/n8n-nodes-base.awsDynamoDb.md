---
type: n8n-nodes-base.awsDynamoDb
displayName: AWS DynamoDB
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# AWS DynamoDB

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsdynamodb/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/Welcome.html | Public docs only |
| Published npm package node.json (type string + categories only) | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsDynamoDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (IAM access key + secret) or `awsAssumeRole` (STS role assumption)

## Parameters

All parameters except `resource` and `operation` may be supplied as n8n expressions.

### Resource + Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `resource` | literal | `item` | yes | Only one resource; fixed to `item` |
| `operation` | literal | `upsert` | yes | One of `upsert`, `get`, `getAll`, `delete` |

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `authentication` | enum or expression | (none) | no | `iam` (access key) or `assumeRole` (STS); falls back to credential default |

### Item — Upsert (PutItem)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `tableName` | string/e | (none) | yes | Target DynamoDB table name or ARN |
| `dataToSend` | enum | `defineBelow` | no | `autoMapInputData` (map all input item fields) or `defineBelow` (explicit key-value pairs) |
| `inputsToIgnore` | string/e | (none) | no | Comma-separated field names to skip when `autoMapInputData`; displayed only when `dataToSend` = autoMapInputData |
| `fieldsUi.fieldValues[]` | array | (none) | no | Explicit attribute key-value pairs; each entry has `fieldId`, `fieldValue`; displayed only when `dataToSend` = defineBelow |
| `additionalFields.conditionExpression` | string/e | (none) | no | DynamoDB condition expression for conditional put |
| `additionalFields.eanUi` | (collection) | (none) | no | Expression attribute name substitutions (`#name → actualName`) |
| `additionalFields.eavUi` | (collection) | (none) | no | Expression attribute value substitutions (`:val → typed value`) |

### Item — Get (GetItem)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `tableName` | string/e | (none) | yes | Target table name or ARN |
| `select` | enum | `ALL_ATTRIBUTES` | no | `ALL_ATTRIBUTES`, `ALL_PROJECTED_ATTRIBUTES`, `SPECIFIC_ATTRIBUTES` |
| `keysUi.keyValues[]` | array | (none) | yes | Primary key specification; each entry: `key` (attribute name), `type` (B/N/S), `value` (typed value) |
| `additionalFields.projectionExpression` | string/e | (none) | no | Projection expression string; used when `select` = SPECIFIC_ATTRIBUTES |
| `additionalFields.readType` | enum | (none) | no | `stronglyConsistentRead` or `eventuallyConsistentRead` |
| `additionalFields.eanUi` | (collection) | (none) | no | Expression attribute name substitutions |

### Item — GetAll (Scan / Query)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `tableName` | string/e | (none) | yes | Target table name or ARN |
| `scan` | boolean | `false` | no | `true` = Scan operation; `false` = Query operation |
| `returnAll` | boolean | (none) | no | When `false`, `limit` is surfaced |
| `limit` | number/e | (none) | no | Max items to return (required when returnAll = false) |
| `keyConditionExpression` | string/e | (none) | no | Key condition expression (Query mode); displayed when scan = false |
| `filterExpression` | string/e | (none) | no | Filter expression (Scan mode); displayed when scan = true |
| `eavUi.eavValues[]` | array | (none) | no | Expression attribute value substitutions; each entry: `attribute` (placeholder), `type` (N/S), `value` |
| `select` | enum | `ALL_ATTRIBUTES` | no | `ALL_ATTRIBUTES`, `ALL_PROJECTED_ATTRIBUTES`, `COUNT`, `SPECIFIC_ATTRIBUTES` |
| `options.indexName` | string/e | (none) | no | Secondary index name |
| `options.projectionExpression` | string/e | (none) | no | Projection expression string |
| `options.filterExpression` | string/e | (none) | no | Additional filter expression |
| `options.eanUi` | (collection) | (none) | no | Expression attribute name substitutions |

### Item — Delete (DeleteItem)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `tableName` | string/e | (none) | yes | Target table name or ARN |
| `keysUi.keyValues[]` | array | (none) | yes | Primary key specification; same shape as Get: `key`, `type` (B/N/S), `value` |
| `returnValues` | enum | `NONE` | no | `NONE` or `ALL_OLD` (return deleted item attributes) |
| `additionalFields.conditionExpression` | string/e | (none) | no | DynamoDB condition expression |
| `additionalFields.eanUi` | (collection) | (none) | no | Expression attribute name substitutions |
| `additionalFields.expressionAttributeUi` | (collection) | (none) | no | Expression attribute value substitutions |

## Runtime behavior

### Execution

The node uses the AWS SDK v3 for JavaScript (`@aws-sdk/client-dynamodb`) authenticated via the selected credential type (IAM access key or Assume Role). Region is taken from the credential configuration.

### Input processing

Each input item is processed independently. For `upsert` with `autoMapInputData`, the full input item JSON is used as the DynamoDB item map. For `defineBelow`, only the explicitly listed field key-value pairs are included. Values are serialized into DynamoDB's typed attribute-value format (S, N, B, SS, NS, BS, L, M, NULL, BOOL) based on the runtime type of the value.

### Output shape

Each input item produces one output item. The output item retains the original input `json` data, enriched with the DynamoDB API response:

- **upsert:** On success, returns `{ success: true }`; if `ReturnValues = ALL_OLD` and an existing item was overwritten, the old item attributes are included under `data`.
- **get:** Returns the item attributes under `data`; each attribute is unwrapped from DynamoDB's typed format. If no item exists with the given key, output item is empty / not produced.
- **getAll:** Returns an array of items under `data`.
- **delete:** On success, returns `{ success: true }`; if `ReturnValues = ALL_OLD`, deleted item attributes under `data`.

### Error handling

- `ResourceNotFoundException` (table or index not found) — node throws an error.
- `ProvisionedThroughputExceededException` / `ThrottlingException` — node throws an error (upstream retry is handled by the AWS SDK).
- `ConditionalCheckFailedException` — node throws an error.
- When `continueOnFail` is enabled, errored items produce an output item with `{ error: { message, code } }` instead of halting.

### Expressions

All parameter values accept n8n expression strings. The `expressionSchema` wrapper is used for authentication, table name, select, returnAll, limit, key/attribute values, filter expressions, and option fields.

## Acceptance tests

### Test: upsert an item with explicit fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "upsert",
  "authentication": "iam",
  "tableName": "MyTable",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldId": "pk", "fieldValue": "abc" },
      { "fieldId": "data", "fieldValue": "hello" }
    ]
  }
}
```

**Expect** that the DynamoDB PutItem API is called with TableName=MyTable, Item={pk: {S: "abc"}, data: {S: "hello"}}, and output[0] contains `{ success: true }`.

### Test: get an item by primary key

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "get",
  "tableName": "MyTable",
  "keysUi": {
    "keyValues": [
      { "key": "pk", "type": "S", "value": "abc" }
    ]
  }
}
```

**Expect** that the DynamoDB GetItem API is called with TableName=MyTable, Key={pk: {S: "abc"}}. If the item exists, output[0] contains the item attributes under `data`. If not found, no output item is produced.

### Test: scan all items in a table

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "getAll",
  "tableName": "MyTable",
  "scan": true,
  "returnAll": true
}
```

**Expect** that the DynamoDB Scan API is called (no filter) and output[0] contains `{ data: [...] }` with all items.

### Test: delete an item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "delete",
  "tableName": "MyTable",
  "keysUi": {
    "keyValues": [
      { "key": "pk", "type": "S", "value": "abc" }
    ]
  }
}
```

**Expect** that the DynamoDB DeleteItem API is called and output[0] contains `{ success: true }`.

### Test: continueOnFail produces error output

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "get",
  "tableName": "NonExistentTable",
  "keysUi": {
    "keyValues": [{ "key": "pk", "type": "S", "value": "x" }]
  },
  "continueOnFail": true
}
```

**Expect** output[0] to contain `{ error: { message, code: "ResourceNotFoundException" } }` rather than throwing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operations | Documented (public n8n docs) | 1 resource (Item) × 4 operations |
| Parameter names and types | Inferred from corpus schema files | Names like `keysUi`, `eavUi`, `eanUi` are internal UI conventions; high-level semantics stable |
| AWS SDK client version | Inferred | Expects `@aws-sdk/client-dynamodb` v3 |
| Typed attribute value serialization | Inferred from DynamoDB API contract | AWS API uses AttributeValue typed format (S/N/B/SS/etc.); node must map JS values to this format |
| Credentials | Documented | Both `aws` (IAM) and `awsAssumeRole` credentials supported |
| Output unwind format | Inferred | Attributes unwrapped from DynamoDB typed format to plain JSON; exact shape may vary |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/awsDynamoDb.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
