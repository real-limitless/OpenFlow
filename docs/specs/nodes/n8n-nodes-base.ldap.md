---
type: n8n-nodes-base.ldap
displayName: LDAP
category: Core
versions: [1]
priority: medium
status: specced
---

# LDAP

Connect to an LDAP directory server to compare, create, delete, rename, search, and update entries.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ldap.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ldap.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.ldap`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `ldap`

### Credential: `ldap`

| name | type | required | notes |
|------|------|----------|-------|
| host | string | yes | LDAP server IP or domain |
| port | number | yes | LDAP server port |
| bindDn | string | yes | Binding Distinguished Name (user to authenticate as) |
| bindPassword | string | yes | Password for the bind DN user |
| connectionSecurity | string | yes | One of `none`, `tls`, `starttls` |
| connectionTimeout | number | no | Timeout in seconds |

## Parameters

All operations share the same credential selection. The operation parameter selects which action to perform.

### Operation: Compare

Check whether a specific attribute on an entry matches a given value.

| name | type | required | notes |
|------|------|----------|-------|
| dn | string | yes | Distinguished Name of the entry to compare |
| attributeId | string | yes | Attribute ID to compare |
| value | string | yes | Value to compare against |

### Operation: Create

Create a new LDAP entry.

| name | type | required | notes |
|------|------|----------|-------|
| dn | string | yes | Distinguished Name of the entry to create |
| attributes | array | yes | Array of `{ attributeId: string, value: string }` pairs |

### Operation: Delete

Delete an LDAP entry.

| name | type | required | notes |
|------|------|----------|-------|
| dn | string | yes | Distinguished Name of the entry to delete |

### Operation: Rename

Rename (move) an entry by changing its Distinguished Name.

| name | type | required | notes |
|------|------|----------|-------|
| dn | string | yes | Current Distinguished Name |
| newDn | string | yes | New Distinguished Name |

### Operation: Search

Search entries within a subtree of the LDAP directory.

| name | type | required | notes |
|------|------|----------|-------|
| baseDn | string | yes | Distinguished Name of the subtree root |
| searchFor | string | yes | Directory object class to search for |
| attribute | string | yes | Attribute to match against |
| searchText | string | yes | Text to search for; use `*` as wildcard |
| returnAll | boolean | yes | If true, return all results; if false, respect limit |
| limit | number | no | Maximum results to return (only when returnAll is false) |

#### Search options

| name | type | required | notes |
|------|------|----------|-------|
| attributeNamesOrIds | string | no | Comma-separated list of attributes to return |
| pageSize | number | no | Maximum results per page request; 0 disables paging |
| scopes | string | no | One of `baseTree`, `singleLevel`, `wholeSubtree` |

Scope details:
- **baseTree (subordinateSubtree):** searches subordinates of base DN, not base DN itself
- **singleLevel (one):** searches only immediate children of base DN
- **wholeSubtree (sub):** searches base DN entry and all subordinates to any depth

### Operation: Update

Add, remove, or replace attributes on an existing entry.

| name | type | required | notes |
|------|------|----------|-------|
| dn | string | yes | Distinguished Name of the entry to update |
| updateAttributes | string | yes | One of `add`, `remove`, `replace` |
| attributes | array | yes | Array of `{ attributeId: string, value: string }` pairs |

## Runtime behavior

### Input

Each input item is processed independently. The node connects to the configured LDAP server using the selected credential and performs the specified operation.

### Output

Each output item corresponds to one input item, with the operation results added to `json`:

- **Compare:** outputs `{ attributeId, value, result: boolean }`
- **Create:** outputs the created entry attributes
- **Delete:** no additional output beyond passthrough of input item data
- **Rename:** outputs `{ dn: newDn }`
- **Search:** one output item per matching entry, each containing the entry's attributes; returns an empty array when no matches are found
- **Update:** outputs the updated entry attributes

The node passes through any binary data from the input unchanged.

### Errors

- Connection failures (unreachable host, bad credentials, TLS errors) throw a node error
- Compare returns `false` result on mismatch (no error thrown)
- Delete of a non-existent entry throws an error
- Invalid DN syntax throws an error
- `continueOnFail`: when enabled, failed items produce `{ json: { error: string } }` on the single output channel instead of halting execution

### Expressions

All string parameters (dn, newDn, baseDn, searchFor, attribute, attributeId, value, searchText, attributeNamesOrIds) accept expression strings.

### AI tool

This node exposes its operations as tools for AI agent nodes. Parameters may be populated automatically by the AI when used in agent context.

## Acceptance tests

### Test: search returns matching entries

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "search",
  "baseDn": "dc=example,dc=com",
  "searchFor": "person",
  "attribute": "cn",
  "searchText": "j*",
  "returnAll": true
}
```

**Expect** output[0] to contain one or more items with `json` containing entry attributes from the LDAP directory.

### Test: search with limit respects max results

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "search",
  "baseDn": "dc=example,dc=com",
  "searchFor": "person",
  "attribute": "cn",
  "searchText": "*",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] to contain at most 5 items.

### Test: create entry

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "create",
  "dn": "cn=testuser,dc=example,dc=com",
  "attributes": [
    { "attributeId": "cn", "value": "testuser" },
    { "attributeId": "sn", "value": "user" },
    { "attributeId": "objectClass", "value": "person" }
  ]
}
```

**Expect** output[0] to contain a single item with `json` containing the created entry attributes.

### Test: compare returns boolean result

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "compare",
  "dn": "cn=testuser,dc=example,dc=com",
  "attributeId": "sn",
  "value": "user"
}
```

**Expect** output[0] to contain a single item with `json` containing `{ attributeId: "sn", value: "user", result: true }`.

### Test: continueOnFail handles connection error

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "search",
  "baseDn": "dc=invalid,dc=com",
  "searchFor": "person",
  "attribute": "cn",
  "searchText": "*",
  "returnAll": true
}
```

**With** `continueOnFail: true`.

**Expect** output[0] to contain a single item with `{ json: { error: string } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation names | Public docs | All 6 operations confirmed |
| Per-operation parameter schemas | Public docs | All parameters documented |
| Credential fields | Public docs | 6 fields confirmed |
| Output shape detail | Inferred | Exact attribute keys depend on server schema; only compare has a documented shape |
| Search scopes enum | Public docs | 3 values confirmed |
| AI tool integration | Public docs | Confirmed this node can serve as an AI tool |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/ldap.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only