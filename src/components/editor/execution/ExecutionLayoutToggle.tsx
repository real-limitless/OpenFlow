import { Columns3, GanttChart, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ExecutionLayoutMode } from "./types";

const OPTIONS: { value: ExecutionLayoutMode; label: string; icon: typeof List }[] = [
  { value: "list", label: "List", icon: List },
  { value: "waterfall", label: "Waterfall", icon: GanttChart },
  { value: "kanban", label: "Kanban", icon: Columns3 },
];

export function ExecutionLayoutToggle({
  value,
  onChange,
  className,
}: {
  value: ExecutionLayoutMode;
  onChange: (mode: ExecutionLayoutMode) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        if (v === "list" || v === "waterfall" || v === "kanban") onChange(v);
      }}
      className={cn("gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <ToggleGroupItem
          key={v}
          value={v}
          aria-label={label}
          title={label}
          className="h-7 w-7 px-0 data-[state=on]:bg-accent"
        >
          <Icon className="size-3.5" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
