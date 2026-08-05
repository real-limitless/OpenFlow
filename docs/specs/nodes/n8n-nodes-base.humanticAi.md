---
type: n8n-nodes-base.humanticAi
displayName: Humantic AI
category: Analytics
versions: [1]
priority: medium
status: specced
---

# Humantic AI

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

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `profile` | yes | — | Single resource: profile |
| operation | options | `create` | yes | resource=profile | create \| get \| update |
| userId | string | — | yes (create/get/update) | — | LinkedIn URL, email, or unique label identifying the subject |
| sendResume | boolean | false | — | operation=create\|update | True = analysis from a resume document (binary) |
| binaryPropertyName | string | `data` | — | sendResume=true | Binary field name holding the PDF/DOCX |
| text | string | — | — | operation=update, sendResume=false | Free-form text to append to existing analysis |
| persona | multiOptions | — | — | operation=get | Fetch persona data: Sales, Hiring (comma-delimited) |

## Runtime behavior

### Input

Each input item is processed independently. For create and get operations the executor extracts a user identifier (`userId`) from inbound item fields or expressions. For create/update with document input the binary data at the configured `binaryPropertyName` is attached (PDF or DOCX).

### Output

One output item per input item. The output's `json` property contains the full Humantic AI API response including:

- `personality_analysis` — DISC (Dominance, Influence, Steadiness, Calculativeness) and OCEAN (Openness, Conscientiousness, Extraversion, Agreeableness, Emotional Stability) personality scores
- `persona` — communication advice for sales or hiring contexts (if persona was requested and available)
- `metadata` — status codes, confidence score, and analysis state
- Additional optional fields: `work_history`, `education`, `social_profiles`, `social_activity`, `demographics`, `interests`, `web_insights`, `mood`, `photos`, `languages`, `tech_usage`, `content_affinity`, `websites`, `related_entities`, `social_interactions`

The raw API response is passed through as-is — no field remapping is performed.

### Errors

- Missing or invalid API key results in a `NodeApiError`.
- API error codes (51–69, 403, 445–447) are surfaced as `NodeApiError` with the API's status message.
- Non-200 HTTP status codes produce a `NodeApiError`.
- When `continueOnFail` is enabled the node emits the original input item with an `error` property instead of throwing.

### Expressions

All string, boolean, and multi-option parameters accept n8n expressions.

## Acceptance tests

### Test: create profile from LinkedIn URL

**Given** input items:

```json
[{ "json": { "linkedinUrl": "https://www.linkedin.com/in/example" } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "create",
  "userId": "={{ $json.linkedinUrl }}"
}
```

**Expect** output[0] to contain a `json` object with `metadata.status` truthy and at minimum `personality_analysis` present (may take 30-45s for backend processing).

### Test: fetch profile with persona

**Given** input items:

```json
[{ "json": { "profileId": "user-abc-123" } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "get",
  "userId": "={{ $json.profileId }}",
  "persona": ["sales", "hiring"]
}
```

**Expect** output[0] to contain a `json` object with `metadata.analysis_status` of `COMPLETE`, `persona` present, and `personality_analysis` data.

### Test: update profile with additional text

**Given** input items:

```json
[{ "json": { "profileId": "user-abc-123", "extraText": "The candidate led cross-functional teams..." } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "update",
  "userId": "={{ $json.profileId }}",
  "sendResume": false,
  "text": "={{ $json.extraText }}"
}
```

**Expect** output[0] to contain a `json` object with `metadata.status` indicating the update was accepted (status code 2 or 21).

### Test: create profile via resume upload

**Given** input items with a binary attachment named `resume`:

```json
[{ "json": { "applicantId": "corp-0801-a7x9" }, "binary": { "resume": { "fileName": "resume.pdf", "mimeType": "application/pdf" } } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "create",
  "userId": "={{ $json.applicantId }}",
  "sendResume": true,
  "binaryPropertyName": "resume"
}
```

**Expect** output[0] to contain a `json` object with `metadata` present and a create confirmation (status code in 1-20 range).

### Test: continue on error

**Given** input items with an invalid userId:

```json
[{ "json": { "badId": "" } }]
```

**Parameters:**

```json
{
  "resource": "profile",
  "operation": "create",
  "userId": "={{ $json.badId }}",
  "continueOnFail": true
}
```

**Expect** output[0] to contain a `json` object with the original input plus an `error` property, and no thrown exception.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API endpoint URL | Public docs (api.humantic.ai) | Confirmed: `https://api.humantic.ai/v1/user-profile` |
| Authentication | Public docs | API key passed as query param `apikey` |
| Profile resource + 3 ops | Public docs (n8n) + external API docs | Fully documented |
| Parameter shapes | Inferred from published JSON descriptor | userId, sendResume, binaryPropertyName, text, persona are documented in the API docs |
| Error handling conventions | Inferred from JSON descriptor | NodeApiError wrapping; continueOnFail standard pattern |
| Output shape (full response) | Public API docs | Response structure comprehensively documented on api.humantic.ai |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/HumanticAi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
