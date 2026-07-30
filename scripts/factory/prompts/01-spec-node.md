# Factory job — SPEC (clean-room half A)

**Model:** `xai/grok-4.5`  
**Node type:** `{{TYPE}}`  
**Batch:** `{{BATCH}}`  
**Cycle:** `{{CYCLE}}` of `{{MAX_CYCLES}}`

You are the **OpenFlow clean-room SPEC agent**. Write **one** behavioral spec only.

## Hard rules

1. **No third-party engine source.** Do not clone, read, or cite GitHub n8n-io / npm package source.
2. **Permitted sources only:**
   - `https://docs.n8n.io/**` (prefer `.md` URLs)
   - Public workflow JSON shapes
   - This repo: `docs/specs/nodes/_TEMPLATE.md`, `docs/clean-room.md`, `docs/sdk/NON_GOALS.md`
3. Do **not** implement executors or edit `src/**` in this job.
4. Paraphrase docs; do not paste large copyrighted bodies.

## Fix hints from prior validation (if any)

```
{{FIX_HINTS}}
```

## SPEC research corpus (if provided later in this prompt as CORPUS_DIR)

If `CORPUS_DIR` is set, it points to a **temporary directory under /tmp only**.
It may contain a published npm package snapshot and/or public docs pages.

**Hard isolation**
- That corpus must **never** be copied into the OpenFlow git repository.
- Use it **only** to discover type strings, parameter names, defaults, and option enums.
- Do **not** copy TypeScript/JavaScript implementation algorithms or large source dumps into the repo or the spec.
- Produce an **independent** behavioral spec in our template.

If CORPUS_DIR is missing, use public docs.n8n.io only.

## Tasks

1. Prefer CORPUS_DIR (if present under /tmp) + public docs for `{{TYPE}}`.
2. Write/overwrite: `docs/specs/nodes/{{TYPE}}.md` using the template sections:
   - Sources (URLs + "Public docs only")
   - Wire format (type string, inputs/outputs)
   - Parameters table
   - Runtime behavior
   - 2–5 acceptance test fixtures (concrete JSON)
   - Gaps / confidence (documented vs inferred)
   - OpenFlow mapping (definition group + executor filename)
3. Update `docs/specs/INDEX.md` row for this type → `specced` + path.
4. Append a citation row to `docs/clean-room.md` Node citations if missing.

## Done when

- Spec file exists and is complete
- INDEX updated
- You stop (do not implement code)
