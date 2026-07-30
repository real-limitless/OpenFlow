# Clean-room process

OpenFlow is an independent implementation of a workflow automation editor and
engine. It is not affiliated with, endorsed by, or derived from any other
project.

## Non-negotiable rules

1. **No source inspection.** Contributors must not clone, read, decompile, or
   reference another workflow automation project's source code — including node
   packages, execution engine internals, or frontend components.
2. **Permitted sources only:**
   - Public end-user and developer documentation.
   - Publicly shared workflow export JSON (templates, community shares, starter kits).
   - Observed runtime behaviour of a publicly reachable instance.
   - Public API documentation of third-party services (Slack, Google, Postgres, …).
   - OpenFlow specs under `docs/specs/` (for implementers).
3. **Cite your sources.** Every node description carries a `sources: string[]`
   array of the public URLs it was written from. Every significant architectural
   choice gets an ADR under `docs/adr/`.
4. **No trademarks.** Product name, logo, and copy must not use another
   project's marks. Compatibility may be described factually ("imports workflow
   JSON in the widely used public export format").
5. **Review gate.** Pull requests that add a node or engine behaviour must state
   which permitted source class each behaviour came from.
6. **SDK only.** New node executors are authored against the **OpenFlow Plugin
   SDK** (`src/sdk/`). See `docs/sdk/OVERVIEW.md` and `docs/sdk/NON_GOALS.md`.
7. **No third-party node packages.** Do not load or execute `n8n-nodes-*` (or
   similar) packages inside OpenFlow. Native reimplementations and future
   OpenFlow plugins only.

## Spec pipeline

| Role | Prompt / skill | Inputs | Outputs |
|------|----------------|--------|---------|
| Spec agent | `docs/prompts/01-spec-from-public-docs.md`, skill `openflow-node-spec` | Public docs | `docs/specs/nodes/*.md` |
| Implement agent | `docs/prompts/02-implement-from-spec.md`, skill `openflow-node-implement` | Specs + `src/sdk` | Definitions, executors, tests |
| OpenCode batches | `scripts/factory/prompts/*-batch.md` | Catalog batch of ≤4 types | Specs + SDK nodes + batch tests |

Implement agents must **not** fetch external product docs; the spec is the contract.

**Catalog:** `docs/specs/CATALOG.md` · **Factory:** `scripts/factory/README.md`  
**Hot-load (dev):** `POST /api/v1/dev/reload-nodes` when `OPENFLOW_HOT_NODES=1`

## Compatibility targets

The public interfaces we target are enumerated in the in-app compatibility page
(`/docs/compatibility`) and in `src/lib/workflow/types.ts`:

- Workflow JSON top-level and node-level fields.
- Connection map keyed by source node name, channel, and output index.
- Item shape `{ json, binary? }`.
- Expression syntax `{{ … }}` and the documented helper surface.
- The documented node property types and `displayOptions`.

Wire type strings (e.g. `n8n-nodes-base.httpRequest`) are **identifiers in the
export format**, not product branding.

## Decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| Phase 1 | Workflow JSON is the single source of truth; React Flow nodes/edges are a derived view. | Guarantees lossless round-trip and keeps the engine UI-agnostic. |
| Phase 1 | Unsupported node types import as placeholders that preserve parameters. | Import success matters more than node count; nothing is silently dropped. |
| Phase 1 | Storage sits behind `WorkflowRepository`; Phase 1 implements it with browser storage. | Server persistence swaps in without touching the editor. |
| Phase 1 | Expression evaluation in the editor is preview-only and unsandboxed-but-inert. | Real evaluation belongs in the server engine with an isolated sandbox. |
| SDK | Extract in-tree OpenFlow Plugin SDK; builtins migrate onto it; AI implements via SDK. | Stable clean-room authoring surface; avoids ad-hoc executor APIs. |
| SDK | No loading of third-party node packages. | Keeps clean-room posture; user extensibility = OpenFlow plugins later. |

## Node citations

Every node definition carries a `sources` array pointing exclusively at public
documentation. No third-party source code was consulted for any entry below.

| Phase | Node | Source | Source class |
| --- | --- | --- | --- |
| Spec batch 1 | Manual Trigger (`n8n-nodes-base.manualTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger.md | Public docs only |
| Spec batch 1 | No Operation (`n8n-nodes-base.noOp`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop.md | Public docs only |
| Spec batch 1 | Edit Fields / Set (`n8n-nodes-base.set`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set.md | Public docs only |
| Spec batch 1 | IF (`n8n-nodes-base.if`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only |
| Spec batch 1 | Limit (`n8n-nodes-base.limit`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit.md | Public docs only |
| Spec batch 1 | Filter (`n8n-nodes-base.filter`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only |
| Spec batch 1 | Switch (`n8n-nodes-base.switch`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch.md | Public docs only |
| Spec batch 1 | HTTP Request (`n8n-nodes-base.httpRequest`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest.md | Public docs only |
| Spec batch 1 | Webhook (`n8n-nodes-base.webhook`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md | Public docs only |
| Batch 01 | Execute Workflow | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs only |
| Batch 01 | Stop and Error | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.stopanderror.md | Public docs only |
| Batch 01 | Wait | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait.md | Public docs only |
| Batch 01 | Merge | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge.md | Public docs only |
| Batch 02 | Schedule Trigger | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md | Public docs only |
| Batch 02 | Respond to Webhook | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs only |
| Batch 02 | Code | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code.md | Public docs only |
| Batch 02 | Split In Batches | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches.md | Public docs only |
| Batch 03 | Split Out | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout.md | Public docs only |
| Batch 03 | Aggregate | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate.md | Public docs only |
| Batch 03 | Remove Duplicates | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.removeduplicates.md | Public docs only |
| Batch 03 | Item Lists (legacy) | Split Out + Aggregate public docs | Public docs only |
| Batch 04 | Date & Time | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime.md | Public docs only |
| Batch 04 | Sort | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort.md | Public docs only |
| Batch 04 | Rename Keys | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys.md | Public docs only |
| Batch 04 | Error Trigger | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger.md | Public docs only |
| Phase 8 | Split Out (`n8n-nodes-base.splitOut`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout/ | Public docs only |
| Phase 8 | Aggregate (`n8n-nodes-base.aggregate`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/ | Public docs only |
| Phase 8 | Filter (`n8n-nodes-base.filter`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter/ | Public docs only |
| Phase 8 | Limit (`n8n-nodes-base.limit`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit/ | Public docs only |
| Phase 8 | Remove Duplicates (`n8n-nodes-base.removeDuplicates`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.remove-duplicates/ | Public docs only |
| Phase 8 | Item Lists (`n8n-nodes-base.itemLists`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.item-lists/ | Public docs only |
| Phase 8 | Date & Time (`n8n-nodes-base.dateTime`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.date-time/ | Public docs only |
| Phase 8 | Split in Batches (`n8n-nodes-base.splitInBatches`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/ | Public docs only |
| Phase 8 | Execute Workflow (`n8n-nodes-base.executeWorkflow`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/ | Public docs only |
| Factory queue | Execute Sub-workflow Trigger (`n8n-nodes-base.executeWorkflowTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger.md | Public docs only |
| Factory queue | Code (`n8n-nodes-base.code`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code.md | Public docs only |
| Factory queue | IF (`n8n-nodes-base.if`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only |
| Factory queue | Filter (`n8n-nodes-base.filter`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only |
| Factory queue | Aggregate (`n8n-nodes-base.aggregate`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate.md | Public docs only |
| Factory queue | Split In Batches / Loop Over Items (`n8n-nodes-base.splitInBatches`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches.md | Public docs only |
| Factory queue | FTP (`n8n-nodes-base.ftp`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ftp.md | Public docs only |
| Factory queue | FTP credentials | https://docs.n8n.io/integrations/builtin/credentials/ftp.md | Public docs only |
| Factory queue | DataTable (`n8n-nodes-base.dataTable`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable.md | Public docs only |
| Factory queue | OpenAI Chat Model (`@n8n/n8n-nodes-langchain.lmChatOpenAi`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai.md | Public docs only |
| Factory queue | OpenAI Chat Model credentials | https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| Factory queue | OpenAI Chat Model common issues | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai/common-issues.md | Public docs only |
| Factory queue | AI Agent (`@n8n/n8n-nodes-langchain.agent`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent.md | Public docs only |
| Factory queue | AI Agent Tools mode | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent.md | Public docs only |
| Factory queue | AI Agent common issues | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/common-issues.md | Public docs only |
| Factory queue | MCP Client Tool (`@n8n/n8n-nodes-langchain.mcpClientTool`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp.md | Public docs only |
| Factory queue | MCP Client (sibling core node) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient.md | Public docs only |
| Factory queue | MCP Client Tool auth (HTTP Request credentials) | https://docs.n8n.io/integrations/builtin/credentials/httprequest.md | Public docs only |
| Factory queue | MCP protocol tools | https://modelcontextprotocol.io/specification/2024-11-05/server/tools | Third-party protocol docs |
| Factory queue | MCP Client Tool public workflow JSON | n8n template gallery API exports | Public workflow JSON |
| Factory queue | Sort (`n8n-nodes-base.sort`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort.md | Public docs only |
| Factory queue | Compare Datasets (`n8n-nodes-base.compareDatasets`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.comparedatasets.md | Public docs + public descriptor metadata |
| Factory queue | Rename Keys (`n8n-nodes-base.renameKeys`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys.md | Public docs + public descriptor metadata |
| Factory queue | Crypto (`n8n-nodes-base.crypto`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.crypto.md | Public docs + public descriptor metadata |
| Factory queue | Crypto credentials | https://docs.n8n.io/integrations/builtin/credentials/crypto.md | Public docs only |
| Factory queue | Date & Time (`n8n-nodes-base.dateTime`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime.md | Public docs + public descriptor metadata |
| Factory queue | Markdown (`n8n-nodes-base.markdown`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.markdown.md | Public docs + public descriptor metadata |
| Factory queue | HTML (`n8n-nodes-base.html`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html.md | Public docs + public descriptor metadata |
| Factory queue | XML (`n8n-nodes-base.xml`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.xml.md | Public docs + public descriptor metadata |
| Factory queue | JWT (`n8n-nodes-base.jwt`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.jwt.md | Public docs + public descriptor metadata |
| Factory queue | JWT credentials | https://docs.n8n.io/integrations/builtin/credentials/jwt.md | Public docs only |
| Factory queue | Compression (`n8n-nodes-base.compression`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.compression.md | Public docs + public descriptor metadata |
| Factory queue | Execution Data (`n8n-nodes-base.executionData`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executiondata.md | Public docs + public descriptor metadata |
| Factory queue | Execution Data (custom-data API) | https://docs.n8n.io/build/understand-workflows/understand-executions/customize-executions-data.md | Public docs only |
| Factory queue | Execute Workflow (`n8n-nodes-base.executeWorkflow`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs + public descriptor metadata |
| Factory queue | Respond to Webhook (`n8n-nodes-base.respondToWebhook`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook.md | Public docs + public descriptor metadata |
| Factory queue | Webhook (`n8n-nodes-base.webhook`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md | Public docs + public descriptor metadata |
| Factory queue | Webhook credentials | https://docs.n8n.io/integrations/builtin/credentials/webhook.md | Public docs only |
| Factory queue | Chat Trigger (`@n8n/n8n-nodes-langchain.chatTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |
| Factory queue | MCP Server Trigger (`@n8n/n8n-nodes-langchain.mcpTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger.md | Public docs only + MCP protocol docs |
| Factory queue | Chat Trigger common issues | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/common-issues.md | Public docs only |
| Factory queue | n8n Form (`n8n-nodes-base.formTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger.md | Public docs + public descriptor metadata |
| Factory queue | SSE Trigger (`n8n-nodes-base.sseTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssetrigger.md | Public docs only |
| Factory queue | Local File Trigger (`n8n-nodes-base.localFileTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.localfiletrigger.md | Public docs + public descriptor metadata |
| Factory queue | Local File Trigger (node exclude / security) | https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/block-specific-nodes.md | Public docs only |
| Factory queue | Read/Write Files from Disk (`n8n-nodes-base.readWriteFile`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md | Public docs + public descriptor metadata |
| Factory queue | Read/Write Files from Disk (file access restrictions) | https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security.md | Public docs only |
| Factory queue | SSH (`n8n-nodes-base.ssh`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssh.md | Public docs + public descriptor metadata |
| Factory queue | SSH credentials | https://docs.n8n.io/integrations/builtin/credentials/ssh.md | Public docs only |
| Factory queue | Error Trigger (`n8n-nodes-base.errorTrigger`) refresh | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger.md | Public docs + public descriptor metadata |
| Factory queue | Error Trigger (error workflows) | https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md | Public docs only |
| Factory queue | GraphQL (`n8n-nodes-base.graphql`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.graphql.md | Public docs + public descriptor metadata |
| Factory queue | Edit Image (`n8n-nodes-base.editImage`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.editimage.md | Public docs + public descriptor metadata |
| Factory queue | GraphQL (GraphQL query language) | https://graphql.org/learn/ | Third-party protocol docs |
| Factory queue | OpenAI (`@n8n/n8n-nodes-langchain.openAi`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai.md | Public docs only |
| Factory queue | OpenAI text operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/text-operations.md | Public docs only |
| Factory queue | OpenAI image operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/image-operations.md | Public docs only |
| Factory queue | OpenAI audio operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/audio-operations.md | Public docs only |
| Factory queue | OpenAI file operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/file-operations.md | Public docs only |
| Factory queue | OpenAI video operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/video-operations.md | Public docs only |
| Factory queue | OpenAI conversation operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/conversation-operations.md | Public docs only |
| Factory queue | OpenAI credentials | https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| Factory queue | OpenAI common issues | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/common-issues.md | Public docs only |
| Factory queue | `_killtest` (`n8n-nodes-base._killtest`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base._killtest.md | Public docs only (404 — type unpublished) |
| Factory queue | `_killtest` core-nodes index (absence) | https://docs.n8n.io/integrations/builtin/core-nodes.md | Public docs only |
| Factory queue | Workflow Trigger (`n8n-nodes-base.workflowTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.workflowtrigger.md | Public docs + public descriptor metadata |
| Factory queue | RSS Read (`n8n-nodes-base.rssFeedRead`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread.md | Public docs + public descriptor metadata |
| Factory queue | RSS Read (related trigger docs) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedreadtrigger.md | Public docs only |
| Factory queue | RSS Read public workflow JSON | n8n template gallery API exports | Public workflow JSON |
| Factory queue | Google Gemini Chat Model (`@n8n/n8n-nodes-langchain.lmChatGoogleGemini`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatgooglegemini.md | Public docs only |
| Factory queue | Google Gemini (PaLM) credentials | https://docs.n8n.io/integrations/builtin/credentials/googleai.md | Public docs only |
| Factory queue | Anthropic Chat Model (`@n8n/n8n-nodes-langchain.lmChatAnthropic`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatanthropic.md | Public docs only |
| Factory queue | Anthropic credentials | https://docs.n8n.io/integrations/builtin/credentials/anthropic.md | Public docs only |
| Factory queue | Anthropic Chat Model (Messages API) | https://docs.anthropic.com/en/api/messages | Third-party service API docs |
| Factory queue | Anthropic Chat Model (model ids) | https://docs.anthropic.com/en/docs/about-claude/models | Third-party service API docs |
| Factory queue | Cluster nodes overview | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | OpenRouter Chat Model (`@n8n/n8n-nodes-langchain.lmChatOpenRouter`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenrouter.md | Public docs only |
| Factory queue | OpenRouter credentials | https://docs.n8n.io/integrations/builtin/credentials/openrouter.md | Public docs only |
| Factory queue | OpenRouter Chat Model (API quick-start) | https://openrouter.ai/docs/quick-start | Third-party service API docs |
| Factory queue | OpenRouter Chat Model (models list API) | https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties | Third-party service API docs |
| Factory queue | Simple Memory (`@n8n/n8n-nodes-langchain.memoryBufferWindow`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow.md | Public docs only |
| Factory queue | AI Transform (`n8n-nodes-base.aiTransform`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aitransform.md | Public docs only |
| Factory queue | Simple Memory common issues | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow/common-issues.md | Public docs only |
| Factory queue | Simple Memory (related LangChain Buffer Window Memory) | https://v03.api.js.langchain.com/classes/langchain.memory.BufferWindowMemory.html | Third-party docs |
| Factory queue | Advanced AI / integrate-ai | https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| Factory queue | Ollama Chat Model (`@n8n/n8n-nodes-langchain.lmChatOllama`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatollama.md | Public docs only |
| Factory queue | Ollama Chat Model credentials | https://docs.n8n.io/integrations/builtin/credentials/ollama.md | Public docs only |
| Factory queue | Ollama Chat Model common issues | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatollama/common-issues.md | Public docs only |
| Factory queue | Ollama Chat Model (Chat API) | https://github.com/ollama/ollama/blob/main/docs/api.md | Third-party service API docs |
| Factory queue | Ollama Chat Model (Models Library) | https://ollama.com/library | Third-party service docs |
| Factory queue | Telegram (`n8n-nodes-base.telegram`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram.md | Public docs only |
| Factory queue | Discord (`n8n-nodes-base.discord`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/ | Public docs only |
| Factory queue | WhatsApp Business Cloud (`n8n-nodes-base.whatsApp`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp.md | Public docs only |
| Factory queue | WhatsApp Trigger (`n8n-nodes-base.whatsAppTrigger`) | https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.whatsapptrigger.md | Public docs only |
| Factory queue | Webflow (`n8n-nodes-base.webflow`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow/ | Public docs only |
| Factory queue | Slack (`n8n-nodes-base.slack`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/ | Public docs only |
| Factory queue | Slack Trigger (`n8n-nodes-base.slackTrigger`) | https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.slacktrigger/ | Public docs only |
| Factory queue | Slack credentials | https://docs.n8n.io/integrations/builtin/credentials/slack.md | Public docs only |
| Factory queue | Telegram chat operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/chat-operations.md | Public docs only |
| Factory queue | Telegram callback operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/callback-operations.md | Public docs only |
| Factory queue | Telegram file operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/file-operations.md | Public docs only |
| Factory queue | Telegram message operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations.md | Public docs only |
| Factory queue | Telegram credentials | https://docs.n8n.io/integrations/builtin/credentials/telegram.md | Public docs only |
| Factory queue | Twilio (`n8n-nodes-base.twilio`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twilio/ | Public docs only |
| Factory queue | Twilio credentials | https://docs.n8n.io/integrations/builtin/credentials/twilio/ | Public docs only |
| Factory queue | Twilio SMS API | https://www.twilio.com/docs/sms/api/message-resource | Public API docs only |
| Factory queue | Twilio Call API | https://www.twilio.com/docs/voice/api/call-resource | Public API docs only |
| Factory queue | Telegram Bot API reference | https://core.telegram.org/bots/api | Third-party service API docs |
| Factory queue | Basic LLM Chain (`@n8n/n8n-nodes-langchain.chainLlm`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainllm.md | Public docs only |
| Factory queue | Basic LLM Chain (agents vs chains — no tools/no memory) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| Factory queue | Basic LLM Chain (cluster nodes overview) | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | Basic LLM Chain (Chat Trigger `chatInput` / `output`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |
| Factory queue | Basic LLM Chain public workflow JSON | n8n-docs `agents_vs_chains.json` template export | Public workflow JSON |
| Factory queue | Todoist (`n8n-nodes-base.todoist`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist.md | Public docs only |
| Factory queue | Gmail (`n8n-nodes-base.gmail`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/ | Public docs only |
| Factory queue | Gmail credentials | https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| Factory queue | Execute Command (`n8n-nodes-base.executeCommand`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand.md | Public docs only |
| Factory queue | Execute Command common issues | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/common-issues.md | Public docs only |
| Factory queue | Todoist credentials | https://docs.n8n.io/integrations/builtin/credentials/todoist.md | Public docs only |
| Factory queue | Question and Answer Chain (`@n8n/n8n-nodes-langchain.chainRetrievalQa`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainretrievalqa.md | Public docs only |
| Factory queue | Question and Answer Chain common issues | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainretrievalqa/common-issues.md | Public docs only |
| Factory queue | Question and Answer Chain (what chains do) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/what-chains-do.md | Public docs only |
| Factory queue | Question and Answer Chain (RAG / retrieve relevant context) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/retrieve-relevant-context.md | Public docs only |
| Factory queue | Question and Answer Chain (agents vs chains — no tools/no memory) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| Factory queue | Question and Answer Chain (cluster nodes overview) | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | Question and Answer Chain (Chat Trigger `chatInput` / `output`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger.md | Public docs only |
| Factory queue | Question and Answer Chain (LangChain RAG tutorial) | https://js.langchain.com/docs/tutorials/rag/ | Third-party protocol docs |
| Factory queue | Summarization Chain (`@n8n/n8n-nodes-langchain.chainSummarization`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainsummarization.md | Public docs only |
| Factory queue | Summarization Chain (cluster nodes overview) | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | Summarization Chain (agents vs chains) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains.md | Public docs only |
| Factory queue | Summarization Chain (LangChain summarization methods) | https://js.langchain.com/docs/tutorials/summarization/ | Third-party docs |
| Factory queue | Default Data Loader (`@n8n/n8n-nodes-langchain.documentDefaultDataLoader`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.documentdefaultdataloader.md | Public docs only |
| Factory queue | Default Data Loader (cluster nodes overview) | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | Default Data Loader (RAG / retrieve relevant context) | https://docs.n8n.io/build/integrate-ai/understand-ai-components/retrieve-relevant-context.md | Public docs only |
| Factory queue | Default Data Loader (Simple Vector Store Insert Documents) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreinmemory.md | Public docs only |
| Factory queue | Simple Vector Store (`@n8n/n8n-nodes-langchain.vectorStoreInMemory`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreinmemory.md | Public docs only |
| Factory queue | Default Data Loader (Recursive Character Text Splitter) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplitterrecursivecharactertextsplitter.md | Public docs only |
| Factory queue | Default Data Loader (LangChain document loaders) | https://js.langchain.com/docs/modules/data_connection/document_loaders/integrations/file_loaders/ | Third-party docs |
| Factory queue | Embeddings OpenAI (`@n8n/n8n-nodes-langchain.embeddingsOpenAi`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsopenai.md | Public docs only |
| Factory queue | OpenAI credentials | https://docs.n8n.io/integrations/builtin/credentials/openai.md | Public docs only |
| Factory queue | Cluster nodes overview | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | OpenAI Embeddings API | https://platform.openai.com/docs/api-reference/embeddings | Third-party service API docs |
| Factory queue | Recursive Character Text Splitter (`@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter`) | https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplitterrecursivecharactertextsplitter.md | Public docs only |
| Factory queue | Recursive Character Text Splitter (cluster nodes overview) | https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| Factory queue | Recursive Character Text Splitter (Advanced AI) | https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| Factory queue | Recursive Character Text Splitter (LangChain text splitters) | https://js.langchain.com/docs/concepts/text_splitters | Third-party docs |
| Factory queue | Recursive Character Text Splitter (LangChain API reference) | https://v03.api.js.langchain.com/classes/langchain.text_splitter.RecursiveCharacterTextSplitter.html | Third-party docs |
| Factory queue cycle 1 | Execute Command (`n8n-nodes-base.executeCommand`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand.md, https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/common-issues.md | Public docs only |
| Factory queue cycle 1 | Google Sheets (`n8n-nodes-base.googleSheets`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/ | Public docs only |
| Factory queue cycle 1 | Google Sheets document operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/document-operations.md | Public docs only |
| Factory queue cycle 1 | Google Sheets sheet operations | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations.md | Public docs only |
| Factory queue cycle 1 | Google OAuth2 single-service credentials | https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| Factory queue cycle 1 | Google Service Account credentials | https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |
| Factory queue cycle 1 | Google Docs (`n8n-nodes-base.googleDocs`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledocs.md | Public docs only |
| Factory queue cycle 1 | Google Calendar (`n8n-nodes-base.googleCalendar`) | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/ | Public docs only |
| Factory queue cycle 1 | Google Calendar Trigger (`n8n-nodes-base.googleCalendarTrigger`) | https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlecalendartrigger/ | Public docs only |
| Factory queue cycle 1 | Google OAuth2 single-service credentials | https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
