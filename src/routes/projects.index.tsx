import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { seo } from "@/lib/seo";
import { useLookup, useStore } from "@/lib/store";
import { projectHealth, projectStats } from "@/lib/rules";
import { PageHeader, Empty } from "@/components/pp/page";
import { HealthBadge } from "@/components/pp/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectDialog } from "@/components/pp/project-dialog";

export const Route = createFileRoute("/projects/")({
  head: () => seo("Projects", "Portfolio of delivery projects with progress, milestones and risks."),
  component: Projects,
});

function Projects() {
  const { data } = useStore();
  const { member } = useLookup();
  const [q, setQ] = useState("");
  const [health, setHealth] = useState("all");
  const [open, setOpen] = useState(false);
  const list = data.projects.filter(
    (p) => (p.name + p.description).toLowerCase().includes(q.toLowerCase()) && (health === "all" || projectHealth(data, p.id) === health),
  );
  return (
    <>
      <PageHeader title="Projects" description="Sample portfolio — fictional projects, not real client engagements." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New project</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={health} onValueChange={setHealth}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "On Track", "At Risk", "Blocked", "Complete"].map((h) => <SelectItem key={h} value={h}>{h === "all" ? "All statuses" : h}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {list.length === 0 && <Empty>No projects match.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const s = projectStats(data, p.id);
          const next = p.milestones.filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date))[0];
          return (
            <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-primary/50">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{p.name}</h3><HealthBadge health={projectHealth(data, p.id)} /></div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              <div className="mt-4 flex items-center gap-2"><Progress value={s.progress} className="h-2" /><span className="text-xs tabular-nums">{s.progress}%</span></div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="font-semibold">{s.total}</div><div className="text-muted-foreground">Tasks</div></div>
                <div><div className="font-semibold">{s.complete}</div><div className="text-muted-foreground">Done</div></div>
                <div><div className="font-semibold text-destructive">{s.blocked}</div><div className="text-muted-foreground">Blocked</div></div>
                <div><div className="font-semibold">{s.overdue}</div><div className="text-muted-foreground">Overdue</div></div>
              </div>
              <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                PM {member(p.managerId)?.name} · {p.memberIds.length} members · {p.startDate} → {p.targetDate}
                {next && <div>Next milestone: {next.name} ({next.date})</div>}
              </div>
            </Link>
          );
        })}
      </div>
      <ProjectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
