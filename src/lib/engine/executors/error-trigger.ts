import type { NodeExecutor } from "@/sdk";

/**
 * Error Trigger — starts an error workflow with failure context.
 * When run as a normal start (tests / manual), emits a structured error payload
 * from pinData or an empty placeholder shape matching public docs.
 */
export const errorTriggerExecutor: NodeExecutor = async (ctx) => {
  const input = ctx.getInputItems(0);
  if (input.length > 0) {
    return [input];
  }

  const workflow = ctx.getWorkflow();
  return [
    [
      {
        json: {
          execution: {
            id: null,
            url: null,
            error: {
              message: "No error context (manual/test run)",
              stack: "",
            },
            lastNodeExecuted: null,
            mode: "manual",
          },
          workflow: {
            id: workflow.id ?? "",
            name: workflow.name ?? "",
          },
        },
      },
    ],
  ];
};
