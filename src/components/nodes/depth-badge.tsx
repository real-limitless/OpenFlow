import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEPTH_LABEL, type NodeDepth } from "@/lib/nodes/depth";

const STYLES: Record<NodeDepth, string> = {
  ready: "border-success/30 bg-success/10 text-success",
  partial: "border-warning/30 bg-warning/10 text-warning",
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
