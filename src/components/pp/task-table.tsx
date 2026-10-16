import { useLookup, useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { isOverdue } from "@/lib/rules";
import { PriorityBadge, StatusBadge } from "./badges";
import { Empty } from "./page";

/** Compact clickable task list for dashboards and detail pages. */
export function TaskRows({ tasks, empty = "No tasks." }: { tasks: Task[]; empty?: string }) {
  const { setOpenTaskId } = useStore();
  const { member, project } = useLookup();
  if (!tasks.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y">
      {tasks.map((t) => (
        <li key={t.id}>
          <button onClick={() => setOpenTaskId(t.id)} className="flex w-full flex-wrap items-center gap-2 py-2.5 text-left hover:bg-muted/50 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="truncate text-xs text-muted-foreground">{project(t.projectId)?.name} · {member(t.ownerId)?.name}</div>
            </div>
            <span className={`text-xs tabular-nums ${isOverdue(t) ? "font-medium text-destructive" : "text-muted-foreground"}`}>{t.deadline}</span>
            <PriorityBadge priority={t.priority} />
            <StatusBadge status={t.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
