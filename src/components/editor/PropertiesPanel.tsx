import { useEffect, useMemo, useState } from "react";
import { BookOpen, Bug, Copy, ExternalLink, Play, PowerOff, Trash2, TriangleAlert, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { getNodeType } from "@/lib/nodes/registry";
import { ParameterField, shouldDisplay } from "./ParameterField";
import { NodeIcon } from "./BaseNode";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ExpressionContext } from "@/lib/expressions/evaluate";
import type { ExecutionRunData } from "@/lib/engine/types";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { CredentialPicker } from "@/components/credentials";
import { FormTriggerUrls } from "./FormTriggerUrls";
import { isFormTriggerNode } from "@/lib/forms/path";
import { apiFetch } from "@/lib/auth/client";
import { getSelectedEnvironmentId } from "@/lib/environments/client";
import { buildIncoming } from "@/lib/engine/graph";
import { openNodeIssueUrl } from "@/lib/feedback/github-issue";
import { specBlobUrl, toCanonicalType, toWireType } from "@/lib/nodes/type-ids";

export function PropertiesPanel({
  embedded = false,
  runData = null,
  onExecutePrevious,
  isExecuting = false,
}: {
  embedded?: boolean;
  runData?: ExecutionRunData | null;
  onExecutePrevious?: (nodeName: string) => void;
  isExecuting?: boolean;
}) {
  const selected = useWorkflowStore((s) => s.selectedNode);
  const workflow = useWorkflowStore((s) => s.workflow);
  const {
    selectNode,
    updateParameters,
    updateCredentials,
    renameNode,
    deleteNode,
    duplicateNode,
    toggleDisabled,
    setNodeNotes,
  } = useWorkflowStore();
  const node = workflow.nodes.find((n) => n.name === selected);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, unknown>>({});
  const shellClass = embedded
    ? "flex h-full min-h-0 w-full flex-col bg-sidebar"
    : "flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-sidebar";
  const emptyShellClass = embedded
    ? "flex h-full min-h-0 w-full flex-col bg-sidebar"
    : "hidden h-full w-[380px] shrink-0 flex-col border-l border-border bg-sidebar xl:flex";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const envId = getSelectedEnvironmentId();
        const q = new URLSearchParams({ scope: "project", layer: "all" });
        if (envId) q.set("environmentId", envId);
        const res = await apiFetch(`/api/v1/variables?${q}`);
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as Array<{
          key: string;
          value?: unknown;
          secret?: boolean;
          environmentId?: string | null;
        }>;
        const base: Record<string, unknown> = {};
        const env: Record<string, unknown> = {};
        for (const r of rows) {
          if (r.secret) continue;
          const v = r.value;
          if (r.environmentId == null || r.environmentId === "") {
            base[r.key] = v;
          } else if (envId && r.environmentId === envId) {
            env[r.key] = v;
          }
        }
        if (!cancelled) setVars({ ...base, ...env });
      } catch {
        if (!cancelled) setVars({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflow.id]);

  const hasUpstream = useMemo(() => {
    if (!node) return false;
    const incoming = buildIncoming(workflow.connections ?? {});
    return (incoming.get(node.name) ?? []).length > 0;
  }, [workflow.connections, node]);

  const context: ExpressionContext = useMemo(() => {
    const nodeData = mergeNodeSampleData(workflow.pinData, runData);
    const incoming = node
      ? resolveIncomingItems(workflow, node.name, nodeData, runData)
      : [{ json: {} }];
    return {
      json: incoming[0]?.json ?? {},
      allItems: incoming,
      nodeData,
      itemIndex: 0,
      vars,
    };
  }, [workflow, node, runData, vars]);

  if (!node) {
    return (
      <aside className={emptyShellClass}>
        <div className="flex h-full items-center justify-center px-8 text-center">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Select a node to edit its parameters. Fields are generated from the node’s public
            property schema.
          </p>
        </div>
      </aside>
    );
  }

  const description = getNodeType(node.type);
  const parameters = node.parameters ?? {};

  return (
    <aside className={shellClass}>
      <div className="flex items-start gap-2.5 border-b border-border p-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded bg-surface">
          <NodeIcon name={description.icon} className="size-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <Input
            value={nameDraft ?? node.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft != null) renameNode(node.name, nameDraft);
              setNameDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-8 border-transparent bg-transparent px-1 text-[14px] font-medium hover:border-border focus:border-border"
          />
          <p className="px-1 font-mono text-[10px] text-muted-foreground">
            {toCanonicalType(node.type)}
          </p>
        </div>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => selectNode(null)}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px]"
          onClick={() => duplicateNode(node.name)}
        >
          <Copy className="mr-1 size-3.5" /> Duplicate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px]"
          onClick={() => toggleDisabled(node.name)}
        >
          <PowerOff className="mr-1 size-3.5" /> {node.disabled ? "Enable" : "Disable"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => deleteNode(node.name)}
        >
          <Trash2 className="mr-1 size-3.5" /> Delete
        </Button>
        {hasUpstream && onExecutePrevious && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px]"
            disabled={isExecuting}
            onClick={() => onExecutePrevious(node.name)}
            title="Run upstream nodes to feed expression preview"
          >
            <Play className="mr-1 size-3.5" /> Previous
          </Button>
        )}
      </div>

      <Tabs defaultValue="parameters" className="flex min-h-0 flex-1 flex-col">
        <TabsList
          className={`mx-3 mt-3 grid w-auto ${
            (description.credentials?.length ?? 0) > 0 ||
            Object.keys(node.credentials ?? {}).length > 0
              ? "grid-cols-4"
              : "grid-cols-3"
          }`}
        >
          <TabsTrigger value="parameters" className="text-[12px]">
            Parameters
          </TabsTrigger>
          {((description.credentials?.length ?? 0) > 0 ||
            Object.keys(node.credentials ?? {}).length > 0) && (
            <TabsTrigger value="credentials" className="text-[12px]">
              Creds
            </TabsTrigger>
          )}
          <TabsTrigger value="settings" className="text-[12px]">
            Settings
          </TabsTrigger>
          <TabsTrigger value="json" className="text-[12px]">
            JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parameters" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              {description.placeholder && (
                <div className="flex gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
                  <p className="text-[12px] leading-snug text-foreground/85">
                    <span className="font-medium">Not implemented yet.</span> This node’s parameters
                    are preserved verbatim and exported unchanged. Edit them as raw JSON below.
                  </p>
                </div>
              )}

              {description.placeholder ? (
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Raw parameters</Label>
                  <Textarea
                    rows={16}
                    className="font-mono text-[12px]"
                    defaultValue={JSON.stringify(parameters, null, 2)}
                    onBlur={(e) => {
                      try {
                        updateParameters(node.name, JSON.parse(e.target.value));
                      } catch {
                        /* keep previous value on invalid JSON */
                      }
                    }}
                  />
                </div>
              ) : (
                <>
                  {isFormTriggerNode(node) && <FormTriggerUrls node={node} />}
                  {(description.properties ?? [])
                    .filter((prop) => shouldDisplay(prop, parameters))
                    .map((prop) => (
                      <ParameterField
                        key={prop.name}
                        prop={prop}
                        value={parameters[prop.name] ?? prop.default}
                        values={parameters}
                        context={context}
                        onChange={(v) =>
                          updateParameters(node.name, { ...parameters, [prop.name]: v })
                        }
                        onValuesChange={(patch) =>
                          updateParameters(node.name, { ...parameters, ...patch })
                        }
                      />
                    ))}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="credentials" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              <p className="text-[12px] leading-snug text-muted-foreground">
                Secrets are stored encrypted on the server. Pick an existing credential or create
                one. Changes save with the workflow.
              </p>
              {(description.credentials ?? []).map((cred) => (
                <CredentialPicker
                  key={cred.name}
                  credentialType={cred.name}
                  required={cred.required !== false}
                  value={node.credentials?.[cred.name]?.id ?? null}
                  defaultName={node.credentials?.[cred.name]?.name}
                  onChange={(selectedCred) => {
                    const next = { ...(node.credentials ?? {}) };
                    if (!selectedCred) delete next[cred.name];
                    else next[cred.name] = { id: selectedCred.id, name: selectedCred.name };
                    updateCredentials(node.name, Object.keys(next).length ? next : null);
                  }}
                />
              ))}
              {Object.entries(node.credentials ?? {})
                .filter(([type]) => !(description.credentials ?? []).some((c) => c.name === type))
                .map(([type, ref]) => (
                  <CredentialPicker
                    key={type}
                    credentialType={type}
                    value={ref?.id ?? null}
                    defaultName={ref?.name}
                    onChange={(selectedCred) => {
                      const next = { ...(node.credentials ?? {}) };
                      if (!selectedCred) delete next[type];
                      else next[type] = { id: selectedCred.id, name: selectedCred.name };
                      updateCredentials(node.name, Object.keys(next).length ? next : null);
                    }}
                  />
                ))}
              {(description.credentials?.length ?? 0) === 0 &&
                Object.keys(node.credentials ?? {}).length === 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    This node type does not declare credentials.
                  </p>
                )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Notes</Label>
                <Textarea
                  rows={5}
                  className="text-[13px]"
                  value={node.notes ?? ""}
                  onChange={(e) => setNodeNotes(node.name, e.target.value)}
                  placeholder="Why does this node exist?"
                />
              </div>
              <div className="space-y-2 rounded-md border border-border bg-background/40 p-3 text-[12px] text-muted-foreground">
                <p>
                  <span className="text-foreground">Type version:</span> {node.typeVersion}
                </p>
                <p>
                  <span className="text-foreground">Node id:</span>{" "}
                  <span className="font-mono">{node.id}</span>
                </p>
                <p>
                  <span className="text-foreground">Type:</span>{" "}
                  <span className="font-mono break-all">{toCanonicalType(node.type)}</span>
                </p>
                <p>
                  <span className="text-foreground">Alias ID:</span>{" "}
                  <span className="font-mono break-all">{toWireType(node.type)}</span>
                </p>
                <p className="pt-1">
                  <span className="text-foreground">OpenFlow spec: </span>
                  <a
                    href={specBlobUrl(node.type)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 break-all text-primary underline-offset-2 hover:underline"
                  >
                    <BookOpen className="size-3 shrink-0" />
                    View behavioural spec
                    <ExternalLink className="size-3 shrink-0 opacity-70" />
                  </a>
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-full text-[12px]"
                    onClick={() => {
                      window.open(
                        openNodeIssueUrl({
                          nodeType: node.type,
                          nodeName: node.name,
                          nodeDisplayName: description.displayName,
                          typeVersion: node.typeVersion,
                          workflowId: workflow.id,
                          workflowName: workflow.name,
                        }),
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    <Bug className="mr-1.5 size-3.5" />
                    Report issue with this node
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="json" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(node, null, 2)}
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

type SampleItem = { json: Record<string, unknown> };

function itemsFromRunNode(
  runData: ExecutionRunData | null | undefined,
  nodeName: string,
): SampleItem[] | undefined {
  if (!runData?.[nodeName]) return undefined;
  const entry = runData[nodeName];
  if (entry.status !== "success" || !entry.items?.length) return undefined;
  const flat = entry.items.flat().filter(Boolean) as INodeExecutionData[];
  if (!flat.length) return undefined;
  return flat.map((it) => ({ json: (it.json ?? {}) as Record<string, unknown> }));
}

function mergeNodeSampleData(
  pinData: Record<string, INodeExecutionData[]> | undefined,
  runData: ExecutionRunData | null | undefined,
): Record<string, SampleItem[]> {
  const out: Record<string, SampleItem[]> = {};
  if (runData) {
    for (const name of Object.keys(runData)) {
      const items = itemsFromRunNode(runData, name);
      if (items?.length) out[name] = items;
    }
  }
  for (const [k, v] of Object.entries(pinData ?? {})) {
    if (v?.length) {
      out[k] = v.map((it) => ({ json: (it.json ?? {}) as Record<string, unknown> }));
    }
  }
  return out;
}

function resolveIncomingItems(
  workflow: { connections: Record<string, Record<string, Array<Array<{ node: string }> | null>>> },
  nodeName: string,
  nodeData: Record<string, SampleItem[]>,
  runData?: ExecutionRunData | null,
): SampleItem[] {
  for (const [source, channels] of Object.entries(workflow.connections ?? {})) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets?.some((t) => t.node === nodeName)) continue;
        if (nodeData[source]?.length) return nodeData[source]!;
        const fromRun = itemsFromRunNode(runData, source);
        if (fromRun?.length) return fromRun;
      }
    }
  }
  return [{ json: {} }];
}
