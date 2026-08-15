import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/auth/client";

const TTL_OPTIONS = [
  { label: "1 hour", sec: 3600 },
  { label: "24 hours", sec: 86400 },
  { label: "7 days", sec: 604800 },
  { label: "30 days", sec: 2592000 },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  workflowName: string;
};

export function McpShareDialog({ open, onOpenChange, workflowId, workflowName }: Props) {
  const [canWrite, setCanWrite] = useState(true);
  const [canExecute, setCanExecute] = useState(true);
  const [ttl, setTtl] = useState(86400);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    token: string;
    mcpUrl: string;
    expiresAt: string;
  } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/workflows/${workflowId}/mcp-access`, {
        method: "POST",
        body: JSON.stringify({
          canRead: true,
          canWrite,
          canExecute,
          expiresInSec: ttl,
          name: `${workflowName} chatbot`,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(b.error ?? "Failed to create access token");
        return;
      }
      const body = (await res.json()) as {
        token: string;
        mcpUrl: string;
        expiresAt: string;
      };
      setResult(body);
      toast.success("Temporary MCP token created");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const clientJson =
    result &&
    JSON.stringify(
      {
        mcpServers: {
          openflow: {
            url: result.mcpUrl,
            headers: {
              Authorization: `Bearer ${result.token}`,
            },
          },
        },
      },
      null,
      2,
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setResult(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with AI (MCP)</DialogTitle>
          <DialogDescription>
            Mint a temporary token so an external chatbot can only access{" "}
            <strong>{workflowName}</strong> until it expires.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label>Allow edit (write)</Label>
              <Switch checked={canWrite} onCheckedChange={setCanWrite} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Allow run (execute)</Label>
              <Switch checked={canExecute} onCheckedChange={setCanExecute} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires in</Label>
              <div className="flex flex-wrap gap-2">
                {TTL_OPTIONS.map((o) => (
                  <Button
                    key={o.sec}
                    type="button"
                    size="sm"
                    variant={ttl === o.sec ? "default" : "outline"}
                    onClick={() => setTtl(o.sec)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => void generate()}>
              {busy ? "Creating…" : "Generate token"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2 text-[13px]">
            <p className="text-amber-700 dark:text-amber-400">
              Copy now — the token is shown once. Expires{" "}
              {new Date(result.expiresAt).toLocaleString()}.
            </p>
            <div>
              <Label className="text-[11px] text-muted-foreground">Token</Label>
              <div className="mt-1 flex gap-2">
                <code className="min-w-0 flex-1 break-all rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  {result.token}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copy(result.token, "Token")}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">MCP URL</Label>
              <div className="mt-1 flex gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  {result.mcpUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copy(result.mcpUrl, "URL")}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            {clientJson && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Client config</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => void copy(clientJson, "Config")}
                  >
                    Copy JSON
                  </Button>
                </div>
                <pre className="mt-1 max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-[10px]">
                  {clientJson}
                </pre>
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setResult(null);
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
