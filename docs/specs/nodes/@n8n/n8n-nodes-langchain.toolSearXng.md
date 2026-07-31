---
type: "@n8n/n8n-nodes-langchain.toolSearXng"
displayName: SearXNG Tool
category: AI
versions: [1]
priority: high
status: specced
---

# SearXNG Tool

Cluster **sub-node** (tool): exposes a web-search tool to an AI Agent (or other
tool-consuming root) on the `ai_tool` channel. When the model invokes the tool,
the node runs the query against a self-hosted **SearXNG** instance and hands the
aggregated, privacy-friendly search results back to the agent. SearXNG aggregates
results from many upstream engines without tracking the user.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolsearxng.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/searxng.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://docs.searxng.org/dev/search_api.html | Third-party service API docs |
| https://docs.searxng.org/admin/settings/settings_search.html | Third-party service API docs (`search.formats` + `safe_search`) |
| https://docs.searxng.org/dev/result_types/main/mainresult.html | Third-party service API docs (result field shape) |
| https://python.langchain.com/docs/integrations/tools/searx_search/ | Third-party docs (related integration linked from public docs) |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata — confirmed the official type string only; package ships **no** langchain descriptor, so no per-parameter data was extracted |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolSearXng`
- **Aliases:** (none observed in public exports)
- **typeVersion:** `1` (**inferred**; no version deltas documented for this node)
- **Inputs:** none on `main` (tool sub-node; no main-item pipeline) (**public JSON** pattern + cluster docs)
- **Outputs:**
  - `ai_tool` × 1 — connects **into** a root node's tool input (typically AI Agent). Connection objects use `"type": "ai_tool"` (**public JSON** pattern, same as other tool sub-nodes).
- **Credentials:** `searxngApi` (**inferred** from docs + naming convention; the credentials page documents exactly one auth method, **API URL**, and no credential key string appears in public docs). One value: the **API URL** of the SearXNG instance, reachable from the engine host. Required — this node has no anonymous/auth-free mode.

Cluster topology: this node is a **sub-node**. It does not emit `main` items; the
parent agent discovers and invokes the search tool it exposes.

## Parameters

The public docs page documents four **node options** with explicit defaults. The
documented **wire keys** are not published anywhere public (no public workflow
export containing this node was found), so OpenFlow chooses stable keys that map
1:1 onto the documented SearXNG query parameters (**inferred**).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| numResults | number | `10` | no | — | **Number of Results** (**documented**). Maximum result items returned to the agent per invocation. Clamped to the number of results the instance returns for the page. |
| pageno | number | `1` | no | — | **Page Number** (**documented**). Which search results page to fetch; maps to SearXNG `pageno` (**service API docs**). |
| language | string | `en` | no | — | **Language** (**documented**). Two-letter ISO-639 code used to filter results, e.g. `en`, `fr`. Mapped to SearXNG `language` (**service API docs**). Empty/omitted is acceptable if the instance default is wanted (**gap** — OpenFlow sends the value as-is; empty means "let the instance decide"). |
| safesearch | options / string | none (disabled) | no | — | **Safe Search** (**documented**). `none` \| `moderate` \| `strict` (**documented** labels; wire enum **inferred** as these lowercase values). Mapped to SearXNG `safesearch` as `0`/`1`/`2` (**service API docs**). |

There is no documented free-text description parameter: the tool's query input is
supplied by the model at call time (the single tool argument), and the options
above only shape the outbound request.

## Runtime behavior

### External service contract (SearXNG Search API)

From the SearXNG service docs (**service API docs**):

- Endpoints: `GET /` and `GET /search` (also POST) — query params as URL query
  string for GET, form data for POST.
- `q` (required) — the search query, passed through to upstream engines (engine
  query syntax such as `site:` is honored).
- `format` — one of `json`/`csv`/`rss`; **must be enabled** in the instance's
  `search.formats` setting, otherwise the request is rejected with HTTP `403`.
  This node requires the JSON format (`format=json`).
- `language` — language code; instance default when omitted.
- `pageno` — page number; default `1`.
- `safesearch` — `0` (None), `1` (Moderate), `2` (Strict); instance default when omitted.
- JSON result items are main search results with documented fields including
  `url`, `title`, `content` (snippet), `engine`, `score`, `category`,
  `publishedDate`, `positions` (**service API docs**).

### Role

This node is **not** a main-pipeline executor. It registers one tool handle on
the `ai_tool` channel; the agent's tool loop decides when and how often to call
it (**cluster docs**). Tool calls arrive with a query string argument from the
model.

### OpenFlow implementer contract

Independent behavioral contract for `tool-searxng.ts` (paraphrased from public
docs + SearXNG service docs). **Do not** load third-party node packages.

1. **Resolve base URL** from the `searxngApi` credential (`apiUrl`). Missing
   credential or empty URL → error at registration time.
2. **Register the tool handle** on `ai_tool`:
   - `name` / `description`: describe a web/metasearch tool that returns search
     result snippets. Exact description text is **not documented** — choose a
     clear, agent-facing string (OpenFlow baseline).
   - `inputSchema`: a single required string argument, the search query
     (**inferred** — consistent with other tool sub-nodes and the SearXNG API's
     required `q`).
3. **On invocation** with a query string:
   - Evaluate options (`numResults`, `pageno`, `language`, `safesearch`) from the
     node parameters (`ctx.getParam`), each allowing expression strings.
   - Build `GET {apiUrl}/search` with query params: `q`, `format=json`,
     `language` (unless intentionally unset), `pageno` (if ≠ 1 or always),
     `safesearch` (0/1/2 from the mode). POST/URL-encoding choice is free as long
     as the params arrive correctly (**service API docs** support both).
   - Limit the returned items to `numResults` (default 10). No `limit` parameter
     exists in the SearXNG API — truncate the page's `results` array
     (**service API docs** + **documented** option).
4. **Shape the observation** for the agent: a compact textual summary of the
   result items — at minimum title, URL, and snippet (`content`) per result;
   include `engine`/`publishedDate` when present (**service API docs** fields).
   The exact string format is OpenFlow's choice (**gap**).
5. **Error handling:**
   - Network failure / non-2xx / non-JSON response → throw a tool error
     (observation error string) so the agent can recover.
   - HTTP `403` → surface a message explaining JSON output is disabled on the
     SearXNG instance (`search.formats` must include `json`) — this is the most
     common configuration failure (**documented** running-an-instance section).
   - Empty `results` array → return an observation stating no results were found;
     do not treat as a workflow error.
   - `continueOnFail` is owned by the agent root, not this sub-node.
6. **Sub-node expression rule:** parameters containing expressions resolve
   against the **first input item only** — never per-item
   (**documented** "Parameter resolution in sub-nodes").
7. **No `main` output.** Do not produce workflow items from this node alone.

### Input

- No main items.
- Configuration: base URL (credential) + the four options above.
- Runtime calls arrive from the parent agent's tool loop with a query string.

### Output

- Connection-level: one `ai_tool` handle into the agent.
- Invocation-level: a text/structured observation of search results (not a main branch).

### Errors

| Condition | Behavior |
|-----------|----------|
| Credential missing / API URL empty | Fail tool registration |
| HTTP 403 (JSON format disabled) | Tool error with a "enable `json` in search.formats" hint |
| Network / 5xx / non-JSON response | Throw tool error |
| Empty results | Empty-result observation; agent continues |
| `continueOnFail` | Parent agent owns workflow continue-on-fail semantics |

### Expressions

- `numResults`, `pageno`, `language` (and any string option) may be expression
  strings (`={{…}}` / leading `=`). Resolution follows the sub-node rule: first
  item only (**documented**).
- The query itself is supplied at call time by the agent/model, not by a static
  node parameter.

## Acceptance tests

### Test: default search (documented defaults)

**Given** a `searxngApi` credential with `apiUrl` = `http://searxng.local:8080`, and no parameters set on the node. Agent calls the tool with query `"OpenFlow engine"`.

**Expect**

- Outbound request: `GET http://searxng.local:8080/search` with `q=OpenFlow engine`, `format=json`, `language=en`, `pageno=1`, `safesearch=0`.
- A mocked JSON response with 15 result items returns **10** items (default cap), each summarized with at least title, URL, snippet.
- No main items are emitted.

### Test: custom options map onto query params

**Parameters:**

```json
{
  "numResults": 5,
  "pageno": 2,
  "language": "fr",
  "safesearch": "strict"
}
```

**Expect** query string carries `q=<query>`, `format=json`, `language=fr`, `pageno=2`, `safesearch=2`; at most 5 items returned.

### Test: sub-node first-item expression rule

**Given** expression `language` = `{{ $json.lang }}` and an input of two items with `lang` values `en` and `de`.

**Expect** the outbound request uses `language=en` (first item only), never `de`.

### Test: JSON format disabled on instance

**Given** the instance returns HTTP 403 for `format=json`.

**Expect** the agent receives a tool error observation mentioning that JSON output must be enabled in the instance's `search.formats` (including `json`). The workflow fails only if the agent root treats the tool error as fatal.

### Test: no results found

**Given** a valid instance returning `{ "results": [], ... }`.

**Expect** a non-error observation indicating no results; tool does not emit main items and does not fail the run on its own.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string `@n8n/n8n-nodes-langchain.toolSearXng` | documented (corpus MANIFEST) | High confidence; corpus has no langchain descriptor |
| `ai_tool` sub-node topology | documented (cluster docs) + sibling tool specs | High confidence |
| Node options + defaults (10 / 1 / en / None) | documented (public docs) | High confidence |
| Option → SearXNG param mapping | documented (service API docs) | `pageno`, `language`, `safesearch` are the service's own params |
| Wire parameter keys (`numResults`, `safesearch`, …) | inferred | No public workflow JSON with this node was found; docs give UI names only |
| Credential type `searxngApi` + `apiUrl` field | inferred | Docs confirm "API URL" auth method; key string not published |
| typeVersion `1` | inferred | No version deltas documented |
| Tool name/description sent to the model | gap | Not documented; OpenFlow baseline chosen in contract |
| Agent-facing result formatting | gap | Field set documented by the service; formatting is OpenFlow's choice |
| URL join + `/search` endpoint | documented (service API docs) | Both `/` and `/search` supported |
| Sub-node first-item expression rule | documented | Stated on the node's public docs page |

## OpenFlow mapping

- **Definition group:** `ai` (cluster / langchain tool sub-nodes)
- **Executor file:** `src/lib/engine/executors/tool-searxng.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; tool registration via engine AI-tool handles (same pattern as `mcp-client-tool.ts` / other `ai_tool` sub-nodes). Outbound HTTP via the engine's fetch/HTTP facilities. No third-party `n8n-nodes-*` packages.
