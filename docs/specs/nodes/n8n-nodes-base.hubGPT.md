---
type: n8n-nodes-base.hubGPT
displayName: HubGPT
category: AI
versions: [1]
priority: P2
status: implemented
---

# HubGPT

## Sources

| URL | Source class |
|-----|----------------|
| (none — no public doc page exists for this type) | Not documented |
| Public n8n workflow templates (scraped usage, 2 instances) | Public workflow JSON shapes |

## Wire format

- **Type string:** `n8n-nodes-base.hubGPT` (also observed as `n8n-nodes-base.hubGpt`)
- **Aliases:** (none confirmed)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Not observed in any scraped workflow; likely requires an AI/LLM API credential (e.g. OpenAI API key, given usage patterns referencing GPT-3.5)

## Parameters

No parameter schema is recoverable from public docs or workflow JSON shapes. Both scraped workflow instances use an empty parameters object `{}`.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| (not observable) | (not observable) | — | — | No parameter data available in any public source |

## Runtime behavior

Based on workflow context descriptions referencing GPT-3.5/OpenAI integration:

### Input

Accepts items from a previous node. The prompt context appears to be constructed from upstream node outputs (e.g., voice memo transcription text, calendar event details).

### Output

Produces AI-generated text responses (e.g. rewritten blog posts, event prep plans). Output items likely contain the model response in structured JSON fields.

### Errors

Not documented. Likely follows n8n conventions: throws on API failure unless `continueOnFail` is enabled.

### Expressions

Unknown which parameters accept expressions; upstream nodes provide prompt data via output references.

## Acceptance tests

Cannot be authored without documented parameter schema or known API contract.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter schema | Not documented | No public doc page exists; both scraped workflow instances have empty parameters |
| Credential type | Inferred | Workflow descriptions mention GPT-3.5/OpenAI; likely requires `openAiApi` credentials or similar |
| Type string casing | Observed | Two variants exist in scraped workflows: `hubGPT` and `hubGpt` — likely canonical is `hubGPT` |
| Display name | Inferred | "HubGPT" from workflow node names |
| Output shape | Inferred | AI-generated text from GPT model calls |
| Available operations | Not documented | May support prompt-only or have resource/operation split like other app nodes |

## OpenFlow mapping

- **Definition group:** `transform` (AI/LLM interaction)
- **Executor file:** `src/lib/engine/executors/hub-gpt.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Status:** spec missing — executor not implemented. Requires public docs or a redesigned interface based on AI LLM interaction patterns.
