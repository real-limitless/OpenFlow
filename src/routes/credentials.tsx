import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CredentialDialog } from "@/components/credentials";
import {
  getCredentialTypeDef,
  humanizeType,
  type CredentialMeta,
} from "@/lib/credentials/types";

export const Route = createFileRoute("/credentials")({
  head: () => ({
    meta: [
      { title: "Credentials — OpenFlow" },
      {
        name: "description",
        content: "Manage encrypted credentials used by workflow nodes.",
      },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  const [list, setList] = useState<CredentialMeta[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<CredentialMeta | null>(null);

  const refresh = useCallback(() => {
    void fetch("/api/v1/credentials")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json() as Promise<CredentialMeta[]>;
      })
      .then(setList)
      .catch(() => {
        toast.error("Could not load credentials");
        setList([]);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = async (c: CredentialMeta) => {
    if (!confirm(`Delete credential “${c.name}”? Nodes using it will fail until remapped.`)) {
      return;
    }
    const res = await fetch(`/api/v1/credentials/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Credential deleted");
    refresh();
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
            <KeyRound className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Credentials</h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
            Secrets are encrypted with your server key and never returned after save. Attach them to
            nodes from the editor Credentials tab.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> New credential
        </Button>
      </div>

      <section className="mt-10">
        {list === null ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-[14px] text-muted-foreground">No credentials yet.</p>
            <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
              Create your first credential
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.map((c) => {
              const def = getCredentialTypeDef(c.type);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{c.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {def.displayName || humanizeType(c.type)}
                      <span className="mx-1.5 text-border">·</span>
                      {c.type}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setEdit(c)}
                    aria-label="Edit"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => void remove(c)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CredentialDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => refresh()}
      />
      <CredentialDialog
        open={edit != null}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
        edit={edit}
        onSaved={() => {
          setEdit(null);
          refresh();
        }}
      />
    </main>
  );
}
