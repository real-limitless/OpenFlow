---
type: n8n-nodes-base.renameKeys
displayName: Rename Keys
category: Transform
versions: [1]
priority: high
status: specced
---

# Rename Keys

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys.md | Public docs only |

## Parameters

| keys / currentKey+newKey | rename pairs |
| options.regex | optional regex rename |

## Acceptance tests

### Simple rename

`{ old: 1 }` currentKey=old newKey=new → `{ new: 1 }`

## OpenFlow mapping

- `src/lib/engine/executors/rename-keys.ts`
