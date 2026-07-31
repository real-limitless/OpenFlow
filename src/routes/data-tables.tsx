import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateTableDialog } from "@/components/data-tables";
import type { DataTableMeta } from "@/lib/data-tables/types";

export const Route = createFileRoute("/data-tables")({
  head: () => ({
    meta: [
      { title: "Data Tables — OpenFlow" },
      {
        name: "description",
        content: "Browse and edit stored data tables.",
      },
    ],
  }),
  component: DataTablesPage,
});

function DataTablesPage() {
  const [list, setList] = useState<DataTableMeta[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const refresh = useCallback((q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    void fetch(`/api/v1/data-tables${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json() as Promise<DataTableMeta[]>;
      })
      .then(setList)
      .catch(() => {
        toast.error("Could not load data tables");
        setList([]);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(query), 200);
    return () => clearTimeout(t);
  }, [query, refresh]);

  const empty = useMemo(() => list !== null && list.length === 0, [list]);

  const remove = async (t: DataTableMeta) => {
    if (!confirm(`Delete table “${t.name}” and all of its rows?`)) return;
    const res = await fetch(`/api/v1/data-tables/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Table deleted");
    refresh(query);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to workflows
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Table2 className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data tables</h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
            Store tabular data in the database. Create tables, define columns, and edit rows here.
            Workflow nodes can read and write these tables.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New table
        </Button>
      </div>

      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tables…"
          className="h-9 pl-9"
        />
      </div>

      <section className="mt-6">
        {list === null ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : empty ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-[14px] text-muted-foreground">
              {query.trim() ? "No tables match your search." : "No data tables yet."}
            </p>
            {!query.trim() && (
              <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
                Create your first table
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate({ to: "/data-tables/$id", params: { id: t.id } })}
                >
                  <p className="truncate text-[14px] font-medium">{t.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {t.columns.length} column{t.columns.length === 1 ? "" : "s"}
                    <span className="mx-1.5 text-border">·</span>
                    {t.rowCount} row{t.rowCount === 1 ? "" : "s"}
                  </p>
                </button>
                <p className="text-[11px] text-muted-foreground">
                  {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => void remove(t)}
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateTableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(table) => {
          navigate({ to: "/data-tables/$id", params: { id: table.id } });
        }}
      />
    </main>
  );
}
