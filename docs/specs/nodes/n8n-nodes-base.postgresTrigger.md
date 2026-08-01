---
type: n8n-nodes-base.postgresTrigger
displayName: Postgres Trigger
category: Development
versions: [1]
priority: medium
status: specced
---

# Postgres Trigger

React to PostgreSQL table changes (INSERT/UPDATE/DELETE) via auto-created database triggers, or subscribe to asynchronous notifications via Postgres LISTEN/NOTIFY.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.postgrestrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postgres/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postgresTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials:** `postgres` (host, database, user, password, port, SSL mode, SSH tunnel)
- **Node version:** `1.0`
- **Category:** `Development`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| triggerMode | string (`createTrigger` / `listenTrigger`) | `createTrigger` | required | — | Selects which trigger mechanism to use |
| schema | resourceLocator (list/name) | — | when triggerMode=`createTrigger` | show: { triggerMode: [createTrigger] } | The database schema containing the target table |
| tableName | resourceLocator (list/name) | — | when triggerMode=`createTrigger` | show: { triggerMode: [createTrigger] } | The table to create the trigger on |
| firesOn | string (`INSERT` / `UPDATE` / `DELETE`) | — | when triggerMode=`createTrigger` | show: { triggerMode: [createTrigger] } | The database event(s) that fire the trigger |
| additionalFields.channelName | string | — | optional | show: { triggerMode: [createTrigger] } | Custom NOTIFY channel name (defaults to a generated name) |
| additionalFields.functionName | string | — | optional | show: { triggerMode: [createTrigger] } | Custom name for the auto-created trigger function |
| additionalFields.replaceIfExists | boolean | false | optional | show: { triggerMode: [createTrigger] } | Drop existing trigger/function before creating new ones |
| additionalFields.triggerName | string | — | optional | show: { triggerMode: [createTrigger] } | Custom name for the auto-created trigger |
| channelName | string | — | when triggerMode=`listenTrigger` | show: { triggerMode: [listenTrigger] } | The channel name to LISTEN on |
| options.connectionTimeout | number | — | optional | — | Milliseconds to wait for a database connection |
| options.delayClosingIdleConnection | number | — | optional | — | Milliseconds to keep the connection open after the last notification |

## Runtime behavior

### Activation (workflow publish / test)

When the node is activated, it connects to the configured Postgres database. The behavior depends on `triggerMode`:

**createTrigger mode:**
1. The executor acquires a pg client via the `postgres` credential.
2. It creates a trigger function (PL/pgSQL) that wraps the row-level change into a JSON payload and sends it via `NOTIFY` on a channel.
3. It creates a trigger on the specified table (`schema.tableName`) that fires the function on the events selected in `firesOn`.
4. It issues `LISTEN <channelName>` to subscribe to notifications.
5. Generated SQL object names (trigger function, trigger, channel) use unique suffixed names to avoid collisions across workflows. Custom names from `additionalFields` override the generated defaults.

**listenTrigger mode:**
1. The executor acquires a pg client via the `postgres` credential.
2. It issues `LISTEN <channelName>` directly.
3. No database objects are created. The user is responsible for producing NOTIFY traffic on that channel.

### Event processing

When a `NOTIFY` arrives on the subscribed channel, the executor parses the payload:

**For createTrigger mode:** The trigger function sends a JSON string containing the old and new row data plus the operation type. The executor yields one item per notification with shape:

```json
{
  "type": "INSERT" | "UPDATE" | "DELETE",
  "table": "<schema.tableName>",
  "payload": { <row-data> }
}
```

**For listenTrigger mode:** The raw notification payload (a string) is yielded as:

```json
{
  "channel": "<channelName>",
  "message": "<payload-string>"
}
```

### Deactivation (workflow unpublish / stop)

**createTrigger mode:**
1. Drops the trigger from the table.
2. Drops the trigger function.
3. Issues `UNLISTEN <channelName>`.
4. Closes the database connection.

**listenTrigger mode:**
1. Issues `UNLISTEN <channelName>`.
2. Closes the database connection.

### Manual trigger (test step)

When triggered manually, the workflow waits for the first notification, deactivates immediately after receiving it, and yields that single event.

### Errors

- Missing `tableName` or `schema` in createTrigger mode: activation fails with a descriptive error.
- Missing `channelName` in listenTrigger mode: activation fails with a descriptive error.
- Database connection failures: activation throws; the node does not start listening.
- Permission errors (e.g., insufficient privileges to CREATE TRIGGER): activation throws.
- Invalid JSON payload on the channel: the raw string is passed through as the message value.
- `continueOnFail` is not applicable to trigger nodes (trigger errors prevent activation).

### Expressions

All parameter fields accept expression strings.

## Acceptance tests

### Test: createTrigger — insert event yields typed row payload

**Given** a Postgres connection with a table `public.orders`.

**Parameters:**
```json
{
  "triggerMode": "createTrigger",
  "schema": { "__rl": true, "mode": "name", "value": "public" },
  "tableName": { "__rl": true, "mode": "name", "value": "orders" },
  "firesOn": "INSERT"
}
```

**When** an INSERT occurs on `public.orders`, **expect** output[0] items matching:
```json
{
  "type": "INSERT",
  "table": "public.orders",
  "payload": { "id": 1, "customer": "Acme Corp", "total": 99.95 }
}
```

### Test: createTrigger — update event yields typed row payload

**Parameters:** same as above with `firesOn: "UPDATE"`.

**When** an UPDATE occurs on `public.orders`, **expect** output[0] items with `"type": "UPDATE"`.

### Test: createTrigger — delete event yields typed row payload

**Parameters:** same as above with `firesOn: "DELETE"`.

**When** a DELETE occurs on `public.orders`, **expect** output[0] items with `"type": "DELETE"`.

### Test: listenTrigger — channel NOTIFY yields channel and message

**Parameters:**
```json
{
  "triggerMode": "listenTrigger",
  "channelName": "my_events"
}
```

**When** `NOTIFY my_events, 'hello world'` is executed, **expect** output[0] items matching:
```json
{
  "channel": "my_events",
  "message": "hello world"
}
```

### Test: activation fails without tableName in createTrigger mode

**Parameters:**
```json
{
  "triggerMode": "createTrigger",
  "schema": { "__rl": true, "mode": "name", "value": "public" }
}
```

**Expect** activation to throw an error indicating `tableName` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Trigger modes | documented | Public docs specify "Listen and Create Trigger Rule" vs "Listen to Channel" |
| Auto-created trigger/function lifecycle | documented | Docs confirm auto-creation on publish and cleanup on unpublish |
| Required permissions | documented | CREATE TRIGGER + CREATE privilege on schema |
| Output shape (createTrigger) | inferred | Wraps standard Postgres row-level trigger payload; `type`/`table`/`payload` fields are a clean-room abstraction |
| Output shape (listenTrigger) | inferred | Standard Postgres NOTIFY yields channel + message |
| Parameters / options | inferred (corpus) | Parameter names confirmed from node JSON schema; values and defaults are abstractions |
| Connection options | inferred (corpus) | `connectionTimeout` and `delayClosingIdleConnection` confirmed as configurable |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/postgres-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only