---
type: '@n8n/n8n-nodes-langchain.toolSerpApi'
displayName: SerpApi (Google Search)
category: AI
versions: [1]
priority: medium
status: specced
---

# SerpApi (Google Search)

Deprecated LangChain **tool sub-node** that lets an AI agent run a Google web search through the [SerpApi](https://serpapi.com) service. The agent supplies a search query at tool-calling time; the node forwards it to SerpApi's Google Search Engine Results API and returns the structured results to the agent.

> **Deprecation notice (documented):** n8n deprecates this node and marks it for future removal. The verified **SerpApi Official** community node is the recommended replacement. Existing workflows using this node continue to run.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolserpapi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/serp.md | Public docs only |
| https://serpapi.com/search-api | Public docs only (external service) |
| https://serpapi.com/google-countries | Public docs only (external service) |
| https://serpapi.com/google-languages | Public docs only (external service) |
| https://serpapi.com/google-domains | Public docs only (external service) |
| https://js.langchain.com/docs/integrations/tools/serpapi/ | Public docs only (external integration) |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolSerpApi`
- **Aliases:** (none)
- **Inputs:** (none — invoked by the connected AI agent at tool-calling time)
- **Outputs:** `ai_tool` × 1
- **Credentials:** `serpApi` — a single SerpApi **API Key** obtained from the SerpApi dashboard (https://serpapi.com/manage-api-key). API-key authentication only.

This is a LangChain **tool sub-node**. It connects to an AI agent root node through a single `ai_tool` output and is exposed to the model as a callable tool. It has no independent `main` data input; the agent invokes it during tool-calling, and the search results are returned to the agent.

## Parameters

The node's behavior is captured at functional level; the exact internal parameter layout of the original node is intentionally not reproduced.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `query` | string | — | at tool-call time | The Google search query. Supplied by the model when it invokes the tool (see Runtime behavior); may also be a fixed/expression value where supported. |
| `country` | string | — | no | Google country code (SerpApi `gl` parameter). Refer to SerpApi's supported-countries list for valid values. |
| `language` | string | — | no | Google UI language code (SerpApi `hl` parameter). Refer to SerpApi's supported-languages list for valid values. |
| `googleDomain` | string | google.com | no | Google domain to search against (SerpApi `google_domain` parameter). Refer to SerpApi's supported-domains list for valid values. |
| `device` | string: desktop \| mobile \| tablet | desktop | no | Device used to fetch the search results (SerpApi `device` parameter). |
| `explicitArray` | boolean | false | no | When on, forces SerpApi to fetch fresh Google results even when a cached version is already present (SerpApi `no_cache=true`). When off, SerpApi may serve a cached result. |

## Runtime behavior

### Input

The node has no `main` input connection. At tool-calling time the agent invokes the tool with a **search query** argument. Expressions in the node's own parameters resolve against the **first item only** of the calling context (standard sub-node semantics); they do not iterate per item.

### Invocation

1. Resolve the search query and the optional search options (country, language, google domain, device, explicit-array flag) from fixed literals, expressions, or agent-supplied arguments.
2. Authenticate with the `serpApi` API key.
3. Call the SerpApi Google Search endpoint (`https://serpapi.com/search.json`) with `engine=google`, the resolved query, and the option-derived parameters, using the configured API key.

### Output

The SerpApi JSON response becomes the tool's result returned to the agent. The service returns a structured SERP payload — including search metadata, an answer box, a knowledge graph, an ordered `organic_results` array (position, title, link, snippet, and related fields), related questions, and other result blocks — which is passed back to the model largely as returned by the service so the model can cite links and compose an answer.

### Errors

- HTTP 4xx/5xx responses from SerpApi (e.g. 401 invalid API key, 429 quota exhausted) fail the tool call; the agent observes a failed invocation. An option may suppress this and deliver the error response as the tool result instead.
- Network failures and timeouts always fail the tool call.
- `continueOnFail` is honored per standard n8n conventions: when set, the failed tool call returns an error payload instead of aborting the run.

### Expressions

All string parameters (query, country, language, google domain) accept expression strings. `$fromAI(key, description?, type?, defaultValue?)` is valid and lets the model fill in parameters dynamically during tool-calling.

## Acceptance tests

### Test: agent-invoked search returns the SERP payload

**Given** an AI agent connected to this tool sub-node and no incoming items.

**Parameters:**
```json
{
  "query": "coffee near me"
}
```

**When** the agent invokes the tool with the query `"coffee near me"`:

**Expect** the node calls SerpApi with `engine=google`, the resolved query, and the API key; the tool result delivered to the agent is the SerpApi JSON response containing an `organic_results` array (each entry with `position`, `title`, `link`, `snippet`) and `search_metadata`.

### Test: options map to SerpApi parameters

**Parameters:**
```json
{
  "query": "coffee",
  "country": "us",
  "language": "en",
  "googleDomain": "google.com",
  "device": "desktop"
}
```

**When** the agent invokes the tool:

**Expect** the outgoing SerpApi request carries `gl=us`, `hl=en`, `google_domain=google.com`, and `device=desktop` in addition to `engine=google` and `q=coffee`.

### Test: explicit-array forces a fresh fetch

**Parameters:**
```json
{
  "query": "latest AI news",
  "explicitArray": true
}
```

**When** the agent invokes the tool:

**Expect** the outgoing request includes `no_cache=true`, so SerpApi returns a fresh result rather than a cached one. With `explicitArray` off, the flag is absent and SerpApi may serve cached results.

### Test: API error fails the tool call

**Given** a SerpApi key that is invalid or has exhausted its quota.

**When** the agent invokes the tool:

**Expect** the tool call fails (SerpApi returns a non-2xx status with an error payload; the agent observes a failed invocation). With `continueOnFail` enabled, the error payload is returned to the agent instead of aborting the run.

### Test: sub-node expression resolution (first item only)

**Given** multiple input items flow through the calling agent and a parameter such as `language` references `$json`:

**Expect** the expression resolves against the first item only (sub-node semantics), not per item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and deprecation | documented | Public docs: agent can call Google's Search API; deprecated in favor of the verified "SerpApi Official" community node |
| Credentials | documented | Public credentials page: single API key from the SerpApi dashboard; credential name `serpApi` confirmed from corpus descriptor |
| Node options (Country, Device, Explicit Array, Google Domain, Language) | documented | Listed verbatim on the public node page; each maps to a well-known SerpApi parameter (`gl`, `device`, `no_cache`, `google_domain`, `hl`) |
| Tool sub-node wire format | documented | Standard `ai_tool` output, no `main` input; confirmed by public tool-sub-node docs and the type string in the package descriptor |
| SerpApi service contract | documented | External service docs: `search.json` endpoint, `engine=google`, query parameter family, structured SERP JSON response |
| Query-as-tool-argument contract | inferred | Standard tool-calling mechanics (the model passes the search query); consistent with the LangChain SerpAPI integration |
| Exact parameter nesting / option enums | inferred | Deliberately abstracted per clean-room rules; not reproduced from the package |
| Response envelope to the agent | inferred | Docs state the results are returned to the agent; exact serialization is an implementation detail and must not mirror the node's internal JSON verbatim |
| `$fromAI()` support | documented | Public docs cover `$fromAI()` for AI-tool parameters |
| Sub-node first-item expression semantics | documented | Public sub-node hint box confirms expressions resolve against the first item only |
| Versions [1] | inferred from corpus | Package descriptor lists a single `v1`; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/toolSerpApi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
