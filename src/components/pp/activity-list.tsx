import { format } from "date-fns";
import type { Activity } from "@/lib/types";
import { DemoBadge } from "./badges";
import { Empty } from "./page";
import { useLookup } from "@/lib/store";

export function ActivityList({ items, showTask = true }: { items: Activity[]; showTask?: boolean }) {
  const { task } = useLookup();
  if (!items.length) return <Empty>No activity recorded yet.</Empty>;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.summary}</span>
              {a.demo && <DemoBadge>Illustrative</DemoBadge>}
            </div>
            {showTask && a.taskId && <div className="text-xs text-muted-foreground">{task(a.taskId)?.title ?? "Deleted task"}</div>}
            {(a.prev || a.next) && (
              <div className="text-xs text-muted-foreground">
                {a.prev ?? "—"} → <span className="font-medium text-foreground">{a.next ?? "—"}</span>
              </div>
            )}
            {a.evidence && <blockquote className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">{a.evidence}</blockquote>}
            <div className="mt-0.5 text-xs text-muted-foreground">
              {a.actor} · {format(new Date(a.timestamp), "MMM d, yyyy HH:mm")}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
