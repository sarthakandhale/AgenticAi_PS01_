import type { AppData, Task, TaskStatus } from "./types";

export function today(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export const isOverdue = (t: Task) => t.status !== "Complete" && t.deadline < today();
export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export function needsFollowUp(t: Task, missingUpdateDays: number) {
  return t.status !== "Complete" && (daysSince(t.lastUpdate) >= missingUpdateDays || isOverdue(t));
}

/** Transitive downstream tasks (tasks that depend on `id`). */
export function downstream(tasks: Task[], id: string): Task[] {
  const out = new Map<string, Task>();
  const walk = (cur: string) => {
    for (const t of tasks) if (t.dependsOn.includes(cur) && !out.has(t.id)) { out.set(t.id, t); walk(t.id); }
  };
  walk(id);
  return [...out.values()];
}

/** True if setting `deps` on `taskId` would form a cycle. */
export function wouldCreateCycle(tasks: Task[], taskId: string, deps: string[]): boolean {
  if (deps.includes(taskId)) return true;
  const down = new Set(downstream(tasks, taskId).map((t) => t.id));
  return deps.some((d) => down.has(d));
}

export interface RiskFinding {
  taskId: string;
  kind: "confirmed-blocker" | "potential-risk";
  reasons: string[];
}

/** Explainable, rule-based risk evaluation. No probabilities or ML. */
export function evaluateRisks(tasks: Task[]): RiskFinding[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const findings: RiskFinding[] = [];
  for (const t of tasks) {
    if (t.status === "Complete") continue;
    if (t.status === "Blocked") {
      findings.push({ taskId: t.id, kind: "confirmed-blocker", reasons: [t.blocker?.reason ?? "Marked Blocked (no reason recorded)"] });
      continue;
    }
    const reasons: string[] = [];
    for (const depId of t.dependsOn) {
      const up = byId.get(depId);
      if (!up || up.status === "Complete") continue;
      if (up.status === "Blocked") reasons.push(`Upstream "${up.title}" is blocked`);
      if (isOverdue(up)) reasons.push(`Upstream "${up.title}" is overdue (due ${up.deadline})`);
      if (up.deadline >= t.deadline) reasons.push(`Upstream "${up.title}" is due ${up.deadline}, on/after this task's deadline ${t.deadline}`);
    }
    if (isOverdue(t)) reasons.push(`Past deadline ${t.deadline}`);
    if (reasons.length) findings.push({ taskId: t.id, kind: "potential-risk", reasons });
  }
  return findings;
}

export function projectStats(data: AppData, projectId?: string) {
  const tasks = projectId ? data.tasks.filter((t) => t.projectId === projectId) : data.tasks;
  const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
  const complete = count("Complete");
  return {
    total: tasks.length,
    complete,
    inProgress: count("In Progress"),
    pending: count("Pending"),
    blocked: count("Blocked"),
    overdue: tasks.filter(isOverdue).length,
    progress: tasks.length ? Math.round((complete / tasks.length) * 100) : 0,
  };
}

export function projectHealth(data: AppData, projectId: string): "On Track" | "At Risk" | "Blocked" | "Complete" {
  const s = projectStats(data, projectId);
  if (s.total > 0 && s.complete === s.total) return "Complete";
  if (s.blocked > 0) return "Blocked";
  const risks = evaluateRisks(data.tasks.filter((t) => t.projectId === projectId));
  if (s.overdue > 0 || risks.length > 0) return "At Risk";
  return "On Track";
}

/** Demo-only keyword interpreter. Clearly NOT an AI model. */
export function interpretReplyDemo(text: string): {
  proposedStatus: TaskStatus | null; evidence: string[]; extracted: string; clarity: "clear" | "ambiguous"; blockerReason?: string;
} {
  const lower = text.toLowerCase();
  const find = (words: string[]) => words.filter((w) => lower.includes(w));
  const block = find(["blocked", "missing", "waiting for", "waiting on", "can't", "cannot", "don't have", "need access", "not provided", "stuck"]);
  const done = find(["done", "completed", "complete", "finished", "merged", "deployed", "shipped"]);
  const prog = find(["working on", "in progress", "started", "connected", "almost", "%", "halfway", "ongoing"]);
  const categories = [block.length > 0, done.length > 0 && block.length === 0, prog.length > 0].filter(Boolean).length;
  if (block.length) {
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => block.some((w) => s.toLowerCase().includes(w))) ?? text;
    return { proposedStatus: "Blocked", evidence: [...block, ...prog], extracted: `Blocker reported${prog.length ? " (with partial progress)" : ""}.`, clarity: "clear", blockerReason: sentence.trim() };
  }
  if (done.length && !prog.length) return { proposedStatus: "Complete", evidence: done, extracted: "Completion reported.", clarity: "clear" };
  if (prog.length || done.length) return { proposedStatus: "In Progress", evidence: [...prog, ...done], extracted: "Progress reported.", clarity: categories > 1 ? "ambiguous" : "clear" };
  return { proposedStatus: null, evidence: [], extracted: "No clear progress, completion, or blocker signal found.", clarity: "ambiguous" };
}
