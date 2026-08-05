---
type: n8n-nodes-base.affinityTool
displayName: Affinity Tool
category: Sales
versions: [1]
priority: medium
status: specced
---

# Affinity Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.affinity/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/affinity/ | Public docs only |
| https://support.affinity.co/s/article/Getting-started-with-the-Affinity-API-FAQs | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.affinityTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `affinityApi` (API key)

## Parameters

This tool variant exposes the same four resources and operations as the base `n8n-nodes-base.affinity` node. All parameters support `$fromAI()` dynamic population when the node is called by an AI agent, allowing the model to supply values at runtime.

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `list` | yes | One of: `list`, `listEntry`, `organization`, `person` |

### Operation selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | depends on resource | See per-resource operations below |

### List

| operation | parameters |
|-----------|------------|
| Get All Lists | (none — returns all visible lists) |
| Get a List | `listId` (number/string) |

### List Entry

| operation | parameters |
|-----------|------------|
| Create a List Entry | `listId` (number/string), `entityId` (number/string), optional `additionalFields.creator_id` |
| Delete a List Entry | `listId` (number/string), `listEntryId` (number/string) |
| Get a List Entry | `listId` (number/string), `listEntryId` (number/string) |
| Get All List Entries | `listId` (number/string), `returnAll` (boolean, default false), `limit` (number, default 5) |

### Organization

| operation | parameters |
|-----------|------------|
| Create an Organization | `name` (string), optional `domain`, `additionalFields.persons` (IDs) |
| Delete an Organization | `organizationId` (number/string) |
| Get an Organization | `organizationId` (number/string), optional `options.withInteractionDates` |
| Get All Organizations | `returnAll` (boolean, default false), `limit` (number, default 5), optional `options.term`, `options.withInteractionDates` |
| Update an Organization | `organizationId` (number/string), optional `updateFields.domain`, `updateFields.name`, `updateFields.persons` (IDs) |

### Person

| operation | parameters |
|-----------|------------|
| Create a Person | `firstName` (string), `lastName` (string), optional `emails` (string/expression), `additionalFields.organizations` (IDs) |
| Delete a Person | `personId` (number/string) |
| Get a Person | `personId` (number/string), optional `options.withInteractionDates` |
| Get All Persons | `returnAll` (boolean, default false), `limit` (number, default 5), optional `options.term`, `options.withInteractionDates` |
| Update a Person | `personId` (number/string), optional `updateFields.firstName`, `updateFields.lastName`, `updateFields.organizations` (IDs), `emails` |

## Runtime behavior

### Input

Each input item is processed independently. When the node is invoked as an AI agent tool, the model supplies parameters via `$fromAI()`.

### Output

- **List/GetAll operations:** One output item per returned entity. The JSON response body is placed on `json`.
- **Get/Create/Update operations:** A single output item containing the entity JSON on `json`.
- **Delete operations:** The JSON response (typically a confirmation object) on `json`.
- Output shape per operation matches the base node (see `docs/specs/nodes/n8n-nodes-base.affinity.md`).

### Errors

- API HTTP errors (4xx, 5xx) propagate as node errors.
- Missing required parameters throw a parameter-validation error.
- `$fromAI()` defaults are supplied at the tool level — if the model omits a required parameter, the node may error or fall back to a default.

### Expressions

All parameter values accept expression strings including `$fromAI()`. When used as a tool with an AI agent, non-required parameters may be omitted and set by the agent at call time.

## Acceptance tests

### Test: Create an organization via AI tool

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "organization",
  "operation": "create",
  "name": "={{ $fromAI() }}",
  "domain": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a JSON object with at least `id`, `name`, and `domain`.

### Test: Get all lists

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "list",
  "operation": "getAll"
}
```

**Expect** output[0] to contain an array of list objects. Each list object must contain `id` and `name`.

### Test: Get a person by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "person",
  "operation": "get",
  "personId": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a JSON object with at least `id`, `first_name`, `last_name`, and `emails`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation surface | Inferred from base node published descriptor | Identical to n8n-nodes-base.affinity — no operation subsetting; the full API is exposed. |
| $fromAI() parameter support | Public docs confirmed | All parameters must accept $fromAI() expressions when used as a tool node. |
| Credential type | Public docs confirmed | `affinityApi` — API key at `https://api.affinity.co/`. |
| Response shapes | Inferred from published JSON schema | Share base node output shapes. |
| Tool-specific error behavior | Inferred | $fromAI() default handling follows standard n8n AI tool conventions. |

## OpenFlow mapping

- **Definition group:** `sales`
- **Executor file:** `src/lib/engine/executors/affinity.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
