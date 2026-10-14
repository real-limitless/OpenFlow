// Runs inside the api container. Creates an onReceived webhook workflow,
// fires it, and waits until the queued execution succeeds. The API role is
// main (no in-process worker), so success means the worker container ran the job.

const base = "http://127.0.0.1:3000";

const workflow = {
  name: "compose-smoke-webhook",
  active: false,
  nodes: [
    {
      id: "smoke-wh",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      parameters: {
        httpMethod: "POST",
        path: "compose-smoke",
        responseMode: "onReceived",
      },
    },
    {
      id: "smoke-set",
      name: "Tag",
      type: "n8n-nodes-base.set",
      typeVersion: 3,
      position: [240, 0],
      parameters: {
        mode: "manual",
        includeOtherFields: true,
        fields: [{ name: "smoke", type: "stringValue", value: "ok" }],
      },
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Tag", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

async function request(path, init) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init && init.headers) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init && init.method ? init.method : "GET"} ${path} -> ${res.status} ${text}`);
  }
  return body;
}

const created = await request("/api/v1/workflows", {
  method: "POST",
  body: JSON.stringify(workflow),
});
if (!created || !created.id) {
  throw new Error("workflow create did not return an id");
}

await request(`/api/v1/workflows/${created.id}/activate`, {
  method: "PATCH",
  body: JSON.stringify({ active: true }),
});

const accepted = await request("/webhook/compose-smoke", {
  method: "POST",
  body: JSON.stringify({ ping: true }),
});
const executionId = accepted && accepted.executionId;
if (!executionId) {
  throw new Error(`webhook did not return executionId: ${JSON.stringify(accepted)}`);
}

const deadline = Date.now() + 90_000;
let last = null;
while (Date.now() < deadline) {
  last = await request(`/api/v1/executions/${executionId}`);
  if (last && (last.status === "success" || last.status === "error" || last.status === "cancelled")) {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!last || last.status !== "success") {
  throw new Error(`execution ${executionId} status=${last && last.status} error=${JSON.stringify(last && last.error)}`);
}

console.log(`smoke job success execution=${executionId}`);
