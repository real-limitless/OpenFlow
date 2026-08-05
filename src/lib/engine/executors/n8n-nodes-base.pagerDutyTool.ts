import type { NodeExecutor } from "@/sdk";
import { pagerDutyExecutor } from "./pagerDuty";

export const pagerDutyToolExecutor: NodeExecutor = pagerDutyExecutor;
