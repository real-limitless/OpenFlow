---
type: n8n-nodes-base.uproc
displayName: uProc
category: Data & Storage
versions: [1]
priority: P2
status: specced
---

# uProc

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uproc.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/uproc.md | Public docs only |
| https://docs.uproc.io/api/ | Public docs only |
| https://app.uproc.io/#/tools/processor/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.uproc`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `uProcApi` (Email + API Key)

### Credential fields

| name | type | notes |
|------|------|-------|
| email | string | uProc account email |
| apiKey | string | uProc API key (Settings > Integrations > API Credentials) |

The credential authenticates against the uProc API at `https://api.uproc.io`.

## Parameters

### Resource (group) selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| group | options | communication | yes | Selects the resource category, which determines available operations |

Available resource values: `audio`, `communication`, `company`, `finance`, `geographical`, `image`, `internet`, `personal`, `product`, `security`, `text`.

### Operation (tool) selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| tool | options | (first available) | yes | group: [selected group] | Selects the specific data-processing tool from the chosen resource category |

The tool list is determined by the selected group. Each tool has an internal key (e.g. `checkEmail`), a display name, and an optional extended description. Tools are loaded from a bundled catalog of processor definitions.

### Tool-specific parameters

Each tool exposes a variable set of parameters. Parameters are shared across tools when they share the same parameter name. Typical parameter types include:

| type | notes |
|------|-------|
| string | Free-text input (default `""`) |
| number | Numeric input |
| boolean | Checkbox toggle |
| options | Fixed set of named choices |

Parameter names use snake_case (e.g. `email`, `domain`, `phone_number`, `first_name`, `last_name`, `company_name`). All string parameters accept expressions. Parameters are required or optional per tool definition.

Example tool parameter shapes:

- **Email validation** (`communication`): parameters `email` (string, required)
- **Company by domain** (`company`): parameters `domain` (string, required)
- **Distance between addresses** (`geographical`): parameters `address_1`, `address_2` (strings, required)
- **Barcode encode** (`image`): parameters `number`, `standard` (options: EAN13, EAN8, UPCA, CODE128, CODE39, etc.)
- **Domain SSL check** (`internet`): parameters `domain` (string, required)
- **Age check** (`personal`): parameters `birth_date` (string, required)
- **Product lookup by EAN** (`product`): parameters `ean` (string, required)
- **Password strength** (`security`): parameters `password` (string, required)
- **Text translation** (`text`): parameters `text`, `language` (options: locale codes)
- **Currency conversion** (`finance`): parameters `amount` (number), `from_currency`, `to_currency` (options: ISO 4217 codes), `exchange_date` (string, optional)
- **IP geolocation** (`geographical`): parameters `ip` (string, required)

## Runtime behavior

### Input

The node can run without consuming any input item data (it passes incoming items through unchanged and adds the uProc result). When the tool produces a result, it is merged into the output item under a property key.

### Output

Each input item produces one output item on `main[0]`. The original `json` data is enriched with a key containing the uProc tool result object. The output structure varies per tool — different tools return different result shapes (e.g. boolean valid/invalid, structured object with multiple fields, or a string value).

If a tool returns an error (invalid input, API failure), the node behavior follows the standard `continueOnFail` convention:
- `continueOnFail` = `false`: node throws an error, halting workflow execution
- `continueOnFail` = `true`: node outputs the error item with `_error` metadata instead of tool results

### Expressions

All string, number, and option parameters accept expressions.

## Acceptance tests

### Test: Communication — email validation

**Parameters:**
```json
{
  "group": "communication",
  "tool": "checkEmail"
}
```

**Input item `json`:**
```json
{
  "email": "user@example.com"
}
```

**Expect output[0] item `json` to contain:**
```json
{
  "email": "user@example.com",
  "result": { "valid": true, "status": "deliverable" }
}
```

### Test: Company — lookup by domain

**Parameters:**
```json
{
  "group": "company",
  "tool": "getCompanyByDomain"
}
```

**Input item `json`:**
```json
{
  "domain": "example.com"
}
```

**Expect output[0] item `json` to contain a result object with company data fields.**

### Test: Internet — SSL certificate check

**Parameters:**
```json
{
  "group": "internet",
  "tool": "checkSsl"
}
```

**Input item `json`:**
```json
{
  "domain": "example.com"
}
```

**Expect output[0] item `json` to contain:**
```json
{
  "domain": "example.com",
  "result": { "valid": true, "expires": "..." }
}
```

### Test: Text — translation

**Parameters:**
```json
{
  "group": "text",
  "tool": "translateText",
  "language": "es"
}
```

**Input item `json`:**
```json
{
  "text": "Hello world"
}
```

**Expect output[0] item `json` to contain a result with the translated text.**

### Test: Option parameter — barcode encode

**Parameters:**
```json
{
  "group": "image",
  "tool": "encodeBarcode",
  "number": "1234567890128",
  "standard": "EAN13"
}
```

**Expect output[0] to contain a result with encoded barcode data or URL.**

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource group names | Public docs + corpus corpus | Groups match public docs sections (Audio, Communication, etc.) |
| Full tool catalog (300+ tools) | Public docs | Public docs lists ~300 tool descriptions by category. Exact internal tool keys and parameter schemas are bundled in the node package. |
| Per-tool parameter schemas | Inferred from corpus type declarations | Tools define parameters (name, type, required, placeholder, options). Exact enumerations not documented in public n8n docs — derived from corpus. |
| API endpoint | Public docs | api.uproc.io (confirmed by credentials doc) |
| Output shape | Inferred | Public docs do not specify exact output JSON structure per tool. Result shape varies by tool. |
| `continueOnFail` | Inferred | Standard n8n convention. |
| Option enums (ISO currency codes, languages, barcode standards) | Inferred from corpus | Loaded from bundled JSON data files. |
| Parameter sharing across tools | Inferred from corpus JS | Parameters with the same name (e.g. `domain`) are reused across tools via displayOptions group + tool selectors. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.uproc.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
