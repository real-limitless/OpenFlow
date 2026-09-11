import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEPTH_LABEL, type NodeDepth } from "@/lib/nodes/depth";

const STYLES: Record<NodeDepth, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  stub: "border-border bg-muted text-muted-foreground",
};

export function DepthBadge({
  depth,
  className = "",
}: {
  depth: NodeDepth;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-depth={depth}
      className={cn("h-4 shrink-0 px-1 text-[9px] font-medium", STYLES[depth], className)}
      title={`Executor depth: ${DEPTH_LABEL[depth]}`}
    >
      {DEPTH_LABEL[depth]}
    </Badge>
  );
}
