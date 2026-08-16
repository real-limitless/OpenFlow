import { prisma } from "../db";
import {
  applyStaleLlmFailure,
  inspectStaleLlm,
  STREAM_FIRST_CHUNK_MS,
} from "../../lib/engine/llm-silence";
import { notifyExecutionFinished } from "./workflow-events";

type ExecutionRow = {
  id: string;
  workflowId: string;
  status: string;
  mode: string;
  startedAt: Date;
  finishedAt: Date | null;
  runData: string;
  error: string | null;
};

function parseRunData(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export async function failStaleLlmIfNeeded<T extends ExecutionRow>(row: T): Promise<T> {
  if (row.status !== "running") return row;
  const runData = parseRunData(row.runData);
  const found = inspectStaleLlm(runData, row.startedAt.toISOString());
  if (!found.stale) return row;
  const nextRunData = applyStaleLlmFailure(runData, found.message);
  const updated = await prisma.execution.update({
    where: { id: row.id },
    data: {
      status: "error",
      finishedAt: new Date(),
      runData: JSON.stringify(nextRunData),
      error: JSON.stringify({ message: found.message }),
    },
  });
  notifyExecutionFinished(row.workflowId, row.id, "error", row.mode);
  return { ...row, ...updated } as T;
}

export async function failStaleLlmList<T extends ExecutionRow>(rows: T[]): Promise<T[]> {
  const now = Date.now();
  const out: T[] = [];
  for (const row of rows) {
    if (row.status === "running" && now - row.startedAt.getTime() > STREAM_FIRST_CHUNK_MS) {
      out.push(await failStaleLlmIfNeeded(row));
    } else {
      out.push(row);
    }
  }
  return out;
}
