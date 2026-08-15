import { useEffect, useMemo, useState } from "react";
import { schemaHasFormFields, schemaToProperties } from "@/lib/nodes/ansible/catalog-core";
import { fetchAnsibleModuleSchema } from "@/lib/nodes/ansible/client";
import type { AnsibleModuleSchema } from "@/lib/nodes/ansible/types";
import { ParameterField } from "./ParameterField";
import { ExpressionField } from "./ExpressionField";
import type { ExpressionContext } from "@/lib/expressions/evaluate";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "form" | "json";

export function AnsibleModuleOptions({
  moduleFqcn,
  args,
  context,
  onChangeArgs,
}: {
  moduleFqcn: string;
  args: unknown;
  context: ExpressionContext;
  onChangeArgs: (args: Record<string, unknown>) => void;
}) {
  const [schema, setSchema] = useState<AnsibleModuleSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("json");

  useEffect(() => {
    const fqcn = (moduleFqcn ?? "").trim();
    if (!fqcn) {
      setSchema(null);
      setMode("json");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchAnsibleModuleSchema(fqcn)
      .then((s) => {
        if (cancelled) return;
        setSchema(s);
        setMode(schemaHasFormFields(s) ? "form" : "json");
      })
      .catch(() => {
        if (!cancelled) {
          setSchema(null);
          setMode("json");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleFqcn]);

  const argsObj: Record<string, unknown> = useMemo(() => {
    if (args && typeof args === "object" && !Array.isArray(args)) {
      return args as Record<string, unknown>;
    }
    if (typeof args === "string" && args.trim()) {
      try {
        const parsed = JSON.parse(args) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
    return {};
  }, [args]);

  const props = useMemo(
    () => (schema && schemaHasFormFields(schema) ? schemaToProperties(schema) : []),
    [schema],
  );
  const canForm = props.length > 0;

  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-foreground">Module options</p>
          <p className="text-[11px] text-muted-foreground">
            {loading
              ? "Loading schema…"
              : schema
                ? schema.shortDescription || schema.fqcn
                : "No schema for this module — edit JSON args."}
          </p>
        </div>
        {canForm && (
          <div className="flex shrink-0 rounded-md border border-border p-0.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("h-7 px-2 text-[11px]", mode === "form" && "bg-accent")}
              onClick={() => setMode("form")}
            >
              Form
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("h-7 px-2 text-[11px]", mode === "json" && "bg-accent")}
              onClick={() => setMode("json")}
            >
              JSON
            </Button>
          </div>
        )}
      </div>

      {schema?.docUrl && (
        <a
          href={schema.docUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Module docs
        </a>
      )}

      {mode === "form" && canForm ? (
        <div className="space-y-3">
          {props.map((prop) => (
            <ParameterField
              key={prop.name}
              prop={prop}
              value={argsObj[prop.name] ?? prop.default}
              values={argsObj}
              context={context}
              onChange={(v) => onChangeArgs({ ...argsObj, [prop.name]: v })}
              onValuesChange={(patch) => onChangeArgs({ ...argsObj, ...patch })}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-[13px]">Arguments (JSON)</Label>
          <ExpressionField
            value={JSON.stringify(argsObj, null, 2)}
            onChange={(v) => {
              try {
                const parsed = JSON.parse(String(v || "{}")) as unknown;
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                  onChangeArgs(parsed as Record<string, unknown>);
                }
              } catch {
                /* keep previous until valid */
              }
            }}
            context={context}
            language="json"
            rows={10}
          />
        </div>
      )}
    </div>
  );
}
