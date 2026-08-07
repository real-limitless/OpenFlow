import { defineNode, definitionToExecutor } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

const definition = defineNode({
  type: "n8n-nodes-base.surveyMonkeyTrigger",
  async execute(ctx) {
    const items = ctx.getInputItems(0);

    if (items.length === 0) {
      return [[{ json: {} }]];
    }

    const objectType = ctx.getParam("objectType") as string | undefined;
    const event = ctx.getParam("event") as string | undefined;
    const surveyIds = ctx.getParam("surveyIds") as string[] | undefined;
    const collectorIds = ctx.getParam("collectorIds") as string[] | undefined;
    const resolveData = ctx.getParam("resolveData") as boolean | undefined;
    const onlyAnswers = ctx.getParam("onlyAnswers") as boolean | undefined;

    const out: INodeExecutionData[] = [];

    for (const item of items) {
      const payload = item.json as Record<string, unknown>;
      const eventType = payload.event_type as string | undefined;

      if (event && eventType && eventType !== event) {
        continue;
      }

      const resources = payload.resources as Record<string, unknown> | undefined;

      if (objectType === "survey" && surveyIds && surveyIds.length > 0 && resources) {
        const surveyId = resources.survey_id as string | undefined;
        if (surveyId && !surveyIds.includes(surveyId)) {
          continue;
        }
      }

      if (objectType === "collector" && collectorIds && collectorIds.length > 0 && resources) {
        const collectorId = resources.collector_id as string | undefined;
        if (collectorId && !collectorIds.includes(collectorId)) {
          continue;
        }
      }

      if (resolveData && event === "response_completed" && onlyAnswers) {
        out.push({ json: { answers: (payload as any).answers ?? payload } });
      } else {
        out.push({ json: payload, binary: item.binary });
      }
    }

    return [out];
  },
});

export const surveyMonkeyTriggerExecutor = definitionToExecutor(definition);
