import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Search, Store, ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TemplateCard } from "@/components/templates/template-card";
import {
  fetchTemplateFacets,
  fetchTemplates,
  type CompatLevel,
  type TemplateListItem,
} from "@/lib/templates/client";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates — OpenFlow" },
      {
        name: "description",
        content:
          "Browse community workflow templates and import them into your OpenFlow project.",
      },
    ],
  }),
  component: TemplatesMarketplace,
  validateSearch: (s: Record<string, unknown>) => {
    const out: {
      q?: string;
      category?: string;
      sort?: "popular" | "recent";
      compat?: CompatLevel | "any";
      page?: number;
    } = {};
    if (typeof s.q === "string" && s.q) out.q = s.q;
    if (typeof s.category === "string" && s.category) out.category = s.category;
    if (s.sort === "recent" || s.sort === "popular") out.sort = s.sort;
    if (s.compat === "ready" || s.compat === "partial" || s.compat === "limited" || s.compat === "any") {
      out.compat = s.compat;
    }
    if (typeof s.page === "string" || typeof s.page === "number") {
      const p = typeof s.page === "number" ? s.page : parseInt(s.page, 10);
      if (Number.isFinite(p) && p > 1) out.page = Math.floor(p);
    }
    return out;
  },
});

function TemplatesMarketplace() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const sort = search.sort === "recent" ? "recent" : "popular";
  const compat = search.compat ?? "any";
  const page = search.page && search.page > 0 ? search.page : 1;
  const [qInput, setQInput] = useState(search.q ?? "");
  const [items, setItems] = useState<TemplateListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 24;

  useEffect(() => {
    setQInput(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    void fetchTemplateFacets()
      .then((f) => setCategories(f.categories.slice(0, 24)))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    void fetchTemplates({
      q: search.q,
      category: search.category,
      sort,
      compat,
      page,
      pageSize,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e: Error) => {
        setError(e.message);
        setItems([]);
      });
  }, [search.q, search.category, sort, compat, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setSearch = (patch: {
    q?: string | undefined;
    category?: string | undefined;
    sort?: "popular" | "recent" | undefined;
    compat?: CompatLevel | "any" | undefined;
    page?: number | undefined;
  }) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        const resetPage =
          patch.q !== undefined ||
          patch.category !== undefined ||
          patch.sort !== undefined ||
          patch.compat !== undefined;
        if (resetPage && patch.page === undefined) {
          delete next.page;
        }
        if (next.page === 1) delete next.page;
        if (next.sort === "popular") delete next.sort;
        if (next.compat === "any") delete next.compat;
        if (!next.q) delete next.q;
        if (!next.category) delete next.category;
        return next;
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell maxWidth="max-w-6xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Store className="size-5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Marketplace
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1.5 max-w-xl text-[14px] text-muted-foreground">
            Browse community workflows and add them to your project. Compatibility
            badges show how many nodes OpenFlow already supports.
          </p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {total > 0 ? `${total.toLocaleString()} templates` : "—"}
        </p>
      </div>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch({ q: qInput.trim() || undefined });
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search templates, apps, nodes…"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-[12px]"
            value={sort}
            onChange={(e) =>
              setSearch({ sort: e.target.value === "recent" ? "recent" : "popular" })
            }
          >
            <option value="popular">Popular</option>
            <option value="recent">Recent</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-[12px]"
            value={compat}
            onChange={(e) =>
              setSearch({
                compat: (e.target.value as CompatLevel | "any") || "any",
              })
            }
          >
            <option value="any">Any compatibility</option>
            <option value="ready">Ready</option>
            <option value="partial">Partial</option>
            <option value="limited">Limited</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </div>
      </form>

      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSearch({ category: undefined })}
            className={`rounded-full px-2.5 py-1 text-[11px] transition ${
              !search.category
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() =>
                setSearch({
                  category: search.category === c.name ? undefined : c.name,
                })
              }
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                search.category === c.name
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.name}
              <span className="ml-1 opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
          <p className="mt-2 text-muted-foreground">
            If the catalog is empty, run{" "}
            <code className="rounded bg-muted px-1 text-[12px]">npm run templates:sync</code>{" "}
            on the server.
          </p>
        </div>
      )}

      {items === null && !error && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      )}

      {items && items.length === 0 && !error && (
        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>No templates match your filters.</p>
          <p className="mt-2">
            Sync scraped workflows with{" "}
            <code className="rounded bg-muted px-1">npm run templates:sync</code>
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <TemplateCard key={item.id} item={item} />
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setSearch({ page: page - 1 })}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="text-[12px] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setSearch({ page: page + 1 })}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      )}

      <p className="mt-12 text-center text-[11px] text-muted-foreground">
        Community templates from public workflow listings. Not affiliated with n8n GmbH.{" "}
        <Link to="/" className="underline-offset-2 hover:underline">
          Back to workflows
        </Link>
      </p>
    </PageShell>
  );
}
