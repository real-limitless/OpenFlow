---
type: '@n8n/n8n-nodes-langchain.toolHttpRequest'
displayName: HTTP Request Tool
category: AI
versions: [1.1]
priority: medium
status: specced
---

# HTTP Request Tool

Legacy, standalone LangChain **tool sub-node** that lets an AI agent make raw HTTP calls (typically GET) to fetch a website or data from an API.

> **Deprecation notice (documented):** n8n deprecated this standalone node. New instances of the HTTP Request tool are the standard **HTTP Request** node (`n8n-nodes-base.httpRequest`) used in tool mode, attached to an AI agent. The deprecated-nodes page lists "HTTP Request Tool" with final node version **1.1**. Existing workflows using this node continue to run.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolhttprequest.md (retired page; redirects to HTTP Request) | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/httprequest.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/deprecated-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolHttpRequest`
- **Aliases:** (none)
- **Inputs:** (none — invoked by the connected AI agent at tool-calling time)
- **Outputs:** `ai_tool` × 1
- **Credentials:** HTTP Request credentials — the same credential set as the HTTP Request node: predefined credential types (any n8n built-in/community node credential) and generic credential types (Basic auth, Bearer/Header auth, Digest auth, OAuth1, OAuth2, Query auth, Custom auth, SSL).

This is a LangChain **tool sub-node**. It connects to an AI agent root node through a single `ai_tool` output. It has no independent `main` data input; the agent invokes it during tool-calling to fetch a URL or call an API, and the response is returned to the agent.

## Parameters

The node behaves like the HTTP Request node restricted to agent-tool use. Parameters are described at functional level; the exact internal parameter nesting of the original node is intentionally not reproduced.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `method` | string: GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS | GET | yes | HTTP method for the request |
| `url` | string | — | yes | Target endpoint; accepts expressions and `$fromAI()` |
| `authentication` | string: none \| predefinedCredential \| genericCredential | none | no | Authentication mode; matches HTTP Request credentials behavior |
| `sendQuery` | boolean | false | no | Enable URL query parameters |
| `queryParameters` | collection | — | only when `sendQuery` | Name/value pairs appended to the URL |
| `sendHeaders` | boolean | false | no | Enable custom request headers |
| `headerParameters` | collection | — | only when `sendHeaders` | Name/value header pairs |
| `sendBody` | boolean | false | no | Enable a request body |
| `bodyContentType` | string: formUrlencoded \| formData \| json \| binaryData \| raw | — | only when `sendBody` | Body format; payload shape mirrors the HTTP Request node |

Tool identity (a name/description that tells the agent when to call the tool) is part of the general tool-sub-node contract; whether it is configured on the node or derived automatically is an implementation detail.

## Runtime behavior

### Input

The node has no `main` input connection. At tool-calling time the agent invokes the tool; request fields (URL, headers, query parameters, body) are resolved from fixed literals, expressions, or `$fromAI()`-supplied arguments.

### Invocation

1. Resolve the method, URL, credentials, and any query/header/body parameters.
2. Send the HTTP request exactly as the HTTP Request node would (content-type-specific body encoding, credential injection, redirects, SSL validation).
3. Capture the response (body, plus headers/status when requested).

### Output

The HTTP response becomes the tool's result returned to the agent, serialized so the model can consume it (text/JSON). By default the response body is returned; when configured to include response headers and status, the envelope carries body + headers + status code.

### Sub-node expression semantics

Like all LangChain sub-nodes, expressions in the tool's parameters resolve against the **first item only** of the calling context; they do not iterate per item.

### Errors

- Non-2xx responses fail the tool call by default (the agent observes a failed invocation); an option can suppress this and return the error response as the result.
- Connection failures, DNS errors, and timeouts always fail the tool call.
- `continueOnFail` is honored per standard n8n conventions: when set, the failed tool call returns an error payload instead of throwing.

### Expressions

All string request parameters (URL, header/query values, body fields) accept expression strings. `$fromAI(key, description?, type?, defaultValue?)` is valid and lets the model fill in parameters dynamically.

## Acceptance tests

### Test: agent-invoked GET returns the response body

**Given** an AI agent connected to this tool sub-node and no incoming items.

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/todos/1",
  "authentication": "none"
}
```

**When** the agent invokes the tool:

**Expect** the tool result delivered to the agent contains the response body `{ "userId": 1, "id": 1, "title": "delectus aut autem", "completed": false }`.

### Test: query parameters are applied to the request

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "sendQuery": true,
  "queryParameters": { "parameters": [{ "name": "userId", "value": "1" }] }
}
```

**When** the agent invokes the tool:

**Expect** the outgoing request URL includes `?userId=1` and the tool result reflects only posts for user 1.

### Test: POST with JSON body

**Parameters:**
```json
{
  "method": "POST",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "sendBody": true,
  "bodyContentType": "json",
  "jsonBody": { "title": "foo", "body": "bar", "userId": 1 }
}
```

**When** the agent invokes the tool:

**Expect** the request body is sent as JSON (`Content-Type: application/json`) and the tool result contains the echoed payload with an assigned `id`.

### Test: non-2xx response fails the tool call

**Given** a URL returning 404.

**When** the agent invokes the tool:

**Expect** the tool call fails (the agent observes a failed invocation). With `continueOnFail` enabled, the tool returns an error payload instead of throwing.

### Test: $fromAI() supplies the URL

**Parameters:**
```json
{
  "method": "GET",
  "url": "={{ $fromAI('url', 'The API endpoint to fetch') }}"
}
```

**When** the agent invokes the tool and the model supplies the argument `url = "https://jsonplaceholder.typicode.com/todos/1"`:

**Expect** the request is made against the model-supplied URL and its response body is returned to the agent.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and deprecation | documented | Legacy page: works like the HTTP Request node for agent tool use; deprecated-nodes page lists final version 1.1 and the HTTP Request node as the replacement |
| Tool sub-node wire format | documented | `ai_tool` output, no main input; standard for LangChain tool sub-nodes |
| Credentials | documented | Same HTTP Request credentials set |
| Parameter surface ("works just like HTTP Request") | documented | Legacy page explicitly states behavior matches the HTTP Request node |
| Exact parameter nesting / option enums | inferred | Deliberately abstracted per clean-room rules; not reproduced from the package |
| Tool identity (name/description) exposure | inferred | General tool-sub-node contract documented; legacy node's exact config is not |
| Response envelope to the agent | inferred | Docs state the response is returned to the agent; exact serialization is an implementation detail |
| `$fromAI()` support | documented | Public docs cover `$fromAI()` for AI-tool parameters |
| Sub-node first-item expression semantics | documented | Legacy page includes the standard sub-node expression-resolution hint |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/toolHttpRequest.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
