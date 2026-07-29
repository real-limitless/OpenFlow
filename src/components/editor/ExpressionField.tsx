import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Braces, Code2, Type as TypeIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EXPRESSION_HELPERS,
  evaluateExpression,
  isExpression,
  type ExpressionContext,
} from "@/lib/expressions/evaluate";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.default })),
);

interface Props {
  value: string;
  onChange: (value: string) => void;
  context: ExpressionContext;
  placeholder?: string;
  rows?: number;
  language?: "javascript" | "json";
  /** Force the expression editor open (used by the Code node). */
  alwaysCode?: boolean;
}

function Preview({ value, context }: { value: string; context: ExpressionContext }) {
  const result = useMemo(() => evaluateExpression(value, context), [value, context]);
  if (result.literal) return null;
  return (
    <div className="rounded-md border border-border bg-background/60 px-2.5 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Preview
      </p>
      <p
        className={cn(
          "mt-0.5 break-all font-mono text-[12px]",
          result.ok ? "text-[var(--success)]" : "text-destructive",
        )}
      >
        {result.ok
          ? typeof result.value === "object"
            ? JSON.stringify(result.value)
            : String(result.value)
          : result.error}
      </p>
    </div>
  );
}

function CodeArea({
  value,
  onChange,
  rows,
  language,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  language: "javascript" | "json";
}) {
  return (
    <ClientOnly
      fallback={
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="font-mono text-[12px]"
        />
      }
    >
      <Suspense
        fallback={
          <div
            className="rounded-md border border-border bg-background"
            style={{ height: rows * 19 + 16 }}
          />
        }
      >
        <div className="overflow-hidden rounded-md border border-border">
          <MonacoEditor
            height={rows * 19 + 16}
            language={language}
            theme="vs-dark"
            value={value}
            onChange={(v) => onChange(v ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "IBM Plex Mono, monospace",
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 8, bottom: 8 },
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </div>
      </Suspense>
    </ClientOnly>
  );
}

export function ExpressionField({
  value,
  onChange,
  context,
  placeholder,
  rows = 3,
  language = "javascript",
  alwaysCode = false,
}: Props) {
  const [mode, setMode] = useState<"fixed" | "expression">(
    isExpression(value) ? "expression" : "fixed",
  );
  const [showHelpers, setShowHelpers] = useState(false);
  const active = alwaysCode ? "expression" : mode;

  if (alwaysCode) {
    return (
      <div className="space-y-2">
        <CodeArea value={value} onChange={onChange} rows={rows} language={language} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="inline-flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setMode("fixed")}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition",
              active === "fixed"
                ? "bg-surface-raised text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TypeIcon className="size-3" /> Fixed
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("expression");
              if (!isExpression(value)) onChange(`={{ ${value ? JSON.stringify(value) : "$json"} }}`);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition",
              active === "expression"
                ? "bg-[var(--expression)]/15 text-[var(--expression)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Code2 className="size-3" /> Expression
          </button>
        </div>
        {active === "expression" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={() => setShowHelpers((s) => !s)}
          >
            <Braces className="mr-1 size-3" /> Helpers
          </Button>
        )}
      </div>

      {active === "fixed" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="min-h-9 resize-y text-[13px]"
        />
      ) : (
        <>
          <CodeArea value={value} onChange={onChange} rows={Math.max(rows, 3)} language="javascript" />
          {showHelpers && (
            <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-border bg-background/60 p-1.5">
              {EXPRESSION_HELPERS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => onChange(`${value}${value.includes("{{") ? "" : "={{ "}${h.label}${value.includes("{{") ? "" : " }}"}`)}
                  className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1 text-left hover:bg-surface"
                >
                  <span className="font-mono text-[11px] text-[var(--expression)]">{h.label}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{h.detail}</span>
                </button>
              ))}
            </div>
          )}
          <Preview value={value} context={context} />
        </>
      )}
    </div>
  );
}
