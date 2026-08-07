---
type: n8n-nodes-base.humanticAi
displayName: Humantic AI
category: Analytics
versions: [1]
priority: medium
status: specced
---

# Humantic AI Tool

This is the same node as `n8n-nodes-base.humanticAi` with `usableAsTool: true`, making it available as a tool in AI Agent workflows. There is no distinct type string or separate implementation — the tool variant uses the same operations and credential as the base node.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.humanticai/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/humanticai/ | Public docs only |
| https://api.humantic.ai | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.humanticAi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `humanticAiApi` (API key)
- **Usable as AI tool:** yes — supports `$fromAI()` dynamic parameter population

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `profile` | yes | — | Profile (single resource) |
| operation | options | `create` | yes | resource=profile | create \| get \| update |
| userId | string | — | yes | — | LinkedIn URL, email, or unique identifier for the subject |
| sendResume | boolean | false | — | operation=create\|update | True = analysis from a resume document in binary |
| binaryPropertyName | string | `data` | — | sendResume=true | Name of the input binary field holding the PDF/DOCX |
| text | string | — | — | operation=update, sendResume=false | Additional free-form text to append to the analysis |
| persona | multiOptions | [] | — | operation=get | Persona lenses: sales, hiring (comma-delimited) |

## Runtime behavior

### Input

Each input item is processed independently. For create/get/update the `userId` identifies the subject. For create/update with resume upload, binary data at `binaryPropertyName` is sent (PDF/DOCX).

When `usableAsTool` is enabled, an AI Agent can populate `userId` and other parameters dynamically via `$fromAI()`.

### Output

One output item per input item. The output's `json` contains the Humantic AI API response, which includes:

- `personality_analysis` — DISC and OCEAN personality scores
- `persona` — communication advice for sales/hiring contexts (if requested and available)
- `metadata` — status codes, confidence, analysis state
- Additional optional fields: `work_history`, `education`, `social_profiles`, `social_activity`, `demographics`, `interests`, `web_insights`, `mood`, `photos`, `languages`, `tech_usage`, `content_affinity`, `websites`, `related_entities`, `social_interactions`

The raw API response is passed through without field remapping.

### Errors

- Missing/invalid API key produces a `NodeApiError`.
- API error codes are surfaced as `NodeApiError`.
- Non-200 HTTP status produces a `NodeApiError`.
- When `continueOnFail` is enabled the node emits the input item with an `error` property instead of throwing.

### Expressions

All string, boolean, and multi-option parameters accept n8n expressions, including `$fromAI()` when used as a tool.

## Acceptance tests

### Test: create profile from LinkedIn URL (tool mode)

**Given** input items:

```json
[{ "json": { "linkedinUrl": "https://www.linkedin.com/in/example" } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "create",
  "userId": "={{ $fromAI('linkedinUrl') }}"
}
```

**Expect** output[0] to contain a `json` object with `metadata.status` truthy and `personality_analysis` present.

### Test: fetch profile with persona

```json
{
  "resource": "profile",
  "operation": "get",
  "userId": "={{ $fromAI('userId') }}",
  "persona": ["sales", "hiring"]
}
```

**Expect** output[0] to contain `personality_analysis`, `persona` data, and `metadata.analysis_status` of `COMPLETE`.

### Test: update profile with text

```json
{
  "resource": "profile",
  "operation": "update",
  "userId": "={{ $fromAI('userId') }}",
  "sendResume": false,
  "text": "={{ $fromAI('text') }}"
}
```

**Expect** output[0] to contain `metadata.status` indicating acceptance (2 or 21).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | CORPUS_DIR only | Confirmed same as base node (`n8n-nodes-base.humanticAi`); `usableAsTool: true` is the only difference |
| Parameter shapes | Inferred from corpus + public docs | Identical to base node |
| API behavior | Public docs + external API docs | Fully documented at api.humantic.ai |
| $fromAI() support | Inferred from n8n tool pattern | Standard for all `usableAsTool` nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/HumanticAi.ts` (shared with base node)
- **SDK:** `defineNode` + native `ExecutionContext` only
