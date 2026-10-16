import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Pencil, Plus, CheckCircle2, Circle } from "lucide-react";
import { useLookup, useStore } from "@/lib/store";
import { evaluateRisks, projectHealth, projectStats } from "@/lib/rules";
import { PageHeader, Panel, Stat, Empty } from "@/components/pp/page";
import { HealthBadge } from "@/components/pp/badges";
import { TaskRows } from "@/components/pp/task-table";
import { ActivityList } from "@/components/pp/activity-list";
import { ProjectDialog } from "@/components/pp/project-dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project details — ProjectPilot" },
      { name: "description", content: "Project tasks, milestones, blockers and activity." },
      { property: "og:title", content: "Project details — ProjectPilot" },
      { property: "og:description", content: "Project tasks, milestones, blockers and activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { data, openTaskDialog, setSelectedProjectId } = useStore();
  const { member, task } = useLookup();
  const [edit, setEdit] = useState(false);
  const p = data.projects.find((x) => x.id === projectId);
  if (!p) return <Empty>Project not found. <Link to="/projects" className="text-primary underline">Back to projects</Link></Empty>;
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const s = projectStats(data, p.id);
  const risks = evaluateRisks(tasks);

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <PageHeader
        title={p.name}
        description={p.description}
        actions={<>
          <HealthBadge health={projectHealth(data, p.id)} />
          <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" onClick={() => { setSelectedProjectId(p.id); openTaskDialog(); }}><Plus className="h-3.5 w-3.5" /> Add task</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Progress" value={`${s.progress}%`} />
        <Stat label="Tasks" value={s.total} />
        <Stat label="Complete" value={s.complete} tone="ok" />
        <Stat label="Blocked" value={s.blocked} tone={s.blocked ? "danger" : undefined} />
        <Stat label="Overdue" value={s.overdue} tone={s.overdue ? "warn" : undefined} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title={`Tasks (${tasks.length})`} className="lg:col-span-2"><TaskRows tasks={tasks} /></Panel>
        <div className="space-y-4">
          <Panel title="Team">
            <div className="text-sm"><span className="text-muted-foreground">PM:</span> {member(p.managerId)?.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{p.startDate} → {p.targetDate}</div>
            <ul className="mt-2 space-y-1 text-sm">{p.memberIds.map((id) => <li key={id}>{member(id)?.name} <span className="text-xs text-muted-foreground">· {member(id)?.role}</span></li>)}</ul>
          </Panel>
          <Panel title="Milestones">
            {p.milestones.length === 0 ? <Empty>No milestones.</Empty> : (
              <ul className="space-y-2 text-sm">
                {p.milestones.map((m) => <li key={m.id} className="flex items-center gap-2">{m.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}<span className="flex-1">{m.name}</span><span className="text-xs text-muted-foreground">{m.date}</span></li>)}
              </ul>
            )}
          </Panel>
          <Panel title="Blockers & risks">
            {risks.length === 0 ? <Empty>None detected.</Empty> : (
              <ul className="space-y-2 text-sm">
                {risks.map((r) => <li key={r.taskId}><span className={r.kind === "confirmed-blocker" ? "font-medium text-destructive" : "font-medium text-warning-foreground"}>{r.kind === "confirmed-blocker" ? "Blocker" : "Risk"}:</span> {task(r.taskId)?.title}<div className="text-xs text-muted-foreground">{r.reasons.join("; ")}</div></li>)}
              </ul>
            )}
          </Panel>
        </div>
        <Panel title="Project activity" className="lg:col-span-3"><ActivityList items={data.activities.filter((a) => a.projectId === p.id).slice(0, 15)} /></Panel>
      </div>
      <ProjectDialog open={edit} onOpenChange={setEdit} project={p} />
    </>
  );
}
