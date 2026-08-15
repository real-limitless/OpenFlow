import {
  githubNewIssueUrl,
  openflowRepoBase,
  specBlobUrl,
  toCanonicalType,
  toWireType,
} from "@/lib/nodes/type-ids";

export type IssueDiagnostics = {
  title?: string;
  summary?: string;
  errorMessage?: string;
  errorStack?: string;
  nodeType?: string;
  nodeName?: string;
  nodeDisplayName?: string;
  typeVersion?: number;
  workflowId?: string;
  workflowName?: string;
  route?: string;
  userAgent?: string;
  appVersion?: string;
  extra?: Record<string, unknown>;
};

function appVersion(): string {
  try {
    const env = (import.meta as { env?: Record<string, string> }).env;
    return env?.VITE_APP_VERSION || env?.VITE_GIT_SHA || "dev";
  } catch {
    return "dev";
  }
}

function browserMeta(): Pick<IssueDiagnostics, "userAgent" | "route" | "appVersion"> {
  if (typeof window === "undefined") {
    return { appVersion: appVersion() };
  }
  return {
    userAgent: window.navigator.userAgent,
    route: window.location.pathname + window.location.search,
    appVersion: appVersion(),
  };
}

export function buildIssueBody(d: IssueDiagnostics): string {
  const meta = { ...browserMeta(), ...d };
  const lines: string[] = [
    "## Summary",
    meta.summary?.trim() || "_Describe what went wrong_",
    "",
    "## Steps to reproduce",
    "1. ",
    "2. ",
    "",
    "## Expected",
    "",
    "## Actual",
    meta.errorMessage ? `\`${meta.errorMessage}\`` : "",
    "",
    "## Environment",
    `- OpenFlow: \`${meta.appVersion ?? "unknown"}\``,
    `- Route: \`${meta.route ?? "n/a"}\``,
    `- User agent: \`${meta.userAgent ?? "n/a"}\``,
  ];

  if (meta.workflowId || meta.workflowName) {
    lines.push(
      `- Workflow: \`${meta.workflowName ?? "?"}\` (\`${meta.workflowId ?? "?"}\`)`,
    );
  }

  if (meta.nodeType) {
    const canonical = toCanonicalType(meta.nodeType);
    const wire = toWireType(meta.nodeType);
    lines.push("", "## Node");
    lines.push(`- Display name: \`${meta.nodeDisplayName ?? meta.nodeName ?? "?"}\``);
    lines.push(`- Type (canonical): \`${canonical}\``);
    lines.push(`- Type (wire): \`${wire}\``);
    if (meta.typeVersion != null) lines.push(`- Type version: \`${meta.typeVersion}\``);
    lines.push(`- Spec: ${specBlobUrl(meta.nodeType)}`);
  }

  if (meta.errorStack) {
    lines.push("", "## Stack", "```", meta.errorStack.slice(0, 4000), "```");
  }

  lines.push(
    "",
    "## Attachments",
    "Please attach the downloaded debug bundle (`openflow-debug-*.zip`) if you used **Report issue** from the app.",
    "",
    "---",
    "_Do not include credentials, API keys, or secret variable values._",
  );

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

export function openNodeIssueUrl(opts: {
  nodeType: string;
  nodeName?: string;
  nodeDisplayName?: string;
  typeVersion?: number;
  workflowId?: string;
  workflowName?: string;
}): string {
  const canonical = toCanonicalType(opts.nodeType);
  const title = `[node] ${opts.nodeDisplayName ?? opts.nodeName ?? canonical} (${canonical})`;
  return githubNewIssueUrl({
    title,
    body: buildIssueBody({
      ...opts,
      summary: `Issue with node \`${opts.nodeDisplayName ?? opts.nodeName ?? canonical}\``,
    }),
    labels: ["node", "bug"],
  });
}

export function openGeneralIssueUrl(d: IssueDiagnostics = {}): string {
  const title =
    d.title ||
    (d.errorMessage ? `[bug] ${d.errorMessage.slice(0, 80)}` : "[bug] OpenFlow issue report");
  return githubNewIssueUrl({
    title,
    body: buildIssueBody(d),
    labels: ["bug"],
  });
}

export function openflowIssuesHome(): string {
  return `${openflowRepoBase()}/issues`;
}
