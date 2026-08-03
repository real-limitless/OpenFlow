---
type: @n8n/n8n-nodes-langchain.toolWikipedia
displayName: Wikipedia
category: Tools
versions: [1]
priority: medium
status: specced
---

# Wikipedia Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolwikipedia.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolWikipedia`
- **Aliases:** (none)
- **Inputs:** none (sub-node, connects via `ai_tool` channel only)
- **Outputs:** `ai_tool` × 1
- **Output name:** `Tool`
- **Credentials:** none

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none) | — | — | — | — | The node exposes no user-configurable parameters. The AI agent supplies the search query at tool-calling time. |

## Runtime behavior

### Input

The node has no main inputs. It operates as a **tool sub-node** attached to an AI Agent (or compatible root node) via the `ai_tool` connection. When the agent decides to use the tool, it invokes the tool with a single string argument: the search query.

### Output

The tool returns a single result item to the calling agent containing the Wikipedia search output. The output structure is determined by the underlying LangChain `WikipediaQueryRun` tool and typically includes:

- Article summary or extract relevant to the query
- Page title(s)
- URL(s) to the Wikipedia page(s)

The exact response shape is governed by the Wikipedia API and LangChain's wrapper; the node passes the tool result through unmodified.

### Errors

- If the Wikipedia API is unreachable or returns an error, the tool invocation fails and the error propagates to the agent (which may retry or handle it per the agent's error policy).
- No `continueOnFail` concept applies; tool errors are surfaced to the agent for decision-making.
- Empty or ambiguous queries may return an empty result or a disambiguation notice from Wikipedia.

### Expressions

Not applicable — the node has no parameters. The query string is supplied by the AI model at runtime, not via n8n expressions.

## Acceptance tests

### Test: basic search

**Given** an AI Agent with the Wikipedia tool connected, and the agent receives a user query "What is the capital of France?"

**When** the agent invokes the Wikipedia tool with the query "capital of France"

**Expect** the tool returns a result containing "Paris" and a reference to the relevant Wikipedia page.

### Test: ambiguous query

**Given** the same setup

**When** the agent invokes the tool with an ambiguous query "Apple"

**Expect** the tool returns a result (typically the disambiguation page or the most prominent article) without throwing an error.

### Test: no results

**Given** the same setup

**When** the agent invokes the tool with a query for a non-existent term "xyzqwerty123nonexistent"

**Expect** the tool returns an empty or "no results" response without throwing an error.

### Test: tool availability

**Given** a workflow with an AI Agent node and the Wikipedia tool connected via `ai_tool`

**When** the workflow is validated

**Expect** the tool appears in the agent's available tools list with a name derived from the node name (spaces replaced by underscores) and a description indicating it searches Wikipedia.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool name derivation | documented | Node name → tool name via `nodeNameToToolName` (spaces → underscores) |
| Tool description | documented | Fixed description: "A tool for interacting with and fetching data from the Wikipedia API. The input should always be a string query." |
| Response shape | inferred | Determined by LangChain's `WikipediaQueryRun` and the Wikipedia API; not fixed by this node |
| Rate limits / quotas | not documented | Wikipedia API has public rate limits; node does not manage them |
| Language support | inferred | Wikipedia supports multiple languages; underlying tool may default to English or accept language hints |

## OpenFlow mapping

- **Definition group:** `transform` (tool sub-node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-langchain.toolWikipedia.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Connection type:** `ai_tool` output (no main connections)