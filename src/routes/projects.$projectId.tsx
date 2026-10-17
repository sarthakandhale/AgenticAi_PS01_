import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Plus,
  CheckCircle2,
  Circle,
  MessageSquare,
  Video,
  ArrowRight,
  Sparkles,
  XCircle,
  Loader2,
  ShieldAlert,
  Layers,
  GitBranch,
} from "lucide-react";
import { useLookup, useStore } from "@/lib/store";
import { evaluateRisks, projectHealth, projectStats } from "@/lib/rules";
import { PageHeader, Panel, Stat, Empty } from "@/components/pp/page";
import { HealthBadge, StatusBadge } from "@/components/pp/badges";
import { TaskRows } from "@/components/pp/task-table";
import { ActivityList } from "@/components/pp/activity-list";
import { ProjectDialog } from "@/components/pp/project-dialog";
import { OrganizeMeetDialog } from "@/components/pp/organize-meet-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const {
    data,
    openTaskDialog,
    setSelectedProjectId,
    setOpenTaskId,
    isAnalyzingDependencies,
    analyzeProjectDependencies,
    confirmDependency,
    rejectDependency,
  } = useStore();
  const { member, task } = useLookup();
  const [edit, setEdit] = useState(false);
  const [meetOpen, setMeetOpen] = useState(false);
  const p = data.projects.find((x) => x.id === projectId);
  if (!p) return <Empty>Project not found. <Link to="/projects" className="text-primary underline">Back to projects</Link></Empty>;
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const s = projectStats(data, p.id);
  const risks = evaluateRisks(tasks);

  // Automatically analyze dependencies in real-time when project/tasks exist but have no graph yet
  useEffect(() => {
    if (tasks.length > 1 && (data.taskDependencies || []).filter((d) => d.projectId === p.id).length === 0) {
      void analyzeProjectDependencies(p.id, { silent: true });
    }
  }, [p.id, tasks.length]);

  const taskIds = new Set(tasks.map((t) => t.id));

  // Confirmed dependencies
  const confirmedDeps = tasks.flatMap((t) =>
    (t.dependsOn || []).map((prereqId) => {
      const prereq = data.tasks.find((pt) => pt.id === prereqId);
      return {
        prerequisiteId: prereqId,
        prerequisiteTitle: prereq?.title || "Prerequisite Task",
        prerequisiteStatus: prereq?.status || "Pending",
        prerequisiteAssignee: member(prereq?.ownerId || "")?.name || "Unassigned",
        prerequisiteDeadline: prereq?.deadline || "",
        dependentId: t.id,
        dependentTitle: t.title,
        dependentStatus: t.status,
        dependentAssignee: member(t.ownerId)?.name || "Unassigned",
        dependentDeadline: t.deadline,
        isBlocked: prereq?.status === "Blocked",
        isOverdue: prereq?.status !== "Complete" && !!prereq?.deadline && prereq.deadline < new Date().toISOString().slice(0, 10),
      };
    }),
  );

  // AI Proposed dependencies for this project
  const proposedDeps = (data.taskDependencies || []).filter(
    (dep) =>
      dep.status === "PROPOSED" &&
      (dep.projectId === p.id || taskIds.has(dep.prerequisiteTaskId) || taskIds.has(dep.dependentTaskId)),
  );

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <PageHeader
        title={p.name}
        description={p.description}
        actions={<>
          <HealthBadge health={projectHealth(data, p.id)} />
          <Button variant="outline" size="sm" onClick={() => setMeetOpen(true)} className="gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-medium">
            <Video className="h-3.5 w-3.5 text-indigo-500" /> Organize Meet
          </Button>
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

      {/* Real-time Project Dependency Flow Panel */}
      <Panel
        title="Real-Time Dependency Analysis & Milestone Flow"
        className="mt-6"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void analyzeProjectDependencies(p.id)}
              disabled={isAnalyzingDependencies}
              className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 shadow-xs"
            >
              {isAnalyzingDependencies ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
              <span>{isAnalyzingDependencies ? "Analyzing..." : "Re-analyze Flow"}</span>
            </Button>
            <Link to="/dependencies" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium ml-1">
              Full Graph <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        }
      >
        {/* Milestone Timeline Strip */}
        {p.milestones.length > 0 && (
          <div className="mb-4 rounded-lg bg-muted/40 p-3 border">
            <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Project Milestones Sequence ({p.milestones.length})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {p.milestones.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${m.done ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" : "bg-card text-foreground"}`}>
                    {m.done ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Circle className="h-3 w-3 text-muted-foreground" />}
                    <span>{m.name || `Phase ${idx + 1}`}</span>
                    {m.date && <span className="text-[10px] text-muted-foreground ml-0.5">({m.date})</span>}
                  </span>
                  {idx < p.milestones.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/60" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Proposed Dependencies (Pending Review) */}
        {proposedDeps.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-700 dark:text-purple-300">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span>AI Proposed Dependencies ({proposedDeps.length} pending review)</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {proposedDeps.map((dep) => (
                <div key={dep.id} className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="font-semibold text-foreground truncate">{dep.prerequisiteTitle || dep.prerequisiteTaskId}</span>
                    <ArrowRight className="h-3 w-3 text-purple-500 shrink-0" />
                    <span className="font-semibold text-foreground truncate">{dep.dependentTitle || dep.dependentTaskId}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{dep.explanation}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-purple-500/15">
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      Confidence: {Math.round(dep.confidence * 100)}%
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void rejectDependency(dep.prerequisiteTaskId, dep.dependentTaskId)}
                        className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void confirmDependency(dep.prerequisiteTaskId, dep.dependentTaskId)}
                        className="h-6 px-2 text-[11px] bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed Task Dependency Pipeline */}
        {confirmedDeps.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-emerald-500" />
              <span>Active Dependency Flow ({confirmedDeps.length})</span>
            </div>
            <div className="divide-y rounded-lg border bg-card/60">
              {confirmedDeps.map((d, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 text-xs hover:bg-muted/30 transition-all">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{d.prerequisiteTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{d.prerequisiteAssignee} {d.prerequisiteDeadline && `· Due ${d.prerequisiteDeadline}`}</div>
                    </div>
                    <StatusBadge status={d.prerequisiteStatus} />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mx-1" />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{d.dependentTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{d.dependentAssignee} {d.dependentDeadline && `· Due ${d.dependentDeadline}`}</div>
                    </div>
                    <StatusBadge status={d.dependentStatus} />
                  </div>
                  {d.isBlocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded shrink-0">
                      <ShieldAlert className="h-3 w-3" /> Upstream Blocked!
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : proposedDeps.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            {tasks.length <= 1 ? (
              <p>Add at least two tasks to infer and visualize logical prerequisite dependencies.</p>
            ) : (
              <div className="space-y-1.5">
                <p>No active dependencies yet.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void analyzeProjectDependencies(p.id)}
                  disabled={isAnalyzingDependencies}
                  className="h-7 text-xs gap-1"
                >
                  <Sparkles className="h-3 w-3 text-primary" /> Auto-Analyze Dependencies Now
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Panel>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title={`Tasks (${tasks.length})`} className="lg:col-span-2"><TaskRows tasks={tasks} /></Panel>
        <div className="space-y-4">
          <Panel
            title={`Team Members (${p.memberIds.length})`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMeetOpen(true)}
                className="h-7 text-xs gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-medium"
              >
                <Video className="h-3 w-3" /> Meet Team
              </Button>
            }
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b">
              <div><span className="font-medium text-foreground">PM:</span> {member(p.managerId)?.name || "Unassigned"}</div>
              <div>{p.startDate} → {p.targetDate}</div>
            </div>
            <div className="mt-3 space-y-3">
              {p.memberIds.map((id) => {
                const m = member(id);
                if (!m) return null;
                const memberTasks = tasks.filter((t) => t.ownerId === id);
                const memberMessages = data.messages.filter((msg) => msg.memberId === id || memberTasks.some((t) => t.id === msg.taskId));
                const latestInbound = memberMessages.filter((msg) => msg.direction === "in")[0];

                return (
                  <div key={id} className="rounded-lg border bg-card/60 p-3 space-y-2 hover:bg-card/90 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm leading-none flex items-center gap-2">
                            {m.name}
                            {m.role && <span className="text-[11px] font-normal text-muted-foreground">({m.role})</span>}
                          </div>
                          {m.department && <div className="text-[11px] text-muted-foreground mt-0.5">{m.department}</div>}
                        </div>
                      </div>
                      {m.telegramLinked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Telegram Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted border px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Link Pending
                        </span>
                      )}
                    </div>

                    {/* Member's Tasks in this project */}
                    <div className="pt-1 space-y-1.5">
                      {memberTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No tasks assigned in this project</p>
                      ) : (
                        memberTasks.map((t) => {
                          const isComplete = t.status === "Complete";
                          const isBlocked = t.status === "Blocked";
                          return (
                            <div
                              key={t.id}
                              onClick={() => setOpenTaskId(t.id)}
                              className="flex flex-col gap-1 rounded border bg-card p-2 text-xs hover:border-primary/50 cursor-pointer transition-all"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-foreground flex items-center gap-1.5 truncate">
                                  {isComplete ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  )}
                                  <span className="truncate">{t.title}</span>
                                </div>
                                <StatusBadge status={t.status} />
                              </div>

                              {t.blocker?.reason && isBlocked && (
                                <div className="text-[11px] text-destructive bg-destructive/10 px-2 py-0.5 rounded mt-0.5">
                                  ⚠️ Blocker: {t.blocker.reason}
                                </div>
                              )}
                              {isComplete && (t.blocker?.resolution || latestInbound?.text) && (
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded mt-0.5 flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3 shrink-0" />
                                  <span className="truncate">Telegram update: "{latestInbound?.text || t.blocker?.resolution}"</span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
      <OrganizeMeetDialog project={p} open={meetOpen} onOpenChange={setMeetOpen} />
    </>
  );
}
