export type RuntimeReportTarget = {
  url: string;
  token: string;
  workflowId: string;
  host?: string;
  stageId?: string;
  projectId?: string;
  fingerprint?: string;
};

export type RuntimeReportResult = {
  success: boolean;
  runData: unknown;
  error?: { message: string } | string | null;
  startedAt?: string;
  finishedAt?: string | null;
};

export type ReportRuntimeExecutionOptions = {
  target: RuntimeReportTarget;
  result: RuntimeReportResult;
  executionId?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Best-effort POST/PATCH of a headless run into OpenFlow History.
 * Never throws — returns null on network / 4xx so createRuntime().run() stays embeddable.
 */
export async function reportRuntimeExecution(
  opts: ReportRuntimeExecutionOptions,
): Promise<{ id: string } | null> {
  const { target, result, executionId } = opts;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!target.url || !target.token || !target.workflowId) return null;

  const origin = target.url.replace(/\/+$/, "");
  const status = result.success ? "success" : "error";
  const body = {
    status,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt ?? new Date().toISOString(),
    runData: result.runData ?? {},
    error: result.error ?? (result.success ? null : { message: "runtime run failed" }),
    host: target.host,
    stageId: target.stageId,
    projectId: target.projectId,
    fingerprint: target.fingerprint,
  };

  const href = executionId
    ? `${origin}/api/v1/executions/${executionId}`
    : `${origin}/api/v1/workflows/${target.workflowId}/executions`;

  try {
    const res = await fetchImpl(href, {
      method: executionId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return json.id ? { id: json.id } : null;
  } catch {
    return null;
  }
}
