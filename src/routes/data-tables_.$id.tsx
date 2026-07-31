import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Search, Table2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableGrid } from "@/components/data-tables";
import type { DataTableColumn, DataTableDetail } from "@/lib/data-tables/types";
import { mapCsvRowsToColumnIds, parseCsv, toCsv } from "@/lib/data-tables/csv";
import { newColumnId } from "@/lib/data-tables/types";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/data-tables_/$id")({
  head: () => ({
    meta: [
      { title: "Data Table — OpenFlow" },
      { name: "description", content: "View and edit a data table." },
    ],
  }),
  component: DataTableDetailPage,
});

function DataTableDetailPage() {
  const { id } = Route.useParams();
  const [table, setTable] = useState<DataTableDetail | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    void fetch(`/api/v1/data-tables/${id}?${params}`)
      .then(async (res) => {
        if (res.status === 404) {
          setTable(null);
          return;
        }
        if (!res.ok) throw new Error("Failed");
        return res.json() as Promise<DataTableDetail>;
      })
      .then((data) => {
        if (data) {
          setTable(data);
          setNameDraft(data.name);
        }
      })
      .catch(() => {
        toast.error("Could not load table");
        setTable(null);
      });
  }, [id, query, page]);

  useEffect(() => {
    const t = setTimeout(() => refresh(), 200);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  const saveName = async () => {
    if (!table) return;
    const name = nameDraft.trim();
    if (!name || name === table.name) return;
    const res = await fetch(`/api/v1/data-tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Rename failed");
      setNameDraft(table.name);
      return;
    }
    toast.success("Renamed");
    refresh();
  };

  const saveColumns = async (columns: DataTableColumn[]) => {
    const res = await fetch(`/api/v1/data-tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Could not update columns");
      throw new Error("columns failed");
    }
    refresh();
  };

  const exportCsv = async () => {
    // fetch all rows for export (no limit)
    const res = await fetch(`/api/v1/data-tables/${id}`);
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    const full = (await res.json()) as DataTableDetail;
    const csv = toCsv(full.columns, full.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${full.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "table"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const importCsv = async (file: File) => {
    if (!table) return;
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (headers.length === 0) {
      toast.error("CSV has no header row");
      return;
    }

    let columns = [...table.columns];
    let columnsChanged = false;
    for (const h of headers) {
      if (!columns.some((c) => c.name === h)) {
        columns.push({ id: newColumnId(), name: h, type: "string" });
        columnsChanged = true;
      }
    }
    if (columnsChanged) {
      const res = await fetch(`/api/v1/data-tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      if (!res.ok) {
        toast.error("Could not add columns for CSV import");
        return;
      }
    }

    const payloads = mapCsvRowsToColumnIds(rows, columns);
    if (payloads.length === 0) {
      toast.message("CSV had no data rows");
      refresh();
      return;
    }

    const res = await fetch(`/api/v1/data-tables/${id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloads }),
    });
    if (!res.ok) {
      toast.error("Import failed");
      return;
    }
    toast.success(`Imported ${payloads.length} row${payloads.length === 1 ? "" : "s"}`);
    refresh();
  };

  if (table === undefined) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-14">
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (table === null) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-14">
        <Link
          to="/data-tables"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to data tables
        </Link>
        <p className="mt-8 text-[14px] text-muted-foreground">Table not found.</p>
      </main>
    );
  }

  const totalRows = table.totalRows ?? table.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-14">
      <Link
        to="/data-tables"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to data tables
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Table2 className="size-5 text-primary" />
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-10 max-w-md text-xl font-semibold tracking-tight"
        />
        <p className="font-mono text-[11px] text-muted-foreground">
          {table.columns.length} cols · {table.rowCount} rows
          {query.trim() ? ` · ${totalRows} match` : ""}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
            <Download className="mr-1 size-3.5" /> Export CSV
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="mr-1 size-3.5" /> Import CSV
          </Button>
        </div>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rows…"
          className="h-9 pl-9"
        />
      </div>

      <section className="mt-6">
        <DataTableGrid
          tableId={table.id}
          columns={table.columns}
          rows={table.rows}
          onColumnsChange={saveColumns}
          onRowsChange={refresh}
        />
      </section>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button variant="outline" asChild>
          <Link to="/data-tables">All tables</Link>
        </Button>
      </div>
    </main>
  );
}
