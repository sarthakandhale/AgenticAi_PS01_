import { useState } from "react";
import { toast } from "sonner";
import { useLookup, useStore } from "@/lib/store";
import { evaluateRisks, isOverdue, projectHealth, projectStats, today } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/pp/page";

export function ReportsView() {
  const { data, selectedProjectId, logActivity } = useStore();
  const { member } = useLookup();
  const [report, setReport] = useState("");
  const generate = () => {
    const projects = selectedProjectId === "all" ? data.projects : data.projects.filter((p) => p.id === selectedProjectId);
    const lines = [`ProjectPilot status report — generated ${new Date().toLocaleString()}`, data.settings.demoMode ? "(Demo data)" : "", ""];
    for (const p of projects) {
      const s = projectStats(data, p.id);
      const tasks = data.tasks.filter((t) => t.projectId === p.id);
      lines.push(`## ${p.name} — ${projectHealth(data, p.id)} (${s.progress}% complete)`);
      lines.push(`Completed: ${s.complete} · Pending/In progress: ${s.pending + s.inProgress} · Blocked: ${s.blocked} · Overdue: ${s.overdue}`);
      tasks.filter((t) => t.status === "Blocked").forEach((t) => lines.push(`- BLOCKED: ${t.title} — ${t.blocker?.reason ?? "reason not recorded"}`));
      tasks.filter(isOverdue).forEach((t) => lines.push(`- OVERDUE: ${t.title} (due ${t.deadline})`));
      p.milestones.filter((m) => !m.done && m.date >= today()).forEach((m) => lines.push(`- Milestone: ${m.name} on ${m.date}`));
      evaluateRisks(tasks).filter((r) => r.kind === "potential-risk").forEach((r) => lines.push(`- Risk: ${tasks.find((t) => t.id === r.taskId)?.title} — ${r.reasons[0]}`));
      tasks.filter((t) => t.status !== "Complete" && t.nextAction).forEach((t) => lines.push(`- Next: ${t.nextAction} (${member(t.ownerId)?.name})`));
      lines.push("");
    }
    setReport(lines.join("\n"));
    logActivity({ type: "report_generated", summary: "Status report generated" });
  };
  return (
    <div className="space-y-4">
      <div className="no-print flex gap-2">
        <Button onClick={generate}>Generate report</Button>
        <Button variant="outline" disabled={!report} onClick={() => navigator.clipboard.writeText(report).then(() => toast.success("Copied"), () => toast.error("Copy failed"))}>Copy</Button>
        <Button variant="outline" disabled={!report} onClick={() => window.print()}>Print</Button>
      </div>
      <Panel><pre className="whitespace-pre-wrap font-sans text-sm">{report || "Generate a report from the current task data."}</pre></Panel>
    </div>
  );
}
