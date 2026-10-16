import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seo } from "@/lib/seo";
import { useLookup, useScopedTasks, useStore } from "@/lib/store";
import { evaluateRisks, isOverdue, needsFollowUp, projectHealth, projectStats, today } from "@/lib/rules";
import { PageHeader, Panel, Stat, Empty } from "@/components/pp/page";
import { DemoBadge, HealthBadge } from "@/components/pp/badges";
import { TaskRows } from "@/components/pp/task-table";
import { ActivityList } from "@/components/pp/activity-list";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => seo("Overview", "Portfolio overview of tasks, blockers, milestones and team workload."),
  component: Overview,
});

const COLORS = { Pending: "var(--chart-5)", "In Progress": "var(--chart-2)", Blocked: "var(--chart-3)", Complete: "var(--chart-1)" };

function Overview() {
  const { data, selectedProjectId } = useStore();
  const { member, project } = useLookup();
  const navigate = useNavigate();
  const tasks = useScopedTasks();
  const projects = selectedProjectId === "all" ? data.projects : data.projects.filter((p) => p.id === selectedProjectId);
  const scoped = { ...data, tasks };
  const s = projectStats(scoped);
  const atRisk = projects.filter((p) => projectHealth(data, p.id) !== "On Track" && projectHealth(data, p.id) !== "Complete");
  const milestones = projects
    .flatMap((p) => p.milestones.filter((m) => !m.done && m.date >= today()).map((m) => ({ ...m, project: p })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const followUps = tasks.filter((t) => needsFollowUp(t, data.settings.reminders.missingUpdateDays));
  const blockers = tasks.filter((t) => t.status === "Blocked");
  const statusData = (["Pending", "In Progress", "Blocked", "Complete"] as const).map((k) => ({ name: k, value: tasks.filter((t) => t.status === k).length }));
  const workload = data.members
    .map((m) => {
      const mine = tasks.filter((t) => t.ownerId === m.id);
      return { name: m.name.split(" ")[0], open: mine.filter((t) => t.status !== "Complete" && t.status !== "Blocked").length, blocked: mine.filter((t) => t.status === "Blocked").length, done: mine.filter((t) => t.status === "Complete").length };
    })
    .filter((w) => w.open + w.blocked + w.done > 0);
  const projectIds = new Set(projects.map((p) => p.id));
  const activity = data.activities.filter((a) => !a.projectId || projectIds.has(a.projectId)).slice(0, 6);
  const risks = evaluateRisks(tasks);

  return (
    <>
      <PageHeader title="Overview" description="Your AI teammate for project delivery — the latest recorded state of your portfolio." actions={data.settings.demoMode ? <DemoBadge /> : undefined} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Active projects" value={projects.length} onClick={() => navigate({ to: "/projects" })} />
        <Stat label="Total tasks" value={s.total} onClick={() => navigate({ to: "/tasks" })} />
        <Stat label="Completed" value={s.complete} tone="ok" />
        <Stat label="In progress" value={s.inProgress} />
        <Stat label="Blocked" value={s.blocked} tone={s.blocked ? "danger" : undefined} onClick={() => navigate({ to: "/blockers" })} />
        <Stat label="Overdue" value={s.overdue} tone={s.overdue ? "warn" : undefined} />
        <Stat label="Projects at risk" value={atRisk.length} tone={atRisk.length ? "warn" : undefined} onClick={() => navigate({ to: "/dependencies" })} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Projects" className="lg:col-span-2" action={<Link to="/projects" className="text-xs text-primary hover:underline">View all</Link>}>
          <ul className="divide-y">
            {projects.map((p) => {
              const ps = projectStats(data, p.id);
              return (
                <li key={p.id}>
                  <Link to="/projects/$projectId" params={{ projectId: p.id }} className="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">PM: {member(p.managerId)?.name} · Target {p.targetDate} · {ps.blocked} blocked · {ps.overdue} overdue</div>
                    </div>
                    <div className="flex w-40 items-center gap-2"><Progress value={ps.progress} className="h-2" /><span className="text-xs tabular-nums">{ps.progress}%</span></div>
                    <HealthBadge health={projectHealth(data, p.id)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Task status">
          {s.total === 0 ? <Empty>No tasks.</Empty> : (
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {statusData.map((d) => <Cell key={d.name} fill={COLORS[d.name]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title={`Major blockers (${blockers.length})`} action={<Link to="/blockers" className="text-xs text-primary hover:underline">Blocker Radar</Link>}>
          <TaskRows tasks={blockers} empty="No blocked tasks." />
        </Panel>
        <Panel title={`Tasks requiring follow-up (${followUps.length})`} action={<Link to="/coordinator" className="text-xs text-primary hover:underline">Coordinator</Link>}>
          <TaskRows tasks={followUps.slice(0, 6)} empty="All tasks have recent updates." />
        </Panel>
        <Panel title="Upcoming milestones">
          {milestones.length === 0 ? <Empty>No upcoming milestones.</Empty> : (
            <ul className="space-y-2 text-sm">
              {milestones.slice(0, 6).map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <Link to="/projects/$projectId" params={{ projectId: m.project.id }} className="min-w-0 hover:underline">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.project.name}</div>
                  </Link>
                  <span className="text-xs tabular-nums text-muted-foreground">{m.date}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Team workload" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={workload}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="open" name="Open" stackId="a" fill="var(--chart-2)" />
                <Bar dataKey="blocked" name="Blocked" stackId="a" fill="var(--chart-3)" />
                <Bar dataKey="done" name="Complete" stackId="a" fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Recent activity" action={<Link to="/activity" className="text-xs text-primary hover:underline">All</Link>}>
          <ActivityList items={activity} />
        </Panel>
        <Panel title={`Delivery risks (${risks.filter((r) => r.kind === "potential-risk").length} potential)`} className="lg:col-span-3">
          <ul className="space-y-1 text-sm">
            {risks.filter((r) => r.kind === "potential-risk").slice(0, 5).map((r) => {
              const t = tasks.find((x) => x.id === r.taskId)!;
              return <li key={r.taskId}><span className="font-medium">{t.title}</span> <span className="text-muted-foreground">({project(t.projectId)?.name}) — {r.reasons[0]}</span>{isOverdue(t) && " "}</li>;
            })}
            {risks.filter((r) => r.kind === "potential-risk").length === 0 && <Empty>No potential risks detected by current rules.</Empty>}
          </ul>
        </Panel>
      </div>
    </>
  );
}
