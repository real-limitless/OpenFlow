import { prisma } from "../db";
import { notifyExecutionProgress } from "./workflow-events";

export async function persistExecutionProgress(
  executionId: string,
  runData: unknown,
): Promise<void> {
  await prisma.execution.update({
    where: { id: executionId },
    data: { runData: JSON.stringify(runData) },
  });
  notifyExecutionProgress(executionId, runData);
}
