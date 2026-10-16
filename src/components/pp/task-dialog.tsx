import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/store";
import { PRIORITIES, STATUSES, type Task } from "@/lib/types";
import { rel } from "@/lib/demo-data";
import { wouldCreateCycle } from "@/lib/rules";

const schema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().max(1000),
  projectId: z.string().min(1, "Select a project"),
  ownerId: z.string().min(1, "Select an owner"),
  team: z.string().trim().min(1, "Team is required").max(60),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a deadline"),
  nextAction: z.string().max(300),
});

export function TaskDialog() {
  const { data, taskDialog, closeTaskDialog, saveTask, selectedProjectId } = useStore();
  const editing = taskDialog.task;
  const blank = (): Task => ({
    id: `t${Date.now().toString(36)}`,
    title: "", description: "",
    projectId: selectedProjectId !== "all" ? selectedProjectId : data.projects[0]?.id ?? "",
    ownerId: "", team: "", deadline: rel(7), priority: "Medium", status: "Pending",
    dependsOn: [], nextAction: "", lastUpdate: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  const [f, setF] = useState<Task>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blockReason, setBlockReason] = useState("");

  useEffect(() => {
    if (taskDialog.open) {
      setF(editing ?? blank());
      setBlockReason(editing?.blocker?.reason ?? "");
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDialog.open]);

  const set = <K extends keyof Task>(k: K, v: Task[K]) => setF((p) => ({ ...p, [k]: v }));
  const candidates = data.tasks.filter((t) => t.projectId === f.projectId && t.id !== f.id);

  const submit = () => {
    const r = schema.safeParse(f);
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] = i.message;
    if (f.status === "Blocked" && !blockReason.trim()) errs["blocker"] = "Describe the blocker (known facts only)";
    if (wouldCreateCycle(data.tasks, f.id, f.dependsOn)) errs["dependsOn"] = "These dependencies would create a circular chain";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const task: Task = { ...f, title: f.title.trim() };
    if (f.status === "Blocked") task.blocker = { ...(f.blocker ?? { identifiedAt: new Date().toISOString() }), reason: blockReason.trim() };
    saveTask(task, !editing);
    toast.success(editing ? "Task updated" : "Task created");
    closeTaskDialog();
  };

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Dialog open={taskDialog.open} onOpenChange={(o) => !o && closeTaskDialog()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "Create task"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={f.title} onChange={(e) => set("title", e.target.value)} />
            {err("title")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={f.projectId} onValueChange={(v) => setF((p) => ({ ...p, projectId: v, dependsOn: [] }))}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{data.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {err("projectId")}
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Select value={f.ownerId} onValueChange={(v) => setF((p) => ({ ...p, ownerId: v, team: p.team || data.members.find((m) => m.id === v)?.department || "" }))}>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>{data.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} — {m.role}</SelectItem>)}</SelectContent>
            </Select>
            {err("ownerId")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-team">Team / department</Label>
            <Input id="t-team" value={f.team} onChange={(e) => set("team", e.target.value)} />
            {err("team")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-deadline">Deadline</Label>
            <Input id="t-deadline" type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} />
            {err("deadline")}
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={f.priority} onValueChange={(v) => set("priority", v as Task["priority"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v as Task["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.status === "Blocked" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="t-block">Blocker description</Label>
              <Textarea id="t-block" rows={2} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              {err("blocker")}
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-next">Next action</Label>
            <Input id="t-next" value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Depends on (same project)</Label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
              {candidates.length === 0 && <p className="text-xs text-muted-foreground">No other tasks in this project.</p>}
              {candidates.map((t) => {
                const checked = f.dependsOn.includes(t.id);
                const cyc = !checked && wouldCreateCycle(data.tasks, f.id, [...f.dependsOn, t.id]);
                return (
                  <label key={t.id} className={`flex items-center gap-2 text-sm ${cyc ? "opacity-50" : ""}`}>
                    <Checkbox checked={checked} disabled={cyc} onCheckedChange={(c) => set("dependsOn", c ? [...f.dependsOn, t.id] : f.dependsOn.filter((x) => x !== t.id))} />
                    {t.title}
                    {cyc && <span className="text-xs text-muted-foreground">(would create a cycle)</span>}
                  </label>
                );
              })}
            </div>
            {err("dependsOn")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeTaskDialog}>Cancel</Button>
          <Button onClick={submit}>{editing ? "Save changes" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
