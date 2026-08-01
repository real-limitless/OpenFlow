import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CredentialDialog } from "@/components/credentials";
import { ShareDialog } from "@/components/share/share-dialog";
import { PageShell } from "@/components/layout/page-shell";
import {
  getCredentialTypeDef,
  humanizeType,
  type CredentialMeta,
} from "@/lib/credentials/types";
import { apiFetch } from "@/lib/auth/client";

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
  const [share, setShare] = useState<CredentialMeta | null>(null);

  const refresh = useCallback(() => {
    void apiFetch("/api/v1/credentials?includeUse=1")
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
    const onScope = () => refresh();
    window.addEventListener("openflow:scope-change", onScope);
    return () => window.removeEventListener("openflow:scope-change", onScope);
  }, [refresh]);

  const remove = async (c: CredentialMeta) => {
    if (!confirm(`Delete credential “${c.name}”?`)) return;
    const res = await apiFetch(`/api/v1/credentials/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Credential deleted");
    refresh();
  };

  return (
    <PageShell maxWidth="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <KeyRound className="size-5" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Credentials</h1>
          </div>
          <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
            Secrets are encrypted (or stored in an external provider) and never returned after save.
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
                    <p className="truncate text-[14px] font-medium">
                      {c.name}
                      {c.shared ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          shared
                        </span>
                      ) : null}
                      {c.external || c.secretProviderId ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          external
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {def.displayName || humanizeType(c.type)}
                      <span className="mx-1.5 text-border">·</span>
                      {c.type}
                    </p>
                  </div>
                  {!c.shared && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => setShare(c)}
                        aria-label="Share"
                      >
                        <Share2 className="size-3.5" />
                      </Button>
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
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CredentialDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={() => refresh()} />
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
      {share && (
        <ShareDialog
          open
          onOpenChange={(o) => {
            if (!o) setShare(null);
          }}
          resourceType="credential"
          resourceId={share.id}
          resourceName={share.name}
        />
      )}
    </PageShell>
  );
}
