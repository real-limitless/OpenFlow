import { useEffect, useRef, useState } from "react";
import { Bot, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "./PropertiesPanel";
import { AssistantPanel } from "./AssistantPanel";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ExecutionRunData } from "@/lib/engine/types";

export function EditorRightRail({
  workflowId,
  runData = null,
  onExecutePrevious,
  isExecuting = false,
}: {
  workflowId: string;
  runData?: ExecutionRunData | null;
  onExecutePrevious?: (nodeName: string) => void;
  isExecuting?: boolean;
}) {
  const selected = useWorkflowStore((s) => s.selectedNode);
  const [tab, setTab] = useState<string>("assistant");
  const prevSelected = useRef<string | null>(null);

  useEffect(() => {
    if (selected && selected !== prevSelected.current) {
      setTab("properties");
    }
    prevSelected.current = selected;
  }, [selected]);

  return (
    <aside className="flex h-full w-[380px] min-w-0 shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TabsList className="mx-2 mt-2 grid h-9 w-auto shrink-0 grid-cols-2">
          <TabsTrigger value="properties" className="gap-1 text-[12px]">
            <SlidersHorizontal className="size-3.5" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="assistant" className="gap-1 text-[12px]">
            <Bot className="size-3.5" />
            Assistant
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="properties"
          className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <PropertiesPanel
            embedded
            runData={runData}
            onExecutePrevious={onExecutePrevious}
            isExecuting={isExecuting}
          />
        </TabsContent>
        <TabsContent
          value="assistant"
          className="mt-0 min-h-0 min-w-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <AssistantPanel workflowId={workflowId} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
