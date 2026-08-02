---
type: n8n-nodes-base.googleDocsTool
displayName: Google Docs
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Docs (AI Tool)

A tool variant of the Google Docs node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Document resource operations (Create, Get, Update) against the Google Docs API v1.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledocs.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/docs/api/how-tos/overview | External API docs |
| https://developers.google.com/docs/api/reference/rest/v1/documents/create | External API docs |
| https://developers.google.com/workspace/docs/api/how-tos/move-text | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleDocsTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleDocsOAuth2Api` (OAuth2) or `googleApi` (service account). Google Docs supports both OAuth2 and service account authentication.

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Document operations

The user selects one of three operations on the Document resource:

| Operation | Required parameters | Optional parameters |
|-----------|---------------------|---------------------|
| Create | Title | Content (initial body text), Destination location (Drive folder) |
| Get | Document ID | — |
| Update | Document ID | Body content (append/replace text), Update mode (append vs replace) |

### Document identification

- **Document ID**: the Google Docs document identifier. It can be derived from the document URL (`https://docs.google.com/document/d/<DOCUMENT_ID>/edit`). Document IDs are stable even when the title changes.

### Content specification

Body content is provided as free text and is inserted into the document body using the Docs API. A replace-style update clears the existing body content before writing, while an append-style update writes at the end of the current body.

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- Optional fields are auto-populated by the AI agent when "let model fill" is enabled

## Runtime behavior

### Input

Consumes items from `main` input. Field values (title, document ID, body content) can reference input item properties via expressions.

### Output

All operations produce items on `output[0]`:

- **Create** — returns the created document from the Google Docs API including `documentId`, `title`, and the document structure (`body`, `documentStyle`, `lists`, etc.)
- **Get** — returns the document object matching the Document ID, including `documentId`, `title`, `body` (content elements with `startIndex`/`endIndex`, paragraphs, tables, lists), `headers`, `footers`, `namedStyles`, `namedRanges`, `inlineObjects`, and `positionedObjects`
- **Update** — returns the updated document from the Google Docs API (title, body with the modified content, revision metadata)

Output follows the Google Docs API v1 Document resource schema:
- `documentId` (string) — document identifier
- `title` (string) — document title
- `revisionId` (string) — opaque revision token (only populated with edit access; valid ~24h)
- `body` (object) — main body with `content[]` elements (Paragraph, Table, TableOfContents, SectionBreak), each carrying `startIndex`/`endIndex`
- `headers`, `footers` (map) — keyed by ID
- `namedStyles`, `lists`, `namedRanges`, `inlineObjects`, `positionedObjects` (maps)

### Errors

- API errors (auth failures, permission errors on document access, invalid document IDs, rate limits, index/range errors on update) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Update operations that target content ranges outside the current document bounds fail with an API error before any change is applied

### Expressions

All string/boolean/number fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a document

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "create",
  "title": "Meeting notes",
  "bodyContent": "Agenda:\n- Review Q3 goals"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "<valid-document-id>",
    "title": "Meeting notes",
    "body": {
      "content": [
        { "startIndex": 1, "endIndex": 9, "paragraph": { "elements": [{ "startIndex": 1, "endIndex": 9, "textRun": { "content": "Agenda:\n" } }] } }
      ]
    }
  }
}]
```

### Test: Get a document by ID

**Given** input items:
```json
[{ "json": { "documentId": "1ABCxyz" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "get",
  "documentId": "={{ $json.documentId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "1ABCxyz",
    "title": "Meeting notes",
    "body": {
      "content": [
        { "startIndex": 1, "endIndex": 30, "paragraph": { "elements": [{ "startIndex": 1, "endIndex": 30, "textRun": { "content": "Agenda:\n- Review Q3 goals\n" } }] } }
      ]
    }
  }
}]
```

### Test: Update a document by appending content

**Given** input items:
```json
[{ "json": { "docId": "1ABCxyz", "note": "Action item: ship milestone 1" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentId": "={{ $json.docId }}",
  "updateMode": "append",
  "bodyContent": "={{ $json.note }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "1ABCxyz",
    "title": "Meeting notes",
    "revisionId": "<opaque-revision-token>",
    "body": {
      "content": [
        { "startIndex": 1, "endIndex": 30, "paragraph": { "elements": [{ "startIndex": 1, "endIndex": 30, "textRun": { "content": "Agenda:\n- Review Q3 goals\n" } }] } },
        { "startIndex": 31, "endIndex": 46, "paragraph": { "elements": [{ "startIndex": 31, "endIndex": 46, "textRun": { "content": "Action item: ship milestone 1\n" } }] } }
      ]
    }
  }
}]
```

### Test: Replace the entire body content

**Given** input items:
```json
[{ "json": { "docId": "1ABCxyz", "newText": "Completely new draft" } }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "update",
  "documentId": "={{ $json.docId }}",
  "updateMode": "replace",
  "bodyContent": "={{ $json.newText }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "documentId": "1ABCxyz",
    "title": "Meeting notes",
    "body": {
      "content": [
        { "startIndex": 1, "endIndex": 22, "paragraph": { "elements": [{ "startIndex": 1, "endIndex": 22, "textRun": { "content": "Completely new draft\n" } }] } }
      ]
    }
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (Document Create/Get/Update) | documented | Public n8n docs list the three Document operations |
| AI tool parameter support | documented | Public n8n docs confirm the node can be used as an AI tool with `$fromAI()` |
| Google Docs API v1 endpoints | documented | `documents.create`, `documents.get`, `documents.batchUpdate` per Google API reference |
| Document output schema | documented | Google Docs API v1 Document resource schema is public |
| Exact update behavior (append vs replace) | inferred | Public n8n docs do not specify update modes; inferred from the Docs API (insertText + deleteContentRange) patterns |
| Credential type names | inferred | `googleDocsOAuth2Api` (OAuth2) and `googleApi` (service account) follow the Google credential conventions; both auth methods are documented as supported for Google Docs |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Google Docs operations identically to the base node in agent context |
| Version differences | inferred | Single version for this tool variant; base node has one version |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleDocsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
