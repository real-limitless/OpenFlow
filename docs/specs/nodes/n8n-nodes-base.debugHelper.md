---
type: n8n-nodes-base.debugHelper
displayName: Debug Helper
category: Action
versions: [1]
priority: low
status: specced
---

# Debug Helper

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.debughelper.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.debugHelper`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| category | string | `"doNothing"` | required | — | "doNothing" | "throwError" | "outOfMemory" | "generateRandomData" |
| errorType | string | `"NodeApiError"` | required | category = "throwError" | "NodeApiError" | "NodeOperationError" | "Error" |
| errorMessage | string | `""` | required | category = "throwError" | Text of the error to throw |
| memorySize | number | `1` | required | category = "outOfMemory" | Approximate MB of memory to allocate |
| dataType | string | `"address"` | required | category = "generateRandomData" | "address" | "coordinates" | "creditCard" | "email" | "ipv4" | "ipv6" | "mac" | "nanoids" | "url" | "userData" | "uuid" | "version" |
| seed | string | `""` | optional | category = "generateRandomData" | Deterministic seed for reproducible random data |
| itemsToGenerate | number | `1` | required | category = "generateRandomData" | Count of random data items to produce |
| outputAsSingleArray | boolean | false | optional | category = "generateRandomData" | Emit one item with an array, vs emit N items |
| nanoidAlphabet | string | `""` | required | category = "generateRandomData" AND dataType = "nanoids" | Characters the nanoid generator may use |
| nanoidLength | number | `21` | required | category = "generateRandomData" AND dataType = "nanoids" | Length of each generated nanoid |

## Runtime behavior

### Input

Accepts any input items. When category is "generateRandomData", input items are replaced by generated data. When category is "doNothing", input items pass through unchanged.

### Output

- **doNothing:** Outputs the exact input items unchanged.
- **throwError:** Throws a runtime error — no output items are produced. The error type determines the error class reported.
- **outOfMemory:** Allocates `memorySize` MB of memory (approximate). The node may crash the host if allocation exceeds available resources. No output items are produced.
- **generateRandomData:** Discards input items and produces `itemsToGenerate` output items (when `outputAsSingleArray` is false), or one output item containing a `data` array field with `itemsToGenerate` entries (when `outputAsSingleArray` is true). Each item contains fields appropriate to the chosen `dataType` (e.g. address fields, lat/lng, credit card number/expiry, email, IP, etc.).

### Errors

- **throwError** always throws; `continueOnFail` may be used to capture the error as an output item with a `json.error` field.
- **outOfMemory** may throw or crash; behavior under `continueOnFail` is undefined.
- **generateRandomData** is expected to succeed unless an unsupported `dataType` is provided.

### Expressions

All string and number parameters accept expression strings.

## Acceptance tests

### Test: do nothing pass-through

**Given** input items:

```json
[{ "json": { "foo": 1 } }]
```

**Parameters:**

```json
{ "category": "doNothing" }
```

**Expect** output[0]:

```json
[{ "json": { "foo": 1 } }]
```

### Test: throw error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "category": "throwError", "errorType": "NodeOperationError", "errorMessage": "test error" }
```

**Expect** execution to throw a `NodeOperationError` with message "test error".

### Test: generate random UUIDs

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "category": "generateRandomData", "dataType": "uuid", "seed": "test42", "itemsToGenerate": 3, "outputAsSingleArray": false }
```

**Expect** output[0] to contain 3 items, each with a `uuid` string field conforming to UUID v4 format.

### Test: generate nanoids with custom alphabet

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "category": "generateRandomData", "dataType": "nanoids", "nanoidAlphabet": "ABC", "nanoidLength": 4, "seed": "test", "itemsToGenerate": 2, "outputAsSingleArray": false }
```

**Expect** output[0] to contain 2 items, each with a `nanoid` field that is a 4-character string containing only "A", "B", or "C".

### Test: generate random data as single array

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "category": "generateRandomData", "dataType": "address", "itemsToGenerate": 2, "outputAsSingleArray": true, "seed": "test42" }
```

**Expect** output[0] to contain 1 item with a `data` array field containing 2 address objects.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Field names in generated data | Inferred | Exact field names for each dataType not documented; implementer should use common conventions (e.g. `street`, `city` for address; `lat`, `lng` for coordinates) |
| Out Of Memory implementation detail | Inferred | Docs state "approximate amount of memory to generate"; exact allocation mechanism is implementation-defined |
| Error class behavior for throwError | Documented | Three error types explicitly listed: `NodeApiError`, `NodeOperationError`, `Error` |
| Seed determinism | Documented | Docs specify seed "ensures data gets generated consistently" |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/debug-helper.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only