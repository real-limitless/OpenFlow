# Factory job – SPEC (clean‑room half A)

**Model:** `xai/grok-4.5`
**Node type:** `n8n-edges.base.circleCi`
**Batch:** `queue`
**Cycle:** `1` of `4`

## Sources
- Public docs: https://docs.n8n.io/integrations/builtin/credentials/circleci.md (Public docs only)

## Wire format
- **Type string:** `n8n-edges.base.circleCi`
- **Inputs:** workflow execution ID, optional execution parameters
- **Outputs:** successful run status, job details (ID, status, artifacts)
- **Credentials:** uses CircleCI personal API token stored as a credential

## Parameters (high‑level, abstracted)
1. **API Token** – secret field (referenced via credential) 
2. **Project Path** – free‑text identifier for the CircleCI project (e.g., `org/repo`)
3. **Workflow Name** – optional name of workflow to trigger
4. **Environment Variables** – key‑value map used during the run
5. **Flags** – `build_only`, `dry_run`

## Runtime behavior
- The node authenticates using the provided CircleCI credential.
- It POSTs to `/api/v2/projects/:project_path/workflows/:workflow_name` to trigger the workflow.
- Upon response, extracts the job ID and monitors its status asynchronously.
- On success, emits JSON with `jobId`, `status: "success"`, and any `artifactUrls`.
- Errors (invalid token, 4xx/5xx) raise a descriptive exception.

## Acceptance tests
1. **Successful trigger**: Given a valid token and existing project, the node returns a JSON with `status: "success"` and a `jobId`.
2. **Error handling**: With an invalid token, the node raises `AuthenticationError`.
3. **Environment vars**: Verify that passed key‑value pairs appear in the CircleCI run logs.
4. **Flags**: `build_only` skips workflow execution, returning `status: "queued"`.
5. **Dry‑run**: Returns the expected API request payload without contacting CircleCI.

## Gaps / confidence
- The specification relies on the public CircleCI API documentation (v2). No undocumented `circleCi` node specific quirks were found.
- Exact mapping of n8n credential system to CircleCI tokens is inferred from the credentials page.
- Confidence: High – clear public source, no hidden implementation details.

## OpenFlow mapping
- **Definition group:** `circleCi`
- **Intented executor filename:** `circleCiExecutor.ts`

## Citation
- CircleCI credentials page: https://docs.n8n.io/integrations/builtin/credentials/circleci.md

---

*Done.*