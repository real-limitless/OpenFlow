import { Badge } from "@/components/ui/badge";
import type { CompatLevel } from "@/lib/templates/client";

const LABELS: Record<CompatLevel, string> = {
  ready: "Ready",
  partial: "Partial",
  limited: "Stub",
};

const STYLES: Record<CompatLevel, string> = {
  ready:
    "border-success/30 bg-success/10 text-success",
  partial:
    "border-warning/30 bg-warning/10 text-warning",
  limited:
    "border-border bg-muted text-muted-foreground",
};

export function CompatibilityBadge({
  level,
  className = "",
}: {
  level: CompatLevel;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-medium ${STYLES[level]} ${className}`}
      title={`Executor depth: ${LABELS[level]}`}
    >
      {LABELS[level]}
    </Badge>
  );
}
