export const AGENT_TYPES = ["EMAIL", "DOCUMENT", "ADMIN", "MANAGER"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const TASK_STATUSES = [
  "PENDING",
  "RUNNING",
  "AWAITING_VALIDATION",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
