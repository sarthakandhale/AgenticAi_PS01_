import type { Member, RescueRecommendation, RescueStrategy, Task } from "./types";
import { downstream, isOverdue } from "./rules";

const BACKEND_KEYWORDS = ["api", "backend", "endpoint", "service", "gateway", "auth", "database", "server", "webhook"];
const FRONTEND_KEYWORDS = ["frontend", "ui", "client", "portal", "screen", "web", "component", "view", "page", "integration"];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = (text || "").toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Evaluates the best recovery strategy for a delayed upstream task with downstream dependencies.
 */
export function evaluateStrategy(
  delayedTask: Task,
  downstreamTasks: Task[],
  allTasks: Task[],
  members: Member[],
): { strategy: RescueStrategy; title: string; rationale: string } {
  const isBackend =
    matchesKeywords(delayedTask.title, BACKEND_KEYWORDS) ||
    matchesKeywords(delayedTask.description, BACKEND_KEYWORDS) ||
    delayedTask.team.toLowerCase().includes("engineering") ||
    delayedTask.team.toLowerCase().includes("backend");

  const hasFrontendDownstream = downstreamTasks.some(
    (dt) =>
      matchesKeywords(dt.title, FRONTEND_KEYWORDS) ||
      matchesKeywords(dt.description, FRONTEND_KEYWORDS) ||
      dt.team.toLowerCase().includes("frontend"),
  );

  // Strategy 1: Parallel development with mock APIs
  if (isBackend && hasFrontendDownstream) {
    return {
      strategy: "mock_api_contract",
      title: "Parallel development with mock API contract",
      rationale:
        "Backend API is delayed and blocks frontend integration. Recommended action: define and agree on a mock API contract so frontend development can continue independently while the backend endpoint is completed.",
    };
  }

  // Strategy 2: Partial deliverables for multi-downstream bottlenecks
  if (downstreamTasks.length > 1) {
    return {
      strategy: "partial_deliverable",
      title: "Define minimum usable partial deliverable",
      rationale: `Delayed task blocks ${downstreamTasks.length} downstream dependencies. Recommended action: define a minimum usable partial deliverable (initial endpoint, contract, or schema) to unblock downstream work while remaining work continues.`,
    };
  }

  // Strategy 3: Task resequencing
  const affectedOwnerIds = new Set(downstreamTasks.map((t) => t.ownerId).filter(Boolean));
  for (const ownerId of affectedOwnerIds) {
    const ownerName = members.find((m) => m.id === ownerId)?.name || "the downstream assignee";
    // Check if member has other tasks in their queue that are NOT blocked
    const otherTasks = allTasks.filter(
      (t) => t.ownerId === ownerId && t.id !== delayedTask.id && !downstreamTasks.some((dt) => dt.id === t.id) && t.status !== "Complete" && t.status !== "Blocked",
    );
    if (otherTasks.length > 0) {
      return {
        strategy: "task_resequencing",
        title: `Resequence tasks for ${ownerName}`,
        rationale: `Downstream member ${ownerName} has ${otherTasks.length} unaffected task(s) available in their queue (e.g. "${otherTasks[0].title}"). Recommended action: resequence work to prioritize unaffected tasks while waiting for prerequisite resolution.`,
      };
    }
  }

  // Strategy 4: Work reassignment or task splitting (Critical path)
  const isCritical = delayedTask.priority === "Critical" || delayedTask.priority === "High";
  return {
    strategy: "work_reassignment",
    title: isCritical ? "Work reassignment for critical path" : "Task splitting and workload balancing",
    rationale:
      "Delayed task is on the critical path and cannot be unblocked by mock contracts alone. Recommended action: reassign work or split subtasks with an available team member to restore schedule momentum.",
  };
}

/**
 * Scans tasks for delays blocking downstream work and generates or updates rescue recommendations.
 */
export function generateRescueRecommendations(
  tasks: Task[],
  members: Member[],
  existingActions: RescueRecommendation[] = [],
): RescueRecommendation[] {
  const existingMap = new Map(existingActions.map((a) => [a.delayedTaskId, a]));
  const results: RescueRecommendation[] = [];

  for (const task of tasks) {
    const isDelayed = task.status === "Blocked" || isOverdue(task);
    const downstreamTasks = downstream(tasks, task.id);

    // If task is not delayed or has no downstream tasks, it cannot have an active rescue recommendation
    if (!isDelayed) {
      // If task was previously delayed and is now Complete, check if an existing recommendation should be marked completed
      const existing = existingMap.get(task.id);
      if (existing) {
        if (task.status === "Complete" && existing.status !== "completed") {
          results.push({
            ...existing,
            status: "completed",
            updatedAt: new Date().toISOString(),
          });
        } else {
          results.push(existing);
        }
      }
      continue;
    }

    // Task is delayed, but does it block any downstream tasks?
    // Unaffected tasks with 0 downstream tasks do NOT generate recommendations.
    if (downstreamTasks.length === 0) {
      continue;
    }

    const affectedTaskIds = downstreamTasks.map((t) => t.id);
    const evaluation = evaluateStrategy(task, downstreamTasks, tasks, members);

    const existing = existingMap.get(task.id);
    if (existing) {
      // Keep existing approval/decision status, update downstream if changed
      results.push({
        ...existing,
        title: evaluation.title,
        rationale: evaluation.rationale,
        affectedTaskIds,
      });
    } else {
      results.push({
        id: `rescue-${task.id}-${Date.now().toString(36)}`,
        delayedTaskId: task.id,
        strategy: evaluation.strategy,
        title: evaluation.title,
        rationale: evaluation.rationale,
        affectedTaskIds,
        status: "proposed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
