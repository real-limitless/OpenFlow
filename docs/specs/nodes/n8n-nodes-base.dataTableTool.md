---
type: n8n-nodes-base.dataTableTool
displayName: Data Table
category: Action
versions: [1.1]
priority: high
status: specced
---

# Data Table

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/tables.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/rows.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dataTable`
- **Aliases:** `data`, `table`, `knowledge`, `data table`, `sheet`, `database`, `data base`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** None — uses n8n's internal data table storage

## Parameters

### Resource: Table

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | string: create \| delete \| getMany \| update | — | true | Table-level operation |
| dataTableId | resource locator (list \| name \| id) | — | true for delete, getMany, update | Target table identifier; defaults to list mode for ease of use |
| name | string | — | true for create | Table name (required for create) |
| columns | fixedCollection: [{ name: string, type: string: Boolean \| Date \| Number \| String }] | — | true for create | Column definitions for new table |
| reuseExisting | boolean | false | false | For create: return existing table if name matches instead of error |
| newName | string | — | true for update | New table name for update operation |

#### Table operation options

| key path | type | default | notes |
|----------|------|---------|-------|
| options.returnAll | boolean | false | For getMany: return all tables vs. limit |
| options.limit | number | 50 | For getMany: max tables when returnAll=false |
| options.filterByName | string | — | Case-insensitive name filter for getMany |
| options.sortField | string | — | Sort field for getMany |
| options.sortDirection | string: ASC \| DESC | — | Sort direction for getMany |

### Resource: Row

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | string: delete \| get \| insert \| rowExists \| rowNotExists \| update \| upsert | — | true | Row-level operation |
| dataTableId | resource locator (list \| name \| id) | — | true | Target table identifier; defaults to list mode |
| matchType | string: anyCondition \| allConditions | anyCondition | false | Logical combination for conditions |
| conditions | collection: [{ keyName: string, condition: string, keyValue: string }] | — | false | Filter conditions; condition enum: eq, neq, gt, gte, lt, lte, isEmpty, isNotEmpty |
| mappingMode | string: defineBelow \| autoMap | defineBelow | false | For insert/update/upsert: manual or automatic column mapping |
| columns | string | — | false for insert/update/upsert | Column mapping specification |
| options.optimizeBulk | boolean | false | false | For insert: skip returning inserted data for 5x performance |
| options.dryRun | boolean | false | false | For delete/update/upsert: simulate without modifying |

#### Row operation options

| key path | type | default | notes |
|----------|------|---------|-------|
| options.returnAll | boolean | false | For get: return all matching rows vs. limit |
| options.limit | number | 50 | For get: max rows when returnAll=false |
| options.orderBy | boolean | false | For get: enable sorting |
| options.orderByColumn | string | createdAt | For get: column to sort by when orderBy=true |
| options.orderByDirection | string: ASC \| DESC | DESC | For get: sort direction when orderBy=true |

## Runtime behavior

### Input

Consumes items from the `main` input. Each item can supply expression values for table identification, filter conditions, and column mapping. The node operates on n8n's internal data table storage — no external API calls.

### Output

Produces one output item per input item (or per matching row for get operations). Output shape depends on operation:

- **Table create/update/delete/getMany:** Returns table metadata (id, name, createdAt, updatedAt, column schema)
- **Row insert/update/upsert:** Returns row metadata (id, createdAt, updatedAt) plus column data
- **Row get:** Returns matching rows with full column data
- **Row delete:** Returns deleted row metadata when not in dry-run mode
- **Row rowExists/rowNotExists:** Passes through input item unchanged when condition matches/doesn't match; outputs nothing otherwise

### Error handling

- Table not found: throws error (except getMany with filter returning empty)
- Invalid column mapping: throws error with column name context
- Condition evaluation errors: throws error identifying the failing condition
- Bulk operation partial failure: fails entire batch (no partial commit)
- Data type coercion failures: throws error with value and expected type

## Acceptance tests

1. **Table lifecycle:** Create table with columns (id: Number, name: String, active: Boolean, createdAt: Date) → List tables returns it → Update name → Delete table → List tables no longer returns it
2. **Row insert & get:** Insert 3 rows into table → Get all rows returns 3 items with correct column data → Get with filter (active = true) returns matching subset
3. **Row update with conditions:** Insert rows → Update rows where name = "test" setting active = false → Get with filter (active = false) returns updated rows
4. **Upsert behavior:** Upsert with condition (id = 1) on empty table creates new row → Upsert same condition updates existing row → Verify row count stays at 1
5. **Dry-run simulation:** Insert rows → Run delete with dryRun=true and condition → Verify node returns rows that would be deleted but table row count unchanged → Run delete without dryRun → Verify rows actually removed

## Gaps / confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Table operations (create/list/update/delete) | High | Fully documented in public docs |
| Row operations (insert/get/update/delete/upsert) | High | Fully documented in public docs |
| Filter condition enums | High | Documented in rows.md (eq, neq, gt, gte, lt, lte, isEmpty, isNotEmpty) |
| Column types | High | Documented as Boolean, Date, Number, String |
| Resource locator modes (list/name/id) | High | Standard n8n pattern, documented in tables.md/rows.md |
| Dry-run semantics | Medium | Documented as option for delete/update/upsert; exact output shape inferred |
| Bulk optimize performance claim | Low | "5x" claim from docs; not independently verified |
| Expression support in all fields | Medium | Standard n8n behavior assumed; not exhaustively documented per field |
| Version differences (v1 vs v1.1) | Low | Only v1.1 schema available in corpus; v1 behavior not compared |

## OpenFlow mapping

- **Definition group:** `core/data-storage`
- **Intended executor filename:** `src/executors/n8n-nodes-base.dataTableTool.ts`