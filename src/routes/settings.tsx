import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { RateLimitSettingsPanel } from "@/components/settings/rate-limit-settings-panel";
import { SecurityHeadersPanel } from "@/components/settings/security-headers-panel";
import { WorkerRuntimePanel } from "@/components/settings/worker-runtime-panel";
import { WebhookSettingsPanel } from "@/components/settings/webhook-settings-panel";
import { ExecutionGovernancePanel } from "@/components/settings/execution-governance-panel";
import { DlqPanel } from "@/components/settings/dlq-panel";
import { InviteAdminPanel } from "@/components/settings/invite-admin-panel";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { HitlInboxPanel } from "@/components/settings/hitl-inbox-panel";
import { ObservabilityPanel } from "@/components/settings/observability-panel";
import { RetentionPanel } from "@/components/settings/retention-panel";
import { CircuitBreakerPanel } from "@/components/settings/circuit-breaker-panel";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — OpenFlow" }] }),
  component: SettingsLayout,
});

const LINKS = [
  { to: "/settings", label: "Overview", exact: true },
  { to: "/settings/api-keys", label: "API keys" },
  { to: "/settings/mcp", label: "MCP" },
  { to: "/settings/mcp-flow", label: "mcp-flow" },
  { to: "/settings/environments", label: "Environments" },
  { to: "/settings/secret-providers", label: "Secret providers" },
  { to: "/settings/templates", label: "Templates" },
  { to: "/settings/code", label: "Code node" },
  { to: "/settings/logs", label: "Logs" },
] as const;

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = pathname === "/settings" || pathname === "/settings/";

  return (
    <PageShell maxWidth="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <nav className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {LINKS.map((l) => {
          const active = "exact" in l && l.exact ? isIndex : pathname.startsWith(l.to);
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-md px-3 py-1.5 text-[13px] ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6">{isIndex ? <SettingsOverview /> : <Outlet />}</div>
    </PageShell>
  );
}

function SettingsOverview() {
  return (
    <div className="space-y-6 text-[14px] text-muted-foreground">
      <InviteAdminPanel />
      <AuditLogPanel />
      <HitlInboxPanel />
      <ObservabilityPanel />
      <RetentionPanel />
      <CircuitBreakerPanel />
      <RateLimitSettingsPanel />
      <WorkerRuntimePanel />
      <ExecutionGovernancePanel />
      <DlqPanel />
      <SecurityHeadersPanel />
      <WebhookSettingsPanel />
      <div className="space-y-3">
      <p>Manage instance and project operations for OpenFlow enterprise features.</p>
      <ul className="list-inside list-disc space-y-1">
        <li>
          <Link to="/settings/api-keys" className="text-primary hover:underline">
            API keys
          </Link>{" "}
          — machine access with of_… tokens
        </li>
        <li>
          <Link to="/settings/mcp" className="text-primary hover:underline">
            MCP
          </Link>{" "}
          — remote MCP URL, OAuth, and enable toggle for third-party chatbots
        </li>
        <li>
          <Link to="/settings/mcp-flow" className="text-primary hover:underline">
            mcp-flow
          </Link>{" "}
          — connect an mcp-flow agent key and list gateway backends for AI Agent tools
        </li>
        <li>
          <Link to="/settings/environments" className="text-primary hover:underline">
            Environments
          </Link>{" "}
          — dev / staging / prod for the current project
        </li>
        <li>
          <Link to="/settings/secret-providers" className="text-primary hover:underline">
            Secret providers
          </Link>{" "}
          — Vault / AWS Secrets Manager backends
        </li>
        <li>
          <Link to="/settings/templates" className="text-primary hover:underline">
            Templates
          </Link>{" "}
          — marketplace libraries (default n8n-workflow-library + your repos)
        </li>
        <li>
          <Link to="/settings/code" className="text-primary hover:underline">
            Code node
          </Link>{" "}
          — Python import allowlist for the Code node
        </li>
        <li>
          <Link to="/settings/logs" className="text-primary hover:underline">
            Logs
          </Link>{" "}
          — recent structured application logs
        </li>
      </ul>
      </div>
    </div>
  );
}
