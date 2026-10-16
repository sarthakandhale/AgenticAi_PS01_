import { useState } from "react";
import { useScopedTasks, useStore } from "@/lib/store";
import { STATUSES, type TaskStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TaskRows } from "@/components/pp/task-table";
import { StatusBadge } from "@/components/pp/badges";

export function TasksView() {
  const tasks = useScopedTasks();
  const { setStatus, setOpenTaskId } = useStore();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  const list = tasks.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.deadline.localeCompare(b.deadline));
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Table</Button>
        <Button variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")}>Kanban</Button>
      </div>
      {view === "table" ? <div className="rounded-lg border bg-card px-4"><TaskRows tasks={list} /></div> : (
        <div className="grid gap-3 md:grid-cols-4">
          {STATUSES.map((s) => (
            <div key={s} className="rounded-lg border bg-muted/40 p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => setStatus(e.dataTransfer.getData("id"), s as TaskStatus)}>
              <div className="mb-2 px-1"><StatusBadge status={s} /></div>
              {list.filter((t) => t.status === s).map((t) => (
                <button key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("id", t.id)} onClick={() => setOpenTaskId(t.id)} className="mb-2 w-full rounded-md border bg-card p-2 text-left text-sm shadow-sm">{t.title}<div className="text-xs text-muted-foreground">{t.deadline}</div></button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
