import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { rel } from "@/lib/demo-data";
import type { Project } from "@/lib/types";

const schema = z
  .object({
    name: z.string().trim().min(3, "Name must be at least 3 characters").max(80),
    description: z.string().max(500),
    managerId: z.string().min(1, "Select a project manager"),
    startDate: z.string().min(1, "Required"),
    targetDate: z.string().min(1, "Required"),
  })
  .refine((v) => v.targetDate >= v.startDate, { path: ["targetDate"], message: "Target must be after start date" });

export function ProjectDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project }) {
  const { data, saveProject } = useStore();
  const blank = (): Project => ({ id: `p${Date.now().toString(36)}`, name: "", description: "", managerId: "", memberIds: [], startDate: rel(0), targetDate: rel(60), milestones: [] });
  const [f, setF] = useState<Project>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setF(project ?? blank()); setErrors({}); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const submit = () => {
    const r = schema.safeParse(f);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (f.milestones.some((m) => !m.name.trim())) return setErrors({ milestones: "Milestones need a name" });
    const memberIds = f.memberIds.includes(f.managerId) ? f.memberIds : [f.managerId, ...f.memberIds];
    saveProject({ ...f, name: f.name.trim(), memberIds }, !project);
    toast.success(project ? "Project updated" : "Project created");
    onOpenChange(false);
  };
  const e = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />{e("name")}</div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="p-desc">Description</Label><Textarea id="p-desc" rows={2} value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Project manager</Label>
            <Select value={f.managerId} onValueChange={(v) => setF({ ...f, managerId: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{data.members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>{e("managerId")}
          </div>
          <div className="space-y-1.5"><Label htmlFor="p-s">Start date</Label><Input id="p-s" type="date" value={f.startDate} onChange={(x) => setF({ ...f, startDate: x.target.value })} />{e("startDate")}</div>
          <div className="space-y-1.5"><Label htmlFor="p-t">Target completion</Label><Input id="p-t" type="date" value={f.targetDate} onChange={(x) => setF({ ...f, targetDate: x.target.value })} />{e("targetDate")}</div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Team members</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-md border p-2 max-h-48 overflow-y-auto">
              {data.members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer hover:bg-muted/30 px-1 rounded">
                  <Checkbox checked={f.memberIds.includes(m.id)} onCheckedChange={(c) => setF({ ...f, memberIds: c ? [...f.memberIds, m.id] : f.memberIds.filter((x) => x !== m.id) })} />
                  <span className="font-medium truncate">{m.name}</span>
                  {m.role && <span className="text-[11px] text-muted-foreground truncate">({m.role})</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between"><Label>Milestones</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, milestones: [...f.milestones, { id: `ms${Date.now().toString(36)}`, name: "", date: f.targetDate, done: false }] })}><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
            {f.milestones.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2">
                <Checkbox aria-label="Done" checked={m.done} onCheckedChange={(c) => setF({ ...f, milestones: f.milestones.map((x, j) => (j === i ? { ...x, done: !!c } : x)) })} />
                <Input placeholder="Milestone" value={m.name} onChange={(x) => setF({ ...f, milestones: f.milestones.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)) })} />
                <Input type="date" className="w-40" value={m.date} onChange={(x) => setF({ ...f, milestones: f.milestones.map((y, j) => (j === i ? { ...y, date: x.target.value } : y)) })} />
                <Button size="icon" variant="ghost" aria-label="Remove milestone" onClick={() => setF({ ...f, milestones: f.milestones.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            {e("milestones")}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>{project ? "Save" : "Create project"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
