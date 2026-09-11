import { prisma } from "../db";
import type { WorkflowEvent } from "./workflow-events";
import {
  deliverLifecyclePayload,
  mapLifecycleEvent,
  parseLifecycleSubscriptions,
  subscriptionWants,
  type LifecycleDelivery,
  type LifecycleSubscription,
  type InternalWorkflowEvent,
} from "../../lib/lifecycle/webhooks";

export const LIFECYCLE_WEBHOOKS_KEY = "lifecycle.webhooks";

const deliveries: LifecycleDelivery[] = [];
const MAX_DELIVERIES = 50;

let cache: { at: number; value: LifecycleSubscription[] } | null = null;

export function recentLifecycleDeliveries(): LifecycleDelivery[] {
  return [...deliveries].reverse();
}

export function recordLifecycleDeliveryForTests(row: LifecycleDelivery): void {
  deliveries.push(row);
  if (deliveries.length > MAX_DELIVERIES) deliveries.shift();
}

export async function getLifecycleSubscriptions(): Promise<LifecycleSubscription[]> {
  const now = Date.now();
  if (cache && now - cache.at < 3000) return cache.value;
  let stored: unknown;
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: LIFECYCLE_WEBHOOKS_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  const value = parseLifecycleSubscriptions(stored);
  cache = { at: now, value };
  return value;
}

export async function setLifecycleSubscriptions(
  rows: unknown,
): Promise<LifecycleSubscription[]> {
  const value = parseLifecycleSubscriptions(rows);
  await prisma.instanceSetting.upsert({
    where: { key: LIFECYCLE_WEBHOOKS_KEY },
    create: { key: LIFECYCLE_WEBHOOKS_KEY, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
  cache = { at: Date.now(), value };
  return value;
}

export async function dispatchLifecycleEvent(event: WorkflowEvent): Promise<void> {
  if (event.type === "node.selected") return;
  const mapped = mapLifecycleEvent(event as InternalWorkflowEvent);
  if (!mapped) return;
  let subs: LifecycleSubscription[] = [];
  try {
    subs = await getLifecycleSubscriptions();
  } catch {
    return;
  }
  const payload: Record<string, unknown> = {
    workflowId: event.workflowId,
  };
  if ("executionId" in event) payload.executionId = event.executionId;
  if ("mode" in event && event.mode) payload.mode = event.mode;
  if ("status" in event) payload.status = event.status;
  if (event.type === "workflow.updated") payload.source = event.source;

  for (const sub of subs) {
    if (!subscriptionWants(sub, mapped)) continue;
    const delivery = await deliverLifecyclePayload({
      fetchImpl: fetch,
      sub,
      event: mapped,
      payload,
    });
    deliveries.push(delivery);
    if (deliveries.length > MAX_DELIVERIES) deliveries.shift();
  }
}
