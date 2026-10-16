import { useEffect, useRef, useState } from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLookup, useStore } from "@/lib/store";
import { STATUSES, type TaskStatus } from "@/lib/types";
import { downstream, isOverdue } from "@/lib/rules";
import { PriorityBadge, StatusBadge } from "./badges";
import { ActivityList } from "./activity-list";
import { RequestUpdateButton } from "./request-update";

export function TaskSheet() {
  const { data, openTaskId, setOpenTaskId, setStatus, deleteTask, openTaskDialog, refreshTask, backend, coordinatorApiKey } = useStore();
  const backendReady = backend.state === "ok" && !!coordinatorApiKey && !!backend.health.coordinatorAuth?.configured;
  const { member, project, task: getTask } = useLookup();
  const [confirmDel, setConfirmDel] = useState(false);
  const refreshTaskRef = useRef(refreshTask);
  const pollErrorShown = useRef(false);
  const refreshInFlight = useRef(false);
  const t = openTaskId ? getTask(openTaskId) : undefined;

  useEffect(() => {
    refreshTaskRef.current = refreshTask;
  }, [refreshTask]);

  useEffect(() => {
    if (!openTaskId || !backendReady) return;
    let active = true;
    const refresh = () => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      void refreshTaskRef.current(openTaskId).then(() => {
        pollErrorShown.current = false;
      }).catch((error) => {
        if (active && !pollErrorShown.current) {
          pollErrorShown.current = true;
          toast.error(`Live task refresh failed: ${(error as Error).message}`);
        }
      }).finally(() => {
        refreshInFlight.current = false;
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [openTaskId, backendReady]);

  return (
    <Sheet open={!!t} onOpenChange={(o) => !o && setOpenTaskId(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {t && (
          <>
            <SheetHeader>
              <div className="text-xs text-muted-foreground">{project(t.projectId)?.name}</div>
              <SheetTitle className="text-lg">{t.title}</SheetTitle>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={t.status} />
                <PriorityBadge priority={t.priority} />
                {isOverdue(t) && <span className="text-xs font-medium text-destructive">Overdue</span>}
              </div>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6 text-sm">
              {t.description && <p className="text-muted-foreground">{t.description}</p>}
              {t.acceptanceCriteria?.length ? <div><div className="mb-1 text-xs text-muted-foreground">Acceptance criteria</div><ul className="list-disc space-y-1 pl-5">{t.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></div> : null}
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{member(t.ownerId)?.name ?? "Unassigned"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Team</dt><dd>{t.team}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Deadline</dt><dd>{t.deadline}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Last update</dt><dd>{new Date(t.lastUpdate).toLocaleString()}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">Next action</dt><dd>{t.nextAction || "—"}</dd></div>
              </dl>
              {t.blocker && !t.blocker.resolvedAt && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-xs font-semibold uppercase text-destructive">Blocker</div>
                  <p className="mt-1">{t.blocker.reason}</p>
                  {t.blocker.evidence && <p className="mt-1 text-xs italic text-muted-foreground">{t.blocker.evidence}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Resolver: {t.blocker.requiredResolver ?? "Not yet established"}</p>
                </div>
              )}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Depends on</div>
                {t.dependsOn.length ? t.dependsOn.map((id) => {
                  const u = getTask(id);
                  return u && <button key={id} onClick={() => setOpenTaskId(id)} className="mr-2 mb-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted">{u.title} <StatusBadge status={u.status} /></button>;
                }) : <span className="text-muted-foreground">None</span>}
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Downstream (affected) tasks</div>
                {downstream(data.tasks, t.id).map((d) => (
                  <button key={d.id} onClick={() => setOpenTaskId(d.id)} className="mr-2 mb-1 inline-flex rounded border px-2 py-0.5 text-xs hover:bg-muted">{d.title}</button>
                ))}
                {downstream(data.tasks, t.id).length === 0 && <span className="text-muted-foreground">None</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Select value={t.status} onValueChange={(v) => {
                  if (v === "Blocked" && t.status !== "Blocked") {
                    toast.error("Edit the task to provide a blocker description.");
                    return;
                  }
                  setStatus(t.id, v as TaskStatus);
                  toast.success(`Status set to ${v}`);
                }}>
                  <SelectTrigger className="w-40" aria-label="Change status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <RequestUpdateButton task={t} />
                {backendReady && <Button size="sm" variant="outline" onClick={() => void refreshTask(t.id).then(() => toast.success("Task refreshed from backend")).catch((error) => toast.error((error as Error).message))}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>}
                <Button size="sm" variant="outline" onClick={() => openTaskDialog(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Messages</h3>
                {data.messages.filter((m) => m.taskId === t.id).length === 0 && <p className="text-xs text-muted-foreground">No messages for this task.</p>}
                <ul className="space-y-2">
                  {data.messages.filter((m) => m.taskId === t.id).map((m) => (
                    <li key={m.id} className={`rounded-md border p-2 text-xs ${m.direction === "in" ? "bg-muted" : ""}`}>
                      <div className="mb-0.5 font-medium">{m.direction === "out" ? "Follow-up" : "Reply"} · {m.delivery}{m.demo && " (demo, not real)"}</div>
                      {m.text}
                      {m.error && <div className="text-destructive">{m.error}</div>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Activity</h3>
                <ActivityList items={data.activities.filter((a) => a.taskId === t.id)} showTask={false} />
              </div>
            </div>
            <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                  <AlertDialogDescription>"{t.title}" will be removed and unlinked from any dependent tasks. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { deleteTask(t.id); setOpenTaskId(null); toast.success("Task deleted"); }}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
