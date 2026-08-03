import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, Eye, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { CompatibilityBadge } from "@/components/templates/compatibility-badge";
import { ImportTemplateButton } from "@/components/templates/import-template-button";
import {
  fetchTemplate,
  formatViews,
  type TemplateDetail,
} from "@/lib/templates/client";

// Pathless-prefix `_` keeps this a flat sibling of `/templates` (not a nested child).
// Same pattern as `data-tables_.$id.tsx` — parent list route has no <Outlet />.
export const Route = createFileRoute("/templates_/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Template ${params.id} — OpenFlow` }],
  }),
  component: TemplateDetailPage,
});

function TemplateDetailPage() {
  const { id } = Route.useParams();
  const [tpl, setTpl] = useState<TemplateDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTpl(undefined);
    setError(null);
    void fetchTemplate(id)
      .then(setTpl)
      .catch((e: Error) => {
        setError(e.message);
        setTpl(null);
      });
  }, [id]);

  if (tpl === undefined) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-24 animate-pulse rounded bg-muted" />
      </PageShell>
    );
  }

  if (!tpl || error) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <Link
          to="/templates"
          search={{}}
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All templates
        </Link>
        <p className="mt-8 text-sm text-destructive">{error ?? "Not found"}</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-4xl">
      <Link
        to="/templates"
        search={{}}
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All templates
      </Link>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        {tpl.imageUrl ? (
          <img
            src={tpl.imageUrl}
            alt=""
            className="max-h-72 w-full object-cover"
          />
        ) : (
          <div className="flex h-40 items-center justify-center bg-gradient-to-br from-violet-600/40 to-slate-900/80 px-6">
            <h1 className="text-center text-xl font-semibold text-white drop-shadow">
              {tpl.name}
            </h1>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CompatibilityBadge level={tpl.compatibility.level} />
            {tpl.categories.map((c) => (
              <span
                key={c}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {tpl.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" />
              {formatViews(tpl.views)} views
            </span>
            <span className="inline-flex items-center gap-1">
              <Boxes className="size-3.5" />
              {tpl.nodeCount} nodes
            </span>
            {tpl.authorName && (
              <span className="inline-flex items-center gap-1.5">
                {tpl.authorAvatar && (
                  <img
                    src={tpl.authorAvatar}
                    alt=""
                    className="size-5 rounded-full object-cover"
                  />
                )}
                {tpl.authorName}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <ImportTemplateButton templateId={tpl.id} />
          {tpl.sourceUrl && (
            <a
              href={tpl.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Public source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>

      {tpl.description && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">About</h2>
          <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {tpl.description}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">
            Supported nodes ({tpl.compatibility.supportedCount})
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {tpl.compatibility.supported.length === 0 ? (
              <span className="text-[12px] text-muted-foreground">None scored</span>
            ) : (
              tpl.compatibility.supported.map((t) => (
                <code
                  key={t}
                  className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300"
                >
                  {t.replace(/^n8n-nodes-base\./, "").replace(/^@n8n\/n8n-nodes-langchain\./, "lc:")}
                </code>
              ))
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">
            Missing in OpenFlow ({tpl.compatibility.missingCount})
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {tpl.compatibility.missing.length === 0 ? (
              <span className="text-[12px] text-muted-foreground">
                All scored nodes are available
              </span>
            ) : (
              tpl.compatibility.missing.map((t) => (
                <code
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {t.replace(/^n8n-nodes-base\./, "").replace(/^@n8n\/n8n-nodes-langchain\./, "lc:")}
                </code>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
        <ImportTemplateButton templateId={tpl.id} />
        <Button variant="outline" asChild>
          <Link to="/templates" search={{}}>Browse more</Link>
        </Button>
      </div>
    </PageShell>
  );
}
