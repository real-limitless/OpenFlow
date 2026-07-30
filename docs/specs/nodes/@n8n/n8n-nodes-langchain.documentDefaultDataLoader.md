---
type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader"
displayName: Default Data Loader
category: AI
versions: [1]
priority: medium
status: specced
---

# Default Data Loader

Cluster **sub-node**: loads binary data files or JSON data and splits the content
into document chunks, then provides those documents to a parent root node (a
Vector Store in **Insert Documents** mode, or a Summarization Chain) on the
`ai_documentLoader` channel. Used to ingest source data into vector stores (RAG)
or to feed a summarization chain.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.documentdefaultdataloader.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/retrieve-relevant-context.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.vectorstoreinmemory.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.textsplitterrecursivecharactertextsplitter.md | Public docs only |
| https://js.langchain.com/docs/modules/data_connection/document_loaders/integrations/file_loaders/ | Third-party docs (related resource linked from public docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.documentDefaultDataLoader`
- **Aliases:** (none observed)
- **typeVersion:** `1` (**inferred** — not observed in available public JSON; **gap**)
- **Inputs:**
  - No `main` input of its own in the cluster pattern (sub-node). It operates on
    the input items available to the parent root (the root's `main` input items)
    (**inferred** from cluster-node model + "Use all the node's input data").
  - `ai_textSplitter` × 0..1 — splitter sub-node, required when **Text Splitting**
    is **Custom** (**documented** "connect a text splitter of your choice" +
    **inferred** channel name from chainSummarization parity).
- **Outputs:**
  - `ai_documentLoader` × 1 — connects **into** a parent root's document-loader
    input (**inferred** channel name from chainSummarization parity, where the
    Summarization Chain consumes a document-loader sub-node on `ai_documentLoader`).
- **Credentials:** none (**documented** — the loader reads workflow/binary data;
    any service credentials live on the parent root or sibling sub-nodes)

Cluster topology: this node is attached as a **sub-node** of a root (Vector Store
Insert Documents, or Summarization Chain). The root drives ingestion; this node
owns only the load + split step — it turns input data into chunked documents and
hands them to the parent (**documented** cluster-node model + RAG insert pattern).

## Parameters

UI labels from **public docs**; wire names **inferred** from camelCase convention
+ chainSummarization/agent parity. The `@n8n/n8n-nodes-langchain` package
descriptor was **not** in the available corpus (`n8n-nodes-base@2.15.1` contains
no langchain descriptors), so exact JSON keys are a **gap**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| textSplitter | options / string | `simple` (**inferred**) | no | — | **Text Splitting**. `simple` = built-in Recursive Character Text Splitter (chunk size 1000, overlap 200); `custom` = connect a text splitter sub-node on `ai_textSplitter` (**documented**; wire name + enum values **inferred**). |
| dataType | options / string | — | yes | — | **Type of Data**. `binary` / `json` (**documented** labels "Binary" / "JSON"; wire name + enum values **inferred**). |
| mode | options / string | — | yes | — | **Mode**. `all` = "Load All Input Data" (use all the node's input data); `specific` = "Load Specific Data" (define data with expressions) (**documented** labels; wire name + enum values **inferred**). |
| data | string | — | when `mode` is `specific` | show when mode = "Load Specific Data" | **Data** — a mix of text and `{{ }}` expressions defining the data to load; creates a custom document from text + expressions (**documented**; wire name **inferred**). |
| dataFormat | options / string | auto-detect (**inferred**) | no | show when dataType = "Binary" | **Data Format** — file MIME type, or "Automatically Detect by MIME Type". Specific format + incoming MIME mismatch → node errors. Auto-detect + no MIME match → falls back to text format (**documented**; wire name **inferred**; exact MIME enum is a **gap**). |
| metadata | (key/value collection) | — | no | under **Node Options** | **Metadata** — metadata attached to each document in the vector store; matched later via the **Metadata Filter** option on retrieval (**documented**; wire name **inferred**). |

No operation/resource selector — the docs page lists only the parameters above
(**documented**).

## Runtime behavior

### Role

1. Expose a **document-loader handle** on output channel **`ai_documentLoader`**
   for the parent root to call. The parent (Vector Store Insert Documents, or
   Summarization Chain) invokes the handle to obtain chunked documents
   (**documented** RAG insert pattern + **inferred** cluster handle model).
2. **Load data** from the input items available to the node:
   - **Type of Data = JSON** → load JSON data from input items (**documented**).
   - **Type of Data = Binary** → load binary file content from input items by
     binary key; decode according to the **Data Format** (**documented**).
3. **Mode** controls which input data is loaded:
   - **Load All Input Data** → use all the node's input data (**documented**).
   - **Load Specific Data** → use the `data` expression/string to define the
     data; may mix literal text and `{{ }}` expressions to build a custom
     document (**documented**). As a **sub-node**, any expression resolves
     against the **first** input item only (**documented** sub-node parameter
     resolution).
4. **Split into chunks** (Text Splitting):
   - **Simple** → built-in Recursive Character Text Splitter with chunk size
     **1000** and overlap **200** (**documented** exact values).
   - **Custom** → delegate splitting to the connected `ai_textSplitter` sub-node
     handle (**documented** "connect a text splitter of your choice").
5. **Metadata** (Node Options): attach the configured key/value metadata to each
   produced document so it travels into the vector store and can be filtered on
   retrieval (**documented**).

### Document-loader handle contract (parent-invoked)

The parent root drives the load through the handle. Interface is **inferred**
from documented behavior + the RAG insert pattern; OpenFlow baselines are marked.

- **Load + split:** when the parent needs documents (e.g. Vector Store Insert
  Documents, or Summarization Chain with data source = Document Loader), it
  invokes the handle. The handle loads the data per `dataType`/`mode`, splits per
  `textSplitter`, attaches `metadata`, and returns an ordered list of document
  chunks (`{ pageContent, metadata }`) (**documented** behavior + **inferred**
  handle call site).
- **No `main` output:** this node does not emit normal `main` items by itself in
  the cluster pattern; the parent incorporates the loaded documents into its own
  processing (e.g. embedding + insert into the vector store) (**inferred** from
  cluster model).

### Output

When used as a document-loader sub-node:

- Connection graph output: `ai_documentLoader` → parent.
- No `main`-branch items are produced by this node; the parent consumes the
  documents and continues the workflow on its own `main` output (**inferred**
  cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| Binary: specific **Data Format** set and incoming file MIME type doesn't match | Node errors (**documented**) |
| Binary: **Automatically Detect by MIME Type** and can't match the MIME type | Falls back to **text** format (no error) (**documented**) |
| No input data / empty input | Not documented (**gap** — OpenFlow: return empty document list) |
| `textSplitter` = Custom but no splitter sub-node connected | Not documented (**gap** — OpenFlow: error "A Text Splitter sub-node must be connected") |
| `continueOnFail` | Standard engine: surface error on item / continue (**inferred**) |

### Expressions

- `data` (Load Specific Data) accepts `{{ }}` expressions mixed with literal
  text; resolves against the **first** input item (sub-node rule) (**documented**).
- `metadata` values may accept expressions (**inferred** from sibling sub-node
  conventions).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).

## Acceptance tests

Fixtures for `batch-queue-langchain-document-default-data-loader.test.ts` (and
equivalent). Shape assertions; parent consumption is mock-driven.

### Test: simple splitting — binary input

**Given** input items (parent root `main`):

```json
[{ "json": {}, "binary": { "data": { "data": "<1000+ char file content>", "mimeType": "text/plain" } } }]
```

**Parameters:**

```json
{
  "textSplitter": "simple",
  "dataType": "binary",
  "mode": "all",
  "dataFormat": "auto"
}
```

**Cluster:** connect this node's `ai_documentLoader` → Vector Store (Insert
Documents).

**Expect:** the handle returns document chunks split at chunk size 1000 / overlap
200; each chunk is `{ "pageContent": "<...>", "metadata": {} }` (**documented**
simple splitter values).

### Test: JSON data — load all input data

**Given** input items:

```json
[
  { "json": { "text": "First passage." } },
  { "json": { "text": "Second passage." } }
]
```

**Parameters:**

```json
{
  "textSplitter": "simple",
  "dataType": "json",
  "mode": "all"
}
```

**Expect:** the handle returns documents derived from all input items
(**documented** "use all the node's input data").

### Test: load specific data — mixed text and expression

**Given** input items:

```json
[{ "json": { "title": "Quarterly Report" } }]
```

**Parameters:**

```json
{
  "textSplitter": "simple",
  "dataType": "json",
  "mode": "specific",
  "data": "Summary: {{ $json.title }}"
}
```

**Expect:** the handle returns a single document with `pageContent` =
`"Summary: Quarterly Report"` — expression resolved against the **first** item
(**documented** sub-node first-item rule + mixed text/expressions).

### Test: custom text splitter via sub-node

**Given** input `[{ "json": { "text": "Long text..." } }]` and a text-splitter
sub-node on `ai_textSplitter`.

**Parameters:**

```json
{
  "textSplitter": "custom",
  "dataType": "json",
  "mode": "all"
}
```

**Expect:** documents are split by the connected splitter sub-node handle (not by
the built-in 1000/200 defaults) (**documented** "connect a text splitter of your
choice").

### Test: binary data format mismatch → error

**Given** input with binary MIME type `text/plain`:

```json
[{ "json": {}, "binary": { "data": { "data": "...", "mimeType": "text/plain" } } }]
```

**Parameters:**

```json
{
  "dataType": "binary",
  "mode": "all",
  "dataFormat": "application/pdf"
}
```

**Expect:** execution error — incoming MIME type doesn't match the specified data
format (**documented**).

### Test: auto-detect falls back to text

**Given** input with an unsupported MIME type `application/x-unknown`:

```json
[{ "json": {}, "binary": { "data": { "data": "...", "mimeType": "application/x-unknown" } } }]
```

**Parameters:**

```json
{
  "dataType": "binary",
  "mode": "all",
  "dataFormat": "auto"
}
```

**Expect:** no error; the node falls back to **text** format (**documented**).

### Test: metadata attached to documents

**Given** input `[{ "json": { "text": "Content." } }]`.

**Parameters:**

```json
{
  "textSplitter": "simple",
  "dataType": "json",
  "mode": "all",
  "metadata": { "source": "manual" }
}
```

**Expect:** every returned document chunk carries `metadata.source = "manual"`
(**documented** — metadata accompanies the document in the vector store).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, "load binary/JSON for vector stores or summarization" | documented | Primary docs page |
| Text Splitting: Simple (Recursive Character, 1000/200) / Custom (connect splitter) | documented | Exact chunk size + overlap values stated |
| Type of Data: Binary / JSON | documented | UI labels; wire name `dataType` + enum values inferred |
| Mode: Load All / Load Specific (text + expressions) | documented | UI labels; wire name `mode` + enum values inferred |
| Data Format: MIME type or auto-detect; mismatch → error; auto → text fallback | documented | Wire name `dataFormat` inferred; exact MIME enum is a gap |
| Metadata option + Metadata Filter matching | documented | Wire name `metadata` inferred |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary page |
| Channel name `ai_documentLoader` | inferred | From chainSummarization parity (Summarization Chain consumes a document-loader sub-node on `ai_documentLoader`) |
| Channel name `ai_textSplitter` | inferred | From chainSummarization parity |
| Input data = parent root's main input items | inferred | "Use all the node's input data" + cluster sub-node model; exact input mechanism not documented |
| Document shape `{ pageContent, metadata }` | inferred | LangChain document convention (related resource) |
| Handle call site (parent-invoked load+split) | inferred / OpenFlow contract | Docs describe behavior, not the exact interface |
| Exact supported MIME types for binary Data Format | gap | Not listed on the node page |
| Default `textSplitter` value | inferred | `simple` is the natural default; not explicitly stated |
| typeVersion behavior deltas | gap | Only v1 observed; treat as additive if more appear |
| No-input / empty-input behavior | gap | Not documented |
| Custom splitter missing → error string | gap | OpenFlow: "A Text Splitter sub-node must be connected" |
| Exact main-item JSON if node ever run standalone | gap | Cluster usage is via parent |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-document-default-data-loader.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.documentDefaultDataLoader` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a document-loader handle on
  `ai_documentLoader` that loads data per `dataType`/`mode`, splits per
  `textSplitter` (built-in Recursive Character 1000/200 for Simple, or delegate to
  `ai_textSplitter` for Custom), attaches `metadata`, and returns chunked
  documents; resolve expressions against the first item (sub-node rule); do **not**
  load `@n8n/nodes-langchain` packages.
- **Tests file:** `src/lib/engine/__tests__/batches/batch-queue-langchain-document-default-data-loader.test.ts`
  — cover simple/custom splitting, JSON/binary load, all/specific mode, data
  format mismatch + auto-detect fallback, metadata attachment