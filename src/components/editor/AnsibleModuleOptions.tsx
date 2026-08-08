import { useEffect, useMemo, useState } from "react";
import { getAnsibleModuleSchema, schemaToProperties } from "@/lib/nodes/ansible/catalog";
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
  const schema: AnsibleModuleSchema | null = useMemo(
    () => getAnsibleModuleSchema(moduleFqcn),
    [moduleFqcn],
  );
  const [mode, setMode] = useState<Mode>(schema ? "form" : "json");

  useEffect(() => {
    setMode(schema ? "form" : "json");
  }, [moduleFqcn, schema]);

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

  const props = useMemo(() => (schema ? schemaToProperties(schema) : []), [schema]);

  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-foreground">Module options</p>
          <p className="text-[11px] text-muted-foreground">
            {schema
              ? schema.shortDescription || schema.fqcn
              : "No schema for this module — edit JSON args."}
          </p>
        </div>
        {schema && (
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

      {mode === "form" && schema ? (
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
          {!props.length && (
            <p className="text-[12px] text-muted-foreground">
              This module has no documented options.
            </p>
          )}
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
