import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleDashed } from "lucide-react";
import { allNodeTypes } from "@/lib/nodes/registry";
import { EXPRESSION_HELPERS } from "@/lib/expressions/evaluate";

export const Route = createFileRoute("/docs/compatibility")({
  head: () => ({
    meta: [
      { title: "Compatibility matrix — OpenFlow" },
      {
        name: "description",
        content:
          "What OpenFlow supports today: node types, workflow JSON fields, expression helpers, and the clean-room rules behind them.",
      },
      { property: "og:title", content: "Compatibility matrix — OpenFlow" },
      {
        property: "og:description",
        content: "Supported nodes, JSON fields, expressions and clean-room process for OpenFlow.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompatibilityPage,
});

const roadmap = [
  { level: "Level 1 — MVP", done: true, text: "Import, edit and export linear and branching workflows in the visual editor." },
  { level: "Level 2 — Engine", done: false, text: "Execution: branches, merges, wait, binary data, webhooks, schedule, credentials." },
  { level: "Level 3 — Coverage", done: false, text: "Top 50–100 integration nodes with parameter compatibility." },
  { level: "Level 4 — Platform", done: false, text: "Public REST API subset and a community node SDK." },
];

function CompatibilityPage() {
  const nodes = allNodeTypes();

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-14">
      <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Compatibility matrix</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        OpenFlow is an independent, clean-room implementation. It targets the publicly documented
        workflow JSON format and expression syntax so existing exports can be opened, edited and
        saved without loss. It is not affiliated with, endorsed by, or derived from any other
        project’s source code.
      </p>

      <Section title="Roadmap">
        <ul className="space-y-2">
          {roadmap.map((r) => (
            <li key={r.level} className="flex gap-2.5 text-[14px]">
              {r.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              ) : (
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span>
                <span className="font-medium">{r.level}.</span>{" "}
                <span className="text-muted-foreground">{r.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Implemented nodes (${nodes.length})`}>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Node</th>
                <th className="px-3 py-2 font-medium">Type string</th>
                <th className="px-3 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.name} className="border-t border-border">
                  <td className="px-3 py-2">{n.displayName}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{n.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{n.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Any other node type imports as a placeholder: its parameters, credentials and position are
          preserved and re-exported unchanged, and the migration report flags it.
        </p>
      </Section>

      <Section title="Workflow JSON fields">
        <ul className="grid gap-1.5 text-[13px] text-muted-foreground sm:grid-cols-2">
          {[
            "id, name, active, versionId, tags, meta",
            "nodes[]: id, name, type, typeVersion, position, parameters",
            "nodes[]: credentials, disabled, notes, webhookId",
            "connections: per source node, per channel, per output index",
            "Non-main channels (ai_*) preserved and rendered",
            "settings, staticData, pinData",
            "Unmodelled fields preserved verbatim on export",
            "Items shaped as { json, binary? }",
          ].map((t) => (
            <li key={t} className="rounded-md border border-border bg-card px-3 py-2">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Expression helpers available in the editor preview">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {EXPRESSION_HELPERS.map((h) => (
            <div key={h.label} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="font-mono text-[12px] text-[var(--expression)]">{h.label}</p>
              <p className="text-[12px] text-muted-foreground">{h.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          The in-editor evaluator is a preview only. Full evaluation, including item pairing and
          binary data, runs in the server engine planned for the next phase.
        </p>
      </Section>

      <Section title="Clean-room rules">
        <ol className="list-decimal space-y-2 pl-5 text-[14px] text-muted-foreground">
          <li>No other project’s source code is read, cloned, decompiled, or referenced.</li>
          <li>
            Permitted sources only: public documentation, publicly shared workflow exports, observed
            behaviour of a public instance, and third-party service API docs.
          </li>
          <li>Every node records the public documentation URLs it was written from.</li>
          <li>No third-party trademarks are used in the product name or branding.</li>
        </ol>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
