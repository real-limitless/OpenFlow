---
type: "@n8n/n8n-nodes-langchain.toolWolframAlpha"
displayName: Wolfram Alpha
category: AI
versions: [1]
priority: high
status: specced
---

# Wolfram|Alpha Tool

Cluster **sub-node** (tool): gives an AI Agent (or another tool-consuming root) a single tool handle that sends a query to Wolfram|Alpha's computational intelligence engine and returns the computed answer to the agent as plain text. Part of the `@n8n/n8n-nodes-langchain` tool family (sibling of MCP Client Tool, SearXNG, Wikipedia, etc.).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolwolframalpha.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wolframalpha.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://products.wolframalpha.com/short-answers-api/documentation | Third-party service API docs |
| https://products.wolframalpha.com/simple-api/documentation | Third-party service API docs |
| Public workflow export JSON (n8n template gallery API) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolWolframAlpha`
- **Aliases:** (none for this type). Do **not** treat it as any other `tool*` type — each tool sub-node is a distinct type string (**public JSON**).
- **typeVersion:** `1` (**public JSON**)
- **Inputs:** none on `main` (tool sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_tool` × 1 — connects **into** a root node's tool input (typically AI Agent). Connection objects use `"type": "ai_tool"` (**public JSON**).
- **Credentials:** Wolfram|Alpha — **API key** (single **App ID** value) (**documented**). Credential is required for the tool to be usable (the service call needs the App ID). Exact credential type key not observed in sampled public exports — **inferred** `wolframAlphaApi` (see Gaps).

Cluster topology: this node is a **sub-node**. It does not emit `main` items; the parent agent invokes the tool during its tool loop.

## Parameters

The node exposes **no node-level parameters** (sampled public workflow JSON carries `"parameters": {}`). Configuration is limited to the credential (App ID). The only runtime input is the **query string**, which the agent/model supplies at call time — it is not a static node parameter.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| (none) | — | — | — | Query text arrives as the tool's call-time argument, not from node parameters (**public JSON** `{}` + LangChain tool shape **third-party docs**). No displayOptions / options collections are documented for this node (**documented**). |

## Runtime behavior

### Role

This node is **not** a main-pipeline executor. It registers a single tool handle with a connected agent root. When the model selects the tool, the node sends the query to Wolfram|Alpha and returns the answer text as the tool observation.

### OpenFlow implementer contract

Independent behavioral contract for the Wolfram|Alpha tool executor (paraphrased from public docs, public workflow JSON, and Wolfram service API docs). **Do not** load third-party node packages.

1. **Register one tool** on the `ai_tool` channel for the parent agent. Tool semantics: computational knowledge queries (math, science, dates, quantities, units, factual computation). Tool name/description are agent-facing strings; pick a stable default (e.g. `wolfram_alpha`) and a description that states it answers computational/intelligence queries by querying Wolfram|Alpha (**inferred** naming; not visible in sampled JSON).
2. **On invocation** (single string argument = the query):
   - Resolve the App ID from the Wolfram|Alpha credential; missing credential → tool registration or call-time error.
   - Send an HTTP **GET** to the Short Answers API `https://api.wolframalpha.com/v1/result` with query parameters:
     - `appid` = the App ID
     - `i` = the URL-encoded query text
   - Optional documented query parameters (`units`, `timeout`) are **not** exposed as node options in public docs; the OpenFlow executor should rely on service defaults (**documented** service params, **not documented** on the node).
   - The API returns a **single plain-text answer** (e.g. `2464 miles`); return that text as the tool observation to the agent.
3. **Error handling**
   - Service `400` (missing/invalid `i` input), `501` (input not interpretable / no short result), `Error 1` (invalid `appid`), `Error 2` (missing `appid`) (**third-party docs**): surface as a tool-level error observation so the agent can recover; do not crash the whole workflow unless the parent root treats the tool failure as fatal.
   - Empty/non-interpretable results map to a helpful error observation (**OpenFlow** baseline).
4. **No `main` output.** Do not produce workflow items from this node alone.

### Input

- No main items.
- Configuration: only the Wolfram|Alpha credential (App ID).
- Runtime calls arrive from the parent agent's tool loop with a single query string.

### Output

- Connection-level: `ai_tool` handle into the agent.
- Invocation-level: plain-text answer (or error observation) returned to the agent (not a main branch).

### Errors

| Condition | Behavior |
|-----------|----------|
| Credential missing / App ID absent | Throw / fail tool registration or call |
| Service HTTP 400 / 501 / invalid-or-missing `appid` | Tool-level error observation; agent may continue (**inferred**) |
| Network failure / timeout | Throw / tool error |
| `continueOnFail` | Not applicable as main-node semantics; parent agent owns workflow continue-on-fail |

### Expressions

- No node parameters exist, so no expression evaluation on this sub-node.
- Sub-node rule applies generally: had any parameter been an expression, it would resolve against the **first** input item only (**documented**). The call-time query argument comes from the agent/model, not from static node parameters.

## Acceptance tests

### Test: basic answer query

**Given** no main input (sub-node), agent root connected via `ai_tool`. Mock service at `https://api.wolframalpha.com/v1/result`.

**Credentials:** Wolfram|Alpha API key with App ID `demo-appid`.

**Invoke tool** with query `How far is Los Angeles from New York?`

**Expect**

- Outbound request: `GET https://api.wolframalpha.com/v1/result?appid=demo-appid&i=How%20far%20is%20Los%20Angeles%20from%20New%20York%3F` (URL-encoded input; exact encoding order of params not asserted).
- Observation returned to agent is the plain-text body (`2464 miles`).
- No `main` items emitted.

### Test: missing credential

**Given** sub-node with no Wolfram|Alpha credential attached.

**Expect** the tool fails with a clear error (registration or call-time) stating the credential / App ID is required. No request is sent.

### Test: service 501 propagates as tool error

**Given** mock service returns HTTP 501 for the query.

**Expect** the agent receives an error observation (string or structured); node does not emit main items; the workflow fails only if the parent agent treats tool failure as fatal.

### Test: query with special characters is URL-encoded

**Invoke** with query `what is the integral of e^(-x^2) from 0 to 1?`

**Expect** the `i` parameter is URL-encoded (spaces, parentheses, carets, equals) and the plain-text answer body is returned as the observation.

### Test: no node parameters in workflow JSON round-trip

**Given** a workflow JSON node object `{"type":"@n8n/n8n-nodes-langchain.toolWolframAlpha","parameters":{},"typeVersion":1}` (**public JSON** shape).

**Expect** the OpenFlow node accepts it without modification; all behavior driven by credential + call-time query.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string + `ai_tool` topology + typeVersion 1 | documented + public JSON | High confidence |
| No node-level parameters | public JSON + docs | High confidence (`"parameters": {}` in export) |
| Credential method (API key / App ID) | documented | High confidence; "Simple API" is the recommended App ID registration type on the developer portal |
| Credential wire type key | **inferred** `wolframAlphaApi` | Not observed in sampled public exports — implementer should confirm against a credential-bearing export when available |
| Service endpoint | third-party docs | Short Answers API (`/v1/result`) returns plain text, matching an agent tool; Simple API (`/v1/simple`) returns an image. Credential page points to Simple API docs, but a text-returning tool implies Short Answers — **gap**; implementer should verify live behavior. |
| Tool name / description strings | inferred | Not visible in sampled JSON; agent-facing strings are OpenFlow policy |
| `units` / `timeout` service params | documented (service) / not on node | OpenFlow relies on service defaults |
| Error-to-observation mapping | inferred | Reasonable baseline above |
| Catalog may mark executor "implemented" | process | This file is the clean-room **spec** contract; implement only via SDK against this doc |

## OpenFlow mapping

- **Definition group:** `ai` (cluster / langchain tool sub-nodes)
- **Executor file:** `src/lib/engine/executors/tool-wolfram-alpha.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; tool registration via engine AI-tool handles (same pattern as other `ai_tool` sub-nodes). No third-party `n8n-nodes-*` packages. The Wolfram|Alpha service call uses a plain HTTP client; no extra libraries required.
