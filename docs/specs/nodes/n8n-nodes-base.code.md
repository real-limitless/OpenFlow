---
type: n8n-nodes-base.code
displayName: Code
category: Transform
versions: [2]
priority: high
status: specced
---

# Code

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code.md | Public docs only |

## Parameters

| mode | runOnceForAllItems / runOnceForEachItem |
| jsCode | JavaScript source |

## Runtime behavior

Runs in isolated-vm sandbox. Helpers: `$json`, `$input.all/first/last/item`. Return array of items or single object. No network/fs in sandbox.

## Acceptance tests

### All items

`return $input.all().map(i => ({ json: { n: i.json.x } }))`

### Each item

mode each, `return { json: { doubled: $json.v * 2 } }`

## OpenFlow mapping

- `src/lib/engine/executors/code.ts`
