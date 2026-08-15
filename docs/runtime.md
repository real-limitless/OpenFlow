# Lite / harness runtime

Headless `createRuntime().run()` does not persist executions by itself. Hosts such as CleanFlow can **best-effort ingest** a finished (or in-flight) `runData` snapshot into OpenFlow History.

Ingest is optional. If OpenFlow is down, `run()` must still succeed.

## Ingest API

Authenticate with a user API key (`of_…`) that has `openflow:execute`. Restricted keys need a `canExecute` grant on the target workflow. Session cookies are rejected.

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/api/v1/workflows/:id/executions` | Create `mode: "runtime"` |
| `PATCH` | `/api/v1/executions/:id` | Update the same row (`onProgress`) |

```json
{
  "status": "success",
  "startedAt": "2026-08-15T00:00:00.000Z",
  "finishedAt": "2026-08-15T00:00:02.000Z",
  "runData": {
    "Start": { "status": "success", "items": [[{ "json": {} }]] },
    "Agent": { "status": "success", "items": [[{ "json": { "output": "…" } }]] }
  },
  "error": null,
  "host": "cleanflow",
  "stageId": "orchestrate",
  "projectId": "cf-project-id",
  "fingerprint": "optional-graph-hash"
}
```

`201` / `200` body: `{ "id", "workflowId", "status", "mode": "runtime" }`.

| Status | When |
| --- | --- |
| 401 | Missing token, or session cookie only |
| 403 | Missing `openflow:execute` or execute grant |
| 404 | Unknown / inaccessible `workflowId` |
| 413 | `runData` JSON larger than 2MB |
| 400 | Invalid `status` or JSON |

Do **not** ingest fetch-fallback / HTTP-chat results. Only real harness `run()` snapshots.

## Redaction

The server walks `runData` before persist and masks:

- Keys such as `password`, `token`, `secret`, `apiKey`, `authorization`, `*password`
- String values matching `Bearer …`, `sk-…`, `of_…` / `oft_…` / `ofa_…`

Do not send credential payloads. The server redacts anyway.

## Host helper

```ts
import { reportRuntimeExecution } from "openflow/src/lib/runtime/report";

const reported = await reportRuntimeExecution({
  target: {
    url: process.env.OPENFLOW_URL!,
    token: process.env.OPENFLOW_TOKEN!,
    workflowId,
    host: "cleanflow",
    stageId: "orchestrate",
  },
  result: { success: result.success, runData: result.runData },
});
// reported?.id → History row; null if OpenFlow was unreachable
```

After `src/lib/runtime/create-runtime.ts` is on this branch, wire `createRuntime({ report: { url, token, workflowId } })` to this helper (POST on start / first snapshot, PATCH on later `onProgress` and finish).
