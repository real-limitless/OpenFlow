# wiki-flow docs build

Importable OpenFlow workflows for the wiki-flow docs build.

| File | Name | What it does |
|------|------|----------------|
| `docs-build.json` | `wiki-flow/docs-build` | `POST /webhook/wiki-build` splits `plan` and hands each page to a specialist seat |
| `docs-build-complete.json` | `wiki-flow/docs-build-complete` | `POST /webhook/wiki-build-complete` marks the wiki run complete |

Each file has one webhook trigger. There is no Respond to Webhook node. `responseMode` is the default `onReceived`, so the host answers **202** immediately:

```json
{ "success": true, "executionId": "<id>", "message": "Webhook received, execution started" }
```

## Import, then activate

`POST /api/v1/workflows` with the file body (the `id` is kept when it is new). Then:

```http
PATCH /api/v1/workflows/<id>/activate
Content-Type: application/json

{ "active": true }
```

Activation registers `wiki-build` and `wiki-build-complete`. Workflows ship inactive.

## Secret header

`settings.webhookAuthMode` is `header`. Callers send:

```http
x-openflow-webhook-secret: <secret>
```

No secret is stored in these files. Set `settings.webhookSecret` on the workflow (`PUT /api/v1/webhooks/:id/secret` writes that field) or provide `OPENFLOW_WEBHOOK_SECRET`. The workflow value is used first, then the instance webhook secret, then the env var.

## Idempotency

Send `Idempotency-Key` (or `X-Idempotency-Key`). Keys are scoped to the webhook path, so use a different key per path:

- build: `` `${runId}:build` ``
- complete: `` `${runId}:complete` ``

A replay of the same path and key returns **202** with the original `executionId` and `replayed: true`.

## Polling

`GET /api/v1/executions/:id` for the run, or `GET /api/v1/executions/:id/stream` for server-sent progress events.

`settings.executionTimeout` is **600 seconds** (10 minutes).

## Payloads

The live webhook route pins the parsed JSON body as the item. Expressions use `$json.owner`, not `$json.body`.

**Build** `POST /webhook/wiki-build`:

```json
{
  "owner": "acme",
  "repo": "handbook",
  "runId": "run-42",
  "wikiUrl": "https://wiki.example",
  "rosterUrl": "https://roster.example",
  "plan": [
    { "seatId": "docs-writer", "slug": "intro", "brief": "Write the intro" }
  ]
}
```

`wikiUrl` and `rosterUrl` have no trailing slash. Each plan entry is an object with `seatId` (specialist seat), `slug`, and `brief`.

Split Out uses `include: allOtherFields` and `destinationFieldName: plan`. Each output item keeps the webhook fields and replaces `plan` with that one page, so the HTTP node can read `$json.plan.seatId` and `$json.rosterUrl` / `$json.runId` together. The default include (`noOtherFields`) would drop `rosterUrl` and `runId`.

Send Handoff posts one request per page to `{{rosterUrl}}/api/v1/bus/send`:

```json
{
  "from": "wiki-supervisor",
  "to": "<seatId>",
  "kind": "handoff",
  "wake": true,
  "text": "<brief>\nrunId: <runId>\nslug: <slug>"
}
```

`continueOnFail` is set on that HTTP node. With more than one page, a failed page is stored as `{ "error": "..." }`, the other pages are still sent, and the node finishes in error with those partial outputs. A one-page failure still throws, and the runner keeps the incoming item.

**Complete** `POST /webhook/wiki-build-complete` body: `{ owner, repo, runId, status, wikiUrl }`.

One POST to `{{wikiUrl}}/api/v1/repos/{{owner}}/{{repo}}/runs/{{runId}}/complete` with JSON `{ owner, repo, runId, status }`.

## Engine notes

The graph is a straight line. The runner executes each node once and does not loop back, so these files do not contain a cycle.

`url` and `jsonBody` are string expressions. A JSON object whose fields are `={{ }}` strings is not walked; those strings would be sent literally. The bodies above are one expression that returns an object, which is the path the HTTP executor evaluates.

The webhook *executor*, if it runs on its own, wraps the request as `{ headers, params, query, body }`. Production `POST /webhook/:path` does not do that: it pins the parsed JSON as the item and skips the executor. That is why these workflows use `$json.owner`.
