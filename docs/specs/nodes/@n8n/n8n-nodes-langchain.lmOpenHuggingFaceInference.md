---
type: @n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference
displayName: Hugging Face Inference Model
category: AI
versions: [1]
priority: medium
status: specced
---

# Hugging Face Inference Model

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmopenhuggingfaceinference.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/huggingface.md | Public docs only |
| https://huggingface.co/docs/api-inference/quicktour | Public docs only |
| https://huggingface.co/docs/api-inference/en/tasks/text-generation | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference`
- **Aliases:** (none)
- **Inputs:** (none — sub-node supplies `ai_languageModel` output only)
- **Outputs:** `ai_languageModel` × 1
- **Credentials:** `huggingFaceApi` (API Key — a Hugging Face access token beginning with `hf_`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| model | string | — | yes | — | Hugging Face model ID (e.g. `gpt2`, `meta-llama/Llama-2-7b`). Populated from the Hugging Face Inference API model list. |
| options.customInferenceEndpoint | string | — | no | — | Overrides the default Hugging Face Inference API base URL with a custom inference endpoint URL. |
| options.frequencyPenalty | number | 0 | no | — | Penalizes new tokens based on their existing frequency in the text, decreasing repetition. 1.0 means no penalty. |
| options.maxTokens | number | — | no | — | Maximum number of tokens in the generated completion. |
| options.presencePenalty | number | 0 | no | — | Penalizes tokens that have appeared in the text so far, encouraging the model to talk about new topics. |
| options.temperature | number | — | no | — | Controls randomness in sampling. Higher values produce more diverse outputs. |
| options.topK | number | — | no | — | Limits the number of highest-probability token candidates considered at each generation step. |
| options.topP | number | — | no | — | Nucleus sampling threshold. Lower values restrict sampling to a smaller cumulative probability mass. |

All option parameters accept expression strings.

## Runtime behavior

This node is a **sub-node** that supplies a Hugging Face Inference API-backed LLM to a parent root node (e.g. Basic LLM Chain) over the `ai_languageModel` channel.

### Input

No main-input channels. The node does not consume workflow input items. Expressions in the node's own parameters always resolve against the first input item of the parent root node (standard sub-node expression semantics).

### Generation

On execution, the node configures a LangChain `HuggingFaceInference` instance with the selected model, the provided options, and the authenticated Hugging Face API client. The LLM is wired to the root node which supplies the prompt text.

The Hugging Face Inference API (`/models/{modelId}`) is called with:
- `inputs` — the prompt text (supplied by the parent root node)
- `parameters` — a flat map of generation options (temperature, max_new_tokens / maxTokens, topP, topK, frequencyPenalty, repetitionPenalty / presencePenalty)

### Output

No direct output from this sub-node. The LLM generation result is consumed by the parent root node, which produces the final workflow output items. The root node typically passes through the original input items with the generated text injected per item.

### Errors

- Invalid API key or insufficient permissions results in an HTTP 401/403 from Hugging Face — the node surfaces this as a workflow error.
- Model not found or unavailable results in an HTTP 404 — surfaced as a workflow error.
- Token limit exceeded or rate limited results in an HTTP 429 — surfaced as a workflow error.
- `continueOnFail` behavior follows the parent root node's error handling pattern.

### Sub-node expression semantics

All expression-enabled parameters in this sub-node always resolve against the **first item** of the parent root node's input, not against each item in turn.

## Acceptance tests

### Test: basic text generation

**Given** the node is connected to a Basic LLM Chain root node with credentials `huggingFaceApi` (valid API key).

**Parameters:**

```json
{
  "model": "gpt2",
  "options": {
    "maxTokens": 50,
    "temperature": 0.7
  }
}
```

**When** the workflow runs with a prompt input, **expect** the LLM chain to produce an output item with a `text` field containing generated text (non-empty string, ≤ 50 tokens).

### Test: custom inference endpoint

**Parameters:**

```json
{
  "model": "my-org/my-model",
  "options": {
    "customInferenceEndpoint": "https://my-custom-endpoint.example.com/v1/models/my-model",
    "maxTokens": 100
  }
}
```

**Expect** the node to send requests to the custom endpoint URL instead of the default Hugging Face Inference API.

### Test: generation options affect output

**Parameters:**

```json
{
  "model": "gpt2",
  "options": {
    "temperature": 0.1,
    "topP": 0.9,
    "topK": 40,
    "frequencyPenalty": 0.5,
    "presencePenalty": 0.3,
    "maxTokens": 30
  }
}
```

**Expect** the generated output to respect the constrained sampling parameters (low temperature → more deterministic output). Confirm the response does not exceed 30 tokens.

### Test: missing credential produces error

**Given** no `huggingFaceApi` credential is configured.

**Expect** the workflow to fail at validation time with a "credentials required" error before any HTTP request is made.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Model parameter (populated list) | documented | Docs confirm model is selected from a list; the source of the list (inline static list vs API-dynamic) is not documented but is a UX detail — the spec only requires a model ID string. |
| All option parameters and their defaults | documented | Taken from public docs and Hugging Face Inference API text-generation task specification. |
| Custom Inference Endpoint behavior | documented | Public docs describe it as an override for the default endpoint URL. |
| Credential shape | documented | Public docs: API key from Hugging Face user settings, prefix `hf_`. |
| LangChain wrapper library used | inferred | The node type string and sub-node pattern confirm LangChain integration, but the exact LangChain class is not documented in public n8n docs. This is an implementation detail. |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/lmOpenHuggingFaceInference.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
