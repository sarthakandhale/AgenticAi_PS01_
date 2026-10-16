import { useLookup, useScopedTasks, useStore } from "@/lib/store";
import { evaluateRisks } from "@/lib/rules";
import { Panel, Empty } from "@/components/pp/page";
import { StatusBadge } from "@/components/pp/badges";

export function DependenciesView() {
  const tasks = useScopedTasks();
  const { setOpenTaskId } = useStore();
  const { task } = useLookup();
  const risks = evaluateRisks(tasks);
  const edges = tasks.flatMap((t) => t.dependsOn.map((u) => ({ up: task(u), down: t })));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Dependency chain (upstream → downstream)">
        {edges.length === 0 ? <Empty>No dependencies.</Empty> : edges.map((e, i) => e.up && (
          <div key={i} className={`flex flex-wrap items-center gap-2 border-b py-2 text-sm ${e.up.status === "Blocked" ? "bg-destructive/5" : ""}`}>
            <button onClick={() => setOpenTaskId(e.up!.id)} className="hover:underline">{e.up.title}</button><StatusBadge status={e.up.status} /> →
            <button onClick={() => setOpenTaskId(e.down.id)} className="hover:underline">{e.down.title}</button><StatusBadge status={e.down.status} />
          </div>
        ))}
      </Panel>
      <Panel title="Rule-based findings">
        <p className="mb-2 text-xs text-muted-foreground">Confirmed blockers are recorded facts. Potential risks come from deadlines, states and dependencies — no probability scores.</p>
        {risks.length === 0 ? <Empty>None.</Empty> : risks.map((r) => (
          <div key={r.taskId} className="border-b py-2 text-sm">
            <b className={r.kind === "confirmed-blocker" ? "text-destructive" : "text-warning-foreground"}>{r.kind === "confirmed-blocker" ? "Confirmed blocker" : "Potential risk"}</b>: {task(r.taskId)?.title}
            <ul className="list-disc pl-5 text-xs text-muted-foreground">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </Panel>
    </div>
  );
}
