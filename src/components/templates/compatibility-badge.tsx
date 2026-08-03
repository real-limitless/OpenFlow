import { Badge } from "@/components/ui/badge";
import type { CompatLevel } from "@/lib/templates/client";

const LABELS: Record<CompatLevel, string> = {
  ready: "Ready",
  partial: "Partial",
  limited: "Limited",
};

const STYLES: Record<CompatLevel, string> = {
  ready:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400",
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
      title={`OpenFlow node compatibility: ${LABELS[level]}`}
    >
      {LABELS[level]}
    </Badge>
  );
}
