import { useEffect, useRef, useState } from "react";
import { Bot, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "./PropertiesPanel";
import { AssistantPanel } from "./AssistantPanel";
import { useWorkflowStore } from "@/store/workflow-store";

export function EditorRightRail({ workflowId }: { workflowId: string }) {
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
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-sidebar">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-2 mt-2 grid h-9 w-auto grid-cols-2">
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
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <PropertiesPanel embedded />
        </TabsContent>
        <TabsContent value="assistant" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <AssistantPanel workflowId={workflowId} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
