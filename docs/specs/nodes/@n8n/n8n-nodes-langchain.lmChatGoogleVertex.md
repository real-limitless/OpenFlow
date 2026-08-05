---
type: "@n8n/n8n-nodes-langchain.lmChatGoogleVertex"
displayName: Google Vertex Chat Model
category: AI
versions: [1]
priority: high
status: specced
---

# Google Vertex Chat Model

Cluster **sub-node**: configures a Google Vertex AI Gemini chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model. Vertex AI hosts Gemini models; the n8n docs point users at Google Cloud Vertex AI model listings and the Google Service Account credential guide.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatgooglevertex.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models | Third-party service API docs |
| https://cloud.google.com/vertex-ai/generative-ai/docs/send-chat-prompts-gemini | Third-party service API docs |
| https://cloud.google.com/vertex-ai/generative-ai/docs/safety/safety-settings | Third-party service API docs |
| Public workflow export JSON (n8n template gallery) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatGoogleVertex`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input (**public JSON** channel name)
- **Credentials:** `googleApi` (**documented**: Google Service Account; the n8n credentials page links to the Google Service Account guide for this node)
- **typeVersion:** `1` (**inferred**; no multi-version deltas documented for this node)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, GCP project, sampling options, safety settings, and GCP service-account authentication.

## Parameters

UI labels from **public docs**; wire keys follow **sibling `lmChat*`** conventions and the Vertex AI Gemini API field names.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| projectId | resourceLocator / string | `{ mode: "list", value: "" }` | yes | — | **Project ID** — the GCP project ID. n8n loads available project IDs from the authenticated Google Cloud account at design time via `gcpProjectsList` search method (**documented**). Resource-locator shape `{ "__rl": true, "mode": "list"\|"id", "value": "<project-id>" }`. |
| location | string | — | no | — | **Region / Location** — the GCP region for the Vertex AI endpoint, e.g. `us-central1`. Defaults to `us-central1` or the credential's `region` field. Maps to `${REGION}-aiplatform.googleapis.com` in the endpoint URL (**corpus parameter name** + **service docs**). |
| modelName | string | empty / selectable | yes | — | **Model Name** — the Vertex AI model name, e.g. `gemini-1.5-flash-001`, `gemini-1.5-pro-001`. Accepts a free-form string with a doc link to Vertex AI model listings. `modelName` is a plain input, not a resource-locator (**corpus type confirmation**). |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| maxTokens | number | model default (**inferred**) | **Maximum Number of Tokens** — sets the maximum completion length (**documented**). Maps to Vertex AI `maxOutputTokens` (Gemini API) (**service docs**). |
| temperature | number | model default (**inferred**) | **Sampling Temperature** — controls randomness of the sampling process; higher = more diverse but higher hallucination risk (**documented**). Maps to Vertex AI `temperature` (**service docs**). |
| thinkingBudget | number | empty / auto | **Thinking Budget** — controls reasoning tokens for thinking models. `0` disables automatic thinking, `-1` enables dynamic thinking, empty uses auto mode (**documented**). Maps to Vertex AI `thinkingConfig.thinkingBudget` (**inferred** from Gemini API). |
| topK | number | model default (**inferred**) | **Top K** — number of token choices the model uses to generate the next token (**documented**). Maps to Vertex AI `topK` (**service docs**). |
| topP | number | model default (**inferred**) | **Top P** — probability threshold; lower values ignore less probable options (**documented**). Maps to Vertex AI `topP` (**service docs**). |
| safetySettings | fixedCollection | — | **Safety Settings** — Gemini adjustable safety filters. Nested collection with multiple entries each containing **category** (harassment, hateSpeech, sexuallyExplicit, dangerousContent) and **threshold** (blockNone, blockLowAndAbove, blockMediumAndAbove, blockOnlyHigh, blockNone) (**documented** + **service docs**). |

## Credentials (`googleApi`)

From public credentials docs (Google Service Account) and corpus-confirmed field names:

| field | type | required | notes |
|-------|------|----------|-------|
| email | string | yes | **Service Account Email** — the `client_email` from the GCP service account JSON key file. |
| privateKey | string (secret) | yes | **Private Key** — the `private_key` from the GCP service account JSON key file. |
| region | string | no | **Region** — default GCP region for Vertex AI endpoints, e.g. `us-central1`. Overridden by the node's `location` parameter when set. |
| impersonateUser | string | no | **Impersonate a User** — optional email of a Google Workspace user to impersonate (domain-wide delegation). |
| scopes | string | no | **Scope(s)** — OAuth2 scopes for use with HTTP Request node (optional, not used for the Vertex AI node itself). |

The credential authenticates via Google's service account JWT flow (OAuth2 server-to-server). For Vertex AI, the required scope is `https://www.googleapis.com/auth/cloud-platform` (**service docs**). The n8n docs also require the Cloud Resource Manager API to be enabled for project listing.

## Runtime behavior

### Role

1. Resolve credentials (`googleApi`). Missing or invalid service account → fail when the parent invokes the model (**documented** + **inferred**).
2. Resolve **projectId** from `projectId` (string or resource-locator `.value`). Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only (**documented** sub-node parameter resolution).
3. Resolve **modelName** from `modelName` (string or resource-locator `.value`). Expressions allowed.
4. Build a Gemini chat-model handle / client configuration:
   - Endpoint: `POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}:generateContent` (**service docs**). Default region is `us-central1`; region may be configurable or inferred from the project.
   - Authentication: Google service account OAuth2 token (JWT bearer token for `https://www.googleapis.com/auth/cloud-platform`) (**service docs**).
   - Apply `options` into the generation config: `maxTokens` → `maxOutputTokens`, `temperature` → `temperature`, `thinkingBudget` → `thinkingConfig.thinkingBudget`, `topK` → `topK`, `topP` → `topP`.
   - Apply `safetySettings` entries if present, mapping category + threshold into the Vertex AI `safetySettings` array (**service docs**).
5. Expose that handle on output channel **`ai_languageModel`** for the parent root to call. This node does **not** emit normal `main` items with a completion text by itself in the cluster pattern (**public JSON** / cluster model).

### Messages

- **No** top-level `messages` / `text` parameter on this node (**public docs** parameter list).
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt). Implementers must accept a Gemini-style `contents` array at invoke time (**service docs** + agent/chain docs).
- Content roles: `user`, `model` (assistant), `function` (tool responses) (**service docs**). System instructions are passed via `system_instruction` at the request level (not in contents).
- Parent (or memory sub-node) must maintain multi-turn state (**documented**).
- Vertex AI Gemini API supports `tools` (function calling), `toolConfig`, `system_instruction`, and `cachedContent` at the request level (**service docs**); whether the parent surfaces these is the parent's responsibility.

### Output

When used only as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns a Vertex AI `generateContent` response whose first `candidates[0].content.parts[]` carries the assistant text (and optionally `functionCall` parts). The **parent** maps that into main-branch fields such as `output` / `text` (**agent/chain docs**).
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

Illustrative completion payload shape (service; not necessarily the node's main item):

```json
{
  "candidates": [
    {
      "index": 0,
      "content": {
        "role": "model",
        "parts": [{ "text": "<assistant message>" }]
      },
      "finishReason": "STOP",
      "safetyRatings": [...]
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 26,
    "candidatesTokenCount": 298,
    "totalTokenCount": 324
  }
}
```

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `googleApi` credential / invalid service account | Fail on invoke (**documented** + **inferred**) |
| Missing / empty projectId | Fail (**inferred**) |
| Missing / empty modelName | Fail (**inferred**) |
| Invalid model name / unavailable in region | Fail (HTTP 404) (**service docs**) |
| Invalid / expired OAuth token | Fail (HTTP 401 / 403) (**service docs**) |
| Quota / rate limit exceeded | Fail; retryable (**inferred** from sibling `lmChat*` retry conventions) |
| Content blocked by safety filter | Fail with `finishReason: SAFETY` or blocked response (**service docs**) |
| `thinkingBudget` for non-thinking model | Ignored or no effect (**inferred**; budget only applies to thinking models) |
| Network / timeout | Fail after timeout; retry up to maxRetries (**inferred** from sibling options) |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `projectId.value`, `modelName.value`, option numerics may be expressions (`={{ … }}`) (**public JSON** conventions).
- Sub-node rule: multi-item expressions always use the **first** item (**documented**).

## Acceptance tests

### Test: wire shape — model + options

**Parameters:**

```json
{
  "projectId": {
    "__rl": true,
    "mode": "list",
    "value": "my-gcp-project"
  },
  "modelName": "gemini-1.5-flash-001",
  "options": {
    "maxTokens": 1024,
    "temperature": 0.7,
    "topP": 0.95,
    "topK": 40
  }
}
```

**Credentials:** `googleApi` with valid `serviceAccountEmail` and `privateKey`.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST .../publishers/google/models/gemini-1.5-flash-001:generateContent` with `generationConfig`: `maxOutputTokens: 1024`, `temperature: 0.7`, `topP: 0.95`, `topK: 40`; request carries a valid Google OAuth2 bearer token.

### Test: expression-based projectId + modelName + location

**Parameters:**

```json
{
  "projectId": {
    "__rl": true,
    "mode": "id",
    "value": "={{ $json.gcp_project }}"
  },
  "modelName": "={{ $json.vertex_model }}",
  "location": "={{ $json.region }}",
  "options": {
    "temperature": 0.2
  }
}
```

**Given** parent/first-item context `{ "gcp_project": "my-project", "vertex_model": "gemini-2.5-pro-001", "region": "europe-west4" }`.

**Expect:** resolved projectId `my-project`, resolved modelName `gemini-2.5-pro-001`, resolved location `europe-west4` (**corpus confirmed types** + sub-node first-item expression rule).

### Test: safety settings

**Parameters:**

```json
{
  "projectId": { "__rl": true, "mode": "list", "value": "my-gcp-project" },
  "modelName": "gemini-1.5-flash-001",
  "options": {
    "safetySettings": {
      "values": [
        { "category": "harassment", "threshold": "blockOnlyHigh" },
        { "category": "hateSpeech", "threshold": "blockMediumAndAbove" }
      ]
    }
  }
}
```

**Expect:** request body includes `safetySettings` array with the two entries mapped per Vertex AI API format (**documented** + **service docs**).

### Test: thinking budget

**Parameters:**

```json
{
  "projectId": { "__rl": true, "mode": "list", "value": "my-gcp-project" },
  "modelName": "gemini-2.5-pro-001",
  "options": { "thinkingBudget": -1 }
}
```

**Expect:** request `generationConfig` includes `thinkingConfig: { thinkingBudget: -1 }` enabling dynamic thinking (**documented**).

### Test: multi-turn contents passed through

**Parameters:**

```json
{
  "projectId": { "__rl": true, "mode": "list", "value": "my-gcp-project" },
  "modelName": "gemini-1.5-flash-001",
  "options": {}
}
```

**Given** parent supplies a contents array:

```json
[
  { "role": "user", "parts": [{ "text": "Summarize the meeting." }] }
]
```

**Expect:** request body `contents` equals the supplied array verbatim; `system_instruction` (if present) passed separately at the top level (**service docs**).

### Test: missing credentials

**Parameters:** valid `projectId` and `modelName`, no `googleApi` credential.

**Expect:** execution error when parent invokes the model (**inferred**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Project ID, Model Name, options (maxTokens, temperature, thinkingBudget, topK, topP, safetySettings) | documented | Primary docs page |
| Credential: Google Service Account (serviceAccountEmail + privateKey) | documented | Credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Project list loaded from GCP, model list loaded from Vertex AI | documented | Docs page |
| Vertex AI Gemini API endpoint format `:generateContent`, `generationConfig`, `contents`, `system_instruction`, `safetySettings` | service docs | Google Cloud Vertex AI docs |
| Credential wire key `googleApi` | inferred | Package metadata credential list `GooglePalmApi.credentials.js`; n8n docs link to Google Service Account guide for this node |
| Parameter keys `projectId`, `modelName`, `options` + option keys `maxTokens`, `temperature`, `thinkingBudget`, `topK`, `topP`, `safetySettings` | documented + inferred | Docs labels → camelCase; high confidence from Vertex AI API field names |
| `projectId` and `modelName` resource-locator shape (`__rl`, `mode`) | public JSON | Sibling `lmChat*` node exports |
| Default region (`us-central1`) | inferred / gap | Vertex AI default region; may be configurable |
| Default numeric values for temperature / maxTokens / timeouts / retries | inferred / gap | Vertex AI + sibling defaults |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| `googleApi` credential key (not `googlePalmApi`) | corpus-confirmed | Executor uses `getCredentials('googleApi')`. Confidence: high. |
| Credential field `email` (not `serviceAccountEmail`) | corpus-confirmed | Executor reads `credentials.email.trim()`. Confidence: high. |
| `modelName` type is plain `string`, not resourceLocator | corpus-confirmed | Description shows `type: 'string'` with doc link. Confidence: high. |
| `location` top-level parameter + credential `region` field | corpus-confirmed | Executor uses `vertexLocationField` and reads `credentials.region`. Confidence: high. |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-google-vertex.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatGoogleVertex` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; call Vertex AI Gemini API (`POST https://{region}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{region}/publishers/google/models/{modelName}:generateContent`) with Google OAuth2 bearer token from the `googleApi` service-account credential (`credentials.email` + `credentials.privateKey`) and map `maxTokens`/`temperature`/`topK`/`topP`/`thinkingBudget`/`safetySettings` into the request (`generationConfig.maxOutputTokens`/`temperature`/`topK`/`topP`/`thinkingConfig.thinkingBudget` + `safetySettings[]`); resolve `location` from node parameter (with `location` field) falling back to `credentials.region` and then `us-central1` — do **not** load `@n8n/n8n-nodes-langchain` packages
