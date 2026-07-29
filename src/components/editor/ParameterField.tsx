import { Fragment, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type {
  INodeProperties,
  INodePropertyCollectionEntry,
  INodePropertyOption,
} from "@/lib/nodes/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpressionField } from "./ExpressionField";
import type { ExpressionContext } from "@/lib/expressions/evaluate";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";

type Values = Record<string, unknown>;

export function shouldDisplay(prop: INodeProperties, values: Values): boolean {
  const opts = prop.displayOptions;
  if (!opts) return true;
  const matches = (rules: Record<string, Array<string | number | boolean>>) =>
    Object.entries(rules).every(([key, allowed]) =>
      allowed.some((v) => String(values[key]) === String(v)),
    );
  if (opts.show && !matches(opts.show)) return false;
  if (opts.hide && matches(opts.hide)) return false;
  return true;
}

interface FieldProps {
  prop: INodeProperties;
  value: unknown;
  values: Values;
  onChange: (value: unknown) => void;
  context: ExpressionContext;
}

function isOptionList(options: INodeProperties["options"]): options is INodePropertyOption[] {
  return Array.isArray(options) && options.length > 0 && "value" in options[0];
}

export function ParameterField({ prop, value, onChange, context }: FieldProps) {
  switch (prop.type) {
    case "notice":
      return (
        <p className="rounded-md border border-border/70 bg-surface/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
          {prop.displayName}
        </p>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
          <div>
            <Label className="text-[13px]">{prop.displayName}</Label>
            {prop.description && (
              <p className="text-[11px] text-muted-foreground">{prop.description}</p>
            )}
          </div>
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
        </div>
      );

    case "number":
      return (
        <FieldShell prop={prop}>
          <Input
            type="number"
            value={value === undefined || value === null ? "" : String(value)}
            min={prop.typeOptions?.minValue}
            max={prop.typeOptions?.maxValue}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-9 text-[13px]"
          />
        </FieldShell>
      );

    case "dateTime":
      return (
        <FieldShell prop={prop}>
          <Input
            type="datetime-local"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 text-[13px]"
          />
        </FieldShell>
      );

    case "options":
      return (
        <FieldShell prop={prop}>
          <Select
            value={String(value ?? "")}
            onValueChange={(v) => {
              const opts = isOptionList(prop.options) ? prop.options : [];
              const match = opts.find((o) => String(o.value) === v);
              onChange(match ? match.value : v);
            }}
          >
            <SelectTrigger className="h-9 w-full text-[13px]">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {isOptionList(prop.options) &&
                prop.options.map((o) => (
                  <SelectItem key={String(o.value)} value={String(o.value)}>
                    {o.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FieldShell>
      );

    case "multiOptions": {
      const selected = Array.isArray(value) ? (value as unknown[]).map(String) : [];
      return (
        <FieldShell prop={prop}>
          <div className="space-y-1.5 rounded-md border border-border bg-background/40 p-2.5">
            {isOptionList(prop.options) &&
              prop.options.map((o) => (
                <label key={String(o.value)} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={selected.includes(String(o.value))}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked
                          ? [...selected, String(o.value)]
                          : selected.filter((s) => s !== String(o.value)),
                      )
                    }
                  />
                  {o.name}
                </label>
              ))}
          </div>
        </FieldShell>
      );
    }

    case "json":
      return (
        <FieldShell prop={prop}>
          <ExpressionField
            value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
            onChange={onChange}
            context={context}
            rows={6}
            language="json"
          />
        </FieldShell>
      );

    case "resourceLocator": {
      const rl = (value ?? { mode: "id", value: "" }) as { mode?: string; value?: string };
      return (
        <FieldShell prop={prop}>
          <div className="flex gap-2">
            <Select value={rl.mode ?? "id"} onValueChange={(mode) => onChange({ ...rl, mode })}>
              <SelectTrigger className="h-9 w-28 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">By ID</SelectItem>
                <SelectItem value="url">By URL</SelectItem>
                <SelectItem value="list">From list</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={rl.value ?? ""}
              onChange={(e) => onChange({ ...rl, value: e.target.value })}
              className="h-9 flex-1 text-[13px]"
            />
          </div>
        </FieldShell>
      );
    }

    case "workflowSelect":
      return <WorkflowSelectField prop={prop} value={value} onChange={onChange} />;

    case "collection": {
      const current = (value ?? {}) as Values;
      const available = (prop.options ?? []) as INodeProperties[];
      const unused = available.filter((o) => !(o.name in current));
      const active = available.filter((o) => o.name in current);
      return (
        <FieldShell prop={prop}>
          <div className="space-y-2 rounded-md border border-border bg-background/40 p-2.5">
            {active.length === 0 && (
              <div className="rounded-md border border-dashed border-border/70 px-3 py-3 text-center">
                <p className="text-[12px] font-medium text-foreground">No options set</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Add an option from the menu below.
                </p>
              </div>
            )}
            {active.map((o) => (
              <div key={o.name} className="flex items-start gap-2 border-l-2 border-border/50 pl-2">
                <div className="flex-1">
                  <ParameterField
                    prop={o}
                    value={current[o.name]}
                    values={current}
                    context={context}
                    onChange={(v) => onChange({ ...current, [o.name]: v })}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mt-5 size-7 text-muted-foreground"
                  onClick={() => {
                    const next = { ...current };
                    delete next[o.name];
                    onChange(next);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {unused.length > 0 && (
              <Select
                value=""
                onValueChange={(name) => {
                  const opt = available.find((o) => o.name === name);
                  onChange({ ...current, [name]: opt?.default });
                }}
              >
                <SelectTrigger className="h-8 w-full text-[12px]">
                  <Plus className="mr-1.5 size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Add option…" />
                </SelectTrigger>
                <SelectContent>
                  {unused.map((o) => (
                    <SelectItem key={o.name} value={o.name}>
                      {o.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </FieldShell>
      );
    }

    case "fixedCollection": {
      const entries = (prop.options ?? []) as INodePropertyCollectionEntry[];
      const current = (value ?? {}) as Record<string, Values[]>;
      const moveRow = (entryName: string, from: number, to: number) => {
        const rows = [...(current[entryName] ?? [])];
        if (to < 0 || to >= rows.length) return;
        [rows[from], rows[to]] = [rows[to], rows[from]];
        onChange({ ...current, [entryName]: rows });
      };
      return (
        <FieldShell prop={prop}>
          <div className="space-y-3">
            {entries.map((entry) => {
              const rows = Array.isArray(current[entry.name]) ? current[entry.name] : [];
              return (
                <div key={entry.name} className="space-y-2">
                  {rows.map((row, i) => (
                    <FixedCollectionRow
                      key={i}
                      entry={entry}
                      row={row}
                      index={i}
                      total={rows.length}
                      context={context}
                      onMove={(from, to) => moveRow(entry.name, from, to)}
                      onRemove={() =>
                        onChange({
                          ...current,
                          [entry.name]: rows.filter((_, idx) => idx !== i),
                        })
                      }
                      onFieldChange={(fieldName, v) =>
                        onChange({
                          ...current,
                          [entry.name]: rows.map((r, idx) =>
                            idx === i ? { ...r, [fieldName]: v } : r,
                          ),
                        })
                      }
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-[12px]"
                    onClick={() =>
                      onChange({
                        ...current,
                        [entry.name]: [
                          ...rows,
                          Object.fromEntries(entry.values.map((v) => [v.name, v.default])),
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 size-3.5" /> Add {entry.displayName}
                  </Button>
                </div>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    case "string":
    default: {
      const rows = prop.typeOptions?.rows ?? 1;
      if (prop.typeOptions?.editor === "code") {
        return (
          <FieldShell prop={prop}>
            <ExpressionField
              value={typeof value === "string" ? value : ""}
              onChange={onChange}
              context={context}
              rows={rows}
              alwaysCode
            />
          </FieldShell>
        );
      }
      if (prop.noDataExpression) {
        return (
          <FieldShell prop={prop}>
            <Input
              value={typeof value === "string" ? value : ""}
              placeholder={prop.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 text-[13px]"
            />
          </FieldShell>
        );
      }
      return (
        <FieldShell prop={prop}>
          <ExpressionField
            value={typeof value === "string" ? value : String(value ?? "")}
            onChange={onChange}
            context={context}
            placeholder={prop.placeholder}
            rows={rows}
          />
        </FieldShell>
      );
    }
  }
}

function FixedCollectionRow({
  entry,
  row,
  index,
  total,
  context,
  onMove,
  onRemove,
  onFieldChange,
}: {
  entry: INodePropertyCollectionEntry;
  row: Values;
  index: number;
  total: number;
  context: ExpressionContext;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onFieldChange: (fieldName: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-background/40 p-2.5">
        <div className="flex items-center gap-1.5">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground"
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </Button>
          </CollapsibleTrigger>
          <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
            {index + 1}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {entry.displayName}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground disabled:opacity-30"
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground disabled:opacity-30"
              disabled={index === total - 1}
              onClick={() => onMove(index, index + 1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <div className="mt-2 space-y-2 border-l border-border/60 pl-3">
            {entry.values.map((sub) => (
              <Fragment key={sub.name}>
                {shouldDisplay(sub, row) && (
                  <ParameterField
                    prop={sub}
                    value={row[sub.name] ?? sub.default}
                    values={row}
                    context={context}
                    onChange={(v) => onFieldChange(sub.name, v)}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

type WorkflowListItem = { id: string; name: string; active?: boolean; nodeCount?: number };

function coerceWorkflowSelectValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.value != null) return String(o.value);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function WorkflowSelectField({
  prop,
  value,
  onChange,
}: {
  prop: INodeProperties;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const currentWorkflowId = useWorkflowStore((s) => s.workflow.id);
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selected = coerceWorkflowSelectValue(value);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/workflows")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load workflows (${res.status})`);
        return res.json() as Promise<WorkflowListItem[]>;
      })
      .then((list) => {
        if (cancelled) return;
        setWorkflows(Array.isArray(list) ? list : []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choices = workflows.filter((w) => w.id !== currentWorkflowId);
  const missingSelection =
    selected && !choices.some((w) => w.id === selected) && !workflows.some((w) => w.id === selected);

  return (
    <FieldShell prop={prop}>
      <Select
        value={selected || undefined}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
        disabled={loading}
      >
        <SelectTrigger className="h-9 w-full text-[13px]">
          <SelectValue placeholder={loading ? "Loading workflows…" : "Select a workflow…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {choices.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">{w.id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!loading && !error && choices.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No other saved workflows. Create and save a child workflow first (e.g. with When Executed
          by Another Workflow).
        </p>
      )}
      {missingSelection && (
        <p className="text-[11px] text-[var(--warning)]">
          Saved id <span className="font-mono">{selected}</span> was not found in the database.
          Pick a workflow from the list.
        </p>
      )}
      {selected && !missingSelection && (
        <p className="font-mono text-[10px] text-muted-foreground">id: {selected}</p>
      )}
    </FieldShell>
  );
}

function FieldShell({ prop, children }: { prop: INodeProperties; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label
        className={cn(
          "text-[13px]",
          prop.required && "after:ml-0.5 after:text-destructive after:content-['*']",
        )}
      >
        {prop.displayName}
      </Label>
      {children}
      {prop.description && (
        <p className="text-[11px] leading-snug text-muted-foreground">{prop.description}</p>
      )}
    </div>
  );
}
