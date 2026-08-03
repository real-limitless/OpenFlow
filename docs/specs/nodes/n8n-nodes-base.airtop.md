---
type: n8n-nodes-base.airtop
displayName: Airtop
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Airtop

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtop/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtop/ | Public docs only |
| https://docs.airtop.ai/api-reference/airtop-api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.airtop`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `airtopApi` (API key authentication)

## Parameters

### Session resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | create | yes | resource: session | Values: `create`, `terminate`, `save`, `waitForDownload` |
| profileName | string | — | no | operation: create | Alphanumeric + hyphens; name of Airtop profile to load/create |
| saveProfileOnTermination | boolean | false | no | operation: create | Persist profile when session ends |
| record | boolean | false | no | operation: create | Record browser session |
| timeoutMinutes | number | 10 | no | operation: create | Idle timeout before auto-termination (1–10080) |
| proxy | options | none | no | operation: create | Values: `none`, `integrated`, `proxyUrl` |
| proxyConfig | object | {country: US, sticky: true} | no | proxy: integrated | Top-level param (not under additionalFields). Airtop proxy config: country (ISO 3166-1 alpha-2), sticky (boolean) |
| proxyUrl | string | — | no | proxy: proxyUrl | Top-level param (not under additionalFields). Custom proxy URL (must start with http/https) |
| solveCaptcha | boolean | false | no | operation: create | Under additionalFields. Auto-solve CAPTCHA challenges |
| extensionIds | string | — | no | operation: create | Under additionalFields. Comma-separated Chrome extension IDs |
| sessionId | string | — | yes | operation: terminate/save/waitForDownload | Existing session identifier |
| profileName | string | — | yes | operation: save | Profile name to persist on termination |
| timeout | number | 30 | no | operation: waitForDownload | Under additionalFields. Seconds to wait for download availability |

### Window resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | create | yes | resource: window | Values: `create`, `load`, `getLiveView`, `takeScreenshot`, `close`, `list` |
| sessionMode | options | existing | yes | window operations | `new` (auto-create) or `existing` |
| sessionId | string | — | — | sessionMode: existing | Session identifier from prior step |
| windowId | string | — | — | sessionMode: existing | Window identifier from prior step |
| url | string | https://www.google.com | — | sessionMode: new or operation: create/load | Initial URL to load |
| profileName | string | — | — | sessionMode: new | Profile for auto-created session |
| autoTerminateSession | boolean | true | — | sessionMode: new | Terminate auto-created session after operation |
| getLiveView | boolean | false | — | operation: create | Return Live View URL |
| waitUntil | options | load | — | operation: create | Under additionalFields. Values: `load`, `domContentLoaded`, `complete`, `noWait` |
| includeNavigationBar | boolean | false | — | resource: window, operation: create, getLiveView: true | Top-level param on window create (new sessions). Resolved via getParam. |
| screenResolution | string | — | — | resource: window, operation: create, getLiveView: true | Top-level param on window create. Resolved via getParam. |
| disableResize | boolean | false | — | resource: window, operation: create, getLiveView: true | Top-level param on window create. Resolved via getParam. |
| includeNavigationBar | boolean | false | — | resource: window, operation: getLiveView | Under additionalFields. Show navigation bar in Live View. Executor must resolve via getAdditionalField(node, 'includeNavigationBar') ?? getParam(node, 'includeNavigationBar') to support both top-level create and additionalFields getLiveView paths. |
| screenResolution | string | — | — | resource: window, operation: getLiveView | Under additionalFields. Force resolution (e.g., `1280x720`). Executor must resolve via getAdditionalField first, then getParam fallback (same dual-path as includeNavigationBar). |
| disableResize | boolean | false | — | resource: window, operation: getLiveView | Under additionalFields. Prevent window resize in Live View. Executor must resolve via getAdditionalField first, then getParam fallback (same dual-path as includeNavigationBar). |

### Agent resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | run | yes | resource: agent | Only `run` supported |
| agentId | resourceLocator | — | yes | — | Airtop agent ID (list or manual entry) |
| agentParameters | resourceMapper | — | no | agentId provided | Input parameters for agent (mapped to agent schema) |
| awaitExecution | boolean | true | — | — | Wait for agent completion |
| timeout | number | 600 | awaitExecution: true | — | Max seconds to wait for agent (≥10) |

### Extraction resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | query | yes | resource: extraction | Values: `query`, `getPaginated`, `scrape` |
| prompt | string | — | yes | operation: query/getPaginated | Natural language query for page content |
| outputSchema | json | — | no | operation: query/getPaginated (additionalFields) | JSON schema for structured output |
| parseJsonOutput | boolean | true | no | outputSchema provided | Parse model response as JSON |
| includeVisualAnalysis | boolean | false | no | operation: query/getPaginated (additionalFields) | Analyze page visually |
| interactionMode | options | auto | no | operation: getPaginated (additionalFields) | Values: `auto`, `accurate`, `cost-efficient` |
| paginationMode | options | auto | no | operation: getPaginated (additionalFields) | Values: `auto`, `paginated`, `infinite-scroll` |
| sessionMode | options | existing | yes | — | `new` or `existing` |
| sessionId | string | — | sessionMode: existing | — | Session identifier |
| windowId | string | — | sessionMode: existing | — | Window identifier |
| url | string | — | sessionMode: new | — | URL to load in new session |
| profileName | string | — | sessionMode: new | — | Profile for new session |
| autoTerminateSession | boolean | true | sessionMode: new | — | Auto-terminate after operation |

### Interaction resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | click | yes | resource: interaction | Values: `click`, `hover`, `scroll`, `type`, `fill` |
| elementDescription | string | — | yes | click/hover/type | Natural language element description |
| clickType | options | click | no | operation: click | Values: `click`, `doubleClick`, `rightClick` |
| text | string | — | yes | operation: type | Text to type |
| pressEnterKey | boolean | false | no | operation: type | Press Enter after typing |
| formData | string | — | yes | operation: fill | Natural language form fill instructions |
| scrollingMode | options | automatic | yes | operation: scroll | Values: `automatic`, `manual` |
| scrollToElement | string | — | scrollingMode: automatic | — | Element to scroll to (natural language) |
| scrollToEdge.yAxis | options | — | scrollingMode: manual | Values: `top`, `bottom` |
| scrollToEdge.xAxis | options | — | scrollingMode: manual | Values: `left`, `right` |
| scrollBy.yAxis | string | — | scrollingMode: manual | Pixels/percentage (e.g., `200px`, `50%`) |
| scrollBy.xAxis | string | — | scrollingMode: manual | Pixels/percentage |
| scrollWithin | string | — | operation: scroll | Constrain scroll to element |
| visualScope | options | auto | no | click/hover/type/scroll (additionalFields) | Values: `auto`, `viewport`, `page`, `scan` |
| waitForNavigation | options | load | no | click/hover/type/scroll (additionalFields) | Values: `load`, `domcontentloaded`, `networkidle0`, `networkidle2` |
| sessionMode | options | existing | yes | — | `new` or `existing` |
| sessionId | string | — | sessionMode: existing | — | Session identifier |
| windowId | string | — | sessionMode: existing | — | Window identifier |
| url | string | — | sessionMode: new | — | URL to load in new session |
| profileName | string | — | sessionMode: new | — | Profile for new session |
| autoTerminateSession | boolean | true | sessionMode: new | — | Auto-terminate after operation |

### File resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | upload | yes | resource: file | Values: `upload`, `get`, `getMany`, `deleteFile`, `load` |
| sessionId | string | — | yes | — | Session identifier |
| windowId | string | — | yes | upload/load | Window identifier |
| fileName | string | — | yes | operation: upload | Unique name for file in session |
| fileType | options | customer_upload | no | operation: upload | Values: `browser_download`, `screenshot`, `video`, `customer_upload` |
| source | options | url | no | operation: upload | Values: `url`, `binary` |
| url | string | — | source: url | — | File URL to fetch |
| binaryPropertyName | string | data | source: binary | — | Binary property name |
| triggerFileInputParameter | boolean | true | no | operation: upload | Auto-trigger file input dialog |
| elementDescription | string | — | triggerFileInputParameter: true | — | File input element description |
| includeHiddenElements | boolean | true | triggerFileInputParameter: true | — | Include hidden file inputs |
| fileId | string | — | operation: get/deleteFile/load | — | File identifier |
| outputBinaryFile | boolean | false | operation: get | — | Output file as binary |
| returnAll | boolean | false | operation: getMany | — | Return all results |
| limit | number | 10 | returnAll: false | operation: getMany | Max results |
| sessionIds | string | — | operation: getMany | — | Comma-separated session IDs to filter |
| outputSingleItem | boolean | true | operation: getMany | — | Single item with all files vs separate items |

## Runtime behavior

### Input

- Single input port `main` accepting items with optional `sessionId`, `windowId` from upstream nodes.
- For `sessionMode: new` operations, no upstream session required.
- For `sessionMode: existing`, expects `sessionId` (and `windowId` where needed) in input item JSON or via expression.

### Output

Each operation returns items with:

| Operation | Output shape (per item) |
|-----------|------------------------|
| session.create | `{ sessionId, data: { id, cdpUrl, cdpWsUrl, chromedriverUrl, configuration, status, dateCreated, lastActivity } }` |
| session.terminate | `{ success: true }` |
| session.save | `{ sessionId, profileName, ...response }` |
| session.waitForDownload | `{ sessionId, data: { fileId, downloadUrl } }` |
| window.create | `{ sessionId, windowId, data: { windowId, targetId, liveViewUrl? } }` |
| window.load | `{ sessionId, windowId, ...response }` |
| window.getLiveView | `{ sessionId, windowId, data: { liveViewUrl, ... } }` |
| window.takeScreenshot | `{ sessionId, windowId, data: { screenshotUrl, ... } }` |
| window.close | `{ success: true }` |
| window.list | `{ sessionId, data: { windows: [...] } }` |
| agent.run | `{ invocationId, status, output: { error, success } }` (or just `invocationId` if not awaiting) |
| extraction.query | `{ modelResponse, ... }` (parsed JSON if `parseJsonOutput`) |
| extraction.getPaginated | `{ modelResponse, ... }` (multiple pages) |
| extraction.scrape | `{ modelResponse: <markdown content> }` |
| interaction.click/hover/type/scroll/fill | `{ sessionId, windowId, modelResponse, actionId?, ... }` |
| file.upload | `{ sessionId, windowId, data: { fileId, message } }` |
| file.get/getMany | `{ sessionId, data: { files: [...] } }` |
| file.deleteFile | `{ success: true }` |
| file.load | `{ sessionId, windowId, data: { fileId, ... } }` |

### Errors

- API errors (4xx/5xx) throw `NodeApiError` unless `continueOnFail` is enabled on the node.
- Validation errors (missing required params, invalid formats) throw `NodeOperationError`.
- For `session.waitForDownload`, timeout throws if no `file_status: available` event within configured seconds.
- For `agent.run` with `awaitExecution`, agent errors surface as `output.error: true` with message.
- Network/transport errors propagate as `NodeApiError`.

### Expressions

All string/number/boolean parameters accept expression syntax (`{{ $json.field }}`, `{{ $('Node').item.json.field }}`, etc.).
Resource locator (`agentId`) and resource mapper (`agentParameters`) support expressions in their respective modes.

## Acceptance tests

### Test: create-session-and-window

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "session",
  "operation": "create",
  "profileName": "test-profile",
  "proxy": "none",
  "timeoutMinutes": 5
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sessionId": "string",
    "data": {
      "id": "string",
      "cdpUrl": "string",
      "cdpWsUrl": "string",
      "chromedriverUrl": "string",
      "configuration": { "timeoutMinutes": 5 },
      "status": "active"
    }
  }
}]
```

---

### Test: extract-content-from-page

**Given** input items with session/window from prior step:
```json
[{ "json": { "sessionId": "sess_123", "windowId": "win_456" } }]
```

**Parameters:**
```json
{
  "resource": "extraction",
  "operation": "query",
  "sessionMode": "existing",
  "prompt": "What is the page title?",
  "outputSchema": { "type": "object", "properties": { "title": { "type": "string" } } },
  "parseJsonOutput": true
}
```

**Expect** output[0]:
```json
[{
  "json": { "title": "string" }
}]
```

---

### Test: click-element

**Given** input items with session/window:
```json
[{ "json": { "sessionId": "sess_123", "windowId": "win_456" } }]
```

**Parameters:**
```json
{
  "resource": "interaction",
  "operation": "click",
  "sessionMode": "existing",
  "elementDescription": "the submit button",
  "clickType": "click"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sessionId": "sess_123",
    "windowId": "win_456",
    "modelResponse": "string"
  }
}]
```

---

### Test: upload-and-trigger-file

**Given** input items with session/window:
```json
[{ "json": { "sessionId": "sess_123", "windowId": "win_456" } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "sessionId": "sess_123",
  "windowId": "win_456",
  "fileName": "test.png",
  "fileType": "screenshot",
  "source": "url",
  "url": "https://example.com/image.png",
  "triggerFileInputParameter": true,
  "elementDescription": "the file upload input"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sessionId": "sess_123",
    "windowId": "win_456",
    "data": {
      "fileId": "string",
      "message": "File uploaded successfully"
    }
  }
}]
```

---

### Test: run-agent-await

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "agent",
  "operation": "run",
  "agentId": { "mode": "id", "value": "agent_abc123" },
  "agentParameters": { "mappingMode": "defineBelow", "value": { "url": "https://example.com" } },
  "awaitExecution": true,
  "timeout": 120
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "invocationId": "string",
    "status": "completed",
    "output": { "success": true, "error": false }
  }
}]
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Session create parameters | documented | From n8n docs + corpus descriptor |
| Proxy config details | documented | Country options from Airtop API docs (corpus COUNTRIES list) |
| Agent parameter mapping | inferred | Resource mapper loads agent schema dynamically; exact structure agent-specific |
| Extraction outputSchema | documented | JSON schema support per n8n docs |
| Scroll manual mode fields | documented | From corpus operation schema |
| File upload trigger behavior | documented | From corpus operation source |
| Live View query params | documented | From corpus operation source (under additionalFields) |
| Wait for download timeout | documented | Under additionalFields in corpus; default from corpus constants |
| Credentials | documented | API key only per n8n credentials doc |
| Session auto-create mode | documented | SessionMode pattern from corpus fields.js |
| Window list operation | documented | From corpus operation_list.ts |

## OpenFlow mapping

- **Definition group:** `flow` (browser automation / external service integration)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtop.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only