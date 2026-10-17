import { useEffect, useState } from "react";
import { useLookup, useScopedTasks, useStore } from "@/lib/store";
import { evaluateRisks } from "@/lib/rules";
import { Panel, Empty } from "@/components/pp/page";
import { StatusBadge } from "@/components/pp/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

function StrategyBadge({ strategy }: { strategy: string }) {
  switch (strategy) {
    case "mock_api_contract":
      return <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30">Mock API Contract</Badge>;
    case "partial_deliverable":
      return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">Partial Deliverable</Badge>;
    case "task_resequencing":
      return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Task Resequencing</Badge>;
    case "work_reassignment":
      return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">Work Reassignment</Badge>;
    default:
      return <Badge variant="outline">{strategy}</Badge>;
  }
}

function RescueStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "proposed":
      return <Badge variant="outline" className="text-sky-600 dark:text-sky-400 border-sky-400/40">Proposed</Badge>;
    case "approved":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Approved</Badge>;
    case "completed":
      return <Badge variant="secondary" className="text-muted-foreground">Resolved</Badge>;
    case "rejected":
      return <Badge variant="outline" className="text-muted-foreground line-through">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function DependenciesView() {
  const tasks = useScopedTasks();
  const {
    data,
    selectedProjectId,
    setOpenTaskId,
    approveRescueAction,
    rejectRescueAction,
    completeRescueAction,
    isAnalyzingDependencies,
    analyzeProjectDependencies,
    confirmDependency,
    rejectDependency,
    deleteDependency,
  } = useStore();
  const { task, member } = useLookup();
  const risks = evaluateRisks(tasks);

  const scopedTaskIds = new Set(tasks.map((t) => t.id));

  // Real-time automatic inference if scoped tasks have no dependencies analyzed yet
  useEffect(() => {
    if (tasks.length > 1 && (data.taskDependencies || []).filter((d) => scopedTaskIds.has(d.prerequisiteTaskId) || scopedTaskIds.has(d.dependentTaskId)).length === 0) {
      void analyzeProjectDependencies(selectedProjectId !== "all" ? selectedProjectId : undefined, { silent: true });
    }
  }, [selectedProjectId, tasks.length]);

  const currentProject = selectedProjectId !== "all" ? data.projects.find((p) => p.id === selectedProjectId) : null;

  // AI Proposed Dependencies for current project / scoped tasks
  const proposedDependencies = (data.taskDependencies || []).filter(
    (dep) =>
      dep.status === "PROPOSED" &&
      (scopedTaskIds.has(dep.prerequisiteTaskId) || scopedTaskIds.has(dep.dependentTaskId)),
  );

  // Confirmed edges for current project / scoped tasks
  const confirmedDependencies = tasks.flatMap((t) =>
    (t.dependsOn || []).map((uId) => ({
      up: task(uId),
      down: t,
      meta: (data.taskDependencies || []).find(
        (d) => d.prerequisiteTaskId === uId && d.dependentTaskId === t.id,
      ),
    })),
  );

  // Filter rescue recommendations for currently scoped tasks
  const activeRescueActions = (data.rescueActions || []).filter(
    (a) => scopedTaskIds.has(a.delayedTaskId) || a.affectedTaskIds.some((id) => scopedTaskIds.has(id)),
  );

  const handleConfirmAll = async () => {
    for (const edge of proposedDependencies) {
      await confirmDependency(edge.prerequisiteTaskId, edge.dependentTaskId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Milestones Phasing Ribbon (when scoped to a project) */}
      {currentProject?.milestones && currentProject.milestones.length > 0 && (
        <div className="rounded-xl border bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              <span>Project Milestone Phases & Delivery Sequence ({currentProject.milestones.length})</span>
            </div>
            <span className="text-[11px] text-muted-foreground">Milestones establish chronological prerequisite boundaries</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {currentProject.milestones.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${m.done ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" : "bg-card text-foreground"}`}>
                  {m.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>{m.name || `Phase ${idx + 1}`}</span>
                  {m.date && <span className="text-[10px] text-muted-foreground">({m.date})</span>}
                </span>
                {idx < currentProject.milestones.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Trigger & Analysis Header */}
      <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                AI Automatic Task Dependency Analysis
              </h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Analyzes database tasks, roles, timelines, and technical deliverables using Gemini &amp; LangGraph.
              Infers directional prerequisite relationships (<span className="font-medium text-foreground">prerequisite → dependent</span>) without manual graph configuration.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            {proposedDependencies.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-medium border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={handleConfirmAll}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                Confirm All ({proposedDependencies.length})
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              disabled={isAnalyzingDependencies}
              onClick={() => analyzeProjectDependencies(selectedProjectId !== "all" ? selectedProjectId : undefined)}
            >
              {isAnalyzingDependencies ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Analyse Dependencies with AI
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Section: AI Proposed Dependencies (Review Queue) */}
      {proposedDependencies.length > 0 && (
        <Panel title={`AI Proposed Dependencies (${proposedDependencies.length} Pending Review)`}>
          <p className="mb-4 text-xs text-muted-foreground">
            Gemini analyzed technical roles, deliverables, and architecture layers and proposed the following logical sequence.
            As project manager, you can confirm or reject each proposed dependency:
          </p>

          <div className="space-y-3">
            {proposedDependencies.map((edge) => {
              const prereq = task(edge.prerequisiteTaskId);
              const dependent = task(edge.dependentTaskId);
              const prereqOwner = prereq ? member(prereq.ownerId) : null;
              const depOwner = dependent ? member(dependent.ownerId) : null;

              return (
                <div
                  key={edge.id || `${edge.prerequisiteTaskId}-${edge.dependentTaskId}`}
                  className="rounded-lg border border-primary/20 bg-card p-4 transition-all shadow-sm hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[11px]">
                        AI Proposed
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        Confidence: {(edge.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => confirmDependency(edge.prerequisiteTaskId, edge.dependentTaskId)}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm Dependency
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => rejectDependency(edge.prerequisiteTaskId, edge.dependentTaskId)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>

                  {/* Visual Prerequisite -> Dependent flow */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-md bg-muted/40 p-2.5 space-y-1">
                      <div className="font-semibold text-muted-foreground flex items-center gap-1 text-[11px]">
                        <Layers className="h-3 w-3 text-primary" /> Prerequisite Task (Upstream):
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => setOpenTaskId(edge.prerequisiteTaskId)}
                          className="font-medium hover:underline text-foreground text-left"
                        >
                          {prereq?.title || edge.prerequisiteTitle || edge.prerequisiteTaskId}
                        </button>
                        {prereq && <StatusBadge status={prereq.status} />}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        Assignee: <span className="font-medium text-foreground">{prereqOwner?.name || "Unassigned"}</span> ({prereqOwner?.role || "Team Member"})
                        {prereq?.deadline && ` | Due: ${prereq.deadline}`}
                      </div>
                    </div>

                    <div className="rounded-md bg-muted/40 p-2.5 space-y-1">
                      <div className="font-semibold text-muted-foreground flex items-center gap-1 text-[11px]">
                        <ArrowRight className="h-3 w-3 text-primary" /> Dependent Task (Downstream):
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => setOpenTaskId(edge.dependentTaskId)}
                          className="font-medium hover:underline text-foreground text-left"
                        >
                          {dependent?.title || edge.dependentTitle || edge.dependentTaskId}
                        </button>
                        {dependent && <StatusBadge status={dependent.status} />}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        Assignee: <span className="font-medium text-foreground">{depOwner?.name || "Unassigned"}</span> ({depOwner?.role || "Team Member"})
                        {dependent?.deadline && ` | Due: ${dependent.deadline}`}
                      </div>
                    </div>
                  </div>

                  {/* AI Explanation & Evidence */}
                  <div className="mt-3 rounded-md border border-primary/15 bg-primary/5 p-2.5 text-xs text-foreground/90">
                    <span className="font-semibold text-primary flex items-center gap-1 mb-1">
                      <Sparkles className="h-3.5 w-3.5" /> AI Logical Rationale:
                    </span>
                    <p className="leading-relaxed">{edge.explanation}</p>
                    {edge.evidence && (
                      <p className="mt-1 text-[11px] text-muted-foreground border-t border-primary/10 pt-1">
                        <span className="font-medium text-foreground">Evidence:</span> {edge.evidence}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Feature 3: Dependency Rescue Engine Section */}
      <Panel title="Dependency Rescue Engine — Missed Deadline & Blocker Recovery">
        <p className="mb-4 text-xs text-muted-foreground">
          Evaluates 4 practical recovery strategies (<span className="font-semibold text-foreground">Mock API Contracts</span>, <span className="font-semibold text-foreground">Partial Deliverables</span>, <span className="font-semibold text-foreground">Task Resequencing</span>, <span className="font-semibold text-foreground">Work Reassignment</span>) to prevent one team member's delay from blocking downstream work.
        </p>
        {activeRescueActions.length === 0 ? (
          <Empty>All clear — no delayed tasks are currently blocking downstream team members.</Empty>
        ) : (
          <div className="space-y-4">
            {activeRescueActions.map((action) => {
              const delayed = task(action.delayedTaskId);
              const delayedOwner = delayed ? member(delayed.ownerId) : null;
              const isResolved = action.status === "completed";

              return (
                <div
                  key={action.id}
                  className={cn(
                    "rounded-lg border p-4 transition-all",
                    action.status === "approved"
                      ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                      : isResolved
                        ? "border-border/60 bg-muted/20 opacity-80"
                        : "border-border bg-card shadow-sm",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="flex items-center gap-2">
                      <StrategyBadge strategy={action.strategy} />
                      <h4 className="text-sm font-semibold text-foreground">{action.title}</h4>
                    </div>
                    <RescueStatusBadge status={action.status} />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
                      <div className="font-semibold text-destructive flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" /> Delayed Prerequisite:
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => setOpenTaskId(action.delayedTaskId)}
                          className="font-medium hover:underline text-foreground text-left"
                        >
                          {delayed?.title || "Unknown Task"}
                        </button>
                        {delayed && <StatusBadge status={delayed.status} />}
                      </div>
                      <div className="text-muted-foreground">
                        Owner: <span className="font-medium text-foreground">{delayedOwner?.name || "Unassigned"}</span> | Due: {delayed?.deadline || "N/A"}
                      </div>
                    </div>

                    <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
                      <div className="font-semibold text-primary flex items-center gap-1">
                        <ArrowRight className="h-3.5 w-3.5" /> Affected Downstream ({action.affectedTaskIds.length}):
                      </div>
                      <ul className="space-y-1 max-h-20 overflow-y-auto">
                        {action.affectedTaskIds.map((downId) => {
                          const dt = task(downId);
                          const dtOwner = dt ? member(dt.ownerId) : null;
                          return (
                            <li key={downId} className="flex items-center justify-between gap-1 text-muted-foreground">
                              <button onClick={() => setOpenTaskId(downId)} className="hover:underline text-foreground truncate max-w-[160px]">
                                {dt?.title || downId}
                              </button>
                              <span className="text-[10px]">({dtOwner?.name || "Unassigned"})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground/90">
                    <span className="font-semibold text-primary flex items-center gap-1 mb-1">
                      <Sparkles className="h-3.5 w-3.5" /> AI Recommended Recovery Action:
                    </span>
                    <p className="leading-relaxed">{action.rationale}</p>
                    {action.mockContractDetails && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground border-t border-primary/10 pt-1">
                        <span className="font-medium text-foreground">Agreed plan:</span> {action.mockContractDetails}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {isResolved
                        ? "✓ Upstream work finished — rescue action automatically completed."
                        : "Will automatically complete when upstream task is finished."}
                    </span>
                    <div className="flex items-center gap-2">
                      {action.status === "proposed" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => approveRescueAction(action.id)}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve Strategy
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => rejectRescueAction(action.id)}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {action.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => completeRescueAction(action.id)}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark Recovery Done
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Grid: Confirmed Dependency Chain & Rule-Based Risk Findings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Confirmed Dependency Chain (${confirmedDependencies.length})`}>
          <p className="mb-3 text-xs text-muted-foreground">
            Active logical dependencies enforced across the project. Downstream tasks require the prerequisite task to be completed.
          </p>
          {confirmedDependencies.length === 0 ? (
            <Empty>No active dependencies. Click "Analyse Dependencies with AI" to infer dependencies automatically.</Empty>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {confirmedDependencies.map((e, i) => {
                if (!e.up) return null;
                const isBlocked = e.up.status === "Blocked";
                const isOverdue = e.up.status !== "Complete" && e.up.deadline && new Date(e.up.deadline).getTime() < Date.now();
                const isSatisfied = e.up.status === "Complete";

                return (
                  <div
                    key={`${e.up.id}-${e.down.id}-${i}`}
                    className={cn(
                      "rounded-lg border p-3 text-xs transition-all space-y-2",
                      isBlocked
                        ? "border-destructive/40 bg-destructive/5"
                        : isOverdue
                          ? "border-amber-500/40 bg-amber-500/5"
                          : isSatisfied
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        {isBlocked ? (
                          <Badge variant="destructive" className="text-[10px] h-5">
                            <ShieldAlert className="mr-1 h-3 w-3" /> Upstream Blocked
                          </Badge>
                        ) : isOverdue ? (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] h-5">
                            <Clock className="mr-1 h-3 w-3" /> Upstream Overdue
                          </Badge>
                        ) : isSatisfied ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] h-5">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Prerequisite Done
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-5">
                            Active Flow
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {e.meta?.confidence ? `${(e.meta.confidence * 100).toFixed(0)}% confidence` : "Manager confirmed"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDependency(e.up!.id, e.down.id)}
                        title="Remove dependency"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <div className="flex-1 min-w-[130px] rounded bg-muted/40 p-2">
                        <span className="text-[10px] text-muted-foreground block">Prerequisite:</span>
                        <button
                          onClick={() => setOpenTaskId(e.up!.id)}
                          className="font-medium hover:underline text-foreground truncate max-w-full block text-left"
                        >
                          {e.up.title}
                        </button>
                        <div className="flex items-center justify-between mt-1 text-[11px]">
                          <span className="text-muted-foreground">{member(e.up.ownerId)?.name || "Unassigned"}</span>
                          <StatusBadge status={e.up.status} />
                        </div>
                      </div>

                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                      <div className="flex-1 min-w-[130px] rounded bg-muted/40 p-2">
                        <span className="text-[10px] text-muted-foreground block">Dependent:</span>
                        <button
                          onClick={() => setOpenTaskId(e.down.id)}
                          className="font-medium hover:underline text-foreground truncate max-w-full block text-left"
                        >
                          {e.down.title}
                        </button>
                        <div className="flex items-center justify-between mt-1 text-[11px]">
                          <span className="text-muted-foreground">{member(e.down.ownerId)?.name || "Unassigned"}</span>
                          <StatusBadge status={e.down.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Rule-based findings">
          <p className="mb-2 text-xs text-muted-foreground">
            Confirmed blockers are recorded facts. Potential risks come from deadlines, states and dependencies — no probability scores.
          </p>
          {risks.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {risks.map((r) => (
                <div key={r.taskId} className="border-b py-2 text-sm">
                  <b className={r.kind === "confirmed-blocker" ? "text-destructive" : "text-warning-foreground"}>
                    {r.kind === "confirmed-blocker" ? "Confirmed blocker" : "Potential risk"}
                  </b>
                  :{" "}
                  <button onClick={() => setOpenTaskId(r.taskId)} className="hover:underline font-medium">
                    {task(r.taskId)?.title || r.taskId}
                  </button>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground mt-1">
                    {r.reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
