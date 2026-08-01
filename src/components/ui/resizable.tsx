import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      // Base: thin line + expanded hit target (after:) so drag is easy
      "relative flex w-px items-center justify-center bg-border",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
      "cursor-col-resize",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      // Vertical groups: full-width strip, row-resize cursor
      "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
      "data-[panel-group-direction=vertical]:cursor-row-resize",
      "data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-3",
      "data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2",
      "data-[panel-group-direction=vertical]:after:translate-x-0",
      "hover:bg-primary/40 active:bg-primary/60 transition-colors",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <>
        {/* Horizontal group: vertical pill grip */}
        <div
          className={cn(
            "z-10 hidden h-8 w-1.5 items-center justify-center rounded-full",
            "border border-border/80 bg-muted shadow-sm",
            "group-data-[panel-group-direction=horizontal]/block",
            "[[data-panel-group-direction=horizontal]_&]:flex",
          )}
          aria-hidden
        >
          <span className="flex h-4 flex-col items-center justify-center gap-0.5">
            <span className="size-0.5 rounded-full bg-muted-foreground/70" />
            <span className="size-0.5 rounded-full bg-muted-foreground/70" />
            <span className="size-0.5 rounded-full bg-muted-foreground/70" />
          </span>
        </div>
        {/* Vertical group: horizontal drag bar (looks grabable, not an icon badge) */}
        <div
          className={cn(
            "z-10 flex h-1.5 w-10 items-center justify-center rounded-full",
            "border border-border/80 bg-muted shadow-sm",
            "pointer-events-none",
          )}
          aria-hidden
        >
          <span className="flex items-center gap-0.5">
            <span className="size-0.5 rounded-full bg-muted-foreground/80" />
            <span className="size-0.5 rounded-full bg-muted-foreground/80" />
            <span className="size-0.5 rounded-full bg-muted-foreground/80" />
          </span>
        </div>
      </>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
