import { prisma } from "../db";
import { notifyExecutionProgress } from "./workflow-events";
import { serializeRunData } from "./retention";

export async function persistExecutionProgress(
  executionId: string,
  runData: unknown,
): Promise<void> {
  await prisma.execution.update({
    where: { id: executionId },
    data: { runData: await serializeRunData(runData) },
  });
  notifyExecutionProgress(executionId, runData);
}
